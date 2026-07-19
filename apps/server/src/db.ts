// Uses Node's built-in SQLite (node:sqlite, stable in Node 22.5+) instead of a
// native addon like better-sqlite3. That means no node-gyp / compiler toolchain
// is needed to install this project - important for a self-hosted open source
// app that people will run on all kinds of servers, NAS boxes, and Raspberry Pis.
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { shouldRestorePackagedSeed } from "./seedLayout.js";
import { runMigrations } from "./migrations.js";

export const dataDir = process.env.AGENT_CITY_DATA_DIR ?? path.resolve(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, "agent-city.sqlite");
export const db = new DatabaseSync(dbPath);

db.exec("PRAGMA journal_mode = WAL;");

db.exec(`
  CREATE TABLE IF NOT EXISTS city_layout (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

function restorePackagedSeedOnce(): void {
  const seedDbPath = process.env.AGENT_CITY_SEED_DB_PATH?.trim();
  if (!seedDbPath || !fs.existsSync(seedDbPath)) return;
  const markerPath = path.join(dataDir, ".packaged-city-seed-v1");
  if (fs.existsSync(markerPath)) return;

  try {
    const currentRow = db.prepare("SELECT data FROM city_layout WHERE id = 1").get() as { data: string } | undefined;
    const seedDb = new DatabaseSync(seedDbPath, { readOnly: true });
    const seedRow = seedDb.prepare("SELECT data FROM city_layout WHERE id = 1").get() as { data: string } | undefined;
    seedDb.close();
    const currentLayout = currentRow ? JSON.parse(currentRow.data) : null;
    const seedLayout = seedRow ? JSON.parse(seedRow.data) : null;
    if (seedRow && shouldRestorePackagedSeed(currentLayout, seedLayout)) {
      db.prepare(
        `INSERT INTO city_layout (id, data, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
      ).run(seedRow.data);
    }
    fs.writeFileSync(markerPath, new Date().toISOString(), "utf8");
  } catch (error) {
    console.error("Failed to check packaged city seed:", error);
  }
}

restorePackagedSeedOnce();

const keychainService = process.platform === "darwin"
  ? process.env.AGENT_CITY_KEYCHAIN_SERVICE?.trim()
  : undefined;

function readKeychainSecret(key: string): string | null {
  if (!keychainService) return null;
  const result = spawnSync(
    "/usr/bin/security",
    ["find-generic-password", "-s", keychainService, "-a", key, "-w"],
    { encoding: "utf8" }
  );
  return result.status === 0 ? result.stdout.trimEnd() : null;
}

function writeKeychainSecret(key: string, value: string): void {
  if (!keychainService) return;
  const result = spawnSync(
    "/usr/bin/security",
    ["add-generic-password", "-U", "-s", keychainService, "-a", key, "-w", value],
    { encoding: "utf8" }
  );
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "macOS Keychain write failed.");
  }
}

function deleteKeychainSecret(key: string): void {
  if (!keychainService) return;
  spawnSync(
    "/usr/bin/security",
    ["delete-generic-password", "-s", keychainService, "-a", key],
    { encoding: "utf8" }
  );
}

function migrateSecretsToKeychain(): void {
  if (!keychainService) return;
  const rows = db.prepare("SELECT key, value FROM app_secret WHERE value <> ''").all() as Array<{
    key: string;
    value: string;
  }>;
  for (const row of rows) {
    try {
      writeKeychainSecret(row.key, row.value);
      db.prepare("UPDATE app_secret SET value = '' WHERE key = ?").run(row.key);
    } catch (error) {
      console.error(`Failed to migrate ${row.key} to macOS Keychain:`, error);
    }
  }
}

db.exec(`
  CREATE TABLE IF NOT EXISTS app_secret (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

migrateSecretsToKeychain();
runMigrations(db);

const DEFAULT_LAYOUT = {
  grid: { cols: 14, rows: 9 },
  buildings: [
    { id: "city-hall-1", type: "city-hall", x: 6, y: 3, name: "City Hall", url: "" },
  ],
  ground: {},
  groundResolution: 2,
  cityName: "Agent City",
  managementLanguage: "zh-CN",
  cityLordName: "",
};

export function getLayout(): unknown {
  const row = db.prepare("SELECT data FROM city_layout WHERE id = 1").get() as
    | { data: string }
    | undefined;
  if (!row) return DEFAULT_LAYOUT;
  return JSON.parse(row.data);
}

export function saveLayoutToDb(layout: unknown): void {
  const json = JSON.stringify(layout);
  db.prepare(
    `INSERT INTO city_layout (id, data, updated_at)
     VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(json);
}

export function listSecrets(): Array<{ key: string; configured: boolean; updatedAt: string }> {
  const rows = db.prepare("SELECT key, updated_at FROM app_secret ORDER BY key").all() as Array<{
    key: string;
    updated_at: string;
  }>;
  return rows.map((row) => ({ key: row.key, configured: true, updatedAt: row.updated_at }));
}

export function getSecretValue(key: string): string | null {
  const keychainValue = readKeychainSecret(key);
  if (keychainValue !== null) return keychainValue;
  const row = db.prepare("SELECT value FROM app_secret WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function saveSecret(key: string, value: string): void {
  writeKeychainSecret(key, value);
  db.prepare(
    `INSERT INTO app_secret (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).run(key, keychainService ? "" : value);
}

export function deleteSecret(key: string): void {
  deleteKeychainSecret(key);
  db.prepare("DELETE FROM app_secret WHERE key = ?").run(key);
}
