import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { LATEST_SCHEMA_VERSION, runMigrations } from "./migrations.js";

test("ordered migrations create the resumable runtime schema idempotently", () => {
  const database = new DatabaseSync(":memory:");
  runMigrations(database);
  runMigrations(database);
  const version = database.prepare("SELECT MAX(version) AS version FROM schema_version").get() as { version: number };
  assert.equal(version.version, LATEST_SCHEMA_VERSION);
  const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view')").all() as Array<{ name: string }>).map((row) => row.name));
  for (const name of ["agent_session", "agent_message", "agent_run", "scheduled_task", "workflow_skill", "memory_record", "agent_memory_setting", "knowledge_chunk"]) assert.ok(tables.has(name), name);
  const runColumns = new Set((database.prepare("PRAGMA table_info(agent_run)").all() as Array<{ name: string }>).map((row) => row.name));
  for (const name of ["session_id", "current_stage", "route_json", "state_json", "cancel_requested_at", "scheduled_task_id", "scheduled_for"]) assert.ok(runColumns.has(name), name);
  const sessionColumns = new Set((database.prepare("PRAGMA table_info(agent_session)").all() as Array<{ name: string }>).map((row) => row.name));
  const memoryColumns = new Set((database.prepare("PRAGMA table_info(memory_record)").all() as Array<{ name: string }>).map((row) => row.name));
  assert.ok(sessionColumns.has("user_id"));
  assert.ok(memoryColumns.has("user_id"));
  const timestamp = new Date().toISOString();
  const insertMemory = database.prepare(`INSERT INTO memory_record
    (id, user_id, agent_id, kind, memory_key, content, importance, metadata_json, created_at, updated_at)
    VALUES (?, ?, ?, 'preference', 'language', ?, 0.8, '{}', ?, ?)`);
  insertMemory.run("m1", "user-a", "finance", "中文", timestamp, timestamp);
  insertMemory.run("m2", "user-b", "finance", "English", timestamp, timestamp);
  insertMemory.run("m3", "user-a", "it", "中文", timestamp, timestamp);
  assert.throws(() => insertMemory.run("m4", "user-a", "finance", "重复", timestamp, timestamp));
  database.close();
});
