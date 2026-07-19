import crypto from "node:crypto";
import { db } from "./db.js";

export interface AgentSession {
  id: string;
  userId: string;
  agentId: string;
  title: string;
  status: string;
  summary: string;
  activeWorkflow: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface AgentMessage {
  id: string;
  sessionId: string;
  runId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function parse(value: unknown): Record<string, unknown> {
  if (typeof value !== "string" || !value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function sessionRow(row: Record<string, unknown>): AgentSession {
  return {
    id: String(row.id), userId: String(row.user_id ?? "local-user"), agentId: String(row.agent_id), title: String(row.title), status: String(row.status),
    summary: String(row.summary ?? ""), activeWorkflow: row.active_workflow_json ? parse(row.active_workflow_json) : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function messageRow(row: Record<string, unknown>): AgentMessage {
  return {
    id: String(row.id), sessionId: String(row.session_id), runId: row.run_id == null ? null : String(row.run_id),
    role: String(row.role) as AgentMessage["role"], content: String(row.content), metadata: parse(row.metadata_json),
    createdAt: String(row.created_at),
  };
}

export function createSession(agentId: string, title = "新对话", userId = "local-user"): AgentSession {
  const id = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO agent_session
    (id, user_id, agent_id, title, status, summary, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', '', ?, ?)`)
    .run(id, userId.trim().slice(0, 160) || "local-user", agentId, title.trim().slice(0, 120) || "新对话", timestamp, timestamp);
  return getSession(id)!;
}

export function getSession(sessionId: string): AgentSession | null {
  const row = db.prepare("SELECT * FROM agent_session WHERE id=?").get(sessionId) as Record<string, unknown> | undefined;
  return row ? sessionRow(row) : null;
}

export function listSessions(agentId?: string, limit = 100): AgentSession[] {
  const rows = (agentId
    ? db.prepare("SELECT * FROM agent_session WHERE agent_id=? ORDER BY updated_at DESC LIMIT ?").all(agentId, Math.min(limit, 200))
    : db.prepare("SELECT * FROM agent_session ORDER BY updated_at DESC LIMIT ?").all(Math.min(limit, 200))) as Array<Record<string, unknown>>;
  return rows.map(sessionRow);
}

export function deleteSession(sessionId: string): boolean {
  const session = getSession(sessionId);
  if (!session) return false;
  const activeRun = db.prepare(`SELECT 1 FROM agent_run
    WHERE session_id=? AND status IN ('queued','running','waiting_approval','waiting_user') LIMIT 1`).get(sessionId);
  if (activeRun) throw new Error("这个对话还有正在执行或等待处理的任务，请先终止任务再删除。");

  const runIds = (db.prepare("SELECT id FROM agent_run WHERE session_id=?").all(sessionId) as Array<{ id: string }>).map((row) => row.id);
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("UPDATE memory_record SET source_session_id=NULL WHERE source_session_id=?").run(sessionId);
    db.prepare("UPDATE scheduled_task SET source_session_id=NULL WHERE source_session_id=?").run(sessionId);
    for (const runId of runIds) {
      db.prepare("DELETE FROM approval_request WHERE run_id=?").run(runId);
      db.prepare("DELETE FROM tool_invocation WHERE run_id=?").run(runId);
      db.prepare("DELETE FROM agent_run_event WHERE run_id=?").run(runId);
      db.prepare("DELETE FROM workflow_run_state WHERE run_id=?").run(runId);
      db.prepare("DELETE FROM scheduled_task_fire WHERE run_id=?").run(runId);
    }
    db.prepare("DELETE FROM agent_message WHERE session_id=?").run(sessionId);
    db.prepare("DELETE FROM agent_run WHERE session_id=?").run(sessionId);
    db.prepare("DELETE FROM agent_session WHERE id=?").run(sessionId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function appendMessage(
  sessionId: string,
  role: AgentMessage["role"],
  content: string,
  options: { runId?: string; metadata?: Record<string, unknown>; id?: string } = {},
): AgentMessage {
  const session = getSession(sessionId);
  if (!session) throw new Error("会话不存在。");
  const id = options.id ?? crypto.randomUUID();
  const timestamp = new Date().toISOString();
  db.prepare(`INSERT INTO agent_message
    (id, session_id, run_id, role, content, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(id, sessionId, options.runId ?? null, role, content, JSON.stringify(options.metadata ?? {}), timestamp);
  const nextTitle = session.title === "新对话" && role === "user" ? content.trim().slice(0, 28) || session.title : session.title;
  db.prepare("UPDATE agent_session SET title=?, updated_at=? WHERE id=?").run(nextTitle, timestamp, sessionId);
  return getMessage(id)!;
}

export function getMessage(messageId: string): AgentMessage | null {
  const row = db.prepare("SELECT * FROM agent_message WHERE id=?").get(messageId) as Record<string, unknown> | undefined;
  return row ? messageRow(row) : null;
}

export function updateMessage(messageId: string, content: string, metadata?: Record<string, unknown>): AgentMessage {
  const current = getMessage(messageId);
  if (!current) throw new Error("消息不存在。");
  db.prepare("UPDATE agent_message SET content=?, metadata_json=? WHERE id=?")
    .run(content, JSON.stringify(metadata ?? current.metadata), messageId);
  db.prepare("UPDATE agent_session SET updated_at=? WHERE id=?").run(new Date().toISOString(), current.sessionId);
  return getMessage(messageId)!;
}

export function attachMessageRun(messageId: string, runId: string): AgentMessage {
  if (!getMessage(messageId)) throw new Error("消息不存在。");
  db.prepare("UPDATE agent_message SET run_id=? WHERE id=?").run(runId, messageId);
  return getMessage(messageId)!;
}

export function listMessages(sessionId: string, limit = 200): AgentMessage[] {
  const rows = db.prepare(`SELECT * FROM agent_message WHERE session_id=?
    ORDER BY created_at, id LIMIT ?`).all(sessionId, Math.min(limit, 500)) as Array<Record<string, unknown>>;
  return rows.map(messageRow);
}

export function recentModelMessages(sessionId: string, limit = 20): Array<{ role: "user" | "assistant"; content: string }> {
  const rows = db.prepare(`SELECT role, content FROM agent_message
    WHERE session_id=? AND role IN ('user','assistant') ORDER BY created_at DESC, id DESC LIMIT ?`)
    .all(sessionId, Math.min(limit, 40)) as Array<{ role: "user" | "assistant"; content: string }>;
  rows.reverse();
  return rows;
}

export function setSessionWorkflow(sessionId: string, state: Record<string, unknown> | null): void {
  db.prepare("UPDATE agent_session SET active_workflow_json=?, updated_at=? WHERE id=?")
    .run(state ? JSON.stringify(state) : null, new Date().toISOString(), sessionId);
}
