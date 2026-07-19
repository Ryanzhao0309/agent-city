import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { latestDesktopNotificationCursor, listDesktopNotificationEvents } from "./desktopNotificationService.js";

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE agent_run (id TEXT PRIMARY KEY, agent_id TEXT, source TEXT, title TEXT, session_id TEXT, scheduled_task_id TEXT);
    CREATE TABLE scheduled_task (id TEXT PRIMARY KEY, title TEXT);
    CREATE TABLE agent_run_event (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT, type TEXT, data_json TEXT, created_at TEXT);
  `);
  db.prepare("INSERT INTO scheduled_task VALUES (?, ?)").run("task-1", "每天巡检");
  db.prepare("INSERT INTO agent_run VALUES (?, ?, ?, ?, ?, ?)").run("run-scheduled", "hermes", "schedule", "巡检", "session-1", "task-1");
  db.prepare("INSERT INTO agent_run VALUES (?, ?, ?, ?, ?, ?)").run("run-chat", "hermes", "chat", "聊天", "session-2", null);
  return db;
}

function event(db: DatabaseSync, runId: string, type: string, data: Record<string, unknown>): number {
  const result = db.prepare("INSERT INTO agent_run_event (run_id, type, data_json, created_at) VALUES (?, ?, ?, ?)")
    .run(runId, type, JSON.stringify(data), "2026-07-19T08:00:00.000Z");
  return Number(result.lastInsertRowid);
}

test("desktop notifications include only actionable scheduled-run events", () => {
  const db = database();
  event(db, "run-scheduled", "running", {});
  event(db, "run-chat", "completed", { resultText: "普通聊天完成" });
  const completedId = event(db, "run-scheduled", "completed", { resultText: "一切正常" });
  const approvalId = event(db, "run-scheduled", "approval_required", { summary: "允许发送邮件" });

  assert.deepEqual(listDesktopNotificationEvents(db, 0, 100, () => "Hermes"), [
    {
      id: completedId, agentId: "hermes", agentName: "Hermes", runId: "run-scheduled", taskId: "task-1",
      sessionId: "session-1", status: "completed", taskTitle: "每天巡检", summary: "一切正常", createdAt: "2026-07-19T08:00:00.000Z",
    },
    {
      id: approvalId, agentId: "hermes", agentName: "Hermes", runId: "run-scheduled", taskId: "task-1",
      sessionId: "session-1", status: "approval_required", taskTitle: "每天巡检", summary: "允许发送邮件", createdAt: "2026-07-19T08:00:00.000Z",
    },
  ]);
  assert.equal(latestDesktopNotificationCursor(db), approvalId);
});

test("desktop notification cursor replays strictly after the consumed event", () => {
  const db = database();
  const firstId = event(db, "run-scheduled", "failed", { error: "连接失败" });
  const secondId = event(db, "run-scheduled", "waiting_user", { reply: "请提供日期" });

  const replay = listDesktopNotificationEvents(db, firstId);
  assert.equal(replay.length, 1);
  assert.equal(replay[0].id, secondId);
  assert.equal(replay[0].summary, "请提供日期");
});
