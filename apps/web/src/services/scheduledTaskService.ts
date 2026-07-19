import type { ScheduledTask, ScheduledTaskDraft } from "../types";
import { apiUrl } from "./api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), init);
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "定时任务操作失败。");
  return data as T;
}

export async function listScheduledTasks(agentId: string): Promise<ScheduledTask[]> {
  const data = await request<{ tasks: ScheduledTask[] }>(`/api/agents/${encodeURIComponent(agentId)}/scheduled-tasks`);
  return data.tasks;
}

export async function parseScheduledTask(agentId: string, input: string, timezone: string): Promise<ScheduledTaskDraft> {
  const data = await request<{ draft: ScheduledTaskDraft }>(`/api/agents/${encodeURIComponent(agentId)}/scheduled-tasks/draft`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input, timezone }),
  });
  return data.draft;
}

export async function createScheduledTask(agentId: string, draft: ScheduledTaskDraft, sourceSessionId?: string): Promise<ScheduledTask> {
  const data = await request<{ task: ScheduledTask }>(`/api/agents/${encodeURIComponent(agentId)}/scheduled-tasks`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...draft, sourceSessionId }),
  });
  return data.task;
}

export async function updateScheduledTask(taskId: string, patch: Partial<ScheduledTask>): Promise<ScheduledTask> {
  const data = await request<{ task: ScheduledTask }>(`/api/scheduled-tasks/${encodeURIComponent(taskId)}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
  });
  return data.task;
}

export async function archiveScheduledTask(taskId: string): Promise<ScheduledTask> {
  const data = await request<{ task: ScheduledTask }>(`/api/scheduled-tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" });
  return data.task;
}

export async function runScheduledTaskNow(taskId: string): Promise<AgentRunStub> {
  const data = await request<{ run: AgentRunStub }>(`/api/scheduled-tasks/${encodeURIComponent(taskId)}/run`, { method: "POST" });
  return data.run;
}

interface AgentRunStub { id?: string; runId?: string; sessionId?: string; }
