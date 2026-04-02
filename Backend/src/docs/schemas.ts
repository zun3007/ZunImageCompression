export const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" }
  }
} as const;

export const healthSchema = {
  tags: ["System"],
  summary: "Health check",
  response: {
    200: {
      type: "object",
      required: ["status", "redis"],
      properties: {
        status: { type: "string", enum: ["ok"] },
        redis: { type: "string", enum: ["ok"] }
      }
    },
    503: {
      type: "object",
      required: ["status", "redis"],
      properties: {
        status: { type: "string", enum: ["degraded"] },
        redis: { type: "string", enum: ["down"] }
      }
    }
  }
} as const;

export const createJobSchema = {
  tags: ["Jobs"],
  summary: "Create an async image processing job",
  body: {
    type: "object",
    additionalProperties: true
  },
  response: {
    202: {
      type: "object",
      required: ["jobId", "status", "fileCount"],
      properties: {
        jobId: { type: "string" },
        status: { type: "string", enum: ["queued"] },
        fileCount: { type: "integer" }
      }
    },
    400: errorSchema,
    413: errorSchema,
    422: errorSchema
  }
} as const;

export const createJobDocBodySchema = {
  type: "object",
  required: ["files"],
  properties: {
    options: {
      type: "string",
      description: "JSON string containing shared processing options for all files in the batch"
    },
    files: {
      type: "array",
      items: {
        isFile: true
      },
      description: "One or more image files"
    }
  }
} as const;

export const getJobSchema = {
  tags: ["Jobs"],
  summary: "Get async job status",
  params: {
    type: "object",
    required: ["jobId"],
    properties: {
      jobId: { type: "string" }
    }
  },
  response: {
    200: {
      type: "object",
      required: [
        "jobId",
        "status",
        "fileCount",
        "completedCount",
        "failedCount",
        "createdAt",
        "updatedAt",
        "expiresAt",
        "items"
      ],
      properties: {
        jobId: { type: "string" },
        status: {
          type: "string",
          enum: ["queued", "processing", "completed", "completed_with_errors", "failed"]
        },
        fileCount: { type: "integer" },
        completedCount: { type: "integer" },
        failedCount: { type: "integer" },
        createdAt: { type: "string", format: "date-time" },
        updatedAt: { type: "string", format: "date-time" },
        expiresAt: { type: "string", format: "date-time" },
        items: {
          type: "array",
          items: {
            type: "object",
            required: ["itemId", "originalFilename", "status", "output", "metrics", "error"],
            properties: {
              itemId: { type: "string" },
              originalFilename: { type: "string" },
              status: { type: "string", enum: ["queued", "processing", "completed", "failed"] },
              output: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    required: ["format", "width", "height", "bytes", "downloadUrl"],
                    properties: {
                      format: { type: "string" },
                      width: { type: "integer" },
                      height: { type: "integer" },
                      bytes: { type: "integer" },
                      downloadUrl: { type: "string" }
                    }
                  }
                ]
              },
              metrics: {
                anyOf: [
                  { type: "null" },
                  {
                    type: "object",
                    required: ["inputBytes", "outputBytes", "compressionRatio", "durationMs"],
                    properties: {
                      inputBytes: { type: "integer" },
                      outputBytes: { type: "integer" },
                      compressionRatio: { type: "number" },
                      durationMs: { type: "integer" }
                    }
                  }
                ]
              },
              error: {
                anyOf: [{ type: "null" }, { type: "string" }]
              }
            }
          }
        }
      }
    },
    404: errorSchema
  }
} as const;

export const downloadJobItemSchema = {
  tags: ["Jobs"],
  summary: "Download a processed image artifact",
  params: {
    type: "object",
    required: ["jobId", "itemId"],
    properties: {
      jobId: { type: "string" },
      itemId: { type: "string" }
    }
  },
  response: {
    200: {
      type: "string",
      format: "binary"
    },
    404: errorSchema,
    409: errorSchema,
    410: errorSchema
  }
} as const;
