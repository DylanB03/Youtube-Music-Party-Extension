import { readPositiveInteger } from "../lib/config";
import type { Env } from "../types";

export type RoomLimits = {
  maxParticipants: number;
  maxQueueItems: number;
  maxMessageBytes: number;
  maxMessagesPerWindow: number;
  messageWindowMs: number;
  maxDisplayNameLength: number;
};

const DEFAULT_LIMITS: RoomLimits = {
  maxParticipants: 50,
  maxQueueItems: 200,
  maxMessageBytes: 16_384,
  maxMessagesPerWindow: 120,
  messageWindowMs: 10_000,
  maxDisplayNameLength: 40,
};

export function readRoomLimits(env: Env): RoomLimits {
  return {
    maxParticipants: readPositiveInteger(
      env.MAX_PARTICIPANTS,
      DEFAULT_LIMITS.maxParticipants,
    ),
    maxQueueItems: readPositiveInteger(
      env.MAX_QUEUE_ITEMS,
      DEFAULT_LIMITS.maxQueueItems,
    ),
    maxMessageBytes: readPositiveInteger(
      env.MAX_MESSAGE_BYTES,
      DEFAULT_LIMITS.maxMessageBytes,
    ),
    maxMessagesPerWindow: readPositiveInteger(
      env.MAX_MESSAGES_PER_WINDOW,
      DEFAULT_LIMITS.maxMessagesPerWindow,
    ),
    messageWindowMs: readPositiveInteger(
      env.MESSAGE_RATE_WINDOW_MS,
      DEFAULT_LIMITS.messageWindowMs,
    ),
    maxDisplayNameLength: readPositiveInteger(
      env.MAX_DISPLAY_NAME_LENGTH,
      DEFAULT_LIMITS.maxDisplayNameLength,
    ),
  };
}

export function normalizeDisplayName(
  value: unknown,
  fallback: string,
  maxLength: number,
): string | null {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}
