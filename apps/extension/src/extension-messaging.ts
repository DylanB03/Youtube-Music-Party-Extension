import type { ExtensionRequest, ExtensionResponse } from "@ytm-party/shared";
import { browser } from "./browser";

export async function sendExtensionRequest<T = unknown>(
  request: ExtensionRequest,
): Promise<ExtensionResponse<T>> {
  return browser.runtime.sendMessage(request) as Promise<ExtensionResponse<T>>;
}

export function ok<T>(data: T): ExtensionResponse<T> {
  return { ok: true, data };
}

export function error(message: string): ExtensionResponse<never> {
  return { ok: false, error: message };
}
