import type { SessionMeta } from "../types";

export function messageSizeBytes(raw: unknown): number {
  if (typeof raw === "string") return new TextEncoder().encode(raw).byteLength;
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (ArrayBuffer.isView(raw)) return raw.byteLength;
  return new TextEncoder().encode(String(raw)).byteLength;
}

export function consumeMessageAllowance(
  session: SessionMeta,
  nowMs: number,
  maxMessages: number,
  windowMs: number,
): boolean {
  if (nowMs - session.messageWindowStartedAtMs >= windowMs) {
    session.messageWindowStartedAtMs = nowMs;
    session.messageCount = 0;
  }

  session.messageCount += 1;
  return session.messageCount <= maxMessages;
}
