import {
  isServerMessage,
  type ServerMessage,
} from "@ytm-party/shared";

export function parseServerMessage(raw: unknown): ServerMessage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(raw));
  } catch {
    return null;
  }

  if (!isServerMessage(parsed)) return null;
  return parsed;
}
