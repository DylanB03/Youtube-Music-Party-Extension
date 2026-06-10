export function inviteLandingPage(inviteCode: string): Response {
  const safeCode = escapeHtml(inviteCode);
  const musicUrl = new URL("https://music.youtube.com/");
  musicUrl.searchParams.set("ytm_party", inviteCode);
  const safeMusicUrl = escapeHtml(musicUrl.toString());

  return new Response(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="light" />
    <title>Join a YouTube Music Party</title>
    <style>
      :root {
        color: #27140f;
        background: #fff4df;
        font-family: Georgia, serif;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at 12% 18%, #ffd166 0 12%, transparent 13%),
          radial-gradient(circle at 88% 82%, #f95738 0 10%, transparent 11%),
          #fff4df;
      }
      main {
        width: min(100%, 560px);
        border: 1px solid rgba(123, 45, 24, 0.2);
        border-radius: 28px;
        background: rgba(255, 250, 242, 0.94);
        box-shadow: 0 28px 80px rgba(80, 39, 18, 0.16);
        padding: clamp(24px, 6vw, 48px);
      }
      .eyebrow {
        color: #9d321d;
        font: 700 12px/1.2 monospace;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0;
        font-size: clamp(38px, 8vw, 64px);
        line-height: 0.94;
      }
      p { color: #705b52; line-height: 1.6; }
      .code {
        margin: 24px 0;
        border-radius: 16px;
        background: #27140f;
        color: #ffd166;
        font: 700 clamp(24px, 7vw, 38px)/1 monospace;
        letter-spacing: 0.2em;
        padding: 20px;
        text-align: center;
      }
      a {
        display: block;
        border-radius: 999px;
        background: #f95738;
        color: white;
        font-weight: 700;
        padding: 16px 20px;
        text-align: center;
        text-decoration: none;
      }
      small {
        display: block;
        margin-top: 16px;
        color: #8a746b;
        line-height: 1.5;
      }
    </style>
  </head>
  <body>
    <main>
      <div class="eyebrow">YouTube Music Party</div>
      <h1>You have been invited.</h1>
      <p>Open YouTube Music to prepare this party in the extension. You will still choose your display name and confirm joining.</p>
      <div class="code" aria-label="Party code">${safeCode}</div>
      <a href="${safeMusicUrl}">Open YouTube Music</a>
      <small>If the extension is not installed, keep this page open and enter the code manually after installing it.</small>
    </main>
  </body>
</html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}

export function expiredInvitePage(): Response {
  return new Response(
    `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width" /><title>Party unavailable</title></head>
  <body style="font-family: sans-serif; max-width: 36rem; margin: 4rem auto; padding: 1rem;">
    <h1>This party is no longer available.</h1>
    <p>Ask the host for a new invite link or create another party in the extension.</p>
  </body>
</html>`,
    {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Security-Policy":
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      },
    },
  );
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
