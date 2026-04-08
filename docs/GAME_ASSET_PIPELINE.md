# Game Asset Compression Pipeline

## Goal

Ship two outputs from the same source art:

1. **WebP** for current web/app delivery and quick previews.
2. **KTX2/BasisU** for runtime game textures where GPU-friendly packaging matters more than plain image delivery.

This project's current compression script now targets the first path. The KTX2/BasisU path below is the recommended next build stage for a zoomable board game or similar 2D game assets.

---

## Asset classes

### 1. UI / icon / badge / text-like art
- Typical traits: small, sharp edges, alpha, flat colors.
- Current delivery: **WebP lossless or near-lossless**.
- Runtime texture target: **KTX2 + UASTC** when the asset must stay crisp in-engine.

### 2. Large art / board background / splash art
- Typical traits: large raster artwork, gradients, painted details, often no meaningful alpha after trim.
- Current delivery: **WebP lossy** after trim and resize.
- Runtime texture target: **KTX2 + ETC1S** for the standard gameplay tier.

### 3. Zoom-critical art
- Typical traits: board tiles, portraits, inspection views, anything the camera can zoom into.
- Current delivery: keep a **standard** and **zoom** tier instead of one oversized master everywhere.
- Runtime texture target: **KTX2 + UASTC** for the zoom tier, optionally with RDO tuning.

---

## Current WebP pipeline in this repo

The script at `C:\Users\Zun\Desktop\Projects\ZunImageCompression\scripts\compress-test-images.mjs` now does this:

1. Scan `test` recursively and ignore generated output.
2. Detect transparent borders and trim them when safe.
3. Classify each asset:
   - UI-like assets stay full size and prefer lossless/near-lossless WebP.
   - Large art resizes its long edge to `1920px` when bigger.
4. Encode candidates with `cwebp` only.
5. Choose output with two different metrics:
   - **UI**: smallest candidate above the SSIM threshold.
   - **Large art**: smallest candidate within a Butteraugli-distance window of the best candidate, measured on a `640px` proxy.
6. Write clean `.webp` filenames into `test\compressed`.

This is the right practical delivery path while the project is still shipping regular image files.

---

## Recommended KTX2/BasisU pipeline

### Why KTX2/BasisU
For actual game runtime textures, plain image codecs are not the end state. KTX2/BasisU is better because it can be transcoded to GPU texture formats at runtime instead of always treating the asset as a generic decoded bitmap.

### Recommended policy

#### UI / alpha-critical / zoom-critical
- Use **UASTC in KTX2**.
- Reason: prioritize visual stability, edge sharpness, and zoom quality.
- Use this for:
  - icons that are magnified in UI
  - tile art with thin outlines
  - cards, portraits, or pieces that can be inspected closely

#### Standard gameplay backgrounds / board art / low-priority art
- Use **ETC1S in KTX2**.
- Reason: prioritize smaller package size.
- Use this for:
  - board backgrounds
  - decorative art
  - assets usually seen at gameplay zoom, not inspection zoom

#### Hybrid high-quality compromise
- Use **UASTC + RDO** when an asset needs to stay visually strong but still needs more compression than plain UASTC.

---

## Build stages

### Stage A — source normalization
Keep source-of-truth art separate from delivery assets.

Suggested folders:
- `assets/source/ui`
- `assets/source/board`
- `assets/source/characters`
- `assets/source/backgrounds`

Normalization rules:
- Trim useless transparent borders.
- Remove accidental alpha from large opaque art.
- Resize to the real gameplay target, not to an arbitrary huge master for every platform.
- Split zoomable boards into layers or chunks if the camera can inspect them closely.

### Stage B — web delivery build
Produce `.webp` for web/app loading and previews.

Suggested folders:
- `assets/build/webp/ui`
- `assets/build/webp/board`
- `assets/build/webp/zoom`

Rules:
- UI stays lossless/near-lossless.
- Large art uses the current Butteraugli-guided `cwebp` search.
- Zoom-critical art should have at least two tiers:
  - `standard`
  - `zoom`

### Stage C — runtime texture build
Produce `.ktx2` for the game runtime.

Suggested folders:
- `assets/build/ktx2/standard`
- `assets/build/ktx2/zoom`
- `assets/build/ktx2/ui`

Rules:
- Standard gameplay tier: default to **ETC1S**.
- Zoom tier: default to **UASTC**.
- UI tier: default to **UASTC**.
- Keep naming aligned across output types so the runtime can swap tiers deterministically.

Example naming policy:
- `board-main.standard.webp`
- `board-main.zoom.webp`
- `board-main.standard.ktx2`
- `board-main.zoom.ktx2`

---

## Runtime loading strategy

### For current web/app image loading
- Use the generated `.webp` files.
- Good for menus, previews, HTML/CSS UI, and non-engine loading.

### For the game renderer
- Prefer `.ktx2`.
- Load `standard` assets by default.
- Switch to `zoom` assets only when the camera crosses a clear threshold.
- Do not rely on one giant raster to serve every zoom level.

### For a Monopoly-style board
Recommended shape:
- Board frame/layout = code or scene layout
- Decorative raster background = standard tier texture
- Tile art / portraits / inspectable art = zoom tier texture
- Small icons = UASTC UI texture or vector when possible

---

## Integration plan for this repo

### Phase 1 — done / in progress
- WebP-only compression
- `cwebp` encoder
- transparent-border trimming
- large-art resizing
- Butteraugli-style candidate search for large assets

### Phase 2 — next practical step
Add a separate build script, for example:
- `scripts/build-game-textures.mjs`

Responsibilities:
- read normalized source assets
- map each asset to `ui`, `standard`, or `zoom`
- emit `.ktx2` outputs into `assets/build/ktx2`
- keep file stems aligned with `.webp` outputs

### Phase 3 — runtime policy
Add asset manifest metadata such as:
- asset class
- standard path
- zoom path
- alpha flag
- intended max display size

That lets the runtime decide when to use WebP, when to use KTX2, and when to swap standard vs zoom textures.

---

## Decision summary

If the asset is:

- **small and sharp** -> WebP lossless now, UASTC KTX2 later
- **large and mostly decorative** -> Butteraugli-guided WebP now, ETC1S KTX2 later
- **zoom-critical** -> dual-tier WebP now, UASTC KTX2 later

That gives the project a clean path from simple image shipping today to a real game-texture pipeline later.

---

## References

- [WebP cwebp tools documentation](https://chromium.googlesource.com/webm/libwebp.git/%2B/2af26267cdfcb63a88e5c74a85927a12d6ca1d76/doc/tools.md)
- [Android Developers: reducing image download sizes](https://developer.android.com/develop/ui/views/graphics/reduce-image-sizes)
- [Basis Universal repository](https://github.com/BinomialLLC/basis_universal)
- [Basis Universal transcoder guidance](https://github.com/BinomialLLC/basis_universal/wiki/How-to-Use-and-Configure-the-Transcoder)
