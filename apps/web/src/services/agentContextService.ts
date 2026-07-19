import type { AgentMemory } from "../types";
import { apiUrl } from "./api";

const LOCAL_USER_ID = "local-user";

async function result(response: Response): Promise<any> {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "员工上下文操作失败。");
  return data;
}

export async function listAgentMemories(agentId: string): Promise<AgentMemory[]> {
  const data = await result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/memories?userId=${LOCAL_USER_ID}`)));
  return Array.isArray(data.memories) ? data.memories : [];
}

export async function getAutomaticMemoryEnabled(agentId: string): Promise<boolean> {
  const data = await result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/memories?userId=${LOCAL_USER_ID}`)));
  return data.autoMemoryEnabled !== false;
}

export async function setAutomaticMemoryEnabled(agentId: string, enabled: boolean): Promise<boolean> {
  const data = await result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/memory-settings`), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ autoMemoryEnabled: enabled }),
  }));
  return data.autoMemoryEnabled !== false;
}

export async function saveAgentMemory(agentId: string, memory: Pick<AgentMemory, "kind" | "key" | "content">): Promise<AgentMemory> {
  const data = await result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/memories`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...memory, userId: LOCAL_USER_ID }),
  }));
  return data.memory;
}

export async function updateAgentMemory(agentId: string, memoryId: string, content: string): Promise<AgentMemory> {
  const data = await result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/memories/${encodeURIComponent(memoryId)}`), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, userId: LOCAL_USER_ID }),
  }));
  return data.memory;
}

export async function deleteAgentMemory(agentId: string, memoryId: string): Promise<void> {
  await result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/memories/${encodeURIComponent(memoryId)}?userId=${LOCAL_USER_ID}`), { method: "DELETE" }));
}

export async function reindexAgentKnowledge(agentId: string): Promise<{ indexed: number; skipped: number; errors: string[] }> {
  return result(await fetch(apiUrl(`/api/agents/${encodeURIComponent(agentId)}/knowledge/reindex`), { method: "POST" }));
}
