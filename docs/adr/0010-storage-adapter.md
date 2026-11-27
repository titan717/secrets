# ADR 0010 — Storage adapter for attachments

Status: proposed · 2026-11-27

**Context.** The prototype stores attachment bytes as `bytea` in Postgres. The prompt requires object
storage. But local development must keep working on a phone with no S3 credentials.

**Decision.** A `StorageAdapter` with two drivers: `s3` (Cloudflare R2 / AWS S3, presigned PUT for
uploads, presigned GET or CDN for reads) and `db` (bytea, dev only). Selection by `STORAGE_DRIVER`.
Object keys are UUIDs; user filenames are metadata. Images are re-encoded and thumbnailed before
storage; MIME is determined from magic bytes, never from the client header.

**Consequences.** Production never proxies bytes through the API; dev stays zero-config. Two code paths
must share the same validation and authorization layer, which is covered by a shared integration test
that runs against both drivers.
