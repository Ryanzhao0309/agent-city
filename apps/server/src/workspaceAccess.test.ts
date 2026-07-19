import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveWorkingPath, writeWorkingFile } from "./workspaceAccess.js";
import type { AgentConfigRecord } from "./agentStore.js";

function config(root: string): AgentConfigRecord {
  return { workspaceRoot: root, permissions: { workspace: "write-with-approval" } };
}

test("working paths stay inside the authorized root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-workspace-"));
  assert.equal(resolveWorkingPath(config(root), "."), fs.realpathSync(root));
  assert.throws(() => resolveWorkingPath(config(root), "../secret.txt", true), /不能离开/);
  assert.throws(() => resolveWorkingPath(config(root), "/etc/passwd"), /相对路径/);
  fs.rmSync(root, { recursive: true, force: true });
});

test("symbolic links cannot escape the authorized root", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-workspace-"));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-outside-"));
  fs.symlinkSync(outside, path.join(root, "outside"));
  assert.throws(() => resolveWorkingPath(config(root), "outside/file.txt", true), /符号链接/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

test("workspace writes only allow new text, markdown, and csv results", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-workspace-"));
  assert.deepEqual(writeWorkingFile(config(root), "reports/summary.md", "ok"), { path: "reports/summary.md", bytes: 2 });
  assert.equal(fs.readFileSync(path.join(root, "reports/summary.md"), "utf8"), "ok");
  assert.throws(() => writeWorkingFile(config(root), "report.docx", "not-a-docx"), /只能新建或更新/);
  fs.rmSync(root, { recursive: true, force: true });
});
