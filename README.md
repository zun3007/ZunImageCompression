# ZunImageCompression

Monorepo scaffold for an async image compression platform.

## Structure

- `Backend/`: Fastify + TypeScript image compression/conversion service
- `Frontend/`: reserved workspace for future UI/client work

## Backend capabilities

- multipart batch upload
- async processing with BullMQ + Redis
- image resize/compression/conversion with Sharp
- binary download endpoints for processed outputs
- local artifact storage with TTL cleanup
- Swagger UI and OpenAPI JSON for easier API testing
- Dockerized API, worker, and Redis stack

## Docs

- Backend API docs: [Backend/docs/API.md](./Backend/docs/API.md)
- Codex setup: [docs/CODEX_SETUP.md](./docs/CODEX_SETUP.md)
- Codex config template: [docs/CODEX_CONFIG.example.toml](./docs/CODEX_CONFIG.example.toml)
- Codex personalization: [docs/CODEX_PERSONALIZATION.md](./docs/CODEX_PERSONALIZATION.md)
- MCP maintenance checklist: [docs/MCP_CHECKLIST.md](./docs/MCP_CHECKLIST.md)
- Swagger UI: `http://127.0.0.1:3000/docs`
- OpenAPI JSON: `http://127.0.0.1:3000/docs/json`

## Quick start

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy backend env file:

   ```bash
   cp Backend/.env.example Backend/.env
   ```

3. Start Redis, then run:

   ```bash
   npm run dev:api
   npm run dev:worker
   ```

4. Open Swagger UI:

   ```text
   http://127.0.0.1:3000/docs
   ```

## Docker

Production-friendly defaults live in [Backend/.env.production](./Backend/.env.production).

Start the full stack:

```bash
docker compose up --build
```

Services:

- API: `http://127.0.0.1:3000`
- Swagger UI: `http://127.0.0.1:3000/docs`
- OpenAPI JSON: `http://127.0.0.1:3000/docs/json`

Use [docker-compose.yml](./docker-compose.yml) for local container orchestration and [Backend/Dockerfile](./Backend/Dockerfile) for both `api` and `worker` images.

## Notes

- v1 is backend-first and internal-only.
- `Frontend/` is intentionally empty for now.
- GitHub Actions CI validates `typecheck`, `lint`, `test`, and `build` on pushes and pull requests.
