const DEVELOPMENT_API_BASE_URL = "http://localhost:8787";
const configuredApiBaseUrl = import.meta.env.WXT_PUBLIC_PARTY_API_BASE_URL;

if (!import.meta.env.DEV && !configuredApiBaseUrl?.startsWith("https://")) {
  throw new Error("Production extension builds require an HTTPS backend URL.");
}

export const API_BASE_URL =
  configuredApiBaseUrl ?? DEVELOPMENT_API_BASE_URL;

export function apiUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString();
}

export function wsUrl(path: string): string {
  const url = new URL(path, API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
