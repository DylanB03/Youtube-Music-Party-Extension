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

export function inviteLandingPage(inviteCode: string): Response {
  const safeCode = inviteCode
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>YouTube Music Party</title>
  </head>
  <body>
    <main style="font-family: sans-serif; max-width: 36rem; margin: 4rem auto; padding: 1rem;">
      <h1>YouTube Music Party</h1>
      <p>Open YouTube Music, open the extension side panel, and enter this party code:</p>
      <p style="font-size: 2rem; letter-spacing: 0.18em; font-weight: 700;">${safeCode}</p>
    </main>
  </body>
</html>`,
    {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    },
  );
}
