import type { FastifyInstance } from "fastify";

import { healthSchema } from "../docs/schemas.js";

export type HealthCheck = () => Promise<{
  redis: "ok" | "down";
}>;

export const registerHealthRoutes = <TApp extends FastifyInstance>(
  app: TApp,
  healthCheck: HealthCheck
): void => {
  app.get("/health", { schema: healthSchema }, async (_request, reply) => {
    const health = await healthCheck().catch(() => ({ redis: "down" as const }));

    if (health.redis === "down") {
      return reply.code(503).send({
        status: "degraded",
        ...health
      });
    }

    return {
      status: "ok",
      ...health
    };
  });
};
