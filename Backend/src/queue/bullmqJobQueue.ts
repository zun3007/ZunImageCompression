import { Queue } from "bullmq";
import type { Redis } from "ioredis";

import type { AppConfig } from "../config.js";
import type { ProcessJobPayload } from "../types.js";
import type { JobQueue } from "./jobQueue.js";

export class BullMqJobQueue implements JobQueue {
  private readonly queue: Queue<ProcessJobPayload>;

  public constructor(connection: Redis, config: AppConfig) {
    this.queue = new Queue<ProcessJobPayload>(config.queueName, {
      connection,
      defaultJobOptions: {
        attempts: config.jobAttempts,
        backoff: {
          type: "exponential",
          delay: config.jobBackoffMs
        },
        removeOnComplete: {
          age: config.jobRemoveOnCompleteAge
        },
        removeOnFail: {
          age: config.jobRemoveOnFailAge
        }
      }
    });
  }

  public async enqueue(payload: ProcessJobPayload): Promise<void> {
    await this.queue.add(payload.jobId, payload);
  }

  public async close(): Promise<void> {
    await this.queue.close();
  }
}
