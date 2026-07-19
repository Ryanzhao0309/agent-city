import type { DatabaseSync } from "node:sqlite";

export const DESKTOP_NOTIFICATION_EVENT_TYPES = [
  "completed",
  "failed",
  "approval_required",
  "waiting_user",
] as const;

export type DesktopNotificationStatus = typeof DESKTOP_NOTIFICATION_EVENT_TYPES[number];

export interface DesktopNotificationEvent {
  id: number;
  agentId: string;
  agentName: string;
  runId: string;
  taskId: string;
  sessionId: string | null;
  status: DesktopNotificationStatus;
  taskTitle: string;
  summary: string;
  createdAt: string;
}

type NotificationRow = {
  id: number;
  run_id: string;
  type: string;
  data_json: string;
  created_at: string;
  agent_id: string;
  title: string;
  session_id: string | null;
  scheduled_task_id: string;
  task_title: string | null;
};

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function eventSummary(status: DesktopNotificationStatus, dataJson: string): string {
  let data: Record<string, unknown> = {};
  try { data = recordValue(JSON.parse(dataJson)); } catch { /* Invalid event data degrades to the status label. */ }
  const preferred = status === "completed"
    ? data.resultText
    : status === "failed"
      ? data.error
      : status === "approval_required"
        ? data.summary
        : data.reply;
  if (typeof preferred === "string" && preferred.trim()) return preferred.trim();
  return {
    completed: "定时任务已完成。",
    failed: "定时任务执行失败。",
    approval_required: "任务需要你的批准后才能继续。",
    waiting_user: "任务需要你补充信息后才能继续。",
  }[status];
}

function toDesktopNotificationEvent(
  row: NotificationRow,
  resolveAgentName: (agentId: string) => string,
): DesktopNotificationEvent {
  const status = row.type as DesktopNotificationStatus;
  return {
    id: Number(row.id),
    agentId: row.agent_id,
    agentName: resolveAgentName(row.agent_id) || row.agent_id,
    runId: row.run_id,
    taskId: row.scheduled_task_id,
    sessionId: row.session_id,
    status,
    taskTitle: row.task_title?.trim() || row.title,
    summary: eventSummary(status, row.data_json),
    createdAt: row.created_at,
  };
}

const BASE_QUERY = `
  FROM agent_run_event event
  JOIN agent_run run ON run.id = event.run_id
  LEFT JOIN scheduled_task task ON task.id = run.scheduled_task_id
  WHERE run.scheduled_task_id IS NOT NULL
    AND run.source = 'schedule'
    AND event.type IN ('completed', 'failed', 'approval_required', 'waiting_user')`;

export function latestDesktopNotificationCursor(database: DatabaseSync): number {
  const row = database.prepare(`SELECT COALESCE(MAX(event.id), 0) AS id ${BASE_QUERY}`).get() as { id: number };
  return Number(row.id) || 0;
}

export function listDesktopNotificationEvents(
  database: DatabaseSync,
  after = 0,
  limit = 100,
  resolveAgentName: (agentId: string) => string = (agentId) => agentId,
): DesktopNotificationEvent[] {
  const safeAfter = Number.isFinite(after) && after > 0 ? Math.floor(after) : 0;
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(Math.floor(limit), 500)) : 100;
  const rows = database.prepare(`SELECT event.id, event.run_id, event.type, event.data_json, event.created_at,
      run.agent_id, run.title, run.session_id, run.scheduled_task_id, task.title AS task_title
    ${BASE_QUERY} AND event.id > ? ORDER BY event.id LIMIT ?`).all(safeAfter, safeLimit) as NotificationRow[];
  return rows.map((row) => toDesktopNotificationEvent(row, resolveAgentName));
}
