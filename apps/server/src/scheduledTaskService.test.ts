import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("Chinese schedule parser covers relative, daily, workday, weekly and monthly rules", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-schedule-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { parseScheduledTaskDraft } = await import("./scheduledTaskService.js");
  const now = new Date("2026-07-19T00:00:00.000Z");
  assert.equal(parseScheduledTaskDraft("2分钟后搜索当天新闻", "Asia/Shanghai", now).scheduleType, "once");
  assert.equal(parseScheduledTaskDraft("每天8点整理简报", "Asia/Shanghai", now).scheduleType, "daily");
  assert.deepEqual(parseScheduledTaskDraft("工作日上午9点巡检", "Asia/Shanghai", now).schedule.weekdays, [1, 2, 3, 4, 5]);
  assert.deepEqual(parseScheduledTaskDraft("每周一、三上午9点复盘", "Asia/Shanghai", now).schedule.weekdays, [1, 3]);
  assert.equal(parseScheduledTaskDraft("每月15号上午10点对账", "Asia/Shanghai", now).schedule.dayOfMonth, 15);
  fs.rmSync(dataDir, { recursive: true, force: true });
});

test("missed periodic occurrences are coalesced to one future occurrence", async () => {
  const { computeNextRunAt } = await import("./scheduledTaskService.js");
  const next = computeNextRunAt("daily", { time: "08:00" }, "Asia/Shanghai", new Date("2026-07-19T03:00:00.000Z"));
  assert.equal(next, "2026-07-20T00:00:00.000Z");
});
