import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { AppConfig } from "../src/config.js";
import { defaultJobOptions } from "../src/domain/options.js";
import type { ImageProcessor } from "../src/processing/imageProcessor.js";
import { JobProcessor } from "../src/services/jobProcessor.js";
import { LocalArtifactStorage } from "../src/storage/localArtifactStorage.js";
import type { EncodedImage, JobRecord } from "../src/types.js";
import { createJpegBuffer } from "./helpers/images.js";
import { MemoryJobRepository } from "./helpers/memory.js";

const makeConfig = (rootDir: string): AppConfig => ({
  port: 0,
  redisUrl: "memory://",
  uploadTmpDir: join(rootDir, "uploads"),
  artifactDir: join(rootDir, "artifacts"),
  artifactTtlSeconds: 86_400,
  maxUploadFileSize: 26_214_400,
  maxFilesPerJob: 10,
  queueConcurrency: 1,
  jobAttempts: 3,
  jobBackoffMs: 10,
  jobRemoveOnCompleteAge: 86_400,
  jobRemoveOnFailAge: 86_400,
  queueName: "test-queue",
  jobRecordGraceSeconds: 3_600
});

describe("JobProcessor", () => {
  it("is safe to rerun after a transient processing failure", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "zun-job-processor-"));
    const uploadFile = join(rootDir, "uploads", "source.jpg");
    const outputDir = join(rootDir, "artifacts");
    await mkdir(join(rootDir, "uploads"), { recursive: true });
    await mkdir(outputDir, { recursive: true });
    await writeFile(uploadFile, await createJpegBuffer());

    const repository = new MemoryJobRepository();
    const config = makeConfig(rootDir);
    const artifactStorage = new LocalArtifactStorage(outputDir);
    let attempts = 0;

    const fakeProcessor: ImageProcessor = {
      process: async (): Promise<EncodedImage> => {
        attempts += 1;

        if (attempts === 1) {
          throw new Error("temporary failure");
        }

        return {
          buffer: Buffer.from("final-output"),
          bytes: 12,
          contentType: "image/webp",
          extension: "webp",
          format: "webp",
          width: 10,
          height: 10
        };
      }
    } as unknown as ImageProcessor;

    const job: JobRecord = {
      jobId: "retry-job",
      status: "queued",
      fileCount: 1,
      completedCount: 0,
      failedCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      options: {
        ...defaultJobOptions,
        output: {
          ...defaultJobOptions.output,
          format: "webp"
        }
      },
      items: [
        {
          itemId: "item-1",
          originalFilename: "source.jpg",
          mimeType: "image/jpeg",
          tempInputPath: uploadFile,
          sourceBytes: 100,
          sourceFormat: "jpeg",
          status: "queued"
        }
      ]
    };

    await repository.create(job);

    const processor = new JobProcessor(repository, fakeProcessor, artifactStorage, config);

    await processor.processJob(job.jobId);
    let current = await repository.get(job.jobId);
    expect(current?.status).toBe("failed");

    await writeFile(uploadFile, await createJpegBuffer());
    await repository.update(job.jobId, (existing) => {
      existing.status = "queued";
      existing.failedCount = 0;
      existing.items[0]!.status = "queued";
      existing.items[0]!.error = undefined;
      return existing;
    });

    await processor.processJob(job.jobId);
    current = await repository.get(job.jobId);

    expect(attempts).toBe(2);
    expect(current?.status).toBe("completed");
    expect(current?.items[0]?.output?.format).toBe("webp");

    await rm(rootDir, { recursive: true, force: true });
  });
});
