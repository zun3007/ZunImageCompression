import type { Redis } from "ioredis";

import type { AppConfig } from "../config.js";
import type { JobRecord } from "../types.js";
import type { JobRepository } from "./jobRepository.js";

const cloneJob = (job: JobRecord): JobRecord => structuredClone(job);

export class RedisJobRepository implements JobRepository {
  public constructor(
    private readonly redis: Redis,
    private readonly config: AppConfig
  ) {}

  public async create(job: JobRecord): Promise<void> {
    await this.redis.set(this.key(job.jobId), JSON.stringify(job), "EX", this.getTtlSeconds(job));
  }

  public async get(jobId: string): Promise<JobRecord | null> {
    const raw = await this.redis.get(this.key(jobId));
    return raw ? (JSON.parse(raw) as JobRecord) : null;
  }

  public async save(job: JobRecord): Promise<void> {
    await this.redis.set(this.key(job.jobId), JSON.stringify(job), "EX", this.getTtlSeconds(job));
  }

  public async update(
    jobId: string,
    updater: (job: JobRecord) => JobRecord
  ): Promise<JobRecord | null> {
    const current = await this.get(jobId);

    if (!current) {
      return null;
    }

    const next = updater(cloneJob(current));
    await this.save(next);
    return next;
  }

  public async delete(jobId: string): Promise<void> {
    await this.redis.del(this.key(jobId));
  }

  public async ping(): Promise<void> {
    await this.redis.ping();
  }

  public async close(): Promise<void> {
    await this.redis.quit();
  }

  private key(jobId: string): string {
    return `image-job:${jobId}`;
  }

  private getTtlSeconds(job: JobRecord): number {
    const expiresAt = new Date(job.expiresAt).getTime();
    const baseTtl = Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
    return baseTtl + this.config.jobRecordGraceSeconds;
  }
}
