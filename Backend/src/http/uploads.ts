import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import type { FastifyRequest } from "fastify";
import type { MultipartFile } from "@fastify/multipart";

import type { AppConfig } from "../config.js";
import { AppError } from "../errors.js";

export type UploadedFile = {
  itemId: string;
  originalFilename: string;
  mimeType: string;
  tempInputPath: string;
  sourceBytes: number;
};

const sanitizeFilename = (filename: string): string =>
  basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");

type AttachedField = {
  value?: unknown;
};

type RequestWithTrackedUploads = FastifyRequest & {
  body?: Record<string, unknown>;
  trackedUploadPaths?: string[];
};

const getTrackedPaths = (request: FastifyRequest): string[] => {
  const mutableRequest = request as RequestWithTrackedUploads;
  mutableRequest.trackedUploadPaths ??= [];
  return mutableRequest.trackedUploadPaths;
};

export const createMultipartOnFileHandler =
  (config: AppConfig) =>
  async function onFile(this: FastifyRequest, part: MultipartFile): Promise<void> {
    const itemId = randomUUID();
    const originalFilename = sanitizeFilename(part.filename ?? `${itemId}.bin`);
    const targetPath = join(config.uploadTmpDir, itemId, originalFilename);

    await mkdir(dirname(targetPath), { recursive: true });
    getTrackedPaths(this).push(targetPath);
    await pipeline(part.file, createWriteStream(targetPath));

    if (part.file.truncated) {
      await rm(targetPath, { force: true });
      throw new AppError(413, "Uploaded file exceeds the configured size limit");
    }

    const metadata = await stat(targetPath);

    (part as MultipartFile & { value?: UploadedFile }).value = {
      itemId,
      originalFilename,
      mimeType: part.mimetype,
      tempInputPath: targetPath,
      sourceBytes: metadata.size
    } satisfies UploadedFile;
  };

export const collectUploads = async (
  request: FastifyRequest,
  config: AppConfig
): Promise<{ files: UploadedFile[]; optionsRaw?: string }> => {
  const body = (request as RequestWithTrackedUploads).body ?? {};
  const files: UploadedFile[] = [];
  const bodyFiles = body.files ?? body["files[]"];
  const normalizedFiles = Array.isArray(bodyFiles) ? bodyFiles : bodyFiles ? [bodyFiles] : [];

  for (const entry of normalizedFiles) {
    const candidate = entry as AttachedField & { fieldname?: string };
    const uploadedFile = candidate.value as UploadedFile | undefined;

    if (uploadedFile) {
      files.push(uploadedFile);
    }
  }

  if (files.length > config.maxFilesPerJob) {
    throw new AppError(400, `A maximum of ${config.maxFilesPerJob} files is allowed per job`);
  }

  const optionsField = body.options as AttachedField | undefined;

  return {
    files,
    optionsRaw: typeof optionsField?.value === "string" ? optionsField.value : undefined
  };
};

export const cleanupTrackedUploads = async (request: FastifyRequest): Promise<void> => {
  const trackedPaths = (request as RequestWithTrackedUploads).trackedUploadPaths ?? [];
  await Promise.all(
    trackedPaths.map((filePath) => rm(dirname(filePath), { recursive: true, force: true }))
  );
};

export const cleanupUploads = async (files: UploadedFile[]): Promise<void> => {
  await Promise.all(files.map((file) => rm(dirname(file.tempInputPath), { recursive: true, force: true })));
};
