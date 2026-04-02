import "dotenv/config";

import { Redis } from "ioredis";

import { createApp } from "./app.js";
import { startCleanupLoop } from "./cleanup.js";
import { ensureRuntimeDirectories, loadConfig } from "./config.js";
import { BullMqJobQueue } from "./queue/bullmqJobQueue.js";
import { RedisJobRepository } from "./repository/redisJobRepository.js";
import { LocalArtifactStorage } from "./storage/localArtifactStorage.js";

const bootstrap = async () => {
  const config = loadConfig();
  await ensureRuntimeDirectories(config);

  const redis = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const repository = new RedisJobRepository(redis, config);
  const queue = new BullMqJobQueue(redis, config);
  const artifactStorage = new LocalArtifactStorage(config.artifactDir);
  const cleanup = startCleanupLoop({
    uploadTmpDir: config.uploadTmpDir,
    artifactDir: config.artifactDir,
    ttlMs: config.artifactTtlSeconds * 1_000
  });

  const app = await createApp({
    config,
    repository,
    queue,
    artifactStorage,
    healthCheck: async () => {
      await repository.ping();
      return { redis: "ok" as const };
    }
  });

  const shutdown = async () => {
    cleanup();
    await app.close();
    await queue.close();
    await repository.close();
  };

  process.on("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.on("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

  await app.listen({
    host: config.host,
    port: config.port
  });
};

void bootstrap();
