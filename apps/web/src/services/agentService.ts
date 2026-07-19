import type { CharacterRuntimeConfig } from "../types";
import { apiUrl } from "./api";

export interface SkillUrlPreview {
  id?: string;
  slug: string;
  name: string;
  icon: string;
  summary: string;
  sourceUrl: string;
  contentPreview: string;
  content: string;
  resolvedUrl?: string;
  commitSha?: string;
  contentHash?: string;
  requestedCapabilities?: string[];
  alternatives?: Array<{
    slug: string;
    name: string;
    summary: string;
    resolvedUrl?: string;
    commitSha?: string;
    contentHash?: string;
    requestedCapabilities?: string[];
  }>;
}

export interface SkillAdminReview {
  name: string;
  summary: string;
  suitableFor: string[];
  howToUse: string;
  cautions: string[];
}

export async function listAgentConfigs(): Promise<Record<string, CharacterRuntimeConfig>> {
  try {
    const response = await fetch(apiUrl("/api/agents"));
    if (!response.ok) return {};
    const data = await response.json().catch(() => null);
    return data?.agents && typeof data.agents === "object" ? data.agents : {};
  } catch {
    return {};
  }
}

export async function saveAgentConfig(agentId: string, config: CharacterRuntimeConfig): Promise<CharacterRuntimeConfig | null> {
  const response = await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Agent config save failed.");
  return data?.agent ?? null;
}

export async function previewSkillUrl(url: string): Promise<SkillUrlPreview> {
  const response = await fetch(apiUrl("/api/skills/preview-url"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Skill preview failed.");
  return data.skill;
}

export async function previewSkillFile(file: File): Promise<SkillUrlPreview> {
  if (file.size > 256 * 1024) throw new Error("技能文档不能超过 256 KB。");
  const content = await file.text();
  const response = await fetch(apiUrl("/api/skills/preview-content"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, content }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Skill preview failed.");
  return data.skill;
}

export async function reviewSkillWithAgent(agentId: string, skill: SkillUrlPreview): Promise<SkillAdminReview> {
  const response = await fetch(apiUrl("/api/skills/review"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, skill }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "技能管理员审阅失败。");
  return data.review;
}

export async function saveCitySkillToLibrary(skill: SkillUrlPreview): Promise<void> {
  const response = await fetch(apiUrl("/api/skills/library"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ skill }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "城市技能库写入失败。");
}

export async function installSkillForAgents(agentIds: string[], skill: SkillUrlPreview): Promise<Record<string, CharacterRuntimeConfig>> {
  const response = await fetch(apiUrl("/api/agents/skills/install"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentIds, skill }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Skill install failed.");
  return data?.agents ?? {};
}

export async function deleteSkillFromAgents(skillId: string): Promise<Record<string, CharacterRuntimeConfig>> {
  const response = await fetch(apiUrl(`/api/agents/skills/${encodeURIComponent(skillId)}`), {
    method: "DELETE",
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Skill delete failed.");
  return data?.agents ?? {};
}
