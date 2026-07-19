import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("deleting a conversation removes its messages and completed run history", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-session-delete-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { db } = await import("./db.js");
  const { appendMessage, createSession, deleteSession, getSession, listMessages } = await import("./sessionService.js");
  try {
    const session = createSession("test-agent", "要删除的对话");
    appendMessage(session.id, "user", "你好");
    db.prepare(`INSERT INTO agent_run
      (id, agent_id, status, source, title, input_json, created_at, updated_at, session_id, interaction_mode, current_stage)
      VALUES ('run-delete', 'test-agent', 'succeeded', 'chat', 'done', '{}', datetime('now'), datetime('now'), ?, 'chat', 'completed')`).run(session.id);
    db.prepare(`INSERT INTO agent_run_event (run_id, type, data_json, created_at)
      VALUES ('run-delete', 'completed', '{}', datetime('now'))`).run();

    assert.equal(deleteSession(session.id), true);
    assert.equal(getSession(session.id), null);
    assert.deepEqual(listMessages(session.id), []);
    assert.equal(db.prepare("SELECT 1 FROM agent_run WHERE id='run-delete'").get(), undefined);
    assert.equal(db.prepare("SELECT 1 FROM agent_run_event WHERE run_id='run-delete'").get(), undefined);
    assert.equal(deleteSession(session.id), false);

    const activeSession = createSession("test-agent", "运行中的对话");
    db.prepare(`INSERT INTO agent_run
      (id, agent_id, status, source, title, input_json, created_at, updated_at, session_id, interaction_mode, current_stage)
      VALUES ('run-active', 'test-agent', 'running', 'chat', 'running', '{}', datetime('now'), datetime('now'), ?, 'chat', 'model')`).run(activeSession.id);
    assert.throws(() => deleteSession(activeSession.id), /先终止任务/);
    assert.ok(getSession(activeSession.id));
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
