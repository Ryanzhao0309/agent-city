import type { AgentApproval, AgentRun, AgentRunEvent, AgentToolInvocation } from "../types";
import { apiUrl } from "./api";

export async function listAgentRuns(agentId?: string): Promise<AgentRun[]> {
  const response = await fetch(apiUrl(`/api/agent-runs${agentId ? `?agentId=${encodeURIComponent(agentId)}` : ""}`));
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "任务列表读取失败。");
  return Array.isArray(data?.runs) ? data.runs : [];
}

export async function createAgentRun(agentId: string, prompt: string): Promise<AgentRun> {
  const response = await fetch(apiUrl("/api/agent-runs"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ agentId, prompt, title: prompt.slice(0, 120), source: "manual" }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "任务创建失败。");
  return data.run;
}

export async function getAgentRun(runId: string): Promise<{ run: AgentRun; approvals: AgentApproval[]; invocations: AgentToolInvocation[]; events: AgentRunEvent[] }> {
  const response = await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(runId)}`));
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "任务读取失败。");
  return {
    run: data.run,
    approvals: Array.isArray(data.approvals) ? data.approvals : [],
    invocations: Array.isArray(data.invocations) ? data.invocations : [],
    events: Array.isArray(data.events) ? data.events : [],
  };
}

const runEventTypes = [
  "received", "running", "intent_analyzing", "intent_analyzed", "memory_recalled", "routed", "workflow_started", "workflow_resumed",
  "slot_updated", "knowledge_searched", "knowledge_failed", "tool_requested", "tool_rejected", "approval_required",
  "approval_resolved", "tool_completed", "step_advanced", "model_started", "model_completed",
  "reply_streaming", "memory_saved", "memory_failed", "waiting_user", "completed", "failed", "cancelled",
];

export function subscribeAgentRunEvents(runId: string, onEvent: (event: AgentRunEvent) => void): () => void {
  const source = new EventSource(apiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/events`));
  const receive = (raw: MessageEvent<string>) => {
    try { onEvent(JSON.parse(raw.data) as AgentRunEvent); } catch { /* Ignore malformed relay events. */ }
  };
  runEventTypes.forEach((type) => source.addEventListener(type, receive as EventListener));
  return () => source.close();
}

export async function resolveAgentApproval(approvalId: string, decision: "approved" | "denied"): Promise<void> {
  const response = await fetch(apiUrl(`/api/agent-approvals/${encodeURIComponent(approvalId)}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "审批失败。");
}

export async function cancelAgentRun(runId: string): Promise<AgentRun> {
  const response = await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(runId)}`), { method: "DELETE" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "取消任务失败。");
  return data.run as AgentRun;
}

export async function retryAgentRun(runId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/retry`), { method: "POST" });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "重试任务失败。");
}

export interface GoogleConnectionStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  scopes: string[];
  gmail: boolean;
  gmailDraft: boolean;
  calendar: boolean;
  connectedAt: string | null;
}

export async function getGoogleStatus(): Promise<GoogleConnectionStatus> {
  const response = await fetch(apiUrl("/api/google/status"));
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Google 状态读取失败。");
  return data;
}

export async function startGoogleOAuth(services: Array<"gmail" | "calendar">): Promise<string> {
  const response = await fetch(apiUrl("/api/google/oauth/start"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ services }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "Google 授权启动失败。");
  return data.authUrl;
}

export async function disconnectGoogle(): Promise<void> {
  const response = await fetch(apiUrl("/api/google"), { method: "DELETE" });
  if (!response.ok) throw new Error("Google 断开失败。");
}
