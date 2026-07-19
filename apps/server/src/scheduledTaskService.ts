import crypto from "node:crypto";
import { db } from "./db.js";
import { listAgentConfigs, saveAgentConfig, type AgentConfigRecord } from "./agentStore.js";

export type ScheduleType = "once" | "daily" | "weekly" | "monthly";
export type ScheduledTaskStatus = "active" | "paused" | "completed" | "archived";

export interface ScheduledTask {
  id: string;
  agentId: string;
  title: string;
  prompt: string;
  scheduleType: ScheduleType;
  schedule: Record<string, unknown>;
  timezone: string;
  status: ScheduledTaskStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  runCount: number;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskDraft {
  title: string;
  prompt: string;
  scheduleType: ScheduleType;
  schedule: Record<string, unknown>;
  timezone: string;
  confidence: number;
  reason: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
function nowIso(): string { return new Date().toISOString(); }
function parseJson(value: unknown): Record<string, unknown> {
  try { const parsed = JSON.parse(String(value ?? "{}")); return isRecord(parsed) ? parsed : {}; } catch { return {}; }
}

function rowToTask(row: Record<string, unknown>): ScheduledTask {
  return {
    id: String(row.id), agentId: String(row.agent_id), title: String(row.title), prompt: String(row.prompt),
    scheduleType: String(row.schedule_type) as ScheduleType, schedule: parseJson(row.schedule_json),
    timezone: String(row.timezone), status: String(row.status) as ScheduledTaskStatus,
    nextRunAt: row.next_run_at == null ? null : String(row.next_run_at), lastRunAt: row.last_run_at == null ? null : String(row.last_run_at),
    lastStatus: row.last_status == null ? null : String(row.last_status), runCount: Number(row.run_count ?? 0),
    sourceSessionId: row.source_session_id == null ? null : String(row.source_session_id),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function zonedParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    hourCycle: "h23", weekday: "short",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  return {
    year: Number(value("year")), month: Number(value("month")), day: Number(value("day")), hour: Number(value("hour")), minute: Number(value("minute")),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(value("weekday")),
  };
}

function zonedLocalToUtc(year: number, month: number, day: number, hour: number, minute: number, timezone: string): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let candidate = new Date(desired);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(candidate, timezone);
    const actualUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, 0, 0);
    candidate = new Date(candidate.getTime() + desired - actualUtc);
  }
  return candidate;
}

function parseTime(value: unknown): [number, number] {
  const match = text(value).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return [9, 0];
  return [Math.min(23, Number(match[1])), Math.min(59, Number(match[2]))];
}

export function computeNextRunAt(scheduleType: ScheduleType, schedule: Record<string, unknown>, timezone: string, after = new Date()): string | null {
  if (scheduleType === "once") {
    const runAt = new Date(text(schedule.runAt));
    return Number.isNaN(runAt.getTime()) || runAt <= after ? null : runAt.toISOString();
  }
  const [hour, minute] = parseTime(schedule.time);
  const local = zonedParts(after, timezone);
  const localNoon = new Date(Date.UTC(local.year, local.month - 1, local.day, 12));
  for (let offset = 0; offset < 370; offset += 1) {
    const day = new Date(localNoon); day.setUTCDate(localNoon.getUTCDate() + offset);
    const year = day.getUTCFullYear(), month = day.getUTCMonth() + 1, date = day.getUTCDate(), weekday = day.getUTCDay();
    const matches = scheduleType === "daily"
      || (scheduleType === "weekly" && Array.isArray(schedule.weekdays) && schedule.weekdays.map(Number).includes(weekday))
      || (scheduleType === "monthly" && Number(schedule.dayOfMonth) === date);
    if (!matches) continue;
    const candidate = zonedLocalToUtc(year, month, date, hour, minute, timezone);
    if (candidate > after) return candidate.toISOString();
  }
  return null;
}

function normalizedTimezone(value: unknown): string {
  const timezone = text(value) || "Asia/Shanghai";
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); return timezone; } catch { return "Asia/Shanghai"; }
}

