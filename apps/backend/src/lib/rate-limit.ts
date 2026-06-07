import type { Env } from "../types";

type RateLimitOptions = {
  scope: string;
  limit: number;
  windowSeconds: number;
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
  const windowId = Math.floor(Date.now() / (options.windowSeconds * 1000));
  const key = `rate:${options.scope}:${clientAddress}:${windowId}`;
  const current = Number((await env.INVITES.get(key)) ?? "0");

  if (current >= options.limit) {
    return new Response(
      JSON.stringify({
        error: "Too many requests. Please try again shortly.",
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(options.windowSeconds),
        },
      },
    );
  }

  await env.INVITES.put(key, String(current + 1), {
    expirationTtl: options.windowSeconds * 2,
  });
  return null;
}
