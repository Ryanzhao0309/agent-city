export interface SecretStatus {
  key: string;
  configured: boolean;
  updatedAt?: string;
}

export async function listSecrets(): Promise<SecretStatus[]> {
  const response = await fetch(apiUrl("/api/secrets"));
  if (!response.ok) return [];
  const data = await response.json().catch(() => null);
  return Array.isArray(data?.secrets) ? data.secrets : [];
}

async function readApiError(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const data = await response.json().catch(() => null);
    if (typeof data?.error === "string") return data.error;
  }
  const text = await response.text().catch(() => "");
  if (response.status === 404 && text.includes("<!doctype html")) {
    return "后端 API 没有连接：请同时启动 apps/server，或打开 http://localhost:3000 这个一体化服务。";
  }
  if (response.status >= 500) {
    return "后端 API 保存失败：请确认 apps/server 正在运行并且 SQLite data 目录可写。";
  }
  return `Secret save failed (${response.status}).`;
}

export async function saveSecret(key: string, value: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/secrets/${encodeURIComponent(key)}`), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });
  } catch {
    throw new Error("后端 API 没有连接：请同时启动 apps/server，或打开 http://localhost:3000 这个一体化服务。");
  }
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}

export async function deleteSecret(key: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(apiUrl(`/api/secrets/${encodeURIComponent(key)}`), {
      method: "DELETE",
    });
  } catch {
    throw new Error("后端 API 没有连接：请同时启动 apps/server，或打开 http://localhost:3000 这个一体化服务。");
  }
  if (!response.ok) {
    throw new Error(await readApiError(response));
  }
}
import { apiUrl } from "./api";
