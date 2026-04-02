import { z } from "zod";

import { AppError } from "../errors.js";
import {
  chromaSubsamplingModes,
  publicOutputFormats,
  resizeFits,
  resizePositions,
  type JobOptions
} from "../types.js";

const optionsSchema = z
  .object({
    output: z
      .object({
        format: z.enum(publicOutputFormats).optional(),
        quality: z.number().int().min(1).max(100).optional(),
        lossless: z.boolean().optional(),
        progressive: z.boolean().optional(),
        chromaSubsampling: z.enum(chromaSubsamplingModes).optional(),
        compressionLevel: z.number().int().min(0).max(9).optional(),
        effort: z.number().int().min(0).max(9).optional()
      })
      .optional(),
    resize: z
      .object({
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
        fit: z.enum(resizeFits).optional(),
        position: z.enum(resizePositions).optional(),
        withoutEnlargement: z.boolean().optional(),
        withoutReduction: z.boolean().optional(),
        background: z.string().min(1).optional()
      })
      .optional(),
    optimize: z
      .object({
        targetMaxBytes: z.number().int().positive().optional(),
        minQuality: z.number().int().min(1).max(100).optional(),
        maxQuality: z.number().int().min(1).max(100).optional(),
        autoConvert: z.boolean().optional()
      })
      .optional(),
    metadata: z
      .object({
        keepExif: z.boolean().optional(),
        keepIccProfile: z.boolean().optional(),
        keepXmp: z.boolean().optional()
      })
      .optional(),
    animation: z
      .object({
        enabled: z.boolean().optional(),
        maxFrames: z.number().int().positive().optional()
      })
      .optional()
  })
  .superRefine((value, ctx) => {
    const minQuality = value.optimize?.minQuality;
    const maxQuality = value.optimize?.maxQuality;

    if (
      typeof minQuality === "number" &&
      typeof maxQuality === "number" &&
      minQuality > maxQuality
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["optimize", "minQuality"],
        message: "minQuality must be less than or equal to maxQuality"
      });
    }

    if (
      typeof value.resize?.width !== "number" &&
      typeof value.resize?.height !== "number" &&
      value.resize
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["resize"],
        message: "resize requires at least width or height"
      });
    }
  });

export const defaultJobOptions: JobOptions = {
  output: {
    format: "keep",
    lossless: false,
    progressive: false
  },
  optimize: {
    autoConvert: true,
    minQuality: 60,
    maxQuality: 85
  },
  metadata: {
    keepExif: false,
    keepIccProfile: false,
    keepXmp: false
  },
  animation: {
    enabled: true,
    maxFrames: 200
  }
};

export const parseJobOptions = (optionsRaw?: string): JobOptions => {
  let parsedInput: unknown = {};

  if (optionsRaw) {
    try {
      parsedInput = JSON.parse(optionsRaw);
    } catch {
      throw new AppError(400, "Field 'options' must be valid JSON");
    }
  }

  const parsed = optionsSchema.safeParse(parsedInput);

  if (!parsed.success) {
    throw new AppError(400, parsed.error.issues[0]?.message ?? "Invalid job options");
  }

  const normalized: JobOptions = {
    output: {
      format: parsed.data.output?.format ?? defaultJobOptions.output.format,
      quality: parsed.data.output?.quality,
      lossless: parsed.data.output?.lossless ?? defaultJobOptions.output.lossless,
      progressive: parsed.data.output?.progressive ?? defaultJobOptions.output.progressive,
      chromaSubsampling: parsed.data.output?.chromaSubsampling,
      compressionLevel: parsed.data.output?.compressionLevel,
      effort: parsed.data.output?.effort
    },
    optimize: {
      targetMaxBytes: parsed.data.optimize?.targetMaxBytes,
      minQuality: parsed.data.optimize?.minQuality ?? defaultJobOptions.optimize.minQuality,
      maxQuality: parsed.data.optimize?.maxQuality ?? defaultJobOptions.optimize.maxQuality,
      autoConvert: parsed.data.optimize?.autoConvert ?? defaultJobOptions.optimize.autoConvert
    },
    metadata: {
      keepExif: parsed.data.metadata?.keepExif ?? defaultJobOptions.metadata.keepExif,
      keepIccProfile:
        parsed.data.metadata?.keepIccProfile ?? defaultJobOptions.metadata.keepIccProfile,
      keepXmp: parsed.data.metadata?.keepXmp ?? defaultJobOptions.metadata.keepXmp
    },
    animation: {
      enabled: parsed.data.animation?.enabled ?? defaultJobOptions.animation.enabled,
      maxFrames: parsed.data.animation?.maxFrames ?? defaultJobOptions.animation.maxFrames
    }
  };

  if (parsed.data.resize) {
    normalized.resize = {
      width: parsed.data.resize.width,
      height: parsed.data.resize.height,
      fit: parsed.data.resize.fit ?? "inside",
      position: parsed.data.resize.position ?? "centre",
      withoutEnlargement: parsed.data.resize.withoutEnlargement ?? true,
      withoutReduction: parsed.data.resize.withoutReduction ?? false,
      background: parsed.data.resize.background
    };
  }

  return normalized;
};
