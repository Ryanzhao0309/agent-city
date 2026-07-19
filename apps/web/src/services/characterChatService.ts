import type {
  AiBrainConfig,
  BookmarkGroup,
  CharacterChatMessage,
  CharacterCoreFiles,
  NpcDefinition,
  PlacedBuilding,
  LearnedSkill,
  AgentTimedTask,
  AgentWorkSchedule,
  AgentRunEvent,
  AgentRunStatus,
} from "../types";
import { apiUrl } from "./api";

export interface CharacterChatPayload {
  character: NpcDefinition;
  building: PlacedBuilding | null;
  brain: AiBrainConfig;
  files: CharacterCoreFiles;
  messages: CharacterChatMessage[];
  bookmarkGroups: BookmarkGroup[];
  characterName: string;
  managementLanguage: string;
  cityLordName?: string;
  cityContext?: unknown;
  learnedSkills?: LearnedSkill[];
  schedule?: AgentWorkSchedule;
  timedTasks?: AgentTimedTask[];
}

export interface CharacterChatResult {
  message: string;
  sessionId: string;
  runId: string;
  assistantMessageId: string;
  status: AgentRunStatus;
  events: AgentRunEvent[];
  citations: Array<Record<string, unknown>>;
}

export interface ServerAgentSession { id: string; agentId: string; title: string; createdAt: string; updatedAt: string; }
export interface ServerAgentMessage { id: string; sessionId: string; runId: string | null; role: "user" | "assistant" | "system"; content: string; metadata: Record<string, unknown>; createdAt: string; }

export async function listServerAgentSessions(agentId: string): Promise<ServerAgentSession[]> {
  const response = await fetch(apiUrl(`/api/agent-sessions?agentId=${encodeURIComponent(agentId)}`));
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "会话同步失败。");
  return Array.isArray(data?.sessions) ? data.sessions : [];
}

export async function listServerAgentMessages(sessionId: string): Promise<ServerAgentMessage[]> {
  const response = await fetch(apiUrl(`/api/agent-sessions/${encodeURIComponent(sessionId)}/messages`));
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error ?? "消息同步失败。");
  return Array.isArray(data?.messages) ? data.messages : [];
}

export async function deleteServerAgentSession(sessionId: string): Promise<void> {
  const response = await fetch(apiUrl(`/api/agent-sessions/${encodeURIComponent(sessionId)}`), { method: "DELETE" });
  if (response.ok || response.status === 404) return;
  const data = await response.json().catch(() => null);
  throw new Error(data?.error ?? "会话删除失败。");
}

const runEventTypes = [
  "received", "running", "intent_analyzing", "intent_analyzed", "memory_recalled", "routed", "workflow_started", "workflow_resumed",
  "slot_updated", "knowledge_searched", "knowledge_failed", "tool_requested", "tool_rejected", "approval_required",
  "approval_resolved", "tool_completed", "step_advanced", "model_started", "model_completed",
  "reply_streaming", "memory_saved", "memory_failed", "waiting_user", "completed", "failed", "cancelled",
];

