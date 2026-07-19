import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("skill hall manager private workspace maps to the shared city skills directory", async () => {
  const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-skills-"));
  process.env.AGENT_CITY_DATA_DIR = testDataDir;
  const {
    listWorkspaceFiles,
    readWorkspaceFile,
    saveAgentConfig,
    saveCitySkill,
  } = await import("./agentStore.js");

  try {
    saveAgentConfig("skill-manager", { managedWorkspace: "city-skills" });
    saveAgentConfig("regular-agent", {});
    saveCitySkill({
      slug: "daily-planner",
      name: "Daily Planner",
      icon: "🗓️",
      summary: "Plan the day.",
      sourceUrl: "https://example.invalid/daily-planner",
      content: "---\nname: daily-planner\ndescription: Plan the day.\n---\n\n# Daily Planner\n",
    });

    assert.deepEqual(listWorkspaceFiles("skill-manager").map((file) => file.name), ["daily-planner.md"]);
    assert.match(readWorkspaceFile("skill-manager", "daily-planner.md").content, /# Daily Planner/);
    assert.deepEqual(listWorkspaceFiles("regular-agent"), []);
  } finally {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
});
