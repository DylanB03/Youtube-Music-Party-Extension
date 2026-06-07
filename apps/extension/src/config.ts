export const API_BASE_URL =
  import.meta.env.WXT_PUBLIC_PARTY_API_BASE_URL ?? "http://localhost:8787";

export function apiUrl(path: string): string {
  return new URL(path, API_BASE_URL).toString();
}

export function wsUrl(path: string): string {
  const url = new URL(path, API_BASE_URL);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}
