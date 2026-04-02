export const publicOutputFormats = ["jpeg", "png", "webp", "avif", "keep"] as const;
export const resolvedOutputFormats = ["jpeg", "png", "webp", "avif", "gif"] as const;
export const resizeFits = ["cover", "contain", "fill", "inside", "outside"] as const;
export const resizePositions = [
  "centre",
  "top",
  "right top",
  "right",
  "right bottom",
  "bottom",
  "left bottom",
  "left",
  "left top"
] as const;
export const chromaSubsamplingModes = ["4:4:4", "4:2:0"] as const;

export type PublicOutputFormat = (typeof publicOutputFormats)[number];
export type ResolvedOutputFormat = (typeof resolvedOutputFormats)[number];
export type ResizeFit = (typeof resizeFits)[number];
export type ResizePosition = (typeof resizePositions)[number];
export type ChromaSubsamplingMode = (typeof chromaSubsamplingModes)[number];
export type JobStatus = "queued" | "processing" | "completed" | "completed_with_errors" | "failed";
export type ItemStatus = "queued" | "processing" | "completed" | "failed";

export type JobOptions = {
  output: {
    format: PublicOutputFormat;
    quality?: number;
    lossless: boolean;
    progressive: boolean;
    chromaSubsampling?: ChromaSubsamplingMode;
    compressionLevel?: number;
    effort?: number;
  };
  resize?: {
    width?: number;
    height?: number;
    fit: ResizeFit;
    position: ResizePosition;
    withoutEnlargement: boolean;
    withoutReduction: boolean;
    background?: string;
  };
  optimize: {
    targetMaxBytes?: number;
    minQuality: number;
    maxQuality: number;
    autoConvert: boolean;
  };
  metadata: {
    keepExif: boolean;
    keepIccProfile: boolean;
    keepXmp: boolean;
  };
  animation: {
    enabled: boolean;
    maxFrames: number;
  };
};

export type JobItemOutput = {
  artifactPath: string;
  contentType: string;
  filename: string;
  format: ResolvedOutputFormat;
  width: number;
  height: number;
  bytes: number;
};

export type JobItemMetrics = {
  inputBytes: number;
  outputBytes: number;
  compressionRatio: number;
  durationMs: number;
};

export type JobItemRecord = {
  itemId: string;
  originalFilename: string;
  mimeType: string;
  tempInputPath: string;
  sourceBytes: number;
  sourceFormat: string;
  sourceWidth?: number;
  sourceHeight?: number;
  status: ItemStatus;
  output?: JobItemOutput;
  metrics?: JobItemMetrics;
  error?: string;
};

export type JobRecord = {
  jobId: string;
  status: JobStatus;
  fileCount: number;
  completedCount: number;
  failedCount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  options: JobOptions;
  items: JobItemRecord[];
};

export type ProcessJobPayload = {
  jobId: string;
};

export type ProbedImage = {
  format: string;
  width?: number;
  height?: number;
  pages: number;
  hasAlpha: boolean;
  isAnimated: boolean;
};

export type EncodedImage = {
  buffer: Buffer;
  format: ResolvedOutputFormat;
  extension: string;
  contentType: string;
  width: number;
  height: number;
  bytes: number;
};
