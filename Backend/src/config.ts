import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export type AppConfig = {
  port: number;
  redisUrl: string;
  uploadTmpDir: string;
  artifactDir: string;
  artifactTtlSeconds: number;
  maxUploadFileSize: number;
  maxFilesPerJob: number;
  queueConcurrency: number;
  jobAttempts: number;
  jobBackoffMs: number;
  jobRemoveOnCompleteAge: number;
  jobRemoveOnFailAge: number;
  queueName: string;
  jobRecordGraceSeconds: number;
};

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  REDIS_URL: z.string().min(1).default("redis://127.0.0.1:6379"),
  UPLOAD_TMP_DIR: z.string().min(1).default(".data/uploads"),
  ARTIFACT_DIR: z.string().min(1).default(".data/artifacts"),
  ARTIFACT_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  MAX_UPLOAD_FILE_SIZE: z.coerce.number().int().positive().default(26_214_400),
  MAX_FILES_PER_JOB: z.coerce.number().int().positive().default(10),
  QUEUE_CONCURRENCY: z.coerce.number().int().positive().default(4),
  JOB_ATTEMPTS: z.coerce.number().int().positive().default(3),
  JOB_BACKOFF_MS: z.coerce.number().int().nonnegative().default(1_000),
  JOB_REMOVE_ON_COMPLETE_AGE: z.coerce.number().int().positive().default(86_400),
  JOB_REMOVE_ON_FAIL_AGE: z.coerce.number().int().positive().default(86_400)
});

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const loadConfig = (): AppConfig => {
  const env = envSchema.parse(process.env);

  return {
    port: env.PORT,
    redisUrl: env.REDIS_URL,
    uploadTmpDir: resolve(backendRoot, env.UPLOAD_TMP_DIR),
    artifactDir: resolve(backendRoot, env.ARTIFACT_DIR),
    artifactTtlSeconds: env.ARTIFACT_TTL_SECONDS,
    maxUploadFileSize: env.MAX_UPLOAD_FILE_SIZE,
    maxFilesPerJob: env.MAX_FILES_PER_JOB,
    queueConcurrency: env.QUEUE_CONCURRENCY,
    jobAttempts: env.JOB_ATTEMPTS,
    jobBackoffMs: env.JOB_BACKOFF_MS,
    jobRemoveOnCompleteAge: env.JOB_REMOVE_ON_COMPLETE_AGE,
    jobRemoveOnFailAge: env.JOB_REMOVE_ON_FAIL_AGE,
    queueName: "image-processing",
    jobRecordGraceSeconds: env.ARTIFACT_TTL_SECONDS + 3_600
  };
};

export const ensureRuntimeDirectories = async (config: AppConfig): Promise<void> => {
  await Promise.all([
    mkdir(config.uploadTmpDir, { recursive: true }),
    mkdir(config.artifactDir, { recursive: true })
  ]);
};
