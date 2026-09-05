import type { MessageResponse } from "./types";

export class ExtensionRequestError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "ExtensionRequestError";
    this.status = status;
    this.details = details;
  }
}

export async function sendMessage<T>(type: string, payload?: unknown) {
  const response = (await chrome.runtime.sendMessage({
    type,
    payload,
  })) as MessageResponse<T>;

  if (!response?.ok) {
    throw new ExtensionRequestError(
      response?.error?.status ?? 0,
      response?.error?.message ?? "The extension did not respond",
      response?.error?.details,
    );
  }

  return response.data;
}

export function unwrapEnvelope<T>(value: T | { data: T }): T {
  if (value && typeof value === "object" && "data" in value) {
    return value.data;
  }
  return value as T;
}

