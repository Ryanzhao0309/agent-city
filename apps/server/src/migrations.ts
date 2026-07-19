import type { DatabaseSync } from "node:sqlite";

export const LATEST_SCHEMA_VERSION = 7;

function hasColumn(db: DatabaseSync, table: string, column: string): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
}

function addColumn(db: DatabaseSync, table: string, definition: string): void {
  const column = definition.trim().split(/\s+/, 1)[0];
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

function version(db: DatabaseSync): number {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL,
    updated_at TEXT NOT NULL
  )`);
  const row = db.prepare("SELECT version FROM schema_version WHERE id = 1").get() as
    | { version: number }
    | undefined;
  return row?.version ?? 0;
}

function setVersion(db: DatabaseSync, next: number): void {
  db.prepare(`INSERT INTO schema_version (id, version, updated_at)
    VALUES (1, ?, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET version = excluded.version, updated_at = excluded.updated_at`).run(next);
}

function migration1(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_run (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      title TEXT NOT NULL,
      input_json TEXT NOT NULL,
      context_json TEXT,
      result_text TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      finished_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_agent_run_agent_created ON agent_run(agent_id, created_at DESC);
    CREATE TABLE IF NOT EXISTS tool_invocation (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      tool_call_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      args_json TEXT NOT NULL,
      risk TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS approval_request (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      invocation_id TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS agent_run_event (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scheduled_task_fire (
      fire_key TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      fired_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_session (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      summary TEXT NOT NULL DEFAULT '',
      active_workflow_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_session_agent_updated
      ON agent_session(agent_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_message (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      run_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_agent_message_session_created
      ON agent_message(session_id, created_at, id);

    CREATE TABLE IF NOT EXISTS memory_record (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      source_session_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, kind, memory_key)
    );
    CREATE INDEX IF NOT EXISTS idx_memory_agent_updated
      ON memory_record(agent_id, updated_at DESC);
  `);

  addColumn(db, "agent_run", "session_id TEXT");
  addColumn(db, "agent_run", "interaction_mode TEXT NOT NULL DEFAULT 'manual'");
  addColumn(db, "agent_run", "current_stage TEXT NOT NULL DEFAULT 'queued'");
  addColumn(db, "agent_run", "route_json TEXT");
  addColumn(db, "agent_run", "state_json TEXT");
  addColumn(db, "agent_run", "cancel_requested_at TEXT");
  addColumn(db, "agent_run", "assistant_message_id TEXT");
  db.exec("CREATE INDEX IF NOT EXISTS idx_agent_run_session_created ON agent_run(session_id, created_at)");

  addColumn(db, "tool_invocation", "idempotency_key TEXT");
  addColumn(db, "tool_invocation", "workflow_skill_id TEXT");
  addColumn(db, "tool_invocation", "workflow_node_id TEXT");
  addColumn(db, "tool_invocation", "impact_summary TEXT");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_tool_invocation_idempotency ON tool_invocation(idempotency_key) WHERE idempotency_key IS NOT NULL");
}

