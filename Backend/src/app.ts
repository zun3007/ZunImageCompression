import multipart from "@fastify/multipart";
import Fastify from "fastify";

import { registerOpenApi } from "./docs/openapi.js";
import { getErrorMessage, isAppError } from "./errors.js";
import { cleanupTrackedUploads, createMultipartOnFileHandler } from "./http/uploads.js";
import { registerHealthRoutes, type HealthCheck } from "./routes/health.js";
import { registerJobRoutes } from "./routes/jobs.js";
import type { AppConfig } from "./config.js";
import type { JobQueue } from "./queue/jobQueue.js";
import type { JobRepository } from "./repository/jobRepository.js";
import type { LocalArtifactStorage } from "./storage/localArtifactStorage.js";

export const createApp = async (dependencies: {
  config: AppConfig;
  repository: JobRepository;
  queue: JobQueue;
  artifactStorage: LocalArtifactStorage;
  healthCheck: HealthCheck;
}) => {
  const app = Fastify({
    logger: true,
    ajv: {
      plugins: [multipart.ajvFilePlugin as never]
    }
  });

  await registerOpenApi(app, dependencies.config);

  await app.register(multipart, {
    attachFieldsToBody: true,
    onFile: createMultipartOnFileHandler(dependencies.config),
    limits: {
      fileSize: dependencies.config.maxUploadFileSize,
      files: dependencies.config.maxFilesPerJob
    }
  });

  registerHealthRoutes(app, dependencies.healthCheck);
  registerJobRoutes(app, dependencies);

  app.setErrorHandler((error, _request, reply) => {
    void cleanupTrackedUploads(_request);

    if (isAppError(error)) {
      return reply.code(error.statusCode).send({
        error: error.message
      });
    }

    if ((error as { code?: string }).code === "FST_FILES_LIMIT") {
      return reply.code(400).send({
        error: `A maximum of ${dependencies.config.maxFilesPerJob} files is allowed per job`
      });
    }

    if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({
        error: "Uploaded file exceeds the configured size limit"
      });
    }

    app.log.error(error);

    return reply.code(500).send({
      error: getErrorMessage(error)
    });
  });

  app.get("/", async () => ({
    service: "ZunImageCompression Backend"
  }));

  return app;
};
