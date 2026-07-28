// Client-generated identity + timestamps for offline-first records. The UUID
// is the idempotency key the server dedupes on; the ISO client timestamp is
// the ALCOA "contemporaneous" stamp (server time is added on sync ack).

export function uuid(): string {
  return crypto.randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}
