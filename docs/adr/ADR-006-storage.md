# ADR-006: S3-compatible object storage with private buckets + signed URLs

## Status

Accepted

## Context

Uploads (product images, buyback photos, inspection photos) are
user-hostile input by default (brief §42/§43) and must never be served
directly from user-controlled paths or executed.

## Decision

- Use an **S3-compatible object store**: AWS S3 (or Cloudflare R2) in
  production, **MinIO** in Docker Compose for local development — same
  S3 API in both, so the storage client code is identical across envs.
- **Two buckets** (or prefixes with distinct IAM policies):
  - `originals` — private, never publicly readable, holds the
    as-uploaded file after validation.
  - `public` — the processed/optimized derivatives (thumbnails, web
    sizes) that are safe and intended to be public (marketing product
    photos), served via CDN.
- Buyback/inspection photos (potentially sensitive, tied to a specific
  customer and item) stay in a private bucket permanently and are only
  ever accessed via **short-lived signed URLs**, generated server-side
  after an authorization check (the requesting user must own the
  buyback or hold `buyback.inspect`/`buyback.read`).
- Upload pipeline (server-side, never trusting client claims):
  1. Client requests a signed **upload** URL for a specific purpose
     (`PRODUCT_IMAGE`, `BUYBACK_PHOTO`, `INSPECTION_PHOTO`) — server
     checks authorization and issues a constrained pre-signed PUT
     (size limit, content-type constraint) tied to a server-generated
     random object key (the original filename is never used as the key
     or trusted for extension).
  2. On confirmation, a server job re-fetches the object, verifies
     **magic bytes** (not just the `Content-Type` header) against an
     allowlist (`image/jpeg`, `image/png`, `image/webp`), strips EXIF,
     re-encodes to a safe format at fixed max dimensions, and only then
     writes the derivative(s) to the `public`/serving path and creates
     the `ProductImage`/photo DB row. A file that fails validation is
     deleted and never linked to any entity.
  3. Antivirus scanning (e.g. ClamAV sidecar) is a documented
     follow-up for when a suitable managed/self-hosted scanning service
     is selected — flagged as a gap, not silently skipped (see
     THREAT_MODEL.md, "malicious upload").

## Consequences

- No uploaded file is ever served at a guessable/static path with its
  original name or extension.
- Access to sensitive photos is always mediated by a server-side
  authorization check, never bucket-level public ACLs.
- Local dev (MinIO) and production (S3/R2) share one storage
  abstraction (`lib/storage`), swappable via env config only.

## Alternatives considered

- **Storing files in Postgres (bytea)**: rejected — wrong tool, bloats
  the DB, no CDN story.
- **Directly public bucket for all uploads**: rejected — violates
  least-privilege and makes buyback/inspection photos (customer PII)
  world-readable by URL guessing.
