export function jsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

export async function parseJson<T>(request: Request): Promise<T> {
  const body = await request.json();
  return body as T;
}
