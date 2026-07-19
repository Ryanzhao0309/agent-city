import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installTestModelProfile } from "./testModelProfile.js";

test("quoted skill descriptions retain trigger phrases and meta questions load the only learned skill", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-skill-routing-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { installSkillForAgents, previewSkillContent, saveAgentConfig } = await import("./agentStore.js");
  const { db, saveSecret } = await import("./db.js");
  const { createAgentRun, getAgentRun, listRunEvents } = await import("./agentRuntime.js");
  const markdown = `---
name: adhd-founder-planner
description: "Use when the user asks to 'plan my day', 'morning planning', or needs ADHD-friendly planning."
---

# ADHD Planner

FULL_SKILL_MARKER: organize work by energy-based swim lanes.
`;
  const preview = previewSkillContent("adhd-founder-planner-SKILL.md", markdown);
  assert.match(preview.summary, /plan my day/);
  assert.match(preview.summary, /ADHD-friendly planning/);

  saveAgentConfig("skill-agent", {
    displayName: "Skill Agent",
    brain: {
      enabled: true,
      modelProfileId: "skill-routing-profile",
    },
    files: { identity: "Skill tester", agent: "Explain learned skills." },
    permissions: { workspace: "none", web: "none", cityData: "none" },
  });
  installSkillForAgents(["skill-agent"], {
    id: preview.slug,
    slug: preview.slug,
    name: preview.name,
    icon: preview.icon,
    summary: preview.summary,
    sourceUrl: preview.sourceUrl,
    content: markdown,
  });
  installTestModelProfile(db, saveSecret, { id: "skill-routing-profile", secretRef: "SKILL_TEST_KEY" });

  const requestBodies: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    return new Response(JSON.stringify({ choices: [{ message: { content: "这是 ADHD 日程规划技能。" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const run = createAgentRun("skill-agent", { prompt: "你刚学会的这个技能是做什么的？", title: "介绍技能" });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = getAgentRun(run.id);
      if (current?.status === "succeeded") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(getAgentRun(run.id)?.status, "succeeded");
    assert.equal(requestBodies.length, 1, "meta question should bypass a separate router model call");
    assert.match(JSON.stringify(requestBodies[0]), /FULL_SKILL_MARKER/);

    requestBodies.length = 0;
    globalThis.fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
      const content = requestBodies.length === 1
        ? JSON.stringify({
          userIntent: "按精力安排今天任务的优先顺序",
          mode: "instruction_skill",
          selectedSkillId: "adhd-founder-planner",
          confidence: 0.96,
          reason: "用户需要 ADHD 友好的能量分区日程规划",
          useKnowledge: false,
        })
        : "已按你的精力状态安排好今天的任务。";
      return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const implicitRun = createAgentRun("skill-agent", {
      prompt: "我今天事情很多，帮我按精力安排一下先做什么。",
      title: "安排今天任务",
    });
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const current = getAgentRun(implicitRun.id);
      if (current?.status === "succeeded") break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(getAgentRun(implicitRun.id)?.status, "succeeded");
    assert.equal(requestBodies.length, 2, "implicit intent should route first, then execute the selected skill");
    assert.match(JSON.stringify(requestBodies[0]), /recentConversation/);
    assert.match(JSON.stringify(requestBodies[0]), /按精力安排今天任务的优先顺序|userIntent/);
    assert.match(JSON.stringify(requestBodies[1]), /FULL_SKILL_MARKER/);
    assert.deepEqual(
      listRunEvents(implicitRun.id).filter((event) => ["intent_analyzed", "routed"].includes(event.type)).map((event) => event.type),
      ["intent_analyzed", "routed"],
    );
    assert.equal(
      listRunEvents(implicitRun.id).find((event) => event.type === "routed")?.data.selectedSkillName,
      "adhd-founder-planner",
    );
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
