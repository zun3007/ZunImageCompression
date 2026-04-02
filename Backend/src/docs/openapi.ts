import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance } from "fastify";

import type { AppConfig } from "../config.js";

export const registerOpenApi = async <TApp extends FastifyInstance>(
  app: TApp,
  config: AppConfig
): Promise<void> => {
  if (!config.swaggerEnabled) {
    return;
  }

  await app.register(swagger, {
    openapi: {
      info: {
        title: "ZunImageCompression API",
        description: "Async image compression and conversion service",
        version: "0.1.0"
      },
      servers: [
        {
          url: config.appBaseUrl
        }
      ],
      tags: [
        { name: "Jobs", description: "Async image processing jobs" },
        { name: "System", description: "System and health endpoints" }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: config.swaggerRoutePrefix,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    },
    staticCSP: true
  });
};
