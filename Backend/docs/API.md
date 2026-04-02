# Backend API Docs

Manual API documentation for the Fastify backend service.

## Base URLs

- Local: `http://127.0.0.1:3000`
- Docker Compose: `http://localhost:3000`

## Interactive Docs

- Swagger UI: `/docs`
- OpenAPI JSON: `/docs/json`

## Overview

The backend is an async image processing service.

Flow:

1. Upload one or more images to create a job
2. Poll job status until processing finishes
3. Download each completed artifact as binary

Current characteristics:

- internal service, no auth in v1
- shared processing options for all files in one job
- Redis for queue/state
- local disk artifact storage with TTL expiration

## Endpoints

### `GET /health`

Checks API liveness and Redis availability.

Example response:

```json
{
  "status": "ok",
  "redis": "ok"
}
```

Degraded response:

```json
{
  "status": "degraded",
  "redis": "down"
}
```

### `POST /v1/jobs`

Creates an async batch job.

Content type:

```text
multipart/form-data
```

Form fields:

- `files`: one or more image files
- `options`: JSON string with shared processing options

Supported input formats:

- `jpeg`
- `png`
- `webp`
- `avif`
- `gif`
- `tiff`

Example `curl`:

```bash
curl -X POST http://127.0.0.1:3000/v1/jobs \
  -F "files=@./image-1.jpg" \
  -F "files=@./image-2.png" \
  -F "options={\"output\":{\"format\":\"keep\",\"lossless\":false,\"progressive\":false},\"optimize\":{\"autoConvert\":true,\"minQuality\":60,\"maxQuality\":85},\"metadata\":{\"keepExif\":false,\"keepIccProfile\":false,\"keepXmp\":false},\"animation\":{\"enabled\":true,\"maxFrames\":200}}"
```

Success response:

```json
{
  "jobId": "624307c0-9994-417c-89c0-24ae88a26793",
  "status": "queued",
  "fileCount": 2
}
```

### `GET /v1/jobs/:jobId`

Returns aggregate job state and per-file results.

Possible job statuses:

- `queued`
- `processing`
- `completed`
- `completed_with_errors`
- `failed`

Possible item statuses:

- `queued`
- `processing`
- `completed`
- `failed`

Example response:

```json
{
  "jobId": "624307c0-9994-417c-89c0-24ae88a26793",
  "status": "completed",
  "fileCount": 2,
  "completedCount": 2,
  "failedCount": 0,
  "createdAt": "2026-04-02T03:31:29.336Z",
  "updatedAt": "2026-04-02T03:31:29.392Z",
  "expiresAt": "2026-04-03T03:31:29.392Z",
  "items": [
    {
      "itemId": "2b9ee719-b678-453b-b780-6ef959443522",
      "originalFilename": "first.jpg",
      "status": "completed",
      "output": {
        "format": "avif",
        "width": 240,
        "height": 180,
        "bytes": 296,
        "downloadUrl": "/v1/jobs/624307c0-9994-417c-89c0-24ae88a26793/items/2b9ee719-b678-453b-b780-6ef959443522/file"
      },
      "metrics": {
        "inputBytes": 519,
        "outputBytes": 296,
        "compressionRatio": 0.57,
        "durationMs": 31
      },
      "error": null
    }
  ]
}
```

### `GET /v1/jobs/:jobId/items/:itemId/file`

Downloads one processed artifact as binary.

Behavior:

- `200` when artifact is ready
- `404` when job or item does not exist
- `409` when item is not completed yet
- `410` when artifact has expired or is missing

Example `curl`:

```bash
curl -L "http://127.0.0.1:3000/v1/jobs/<jobId>/items/<itemId>/file" --output result.webp
```

## Processing Options

The `options` field in `POST /v1/jobs` is a JSON string.

Example full payload:

