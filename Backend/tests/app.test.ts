import { afterEach, describe, expect, it } from "vitest";

import { defaultJobOptions } from "../src/domain/options.js";
import { createAnimatedGifBuffer, createJpegBuffer, createPngBuffer } from "./helpers/images.js";
import { createTestApp } from "./helpers/memory.js";
import { buildMultipartRequest } from "./helpers/multipart.js";

const contexts: Array<Awaited<ReturnType<typeof createTestApp>>> = [];

const createContext = async (overrides?: Parameters<typeof createTestApp>[0]) => {
  const context = await createTestApp(overrides);
  contexts.push(context);
  return context;
};

const waitForCompletion = async (
  app: Awaited<ReturnType<typeof createTestApp>>["app"],
  jobId: string
) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const response = await app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}`
    });

    const payload = response.json();
    if (
      payload.status === "completed" ||
      payload.status === "completed_with_errors" ||
      payload.status === "failed"
    ) {
      return payload;
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error(`Timed out waiting for job ${jobId}`);
};

afterEach(async () => {
  while (contexts.length > 0) {
    const context = contexts.pop();
    if (context) {
      await context.cleanup();
    }
  }
});

describe("Fastify image job API", () => {
  it("creates a batch job, polls it, and downloads binary output", async () => {
    const context = await createContext();
    const multipart = buildMultipartRequest({
      fields: [{ name: "options", value: JSON.stringify(defaultJobOptions) }],
      files: [
        {
          fieldName: "files",
          filename: "first.jpg",
          contentType: "image/jpeg",
          data: await createJpegBuffer()
        },
        {
          fieldName: "files",
          filename: "second.png",
          contentType: "image/png",
          data: await createPngBuffer()
        }
      ]
    });

    const createResponse = await context.app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: multipart.body,
      headers: multipart.headers
    });

    expect(createResponse.statusCode).toBe(202);
    const { jobId } = createResponse.json();

    const job = await waitForCompletion(context.app, jobId);

    expect(["completed", "completed_with_errors"]).toContain(job.status);
    expect(job.items).toHaveLength(2);
    expect(job.items.every((item: { status: string }) => item.status === "completed")).toBe(true);

    const download = await context.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/items/${job.items[0].itemId}/file`
    });

    expect(download.statusCode).toBe(200);
    expect(download.headers["content-type"]).toMatch(/^image\//);
    expect(download.rawPayload.byteLength).toBeGreaterThan(0);
  });

  it("rejects invalid files before enqueueing", async () => {
    const context = await createContext();
    const multipart = buildMultipartRequest({
      files: [
        {
          fieldName: "files",
          filename: "bad.txt",
          contentType: "text/plain",
          data: Buffer.from("not-an-image")
        }
      ]
    });

    const response = await context.app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: multipart.body,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(422);
  });

  it("rejects malformed options JSON", async () => {
    const context = await createContext();
    const multipart = buildMultipartRequest({
      fields: [{ name: "options", value: "{bad-json" }],
      files: [
        {
          fieldName: "files",
          filename: "test.jpg",
          contentType: "image/jpeg",
          data: await createJpegBuffer()
        }
      ]
    });

    const response = await context.app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: multipart.body,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toMatch(/valid json/i);
  });

  it("rejects uploads that exceed the configured size limit", async () => {
    const context = await createContext({
      maxUploadFileSize: 128
    });
    const multipart = buildMultipartRequest({
      files: [
        {
          fieldName: "files",
          filename: "large.jpg",
          contentType: "image/jpeg",
          data: await createJpegBuffer()
        }
      ]
    });

    const response = await context.app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: multipart.body,
      headers: multipart.headers
    });

    expect(response.statusCode).toBe(413);
  });

  it("returns partial success when some items fail during processing", async () => {
    const context = await createContext();
    const multipart = buildMultipartRequest({
      fields: [
        {
          name: "options",
          value: JSON.stringify({
            ...defaultJobOptions,
            output: {
              ...defaultJobOptions.output,
              format: "jpeg"
            }
          })
        }
      ],
      files: [
        {
          fieldName: "files",
          filename: "still.jpg",
          contentType: "image/jpeg",
          data: await createJpegBuffer()
        },
        {
          fieldName: "files",
          filename: "animated.gif",
          contentType: "image/gif",
          data: createAnimatedGifBuffer()
        }
      ]
    });

    const createResponse = await context.app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: multipart.body,
      headers: multipart.headers
    });

    expect(createResponse.statusCode).toBe(202);
    const { jobId } = createResponse.json();
    const job = await waitForCompletion(context.app, jobId);

    expect(job.status).toBe("completed_with_errors");
    expect(job.items.some((item: { status: string }) => item.status === "completed")).toBe(true);
    expect(job.items.some((item: { status: string }) => item.status === "failed")).toBe(true);
  });

  it("returns 410 for expired artifacts", async () => {
    const context = await createContext();
    const multipart = buildMultipartRequest({
      files: [
        {
          fieldName: "files",
          filename: "expiring.jpg",
          contentType: "image/jpeg",
          data: await createJpegBuffer()
        }
      ]
    });

    const createResponse = await context.app.inject({
      method: "POST",
      url: "/v1/jobs",
      payload: multipart.body,
      headers: multipart.headers
    });

    const { jobId } = createResponse.json();
    const job = await waitForCompletion(context.app, jobId);

    await context.repository.update(jobId, (current) => {
      current.expiresAt = new Date(Date.now() - 1_000).toISOString();
      return current;
    });

    const response = await context.app.inject({
      method: "GET",
      url: `/v1/jobs/${jobId}/items/${job.items[0].itemId}/file`
    });

    expect(response.statusCode).toBe(410);
  });

  it("serves the OpenAPI document for easier manual testing", async () => {
    const context = await createContext();

    const response = await context.app.inject({
      method: "GET",
      url: "/docs/json"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().openapi).toBe("3.0.3");
  });
});
