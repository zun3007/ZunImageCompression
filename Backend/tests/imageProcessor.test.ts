import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { defaultJobOptions } from "../src/domain/options.js";
import { ImageProcessor } from "../src/processing/imageProcessor.js";
import { createAnimatedGifBuffer, createJpegBuffer, createPngBuffer } from "./helpers/images.js";

const writeTempImage = async (buffer: Buffer): Promise<string> => {
  const file = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");

  const dir = await file.mkdtemp(path.join(os.tmpdir(), "zun-processor-"));
  const target = path.join(dir, "input-image");
  await file.writeFile(target, buffer);
  return target;
};

describe("ImageProcessor", () => {
  it("auto converts opaque images to avif by default", async () => {
    const processor = new ImageProcessor();
    const input = await writeTempImage(await createJpegBuffer());

    const result = await processor.process(input, defaultJobOptions);

    expect(result.format).toBe("avif");
    expect(result.contentType).toBe("image/avif");
    expect(result.bytes).toBeGreaterThan(0);
  });

  it("prefers webp for transparent images", async () => {
    const processor = new ImageProcessor();
    const input = await writeTempImage(await createPngBuffer());

    const result = await processor.process(input, defaultJobOptions);

    expect(result.format).toBe("webp");
  });

  it("resizes with width and height constraints", async () => {
    const processor = new ImageProcessor();
    const input = await writeTempImage(await createJpegBuffer());

    const result = await processor.process(input, {
      ...defaultJobOptions,
      output: {
        ...defaultJobOptions.output,
        format: "webp"
      },
      resize: {
        width: 80,
        height: 80,
        fit: "inside",
        position: "centre",
        withoutEnlargement: true,
        withoutReduction: false
      }
    });

    expect(result.width).toBeLessThanOrEqual(80);
    expect(result.height).toBeLessThanOrEqual(80);
  });

  it("preserves animation and emits animated webp", async () => {
    const processor = new ImageProcessor();
    const input = await writeTempImage(createAnimatedGifBuffer());

    const result = await processor.process(input, defaultJobOptions);
    const metadata = await sharp(result.buffer, { animated: true }).metadata();

    expect(result.format).toBe("webp");
    expect((metadata.pages ?? 1) > 1).toBe(true);
  });

  it("rejects animated files over the frame limit", async () => {
    const processor = new ImageProcessor();
    const input = await writeTempImage(createAnimatedGifBuffer());

    await expect(
      processor.process(input, {
        ...defaultJobOptions,
        animation: {
          enabled: true,
          maxFrames: 1
        }
      })
    ).rejects.toThrow(/maximum allowed frames/i);
  });

  it("uses the quality floor when the target size cannot be reached", async () => {
    const processor = new ImageProcessor();
    const input = await writeTempImage(await createJpegBuffer());

    const floored = await processor.process(input, {
      ...defaultJobOptions,
      output: {
        ...defaultJobOptions.output,
        format: "webp"
      },
      optimize: {
        autoConvert: false,
        minQuality: 80,
        maxQuality: 90,
        targetMaxBytes: 150
      }
    });

    const explicitFloor = await processor.process(input, {
      ...defaultJobOptions,
      output: {
        ...defaultJobOptions.output,
        format: "webp",
        quality: 80
      },
      optimize: {
        autoConvert: false,
        minQuality: 80,
        maxQuality: 90
      }
    });

    expect(floored.bytes).toBe(explicitFloor.bytes);
  });

  it("strips metadata by default and keeps it when requested", async () => {
    const source = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 120, g: 120, b: 120 }
      }
    })
      .withMetadata()
      .jpeg()
      .toBuffer();
    const processor = new ImageProcessor();
    const input = await writeTempImage(source);

    const stripped = await processor.process(input, {
      ...defaultJobOptions,
      output: {
        ...defaultJobOptions.output,
        format: "jpeg"
      }
    });
    const kept = await processor.process(input, {
      ...defaultJobOptions,
      output: {
        ...defaultJobOptions.output,
        format: "jpeg"
      },
      metadata: {
        keepExif: true,
        keepIccProfile: true,
        keepXmp: false
      }
    });

    const strippedMeta = await sharp(stripped.buffer).metadata();
    const keptMeta = await sharp(kept.buffer).metadata();

    expect(strippedMeta.exif).toBeUndefined();
    expect(keptMeta.exif).toBeDefined();
  });
});
