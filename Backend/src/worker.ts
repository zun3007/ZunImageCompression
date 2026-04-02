import "dotenv/config";

import { Worker } from "bullmq";
import { Redis } from "ioredis";

import { ensureRuntimeDirectories, loadConfig } from "./config.js";
import { ImageProcessor } from "./processing/imageProcessor.js";
import { RedisJobRepository } from "./repository/redisJobRepository.js";
import { JobProcessor } from "./services/jobProcessor.js";
import { LocalArtifactStorage } from "./storage/localArtifactStorage.js";

const bootstrap = async () => {
  const config = loadConfig();
  await ensureRuntimeDirectories(config);

  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const repository = new RedisJobRepository(redis, config);
  const processor = new JobProcessor(
    repository,
    new ImageProcessor(),
    new LocalArtifactStorage(config.artifactDir),
    config
  );

  const worker = new Worker(
    config.queueName,
    async (job) => {
      await processor.processJob(job.data.jobId);
    },
    {
      connection: redis,
      concurrency: config.queueConcurrency
    }
  );

  worker.on("completed", (job) => {
    console.log(`Completed job ${job.id}`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Failed job ${job?.id}:`, error);
  });

  const shutdown = async () => {
    await worker.close();
    await repository.close();
  };

  process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));
};

void bootstrap();