function displayTime(hour: number, minute: number): string { return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`; }
function adjustedHour(raw: number, marker: string): number {
  if (/下午|晚上/.test(marker) && raw < 12) return raw + 12;
  if (/凌晨/.test(marker) && raw === 12) return 0;
  return Math.min(23, raw);
}

function extractClock(input: string): { time: string; marker: string } | null {
  const match = input.match(/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})(?::|点)(\d{1,2})?\s*分?/);
  if (!match) return null;
  const hour = adjustedHour(Number(match[2]), match[1] ?? "");
  return { time: displayTime(hour, Number(match[3] ?? 0)), marker: match[0] };
}

function cleanedPrompt(input: string): string {
  return input
    .replace(/^\s*(?:请)?(?:在)?\s*\d+\s*(?:分钟|小时)后\s*/, "")
    .replace(/^\s*(?:请)?(?:在)?\s*(?:今天|明天|每天|每日|工作日|每周[一二三四五六日天、和至到]*|每月\d{1,2}[号日]?)\s*/, "")
    .replace(/^(?:的)?\s*(?:凌晨|早上|上午|中午|下午|晚上)?\s*\d{1,2}(?::|点)\d{0,2}\s*分?\s*/, "")
    .replace(/^帮我\s*/, "")
    .trim() || input.trim();
}

const weekdayMap: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

export function parseScheduledTaskDraft(input: string, timezoneValue = "Asia/Shanghai", current = new Date()): ScheduledTaskDraft {
  const source = input.trim();
  if (!source) throw new Error("任务描述不能为空。");
  const timezone = normalizedTimezone(timezoneValue);
  const relative = source.match(/(\d+)\s*(分钟|小时)后/);
  const clock = extractClock(source);
  let scheduleType: ScheduleType = "once";
  let schedule: Record<string, unknown>;
  let reason = "识别为一次性任务";
  if (relative) {
    const amount = Number(relative[1]) * (relative[2] === "小时" ? 60 : 1);
    schedule = { runAt: new Date(current.getTime() + amount * 60_000).toISOString() };
    reason = `识别为 ${relative[1]}${relative[2]}后执行一次`;
  } else if (/每天|每日/.test(source)) {
    scheduleType = "daily"; schedule = { time: clock?.time ?? "09:00" }; reason = "识别为每天执行";
  } else if (/工作日/.test(source)) {
    scheduleType = "weekly"; schedule = { time: clock?.time ?? "09:00", weekdays: [1, 2, 3, 4, 5] }; reason = "识别为工作日执行";
  } else if (/每周/.test(source)) {
    const dayText = source.match(/每周([一二三四五六日天、和至到]+)/)?.[1] ?? "一";
    const weekdays = [...new Set([...dayText].map((item) => weekdayMap[item]).filter((item) => item !== undefined))];
    scheduleType = "weekly"; schedule = { time: clock?.time ?? "09:00", weekdays: weekdays.length ? weekdays : [1] }; reason = "识别为每周执行";
  } else if (/每月/.test(source)) {
    const day = Math.min(31, Math.max(1, Number(source.match(/每月\s*(\d{1,2})/)?.[1] ?? 1)));
    scheduleType = "monthly"; schedule = { time: clock?.time ?? "09:00", dayOfMonth: day }; reason = "识别为每月执行";
  } else {
    const local = zonedParts(current, timezone);
    const target = new Date(Date.UTC(local.year, local.month - 1, local.day, 12));
    if (/明天/.test(source)) target.setUTCDate(target.getUTCDate() + 1);
    const [hour, minute] = parseTime(clock?.time ?? "09:00");
    let runAt = zonedLocalToUtc(target.getUTCFullYear(), target.getUTCMonth() + 1, target.getUTCDate(), hour, minute, timezone);
    if (!/今天|明天/.test(source) && runAt <= current) runAt = new Date(runAt.getTime() + 86_400_000);
    schedule = { runAt: runAt.toISOString() };
  }
  return { title: source.slice(0, 80), prompt: cleanedPrompt(source), scheduleType, schedule, timezone, confidence: relative || clock || /每天|每日|工作日|每周|每月|今天|明天/.test(source) ? 0.95 : 0.55, reason };
}

export function listScheduledTasks(agentId: string, includeArchived = false): ScheduledTask[] {
  const rows = db.prepare(`SELECT * FROM scheduled_task WHERE agent_id=? ${includeArchived ? "" : "AND status<>'archived'"} ORDER BY created_at DESC`).all(agentId) as Record<string, unknown>[];
  return rows.map(rowToTask);
}

export function getScheduledTask(id: string): ScheduledTask | null {
  const row = db.prepare("SELECT * FROM scheduled_task WHERE id=?").get(id) as Record<string, unknown> | undefined;
  return row ? rowToTask(row) : null;
}

export function createScheduledTask(agentId: string, draft: ScheduledTaskDraft, sourceSessionId?: string | null): ScheduledTask {
  const id = crypto.randomUUID(), timestamp = nowIso();
  const timezone = normalizedTimezone(draft.timezone);
  const nextRunAt = computeNextRunAt(draft.scheduleType, draft.schedule, timezone, new Date(Date.now() - 1000));
  if (!nextRunAt) throw new Error("无法计算下一次执行时间，请检查任务计划。");
  db.prepare(`INSERT INTO scheduled_task
    (id,agent_id,title,prompt,schedule_type,schedule_json,timezone,status,next_run_at,source_session_id,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'active',?,?,?,?)`)
    .run(id, agentId, draft.title.slice(0, 120), draft.prompt.slice(0, 4000), draft.scheduleType, JSON.stringify(draft.schedule), timezone, nextRunAt, sourceSessionId ?? null, timestamp, timestamp);
  return getScheduledTask(id)!;
}

export function updateScheduledTask(id: string, patch: Partial<Pick<ScheduledTask, "title" | "prompt" | "scheduleType" | "schedule" | "timezone" | "status">>): ScheduledTask {
  const current = getScheduledTask(id); if (!current) throw new Error("定时任务不存在。");
  const scheduleType = patch.scheduleType ?? current.scheduleType, schedule = patch.schedule ?? current.schedule;
  const timezone = normalizedTimezone(patch.timezone ?? current.timezone), status = patch.status ?? current.status;
  const nextRunAt = status === "active" ? computeNextRunAt(scheduleType, schedule, timezone, new Date(Date.now() - 1000)) : null;
  db.prepare(`UPDATE scheduled_task SET title=?,prompt=?,schedule_type=?,schedule_json=?,timezone=?,status=?,next_run_at=?,lease_until=NULL,updated_at=? WHERE id=?`)
    .run((patch.title ?? current.title).slice(0, 120), (patch.prompt ?? current.prompt).slice(0, 4000), scheduleType, JSON.stringify(schedule), timezone, status, nextRunAt, nowIso(), id);
  return getScheduledTask(id)!;
}

export function archiveScheduledTask(id: string): ScheduledTask { return updateScheduledTask(id, { status: "archived" }); }

export function claimDueScheduledTasks(at = new Date(), limit = 10): ScheduledTask[] {
  const rows = db.prepare(`SELECT task.* FROM scheduled_task task
    WHERE task.status='active' AND task.next_run_at<=? AND (task.lease_until IS NULL OR task.lease_until<?)
    AND NOT EXISTS (SELECT 1 FROM agent_run run WHERE run.scheduled_task_id=task.id AND run.scheduled_for=task.next_run_at)
    ORDER BY task.next_run_at LIMIT ?`)
    .all(at.toISOString(), at.toISOString(), limit) as Record<string, unknown>[];
  const claimed: ScheduledTask[] = [];
  for (const row of rows) {
    const leaseUntil = new Date(at.getTime() + 120_000).toISOString();
    const result = db.prepare(`UPDATE scheduled_task SET lease_until=?,updated_at=? WHERE id=? AND status='active' AND next_run_at=? AND (lease_until IS NULL OR lease_until<?)`)
      .run(leaseUntil, nowIso(), String(row.id), String(row.next_run_at), at.toISOString());
    if (Number(result.changes) === 1) claimed.push(getScheduledTask(String(row.id))!);
  }
  return claimed;
}

export function releaseScheduledTaskLease(id: string): void { db.prepare("UPDATE scheduled_task SET lease_until=NULL,updated_at=? WHERE id=?").run(nowIso(), id); }

export function finishScheduledTaskOccurrence(id: string, scheduledFor: string, status: string, manual = false): void {
  const task = getScheduledTask(id); if (!task) return;
  if (manual) {
    db.prepare(`UPDATE scheduled_task SET last_run_at=?,last_status=?,run_count=run_count+1,lease_until=NULL,updated_at=? WHERE id=?`)
      .run(nowIso(), status, nowIso(), id);
    return;
  }
  const coalescedAfter = new Date(Math.max(Date.now(), new Date(scheduledFor).getTime() + 1000));
  const next = task.scheduleType === "once" ? null : computeNextRunAt(task.scheduleType, task.schedule, task.timezone, coalescedAfter);
  const taskStatus: ScheduledTaskStatus = task.scheduleType === "once" ? "completed" : next ? "active" : "completed";
  db.prepare(`UPDATE scheduled_task SET status=?,next_run_at=?,last_run_at=?,last_status=?,run_count=run_count+1,lease_until=NULL,updated_at=? WHERE id=?`)
    .run(taskStatus, next, nowIso(), status, nowIso(), id);
}

export function migrateLegacyScheduledTasks(): number {
  let migrated = 0;
  for (const [agentId, config] of Object.entries(listAgentConfigs())) {
    const legacy = Array.isArray(config.timedTasks) ? config.timedTasks : [];
    if (!legacy.length) continue;
    const scheduleConfig = isRecord(config.schedule) ? config.schedule : {};
    const timezone = normalizedTimezone(scheduleConfig.timezone);
    for (const value of legacy) {
      if (!isRecord(value)) continue;
      const id = text(value.id) || crypto.randomUUID();
      if (getScheduledTask(id)) continue;
      const days = Array.isArray(value.days) ? value.days.map(Number).filter((day) => day >= 0 && day <= 6) : [1, 2, 3, 4, 5];
      const scheduleType: ScheduleType = days.length === 7 ? "daily" : "weekly";
      const taskSchedule = scheduleType === "daily" ? { time: text(value.time) || "09:00" } : { time: text(value.time) || "09:00", weekdays: days };
      const draft: ScheduledTaskDraft = { title: text(value.title) || "定时任务", prompt: text(value.title) || "执行定时任务", scheduleType, schedule: taskSchedule, timezone, confidence: 1, reason: "旧任务迁移" };
      const task = createScheduledTask(agentId, draft);
      if (id !== task.id) db.prepare("UPDATE scheduled_task SET id=? WHERE id=?").run(id, task.id);
      if (value.enabled === false) updateScheduledTask(id, { status: "paused" });
      migrated += 1;
    }
    const nextConfig: AgentConfigRecord = { ...config };
    delete nextConfig.timedTasks;
    saveAgentConfig(agentId, nextConfig);
  }
  return migrated;
}
