import { createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { randomUUID } from "node:crypto";

import type { FastifyRequest } from "fastify";

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

export const collectUploads = async (
  request: FastifyRequest,
  config: AppConfig
): Promise<{ files: UploadedFile[]; optionsRaw?: string }> => {
  const files: UploadedFile[] = [];
  let optionsRaw: string | undefined;

  for await (const part of request.parts()) {
    if (part.type === "field") {
      if (part.fieldname === "options") {
        optionsRaw = String(part.value);
      }
      continue;
    }

    if (part.fieldname !== "files" && part.fieldname !== "files[]") {
      await part.toBuffer();
      continue;
    }

    if (files.length >= config.maxFilesPerJob) {
      throw new AppError(400, `A maximum of ${config.maxFilesPerJob} files is allowed per job`);
    }

    const itemId = randomUUID();
    const originalFilename = sanitizeFilename(part.filename ?? `${itemId}.bin`);
    const targetPath = join(config.uploadTmpDir, itemId, originalFilename);

    await mkdir(dirname(targetPath), { recursive: true });
    await pipeline(part.file, createWriteStream(targetPath));

    if (part.file.truncated) {
      await rm(targetPath, { recursive: true, force: true });
      throw new AppError(413, "Uploaded file exceeds the configured size limit");
    }

    const metadata = await stat(targetPath);

    files.push({
      itemId,
      originalFilename,
      mimeType: part.mimetype,
      tempInputPath: targetPath,
      sourceBytes: metadata.size
    });
  }

  return { files, optionsRaw };
};

export const cleanupUploads = async (files: UploadedFile[]): Promise<void> => {
  await Promise.all(files.map((file) => rm(dirname(file.tempInputPath), { recursive: true, force: true })));
};
