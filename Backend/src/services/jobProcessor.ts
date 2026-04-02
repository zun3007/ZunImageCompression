import { rm } from "node:fs/promises";

import { getErrorMessage } from "../errors.js";
import type { AppConfig } from "../config.js";
import type { ImageProcessor } from "../processing/imageProcessor.js";
import type { JobRepository } from "../repository/jobRepository.js";
import type { LocalArtifactStorage } from "../storage/localArtifactStorage.js";
import type { JobRecord, JobStatus } from "../types.js";

const nowIso = () => new Date().toISOString();

const deriveJobStatus = (job: JobRecord): JobStatus => {
  if (job.items.every((item) => item.status === "failed")) {
    return "failed";
  }

  if (job.failedCount > 0) {
    return "completed_with_errors";
  }

  return "completed";
};

export class JobProcessor {
  public constructor(
    private readonly repository: JobRepository,
    private readonly imageProcessor: ImageProcessor,
    private readonly artifactStorage: LocalArtifactStorage,
    private readonly config: AppConfig
  ) {}

  public async processJob(jobId: string): Promise<void> {
    const initialJob = await this.repository.update(jobId, (job) => {
      if (job.status === "completed" || job.status === "completed_with_errors" || job.status === "failed") {
        return job;
      }

      job.status = "processing";
      job.updatedAt = nowIso();
      return job;
    });

    if (!initialJob) {
      throw new Error(`Job '${jobId}' was not found`);
    }

    if (
      initialJob.status === "completed" ||
      initialJob.status === "completed_with_errors" ||
      initialJob.status === "failed"
    ) {
      return;
    }

    for (const item of initialJob.items) {
      if (item.status === "completed" || item.status === "failed") {
        continue;
      }

      await this.repository.update(jobId, (job) => {
        const targetItem = job.items.find((candidate) => candidate.itemId === item.itemId);
        if (!targetItem || targetItem.status === "completed" || targetItem.status === "failed") {
          return job;
        }

        targetItem.status = "processing";
        targetItem.error = undefined;
        job.updatedAt = nowIso();
        return job;
      });

      const startedAt = Date.now();

      try {
        const processed = await this.imageProcessor.process(item.tempInputPath, initialJob.options);
        const outputFilename = this.artifactStorage.buildOutputFilename(
          item.originalFilename,
          processed.extension
        );
        const artifactPath = await this.artifactStorage.writeArtifact(
          jobId,
          item.itemId,
          outputFilename,
          processed.buffer
        );

        await this.repository.update(jobId, (job) => {
          const targetItem = job.items.find((candidate) => candidate.itemId === item.itemId);
          if (!targetItem) {
            return job;
          }

          targetItem.status = "completed";
          targetItem.output = {
            artifactPath,
            bytes: processed.bytes,
            contentType: processed.contentType,
            filename: outputFilename,
            format: processed.format,
            width: processed.width,
            height: processed.height
          };
          targetItem.metrics = {
            inputBytes: targetItem.sourceBytes,
            outputBytes: processed.bytes,
            compressionRatio: Number((processed.bytes / targetItem.sourceBytes).toFixed(3)),
            durationMs: Date.now() - startedAt
          };
          targetItem.error = undefined;
          job.completedCount = job.items.filter((candidate) => candidate.status === "completed").length;
          job.failedCount = job.items.filter((candidate) => candidate.status === "failed").length;
          job.updatedAt = nowIso();
          return job;
        });
      } catch (error) {
        await this.repository.update(jobId, (job) => {
          const targetItem = job.items.find((candidate) => candidate.itemId === item.itemId);
          if (!targetItem) {
            return job;
          }

          targetItem.status = "failed";
          targetItem.error = getErrorMessage(error);
          job.completedCount = job.items.filter((candidate) => candidate.status === "completed").length;
          job.failedCount = job.items.filter((candidate) => candidate.status === "failed").length;
          job.updatedAt = nowIso();
          return job;
        });
      } finally {
        await rm(item.tempInputPath, { force: true }).catch(() => undefined);
      }
    }

    await this.repository.update(jobId, (job) => {
      job.completedCount = job.items.filter((item) => item.status === "completed").length;
      job.failedCount = job.items.filter((item) => item.status === "failed").length;
      job.status = deriveJobStatus(job);
      job.updatedAt = nowIso();
      job.expiresAt = new Date(Date.now() + this.config.artifactTtlSeconds * 1_000).toISOString();
      return job;
    });
  }
}