function migration2(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS workflow_skill (
      id TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      definition_json TEXT NOT NULL,
      source_skill_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      PRIMARY KEY(id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_workflow_skill_status ON workflow_skill(status, updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_workflow_binding (
      agent_id TEXT NOT NULL,
      skill_id TEXT NOT NULL,
      version TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      PRIMARY KEY(agent_id, skill_id)
    );

    CREATE TABLE IF NOT EXISTS workflow_run_state (
      run_id TEXT PRIMARY KEY,
      skill_id TEXT NOT NULL,
      skill_version TEXT NOT NULL,
      active_node_id TEXT NOT NULL,
      slots_json TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'running',
      last_tool_status TEXT,
      awaiting_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function migration3(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_document (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(agent_id, file_path)
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_document_agent ON knowledge_document(agent_id, updated_at DESC);

    CREATE TABLE IF NOT EXISTS knowledge_section (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      parent_id TEXT,
      title TEXT NOT NULL,
      path TEXT NOT NULL,
      ordinal INTEGER NOT NULL,
      summary TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_section_document ON knowledge_section(document_id, ordinal);

    CREATE TABLE IF NOT EXISTS knowledge_chunk (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      section_id TEXT,
      ordinal INTEGER NOT NULL,
      section_path TEXT NOT NULL,
      content TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_chunk_document ON knowledge_chunk(document_id, ordinal);
  `);
  try {
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunk_fts USING fts5(
      chunk_id UNINDEXED,
      agent_id UNINDEXED,
      file_name,
      section_path,
      content,
      tokenize='unicode61'
    )`);
  } catch {
    // Some custom SQLite builds omit FTS5. Search falls back to LIKE.
  }
}

function migration4(db: DatabaseSync): void {
  db.exec(`CREATE TABLE IF NOT EXISTS agent_memory_setting (
    agent_id TEXT PRIMARY KEY,
    auto_enabled INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  )`);
}

function migration5(db: DatabaseSync): void {
  addColumn(db, "agent_session", "user_id TEXT NOT NULL DEFAULT 'local-user'");
  db.exec(`
    DROP INDEX IF EXISTS idx_memory_agent_updated;
    ALTER TABLE memory_record RENAME TO memory_record_before_user_scope;
    CREATE TABLE memory_record (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      memory_key TEXT NOT NULL,
      content TEXT NOT NULL,
      importance REAL NOT NULL DEFAULT 0.5,
      source_session_id TEXT,
      metadata_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(user_id, agent_id, kind, memory_key)
    );
    INSERT INTO memory_record
      (id, user_id, agent_id, kind, memory_key, content, importance, source_session_id, metadata_json, created_at, updated_at)
    SELECT id, 'local-user', agent_id, kind, memory_key, content, importance, source_session_id, metadata_json, created_at, updated_at
    FROM memory_record_before_user_scope;
    DROP TABLE memory_record_before_user_scope;
    CREATE INDEX idx_memory_user_agent_updated
      ON memory_record(user_id, agent_id, updated_at DESC);
    CREATE INDEX idx_agent_session_user_agent_updated
      ON agent_session(user_id, agent_id, updated_at DESC);
  `);
}

function migration6(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_task (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_json TEXT NOT NULL DEFAULT '{}',
      timezone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
      status TEXT NOT NULL DEFAULT 'active',
      next_run_at TEXT,
      last_run_at TEXT,
      last_status TEXT,
      run_count INTEGER NOT NULL DEFAULT 0,
      source_session_id TEXT,
      lease_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_due
      ON scheduled_task(status, next_run_at);
    CREATE INDEX IF NOT EXISTS idx_scheduled_task_agent
      ON scheduled_task(agent_id, updated_at DESC);
  `);
  addColumn(db, "agent_run", "scheduled_task_id TEXT");
  addColumn(db, "agent_run", "scheduled_for TEXT");
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_run_scheduled_occurrence
    ON agent_run(scheduled_task_id, scheduled_for)
    WHERE scheduled_task_id IS NOT NULL AND scheduled_for IS NOT NULL`);
}

function migration7(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS city_knowledge_document (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      file_name TEXT NOT NULL UNIQUE,
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_city_knowledge_document_updated
      ON city_knowledge_document(updated_at DESC);

    CREATE TABLE IF NOT EXISTS agent_knowledge_binding (
      agent_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(agent_id, document_id)
    );
    CREATE INDEX IF NOT EXISTS idx_agent_knowledge_binding_document
      ON agent_knowledge_binding(document_id);
  `);
}

export function runMigrations(db: DatabaseSync): void {
  let current = version(db);
  const migrations = [migration1, migration2, migration3, migration4, migration5, migration6, migration7];
  while (current < LATEST_SCHEMA_VERSION) {
    db.exec("BEGIN IMMEDIATE");
    try {
      migrations[current](db);
      current += 1;
      setVersion(db, current);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