```json
{
  "output": {
    "format": "keep",
    "quality": 82,
    "lossless": false,
    "progressive": false,
    "chromaSubsampling": "4:2:0",
    "compressionLevel": 9,
    "effort": 6
  },
  "resize": {
    "width": 1600,
    "height": 1600,
    "fit": "inside",
    "position": "centre",
    "withoutEnlargement": true,
    "withoutReduction": false,
    "background": "#ffffff"
  },
  "optimize": {
    "targetMaxBytes": 250000,
    "minQuality": 60,
    "maxQuality": 85,
    "autoConvert": true
  },
  "metadata": {
    "keepExif": false,
    "keepIccProfile": false,
    "keepXmp": false
  },
  "animation": {
    "enabled": true,
    "maxFrames": 200
  }
}
```

### Output options

- `format`: `jpeg | png | webp | avif | keep`
- `quality`: quality for lossy output
- `lossless`: mainly for `webp` and `avif`
- `progressive`: mainly for `jpeg` and `png`
- `chromaSubsampling`: `4:4:4 | 4:2:0`
- `compressionLevel`: mainly for `png`
- `effort`: encoder effort for `webp` or `avif`

### Resize options

- `width`
- `height`
- `fit`: `cover | contain | fill | inside | outside`
- `position`:
  - `centre`
  - `top`
  - `right top`
  - `right`
  - `right bottom`
  - `bottom`
  - `left bottom`
  - `left`
  - `left top`
- `withoutEnlargement`
- `withoutReduction`
- `background`

### Optimize options

- `targetMaxBytes`: try to get under a byte target
- `minQuality`: lower quality bound during search
- `maxQuality`: upper quality bound during search
- `autoConvert`: auto-choose best output format when `format=keep`

### Metadata options

- `keepExif`
- `keepIccProfile`
- `keepXmp`

Default behavior strips metadata to reduce file size.

### Animation options

- `enabled`
- `maxFrames`

Animated inputs are preserved in v1 when enabled. Current preserved animated output path is `webp`.

## Default Behavior

Defaults when `options` is omitted:

```json
{
  "output": {
    "format": "keep",
    "lossless": false,
    "progressive": false
  },
  "optimize": {
    "autoConvert": true,
    "minQuality": 60,
    "maxQuality": 85
  },
  "metadata": {
    "keepExif": false,
    "keepIccProfile": false,
    "keepXmp": false
  },
  "animation": {
    "enabled": true,
    "maxFrames": 200
  }
}
```

Other operational defaults:

- artifact TTL: `24h`
- max files per job: `10`
- max file size per upload: `25MB`
- queue attempts: `3`

## Format Selection Rules

When `output.format = "keep"` and `optimize.autoConvert = true`:

- animated input: prefer `webp`
- transparent static input: prefer `webp`
- opaque static input: prefer `avif`

When `targetMaxBytes` is set:

- the service runs a bounded quality search
- it tries to stay under the target
- it never goes below `minQuality`
- if target cannot be met, it returns the smallest result found inside the allowed range

## Error Responses

Common errors:

### `400 Bad Request`

- malformed `options` JSON
- no files uploaded
- too many files
- invalid option combinations

Example:

```json
{
  "error": "Field 'options' must be valid JSON"
}
```

### `413 Payload Too Large`

- file exceeds configured upload limit

Example:

```json
{
  "error": "Uploaded file exceeds the configured size limit"
}
```

### `422 Unprocessable Entity`

- unsupported input format
- animated image disabled
- animated frame count over limit
- invalid requested animated output combination

Example:

```json
{
  "error": "Input file contains unsupported image format"
}
```

### `404 Not Found`

```json
{
  "error": "Job not found"
}
```

### `409 Conflict`

```json
{
  "error": "Processed artifact is not ready yet"
}
```

### `410 Gone`

```json
{
  "error": "Processed artifact has expired"
}
```

## Local Testing

### Node runtime

1. Copy env:

   ```bash
   cp Backend/.env.example Backend/.env
   ```

2. Start Redis
3. Start API:

   ```bash
   npm run dev:api
   ```

4. Start worker:

   ```bash
   npm run dev:worker
   ```

### Docker Compose

```bash
docker compose up --build
```

Then open:

- `http://localhost:3000/docs`
- `http://localhost:3000/docs/json`
