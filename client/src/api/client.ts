import { apiPrefix } from "../config/paths";

function apiErrorMessage(err: {
  error?: string;
  hint?: string;
  shortfalls?: string[];
  available?: { total: number; easy: number; medium: number; hard: number };
  details?: { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
}): string {
  const parts: string[] = [];
  const fieldErrors = err.details?.fieldErrors;
  if (fieldErrors) {
    for (const [field, messages] of Object.entries(fieldErrors)) {
      for (const message of messages) parts.push(`${field}: ${message}`);
    }
  }
  const formErrors = err.details?.formErrors;
  if (formErrors?.length) parts.push(...formErrors);
  if (parts.length === 0) {
    parts.push([err.error, err.hint].filter(Boolean).join(" — ") || "Request failed");
  }
  if (err.available) {
    parts.push(
      `Found ${err.available.total} published (${err.available.easy} easy, ${err.available.medium} medium, ${err.available.hard} hard)`
    );
  }
  if (err.shortfalls?.length) parts.push(...err.shortfalls);
  return parts.join("; ");
}

export async function api<T>(
  path: string,
  options?: RequestInit & { json?: unknown }
): Promise<T> {
  const headers: Record<string, string> = { ...(options?.headers as Record<string, string>) };
  let body = options?.body;
  if (options?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }
  const res = await fetch(`${apiPrefix}${path}`, {
    ...options,
    headers,
    body,
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(apiErrorMessage(err));
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export async function apiForm<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${apiPrefix}${path}`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(apiErrorMessage(err));
  }
  return res.json();
}

export function downloadUrl(path: string) {
  return `${apiPrefix}${path}`;
}
