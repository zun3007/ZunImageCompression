import type { FastifyInstance } from "fastify";

export type HealthCheck = () => Promise<{
  redis: "ok" | "down";
}>;

export const registerHealthRoutes = (app: FastifyInstance, healthCheck: HealthCheck): void => {
  app.get("/health", async (_request, reply) => {
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
