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

## Notes

- v1 is backend-first and internal-only.
- `Frontend/` is intentionally empty for now.
- GitHub Actions CI validates `typecheck`, `lint`, `test`, and `build` on pushes and pull requests.
