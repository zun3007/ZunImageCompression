import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import butteraugli from "butteraugli";
import sharp from "sharp";
import cwebp from "cwebp-bin";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const testDir = path.join(repoRoot, "test");
const outputDir = path.join(testDir, "compressed");

const supportedExtensions = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".gif", ".tif", ".tiff"]);
const largeAssetMinDimension = 1920;
const uiAssetMaxDimension = 1024;
const uiAssetMaxBytes = 256 * 1024;
const uiSsimThreshold = 98.5;
const largeAssetButteraugliProxyWidth = 640;
const largeAssetButteraugliDelta = 0.07;

sharp.simd(true);
sharp.concurrency(Math.max(1, Math.min(os.cpus().length, 8)));
sharp.cache(false);

const log = (message) => {
  console.log(`[compress] ${message}`);
};

const ensureOutputDirectory = async () => {
  await fsp.rm(outputDir, { recursive: true, force: true });
  await fsp.mkdir(outputDir, { recursive: true });
};

const isGeneratedOutput = (entryPath) =>
  entryPath.toLowerCase().includes(`${path.sep}compressed${path.sep}`);

const shouldSkipInputFile = (entryName) => /^tmp[-._]/i.test(entryName);

const collectInputImages = async (directory) => {
  const entries = await fsp.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entryPath === outputDir) {
        continue;
      }

      files.push(...(await collectInputImages(entryPath)));
      continue;
    }

    const extension = path.extname(entry.name).toLowerCase();
    if (
      !supportedExtensions.has(extension) ||
      isGeneratedOutput(entryPath) ||
      shouldSkipInputFile(entry.name)
    ) {
      continue;
    }

    files.push(entryPath);
  }

  return files.sort((left, right) => left.localeCompare(right));
};

