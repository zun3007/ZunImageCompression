import { AppError } from "../errors.js";
import type { JobOptions, ProbedImage, ResolvedOutputFormat } from "../types.js";

const keepInputFormat = (format: string): ResolvedOutputFormat => {
  switch (format) {
    case "jpg":
    case "jpeg":
      return "jpeg";
    case "png":
      return "png";
    case "webp":
      return "webp";
    case "avif":
      return "avif";
    case "gif":
      return "gif";
    default:
      return "png";
  }
};

export const resolveOutputFormat = (
  image: ProbedImage,
  options: JobOptions
): ResolvedOutputFormat => {
  if (options.output.format !== "keep") {
    if (image.isAnimated && options.output.format !== "webp") {
      throw new AppError(
        422,
        "Animated output only supports webp in v1 when preserving animation"
      );
    }

    return options.output.format;
  }

  if (!options.optimize.autoConvert) {
    return keepInputFormat(image.format);
  }

  if (image.isAnimated) {
    return "webp";
  }

  if (image.hasAlpha) {
    return "webp";
  }

  return "avif";
};

export const getExtensionForFormat = (format: ResolvedOutputFormat): string => {
  switch (format) {
    case "jpeg":
      return "jpg";
    default:
      return format;
  }
};

export const getContentTypeForFormat = (format: ResolvedOutputFormat): string => {
  switch (format) {
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "avif":
      return "image/avif";
    case "gif":
      return "image/gif";
  }
};

export const isQualitySearchable = (
  format: ResolvedOutputFormat,
  lossless: boolean
): boolean => {
  if (lossless) {
    return false;
  }

  return format === "jpeg" || format === "webp" || format === "avif";
};
