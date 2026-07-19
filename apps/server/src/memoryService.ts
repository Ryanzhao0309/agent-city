import crypto from "node:crypto";
import { db } from "./db.js";

export type MemoryKind = "profile" | "preference" | "fact";

export interface MemoryRecord {
  id: string;
  userId: string;
  agentId: string;
  kind: MemoryKind;
  key: string;
  content: string;
  importance: number;
  sourceSessionId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

const KINDS = new Set<MemoryKind>(["profile", "preference", "fact"]);

function parse(value: unknown): Record<string, unknown> {
  if (typeof value !== "string") return {};
  try {
    const result = JSON.parse(value);
    return result && typeof result === "object" && !Array.isArray(result) ? result : {};
  } catch {
    return {};
  }
}

function rowToMemory(row: Record<string, unknown>): MemoryRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    agentId: String(row.agent_id),
    kind: String(row.kind) as MemoryKind,
    key: String(row.memory_key),
    content: String(row.content),
    importance: Number(row.importance),
    sourceSessionId: row.source_session_id == null ? null : String(row.source_session_id),
    metadata: parse(row.metadata_json),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export function listMemories(userId: string, agentId: string, limit = 100): MemoryRecord[] {
  const rows = db.prepare(`SELECT * FROM memory_record
    WHERE user_id = ? AND agent_id = ? AND kind IN ('profile', 'preference', 'fact')
    ORDER BY updated_at DESC LIMIT ?`).all(userId, agentId, Math.min(Math.max(limit, 1), 300)) as Array<Record<string, unknown>>;
  return rows.map(rowToMemory);
}

export function automaticMemoryEnabled(agentId: string): boolean {
  const row = db.prepare("SELECT auto_enabled FROM agent_memory_setting WHERE agent_id=?").get(agentId) as { auto_enabled: number } | undefined;
  return row ? row.auto_enabled === 1 : true;
}

export function setAutomaticMemoryEnabled(agentId: string, enabled: boolean): boolean {
  db.prepare(`INSERT INTO agent_memory_setting (agent_id, auto_enabled, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(agent_id) DO UPDATE SET auto_enabled=excluded.auto_enabled, updated_at=excluded.updated_at`)
    .run(agentId, enabled ? 1 : 0, new Date().toISOString());
  return enabled;
}

export function upsertMemory(
  userId: string,
  agentId: string,
  kind: MemoryKind,
  key: string,
  content: string,
  options: { importance?: number; sourceSessionId?: string; metadata?: Record<string, unknown> } = {},
): MemoryRecord {
  if (!KINDS.has(kind)) throw new Error("不支持的记忆类型。");
  const normalizedKey = key.trim().slice(0, 160);
  const normalizedContent = content.trim().slice(0, 12_000);
  if (!normalizedKey || !normalizedContent) throw new Error("记忆 key 和内容不能为空。");
  const timestamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const importance = Math.max(0, Math.min(1, options.importance ?? 0.5));
  db.prepare(`INSERT INTO memory_record
    (id, user_id, agent_id, kind, memory_key, content, importance, source_session_id, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id, agent_id, kind, memory_key) DO UPDATE SET
      content=excluded.content, importance=excluded.importance,
      source_session_id=excluded.source_session_id, metadata_json=excluded.metadata_json,
      updated_at=excluded.updated_at`).run(
    id, userId, agentId, kind, normalizedKey, normalizedContent, importance,
    options.sourceSessionId ?? null, JSON.stringify(options.metadata ?? {}), timestamp, timestamp,
  );
  const row = db.prepare("SELECT * FROM memory_record WHERE user_id=? AND agent_id=? AND kind=? AND memory_key=?")
    .get(userId, agentId, kind, normalizedKey) as Record<string, unknown>;
  return rowToMemory(row);
}

export function updateMemory(
  userId: string,
  agentId: string,
  memoryId: string,
  patch: { content?: string; importance?: number; metadata?: Record<string, unknown> },
): MemoryRecord {
  const row = db.prepare("SELECT * FROM memory_record WHERE id=? AND user_id=? AND agent_id=?").get(memoryId, userId, agentId) as
    | Record<string, unknown>
    | undefined;
  if (!row) throw new Error("记忆不存在。");
  const current = rowToMemory(row);
  const content = patch.content === undefined ? current.content : patch.content.trim().slice(0, 12_000);
  if (!content) throw new Error("记忆内容不能为空。");
  const importance = patch.importance === undefined
    ? current.importance
    : Math.max(0, Math.min(1, patch.importance));
  db.prepare("UPDATE memory_record SET content=?, importance=?, metadata_json=?, updated_at=? WHERE id=? AND user_id=? AND agent_id=?")
    .run(content, importance, JSON.stringify(patch.metadata ?? current.metadata), new Date().toISOString(), memoryId, userId, agentId);
  return rowToMemory(db.prepare("SELECT * FROM memory_record WHERE id=?").get(memoryId) as Record<string, unknown>);
}

export function deleteMemory(userId: string, agentId: string, memoryId: string): boolean {
  return db.prepare("DELETE FROM memory_record WHERE id=? AND user_id=? AND agent_id=?").run(memoryId, userId, agentId).changes > 0;
}

export function memoryContext(userId: string, agentId: string, maxChars = 8_000): string {
  const lines: string[] = [];
  let used = 0;
  for (const memory of listMemories(userId, agentId, 60)) {
    const line = `- [${memory.kind}/${memory.key}] ${memory.content}`;
    if (used + line.length > maxChars) break;
    lines.push(line);
    used += line.length;
  }
  return lines.length ? lines.join("\n") : "No server-side long-term memories.";
}

export function saveSessionSummary(agentId: string, sessionId: string, summary: string): void {
  const content = summary.trim();
  if (!content) return;
  db.prepare("UPDATE agent_session SET summary=?, updated_at=? WHERE id=? AND agent_id=?")
    .run(content.slice(0, 12_000), new Date().toISOString(), sessionId, agentId);
}
