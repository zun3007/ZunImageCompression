import sharp, { type Metadata, type Sharp } from "sharp";

import { AppError } from "../errors.js";
import {
  type EncodedImage,
  type JobOptions,
  type ProbedImage,
  type ResolvedOutputFormat
} from "../types.js";
import {
  getContentTypeForFormat,
  getExtensionForFormat,
  isQualitySearchable,
  resolveOutputFormat
} from "./format.js";

const supportedInputFormats = new Set(["jpeg", "jpg", "png", "webp", "avif", "gif", "tiff"]);

type EncodeCandidate = {
  buffer: Buffer;
  width: number;
  height: number;
  bytes: number;
};

const toProbedImage = (metadata: Metadata): ProbedImage => {
  const format = metadata.format ?? "unknown";
  const pages = metadata.pages ?? 1;

  return {
    format,
    width: metadata.width,
    height: metadata.height,
    pages,
    hasAlpha: metadata.hasAlpha ?? false,
    isAnimated: pages > 1
  };
};

export const probeImage = async (filePath: string): Promise<ProbedImage> => {
  let metadata: Metadata;

  try {
    metadata = await sharp(filePath, { animated: true, failOn: "error" }).metadata();
  } catch {
    throw new AppError(422, "Input file contains unsupported image format");
  }

  const image = toProbedImage(metadata);

  if (!supportedInputFormats.has(image.format)) {
    throw new AppError(422, `Unsupported input format '${image.format}'`);
  }

  return image;
};

export class ImageProcessor {
  public async process(filePath: string, options: JobOptions): Promise<EncodedImage> {
    const image = await probeImage(filePath);

    if (!options.animation.enabled && image.isAnimated) {
      throw new AppError(422, "Animated images are disabled for this request");
    }

    if (image.pages > options.animation.maxFrames) {
      throw new AppError(
        422,
        `Animated image exceeds the maximum allowed frames (${options.animation.maxFrames})`
      );
    }

    const resolvedFormat = resolveOutputFormat(image, options);
    const encoded = await this.encode(filePath, image, options, resolvedFormat);

    return {
      buffer: encoded.buffer,
      bytes: encoded.bytes,
      width: encoded.width,
      height: encoded.height,
      format: resolvedFormat,
      extension: getExtensionForFormat(resolvedFormat),
      contentType: getContentTypeForFormat(resolvedFormat)
    };
  }

  private async encode(
    filePath: string,
    image: ProbedImage,
    options: JobOptions,
    format: ResolvedOutputFormat
  ): Promise<EncodeCandidate> {
    const targetMaxBytes = options.optimize.targetMaxBytes;
    const lossless = options.output.lossless;

    if (!targetMaxBytes || !isQualitySearchable(format, lossless)) {
      const singlePassQuality = options.output.quality ?? options.optimize.maxQuality;
      return this.renderVariant(filePath, image, options, format, singlePassQuality);
    }

    const minQuality = options.optimize.minQuality;
    const maxQuality = options.output.quality ?? options.optimize.maxQuality;
    const cache = new Map<number, EncodeCandidate>();
    let low = minQuality;
    let high = maxQuality;
    let bestUnderTarget: EncodeCandidate | undefined;
    let smallestCandidate: EncodeCandidate | undefined;

    while (low <= high) {
      const quality = Math.floor((low + high) / 2);
      const candidate =
        cache.get(quality) ??
        (await this.renderVariant(filePath, image, options, format, quality));

      cache.set(quality, candidate);

      if (!smallestCandidate || candidate.bytes < smallestCandidate.bytes) {
        smallestCandidate = candidate;
      }

      if (candidate.bytes <= targetMaxBytes) {
        bestUnderTarget = candidate;
        low = quality + 1;
      } else {
        high = quality - 1;
      }
    }

    if (bestUnderTarget) {
      return bestUnderTarget;
    }

    return smallestCandidate ?? this.renderVariant(filePath, image, options, format, minQuality);
  }

  private async renderVariant(
    filePath: string,
    image: ProbedImage,
    options: JobOptions,
    format: ResolvedOutputFormat,
    quality: number
  ): Promise<EncodeCandidate> {
    let pipeline = this.createBasePipeline(filePath, image, options);

    switch (format) {
      case "jpeg":
        pipeline = pipeline.jpeg({
          quality,
          mozjpeg: true,
          progressive: options.output.progressive,
          chromaSubsampling: options.output.chromaSubsampling
        });
        break;
      case "png":
        pipeline = pipeline.png({
          compressionLevel: options.output.compressionLevel ?? 9,
          progressive: options.output.progressive
        });
        break;
      case "webp":
        pipeline = pipeline.webp({
          quality,
          effort: options.output.effort,
          lossless: options.output.lossless
        });
        break;
      case "avif":
        pipeline = pipeline.avif({
          quality,
          effort: options.output.effort,
          lossless: options.output.lossless,
          chromaSubsampling: options.output.chromaSubsampling
        });
        break;
      case "gif":
        pipeline = pipeline.gif();
        break;
    }

    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });

    return {
      buffer: data,
      bytes: data.byteLength,
      width: info.width,
      height: info.height
    };
  }

  private createBasePipeline(filePath: string, image: ProbedImage, options: JobOptions): Sharp {
    let pipeline = sharp(filePath, { animated: image.isAnimated, failOn: "error" }).rotate();

    if (options.resize) {
      pipeline = pipeline.resize({
        width: options.resize.width,
        height: options.resize.height,
        fit: options.resize.fit,
        position: options.resize.position,
        withoutEnlargement: options.resize.withoutEnlargement,
        withoutReduction: options.resize.withoutReduction,
        background: options.resize.background
      });
    }

    if (options.metadata.keepExif) {
      pipeline = pipeline.keepExif();
    }

    if (options.metadata.keepIccProfile) {
      pipeline = pipeline.keepIccProfile();
    }

    if (options.metadata.keepXmp) {
      pipeline = pipeline.keepXmp();
    }

    return pipeline;
  }
}
