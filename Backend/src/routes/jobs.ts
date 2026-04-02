import { randomUUID } from "node:crypto";

import type { FastifyInstance } from "fastify";

import { parseJobOptions } from "../domain/options.js";
import { AppError } from "../errors.js";
import { cleanupUploads, collectUploads } from "../http/uploads.js";
import { probeImage } from "../processing/imageProcessor.js";
import type { AppConfig } from "../config.js";
import type { UploadedFile } from "../http/uploads.js";
import type { JobQueue } from "../queue/jobQueue.js";
import type { JobRepository } from "../repository/jobRepository.js";
import type { LocalArtifactStorage } from "../storage/localArtifactStorage.js";
import type { JobRecord } from "../types.js";

const toPublicJob = (job: JobRecord) => ({
  jobId: job.jobId,
  status: job.status,
  fileCount: job.fileCount,
  completedCount: job.completedCount,
  failedCount: job.failedCount,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  expiresAt: job.expiresAt,
  items: job.items.map((item) => ({
    itemId: item.itemId,
    originalFilename: item.originalFilename,
    status: item.status,
    output: item.output
      ? {
          format: item.output.format,
          width: item.output.width,
          height: item.output.height,
          bytes: item.output.bytes,
          downloadUrl: `/v1/jobs/${job.jobId}/items/${item.itemId}/file`
        }
      : null,
    metrics: item.metrics
      ? {
          inputBytes: item.metrics.inputBytes,
          outputBytes: item.metrics.outputBytes,
          compressionRatio: item.metrics.compressionRatio,
          durationMs: item.metrics.durationMs
        }
      : null,
    error: item.error ?? null
  }))
});

export const registerJobRoutes = (
  app: FastifyInstance,
  dependencies: {
    config: AppConfig;
    repository: JobRepository;
    queue: JobQueue;
    artifactStorage: LocalArtifactStorage;
  }
): void => {
  app.post("/v1/jobs", async (request, reply) => {
    const { config, queue, repository } = dependencies;
    let uploadedFiles: UploadedFile[] = [];

    try {
      const collected = await collectUploads(request, config);
      uploadedFiles = collected.files;

      if (uploadedFiles.length === 0) {
        throw new AppError(400, "At least one file must be uploaded");
      }

      const options = parseJobOptions(collected.optionsRaw);

      const inspectedFiles = await Promise.all(
        uploadedFiles.map(async (file) => {
          const probe = await probeImage(file.tempInputPath);
          return {
            ...file,
            sourceFormat: probe.format,
            sourceWidth: probe.width,
            sourceHeight: probe.height
          };
        })
      );

      const now = new Date().toISOString();
      const jobId = randomUUID();
      const job: JobRecord = {
        jobId,
        status: "queued",
        fileCount: inspectedFiles.length,
        completedCount: 0,
        failedCount: 0,
        createdAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + config.artifactTtlSeconds * 1_000).toISOString(),
        options,
        items: inspectedFiles.map((file) => ({
          itemId: file.itemId,
          originalFilename: file.originalFilename,
          mimeType: file.mimeType,
          tempInputPath: file.tempInputPath,
          sourceBytes: file.sourceBytes,
          sourceFormat: file.sourceFormat,
          sourceWidth: file.sourceWidth,
          sourceHeight: file.sourceHeight,
          status: "queued"
        }))
      };

      await repository.create(job);

      try {
        await queue.enqueue({ jobId });
      } catch (error) {
        await repository.delete(jobId);
        throw error;
      }

      return reply.code(202).send({
        jobId,
        status: "queued",
        fileCount: inspectedFiles.length
      });
    } catch (error) {
      await cleanupUploads(uploadedFiles);
      throw error;
    }
  });

  app.get("/v1/jobs/:jobId", async (request) => {
    const params = request.params as { jobId: string };
    const job = await dependencies.repository.get(params.jobId);

    if (!job) {
      throw new AppError(404, "Job not found");
    }

    return toPublicJob(job);
  });

  app.get("/v1/jobs/:jobId/items/:itemId/file", async (request, reply) => {
    const params = request.params as { jobId: string; itemId: string };
    const job = await dependencies.repository.get(params.jobId);

    if (!job) {
      throw new AppError(404, "Job not found");
    }

    const item = job.items.find((candidate) => candidate.itemId === params.itemId);
    if (!item) {
      throw new AppError(404, "Job item not found");
    }

    if (Date.now() > new Date(job.expiresAt).getTime()) {
      throw new AppError(410, "Processed artifact has expired");
    }

    if (item.status !== "completed" || !item.output) {
      throw new AppError(409, "Processed artifact is not ready yet");
    }

    const exists = await dependencies.artifactStorage.exists(item.output.artifactPath);
    if (!exists) {
      throw new AppError(410, "Processed artifact is no longer available");
    }

    reply.header("Content-Type", item.output.contentType);
    reply.header("Content-Length", String(item.output.bytes));
    reply.header("Content-Disposition", `inline; filename="${item.output.filename}"`);

    return reply.send(dependencies.artifactStorage.openReadStream(item.output.artifactPath));
  });
};
