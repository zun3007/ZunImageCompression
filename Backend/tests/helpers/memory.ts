import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { AppConfig } from "../../src/config.js";
import { createApp } from "../../src/app.js";
import { ensureRuntimeDirectories } from "../../src/config.js";
import { ImageProcessor } from "../../src/processing/imageProcessor.js";
import type { JobQueue } from "../../src/queue/jobQueue.js";
import type { JobRepository } from "../../src/repository/jobRepository.js";
import { JobProcessor } from "../../src/services/jobProcessor.js";
import { LocalArtifactStorage } from "../../src/storage/localArtifactStorage.js";
import type { JobRecord, ProcessJobPayload } from "../../src/types.js";

const cloneJob = (job: JobRecord): JobRecord => structuredClone(job);

export class MemoryJobRepository implements JobRepository {
  private readonly store = new Map<string, JobRecord>();

  public async create(job: JobRecord): Promise<void> {
    this.store.set(job.jobId, cloneJob(job));
  }

  public async get(jobId: string): Promise<JobRecord | null> {
    return this.store.has(jobId) ? cloneJob(this.store.get(jobId)!) : null;
  }

  public async save(job: JobRecord): Promise<void> {
    this.store.set(job.jobId, cloneJob(job));
  }

  public async update(
    jobId: string,
    updater: (job: JobRecord) => JobRecord
  ): Promise<JobRecord | null> {
    const current = this.store.get(jobId);
    if (!current) {
      return null;
    }

    const next = updater(cloneJob(current));
    this.store.set(jobId, cloneJob(next));
    return cloneJob(next);
  }

  public async delete(jobId: string): Promise<void> {
    this.store.delete(jobId);
  }

  public async ping(): Promise<void> {}

  public async close(): Promise<void> {}
}

export class ImmediateJobQueue implements JobQueue {
  public constructor(private readonly handler: (payload: ProcessJobPayload) => Promise<void>) {}

  public async enqueue(payload: ProcessJobPayload): Promise<void> {
    queueMicrotask(() => {
      void this.handler(payload);
    });
  }

  public async close(): Promise<void> {}
}

export const createTestConfig = async (
  overrides?: Partial<AppConfig>
): Promise<{ config: AppConfig; rootDir: string }> => {
  const rootDir = await mkdtemp(join(tmpdir(), "zun-image-compression-"));
  const config: AppConfig = {
    port: 0,
    host: "127.0.0.1",
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
    jobRecordGraceSeconds: 3_600,
    appBaseUrl: "http://127.0.0.1:3000",
    swaggerEnabled: true,
    swaggerRoutePrefix: "/docs",
    ...overrides
  };

  await ensureRuntimeDirectories(config);

  return { config, rootDir };
};

export const createTestApp = async (overrides?: Partial<AppConfig>) => {
  const { config, rootDir } = await createTestConfig(overrides);
  const repository = new MemoryJobRepository();
  const artifactStorage = new LocalArtifactStorage(config.artifactDir);
  const processor = new JobProcessor(
    repository,
    new ImageProcessor(),
    artifactStorage,
    config
  );
  const queue = new ImmediateJobQueue(async ({ jobId }) => {
    await processor.processJob(jobId);
  });
  const app = await createApp({
    config,
    repository,
    queue,
    artifactStorage,
    healthCheck: async () => ({ redis: "ok" as const })
  });

  return {
    app,
    config,
    repository,
    queue,
    rootDir,
    cleanup: async () => {
      await app.close();
      await queue.close();
      await repository.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  };
};
