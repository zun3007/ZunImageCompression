import type { JobRecord } from "../types.js";

export interface JobRepository {
  create(job: JobRecord): Promise<void>;
  get(jobId: string): Promise<JobRecord | null>;
  save(job: JobRecord): Promise<void>;
  update(jobId: string, updater: (job: JobRecord) => JobRecord): Promise<JobRecord | null>;
  delete(jobId: string): Promise<void>;
  ping(): Promise<void>;
  close(): Promise<void>;
}
