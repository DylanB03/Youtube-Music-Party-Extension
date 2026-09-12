import type { Env } from "../types";

type RateLimitOptions = {
  scope:
    | "create-room"
    | "join-room"
    | "resolve-room"
    | "connection-ticket"
    | "leave-room";
};

export async function enforceRateLimit(
  request: Request,
  env: Env,
  options: RateLimitOptions,
): Promise<Response | null> {
  const clientAddress =
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() ??
    "local";
  const limiter = options.scope === "create-room"
    ? env.CREATE_ROOM_RATE_LIMITER
    : options.scope === "join-room"
      ? env.JOIN_ROOM_RATE_LIMITER
      : env.API_RATE_LIMITER;
  const { success } = await limiter.limit({
    key: `ytm-party:${options.scope}:${clientAddress}`,
  });

  if (!success) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again shortly.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  return null;
}
