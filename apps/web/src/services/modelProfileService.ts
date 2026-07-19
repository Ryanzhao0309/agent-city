import type { ModelProfile, ModelProfileDraft } from "../types";
import { apiUrl } from "./api";

async function result<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? `请求失败 (${response.status})`);
  return data as T;
}

export async function listModelProfiles(): Promise<{ profiles: ModelProfile[]; legacySecretRefs: string[] }> {
  return result(await fetch(apiUrl("/api/model-profiles")));
}

export async function createModelProfile(input: ModelProfileDraft): Promise<ModelProfile> {
  const data = await result<{ profile: ModelProfile }>(await fetch(apiUrl("/api/model-profiles"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  return data.profile;
}

export async function updateModelProfile(id: string, input: Partial<ModelProfileDraft>): Promise<ModelProfile> {
  const data = await result<{ profile: ModelProfile }>(await fetch(apiUrl(`/api/model-profiles/${encodeURIComponent(id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }));
  return data.profile;
}

export async function testModelProfile(id: string): Promise<ModelProfile> {
  const data = await result<{ profile: ModelProfile }>(await fetch(apiUrl(`/api/model-profiles/${encodeURIComponent(id)}/test`), {
    method: "POST",
  }));
  return data.profile;
}

export async function deleteModelProfile(id: string): Promise<void> {
  await result(await fetch(apiUrl(`/api/model-profiles/${encodeURIComponent(id)}`), { method: "DELETE" }));
}