const analyzeAlpha = async (inputPath) => {
  const { data, info } = await sharp(inputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  let partial = 0;
  let opaque = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const alpha = data[(y * info.width + x) * info.channels + 3];

      if (alpha === 0) {
        transparent += 1;
        continue;
      }

      if (alpha === 255) {
        opaque += 1;
      } else {
        partial += 1;
      }

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const total = transparent + partial + opaque;
  const cropBox =
    maxX === -1 || maxY === -1
      ? null
      : {
          left: minX,
          top: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1
        };

  let transparentInsideCrop = 0;
  if (cropBox) {
    for (let y = cropBox.top; y < cropBox.top + cropBox.height; y += 1) {
      for (let x = cropBox.left; x < cropBox.left + cropBox.width; x += 1) {
        const alpha = data[(y * info.width + x) * info.channels + 3];
        if (alpha === 0) {
          transparentInsideCrop += 1;
        }
      }
    }
  }

  return {
    transparentPct: total === 0 ? 0 : (transparent / total) * 100,
    partialPct: total === 0 ? 0 : (partial / total) * 100,
    opaquePct: total === 0 ? 0 : (opaque / total) * 100,
    cropBox,
    transparentInsideCrop
  };
};

const getImageProfile = async (inputPath) => {
  const metadata = await sharp(inputPath, { animated: true }).metadata();
  const fileBytes = (await fsp.stat(inputPath)).size;
  const alphaAnalysis = metadata.hasAlpha ? await analyzeAlpha(inputPath) : null;

  const canTrimTransparentBorder =
    Boolean(alphaAnalysis?.cropBox) &&
    (alphaAnalysis.cropBox.width !== (metadata.width ?? 0) ||
      alphaAnalysis.cropBox.height !== (metadata.height ?? 0));

  const canTreatAsOpaqueAfterTrim =
    canTrimTransparentBorder &&
    (alphaAnalysis?.partialPct ?? 0) === 0 &&
    (alphaAnalysis?.transparentInsideCrop ?? 0) === 0;

  const preprocess = {};
  if (canTrimTransparentBorder && alphaAnalysis?.cropBox) {
    preprocess.extract = alphaAnalysis.cropBox;
  }

  const trimmedWidth = preprocess.extract?.width ?? metadata.width ?? 0;
  const trimmedHeight = preprocess.extract?.height ?? metadata.height ?? 0;
  const effectiveHasAlpha = canTreatAsOpaqueAfterTrim ? false : (metadata.hasAlpha ?? false);
  const maxDimension = Math.max(trimmedWidth, trimmedHeight);
  const isUiLike = maxDimension <= uiAssetMaxDimension || fileBytes <= uiAssetMaxBytes;
  const needsDownscale = !isUiLike && maxDimension > largeAssetMinDimension;

  if (needsDownscale) {
    preprocess.resize = {
      width: trimmedWidth >= trimmedHeight ? largeAssetMinDimension : undefined,
      height: trimmedHeight > trimmedWidth ? largeAssetMinDimension : undefined,
      fit: "inside",
      withoutEnlargement: true
    };
  }

  return {
    inputPath,
    inputBytes: fileBytes,
    format: metadata.format ?? "unknown",
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    trimmedWidth,
    trimmedHeight,
    hasAlpha: metadata.hasAlpha ?? false,
    effectiveHasAlpha,
    alphaAnalysis,
    isUiLike,
    preprocess
  };
};

const buildPreparedSource = async (profile, tempDir) => {
  let pipeline = sharp(profile.inputPath).rotate();

  if (profile.preprocess.extract) {
    pipeline = pipeline.extract(profile.preprocess.extract);
  }

  if (profile.preprocess.resize) {
    pipeline = pipeline.resize(profile.preprocess.resize);
  }

  const preparedPath = path.join(tempDir, "prepared.png");
  await pipeline.png().toFile(preparedPath);
  return preparedPath;
};

const parseCwebpMetric = (stderr) => {
  const ssimMatch = stderr.match(/Total:([0-9.]+)/);
  return {
    ssim: ssimMatch ? Number(ssimMatch[1]) : null
  };
};

const buildButteraugliProxy = async (imagePath) =>
  sharp(imagePath)
    .resize({ width: largeAssetButteraugliProxyWidth, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

const compareWithButteraugli = (left, right) =>
  butteraugli(
    { data: left.data, width: left.info.width, height: left.info.height },
    { data: right.data, width: right.info.width, height: right.info.height }
  );

const runCwebp = async (preparedInputPath, args, tempDir, outputName) => {
  const outputPath = path.join(tempDir, outputName);
  const result = spawnSync(cwebp, [preparedInputPath, ...args, "-print_ssim", "-o", outputPath], {
    encoding: "utf8"
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || `cwebp failed with status ${result.status}`);
  }

  const metrics = parseCwebpMetric(result.stderr);
  const bytes = (await fsp.stat(outputPath)).size;
  const outputBuffer = await fsp.readFile(outputPath);

  return {
    outputBuffer,
    bytes,
    ssim: metrics.ssim
  };
};

const buildUiCandidatePlans = (profile) => {
  const alphaArgs = profile.effectiveHasAlpha ? ["-alpha_q", "100", "-exact"] : [];

  return [
    {
      strategy: "lossless-ui",
      args: ["-lossless", "-m", "6", "-mt", ...alphaArgs]
    },
    {
      strategy: "near-lossless-ui-100",
      args: ["-near_lossless", "100", "-m", "6", "-mt", ...alphaArgs]
    },
    {
      strategy: "near-lossless-ui-80",
      args: ["-near_lossless", "80", "-m", "6", "-mt", ...alphaArgs]
    }
  ];
};

const buildLargeAssetCandidatePlans = () => [
  {
    strategy: "large-art-q100",
    args: ["-preset", "picture", "-q", "100", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  },
  {
    strategy: "large-art-q96",
    args: ["-preset", "picture", "-q", "96", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  },
  {
    strategy: "large-art-q94",
    args: ["-preset", "picture", "-q", "94", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  },
  {
    strategy: "large-art-q92",
    args: ["-preset", "picture", "-q", "92", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  },
  {
    strategy: "large-art-q90",
    args: ["-preset", "picture", "-q", "90", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  },
  {
    strategy: "large-art-q88",
    args: ["-preset", "picture", "-q", "88", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  },
  {
    strategy: "large-art-q86",
    args: ["-preset", "picture", "-q", "86", "-m", "6", "-mt", "-af", "-sharp_yuv"]
  }
];

const evaluateCandidates = async (profile, preparedInputPath, tempDir) => {
  const plans = profile.isUiLike || profile.effectiveHasAlpha
    ? buildUiCandidatePlans(profile)
    : buildLargeAssetCandidatePlans();

  const candidates = [];
  const originalButteraugliProxy =
    profile.isUiLike || profile.effectiveHasAlpha ? null : await buildButteraugliProxy(preparedInputPath);

  for (const [index, plan] of plans.entries()) {
    const candidate = await runCwebp(preparedInputPath, plan.args, tempDir, `candidate-${index}.webp`);
    const butteraugliScore =
      originalButteraugliProxy === null
        ? null
        : compareWithButteraugli(originalButteraugliProxy, await buildButteraugliProxy(path.join(tempDir, `candidate-${index}.webp`)));
    log(
      `${path.basename(profile.inputPath)} -> ${plan.strategy} | ${(candidate.bytes / 1024).toFixed(1)} KiB | SSIM ${candidate.ssim ?? "n/a"}${butteraugliScore === null ? "" : ` | Butteraugli ${butteraugliScore.toFixed(3)}`}`
    );

    candidates.push({
      strategy: plan.strategy,
      args: plan.args,
      bytes: candidate.bytes,
      ssim: candidate.ssim,
      butteraugli: butteraugliScore,
      outputBuffer: candidate.outputBuffer
    });
  }

  return candidates;
};

const selectBestCandidate = (profile, candidates) => {
  if (profile.isUiLike || profile.effectiveHasAlpha) {
    const acceptable = candidates
      .filter((candidate) => (candidate.ssim ?? 0) >= uiSsimThreshold)
      .sort((left, right) => left.bytes - right.bytes || (right.ssim ?? 0) - (left.ssim ?? 0));

    return {
      strategyType: "ui-perceptual-threshold",
      threshold: uiSsimThreshold,
      selected: acceptable[0] ?? [...candidates].sort((left, right) => left.bytes - right.bytes)[0]
    };
  }

  const baseline = candidates.find((candidate) => candidate.strategy === "large-art-q100") ?? candidates[0];
  const bestButteraugli = Math.min(...candidates.map((candidate) => candidate.butteraugli ?? Number.POSITIVE_INFINITY));
  const threshold = bestButteraugli + largeAssetButteraugliDelta;
  const acceptable = candidates
    .filter((candidate) => (candidate.butteraugli ?? Number.POSITIVE_INFINITY) <= threshold)
    .sort(
      (left, right) =>
        left.bytes - right.bytes ||
        (left.butteraugli ?? Number.POSITIVE_INFINITY) - (right.butteraugli ?? Number.POSITIVE_INFINITY)
    );

  return {
    strategyType: "large-art-butteraugli-proxy",
    baselineSsim: baseline.ssim,
    baselineButteraugli: baseline.butteraugli,
    threshold,
    selected: acceptable[0] ?? baseline
  };
};

const writeOutput = async (inputPath, outputBuffer) => {
  const relativeDirectory = path.relative(testDir, path.dirname(inputPath));
  const targetDirectory =
    relativeDirectory && relativeDirectory !== "." ? path.join(outputDir, relativeDirectory) : outputDir;
  await fsp.mkdir(targetDirectory, { recursive: true });

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const outputPath = path.join(targetDirectory, `${baseName}.webp`);
  await fsp.writeFile(outputPath, outputBuffer);
  return outputPath;
};

const stripCandidateBuffers = (candidates) =>
  candidates.map(({ outputBuffer, ...candidate }) => candidate);

const main = async () => {
  await ensureOutputDirectory();

  const inputImages = await collectInputImages(testDir);
  if (inputImages.length === 0) {
    throw new Error(`No supported input images were found under ${testDir}`);
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    inputRoot: testDir,
    outputRoot: outputDir,
    strategy: {
      outputs: ["webp"],
      encoder: "cwebp",
      uiMetric: "cwebp -print_ssim",
      largeAssetMetric: `Butteraugli proxy search at ${largeAssetButteraugliProxyWidth}px wide`,
      uiAssets: `Pick the smallest candidate whose SSIM stays at or above ${uiSsimThreshold}.`,
      largeAssets: `Trim transparent border, resize long edge to ${largeAssetMinDimension}px when larger, then pick the smallest candidate within ${largeAssetButteraugliDelta.toFixed(2)} Butteraugli distance of the best candidate on the ${largeAssetButteraugliProxyWidth}px proxy.`,
      note:
        "Near-99% quality and near-99% size reduction cannot be guaranteed simultaneously for every source image. This pipeline uses a stronger practical game-asset tradeoff."
    },
    encoderRuntime: {
      cwebpPath: cwebp,
      sharpConcurrency: sharp.concurrency(),
      sharpSimd: sharp.simd()
    },
    files: []
  };

  for (const inputPath of inputImages) {
    const profile = await getImageProfile(inputPath);
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "zun-cwebp-"));

    try {
      const preparedInputPath = await buildPreparedSource(profile, tempDir);
      log(
        `Processing ${path.relative(testDir, inputPath)} | ${profile.width}x${profile.height} -> ${profile.trimmedWidth}x${profile.trimmedHeight}${profile.preprocess.resize ? " -> resized" : ""} | alpha=${profile.hasAlpha} effectiveAlpha=${profile.effectiveHasAlpha} uiLike=${profile.isUiLike}`
      );

      const candidates = await evaluateCandidates(profile, preparedInputPath, tempDir);
      const decision = selectBestCandidate(profile, candidates);
      const outputPath = await writeOutput(inputPath, decision.selected.outputBuffer);
      const outputMetadata = await sharp(decision.selected.outputBuffer).metadata();

      summary.files.push({
        inputPath,
        inputBytes: profile.inputBytes,
        original: {
          width: profile.width,
          height: profile.height,
          hasAlpha: profile.hasAlpha
        },
        preprocess: {
          trimmed: Boolean(profile.preprocess.extract),
          extract: profile.preprocess.extract ?? null,
          resized: Boolean(profile.preprocess.resize),
          resize: profile.preprocess.resize ?? null,
          effectiveHasAlpha: profile.effectiveHasAlpha,
          isUiLike: profile.isUiLike
        },
        selection: {
          type: decision.strategyType,
          baselineSsim: decision.baselineSsim ?? null,
          baselineButteraugli: decision.baselineButteraugli ?? null,
          threshold: decision.threshold
        },
        output: {
          format: "webp",
          width: outputMetadata.width ?? profile.trimmedWidth,
          height: outputMetadata.height ?? profile.trimmedHeight,
          bytes: decision.selected.bytes,
          reductionPct: Number(((1 - decision.selected.bytes / profile.inputBytes) * 100).toFixed(2)),
          strategy: decision.selected.strategy,
          ssim: decision.selected.ssim,
          butteraugli: decision.selected.butteraugli,
          encoderArgs: decision.selected.args,
          outputPath
        },
        candidates: stripCandidateBuffers(candidates)
      });
    } finally {
      await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  const reportPath = path.join(outputDir, "compression-report.json");
  await fsp.writeFile(reportPath, JSON.stringify(summary, null, 2));
  log(`Done. Summary written to ${reportPath}`);
};

try {
  if (!fs.existsSync(testDir)) {
    throw new Error(`Missing test directory: ${testDir}`);
  }

  await main();
  process.exit(0);
} catch (error) {
  console.error(`\n[compress] ERROR: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