export async function sendCharacterChat(
  payload: CharacterChatPayload,
  options: {
    serverSessionId?: string;
    onStarted?: (value: { sessionId: string; runId: string; assistantMessageId: string; eventCursor: number }) => void;
    onEvent?: (event: AgentRunEvent) => void;
  } = {},
): Promise<CharacterChatResult> {
  const latestMessage = payload.messages[payload.messages.length - 1];
  let sessionId = options.serverSessionId;
  const createServerSession = async (): Promise<string> => {
    const sessionResponse = await fetch(apiUrl("/api/agent-sessions"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: "local-user",
        agentId: payload.character.id,
        title: latestMessage?.content.slice(0, 28) || "新对话",
        messages: payload.messages.slice(0, -1).map((message) => ({
          role: message.role,
          content: message.content,
          metadata: message.attachments?.length ? { attachments: message.attachments } : undefined,
        })),
      }),
    });
    const sessionData = await sessionResponse.json().catch(() => null);
    if (!sessionResponse.ok) throw new Error(sessionData?.error ?? "会话创建失败。");
    return String(sessionData.session.id);
  };
  const createTurn = (targetSessionId: string) => fetch(apiUrl(`/api/agent-sessions/${encodeURIComponent(targetSessionId)}/turns`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: latestMessage?.content ?? "",
        attachments: latestMessage?.attachments ?? [],
        request: {
          characterName: payload.characterName,
          characterRole: payload.character.role,
          buildingId: payload.building?.id ?? null,
          buildingName: payload.building?.name ?? null,
          buildingType: payload.building?.type ?? payload.character.defaultBuildingType,
          managementLanguage: payload.managementLanguage,
          cityLordName: payload.cityLordName ?? "",
        },
      }),
    });

  if (!sessionId) sessionId = await createServerSession();
  let response = await createTurn(sessionId);
  let data = await response.json().catch(() => null);
  const staleSession = Boolean(options.serverSessionId) && (
    response.status === 404
    || data?.error === "会话不存在。"
    || data?.error === "会话和消息不能为空。"
  );
  if (!response.ok && staleSession) {
    sessionId = await createServerSession();
    response = await createTurn(sessionId);
    data = await response.json().catch(() => null);
  }
  if (!response.ok) {
    throw new Error(data?.error ?? "员工任务创建失败。");
  }
  const runId = String(data.runId);
  const assistantMessageId = String(data.assistantMessageId);
  const eventCursor = Number.isFinite(Number(data.eventCursor)) ? Number(data.eventCursor) : 0;
  options.onStarted?.({ sessionId: sessionId!, runId, assistantMessageId, eventCursor });
  const events: AgentRunEvent[] = [];
  return await new Promise<CharacterChatResult>((resolve, reject) => {
    const source = new EventSource(apiUrl(`/api/agent-runs/${encodeURIComponent(runId)}/events?after=${eventCursor}`));
    let settled = false;
    const close = () => { if (!settled) settled = true; source.close(); };
    const finish = async (status: AgentRunStatus, error?: string) => {
      if (settled) return;
      close();
      if (error) { reject(new Error(error)); return; }
      const detailResponse = await fetch(apiUrl(`/api/agent-runs/${encodeURIComponent(runId)}`));
      const detail = await detailResponse.json().catch(() => null);
      const run = detail?.run;
      const messageResponse = await fetch(apiUrl(`/api/agent-sessions/${encodeURIComponent(sessionId!)}/messages`));
      const messageData = await messageResponse.json().catch(() => null);
      const assistant = Array.isArray(messageData?.messages)
        ? messageData.messages.find((item: { id?: string }) => item.id === assistantMessageId)
        : null;
      resolve({
        message: assistant?.content || run?.resultText || "任务已完成。",
        sessionId: sessionId!, runId, assistantMessageId, status,
        events,
        citations: Array.isArray(assistant?.metadata?.citations) ? assistant.metadata.citations : [],
      });
    };
    const receive = (raw: MessageEvent<string>) => {
      try {
        const event = JSON.parse(raw.data) as AgentRunEvent;
        if (!events.some((item) => item.id === event.id)) events.push(event);
        options.onEvent?.(event);
        if (event.type === "completed") void finish("succeeded");
        else if (event.type === "waiting_user") void finish("waiting_user");
        else if (event.type === "failed") void finish("failed", String(event.data?.error ?? "员工任务失败。"));
        else if (event.type === "cancelled") void finish("cancelled");
      } catch { /* Ignore malformed relay events. */ }
    };
    for (const type of runEventTypes) source.addEventListener(type, receive as EventListener);
    source.onerror = () => {
      if (!settled && source.readyState === EventSource.CLOSED) reject(new Error("执行记录连接已断开，请到任务中心查看结果。"));
    };
  });
}
