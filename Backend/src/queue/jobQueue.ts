import type { ProcessJobPayload } from "../types.js";

export interface JobQueue {
  enqueue(payload: ProcessJobPayload): Promise<void>;
  close(): Promise<void>;
}
