import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("a mutating tool pauses for approval and resumes after approval", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-runtime-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { saveAgentConfig, saveWorkspaceFile } = await import("./agentStore.js");
  const { saveSecret } = await import("./db.js");
  const {
    createAgentRun,
    getAgentRun,
    listRunApprovals,
    resolveApproval,
  } = await import("./agentRuntime.js");

  saveAgentConfig("test-agent", {
    displayName: "Test Agent",
    brain: {
      enabled: true,
      provider: "custom",
      baseUrl: "https://model.invalid/v1",
      model: "test-model",
      apiKeyRef: "TEST_MODEL_KEY",
      temperature: 0,
    },
    files: { identity: "Test identity", agent: "Test responsibilities" },
    permissions: { workspace: "none", gmail: "none", calendar: "none", web: "none", cityData: "none" },
  });
  saveSecret("TEST_MODEL_KEY", "test-secret");
  saveWorkspaceFile("test-agent", "agent-city-video-plan.md", Buffer.from("video plan", "utf8"));

  let modelCall = 0;
  const requestBodies: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    modelCall += 1;
    if (modelCall === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ userIntent: "写一份结果", mode: "answer", selectedSkillId: null, confidence: 1, reason: "直接执行", useKnowledge: false }) } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (modelCall === 2) {
      return new Response(JSON.stringify({
        choices: [{ message: {
          content: null,
          tool_calls: [{
            id: "tool-call-1",
            type: "function",
            function: { name: "write_private_workspace_file", arguments: JSON.stringify({ fileName: "result.md", content: "approved" }) },
          }],
        } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "任务完成。" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  const waitFor = async (status: string) => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const run = getAgentRun(runId);
      if (run?.status === status) return run;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    throw new Error(`Run did not reach ${status}`);
  };

  let runId = "";
  try {
    const run = createAgentRun("test-agent", {
      prompt: "写一份结果",
      title: "审批测试",
      request: { cityLordName: "测试用户" },
    });
    runId = run.id;
    await waitFor("waiting_approval");
    const target = path.join(dataDir, "agents", "test-agent", "workspace", "result.md");
    assert.equal(fs.existsSync(target), false);
    const approval = listRunApprovals(runId).find((item) => item.status === "pending");
    assert.ok(approval);
    await resolveApproval(approval.id, "approved");
    const completed = await waitFor("succeeded");
    assert.equal(completed.resultText, "任务完成。");
    assert.equal(fs.readFileSync(target, "utf8"), "approved");
    assert.match(JSON.stringify(requestBodies[1]), /agent-city-video-plan\.md/);
    assert.match(JSON.stringify(requestBodies[1]), /Never translate, rename, or guess a file name/);
    assert.match(JSON.stringify(requestBodies[1]), /person speaking with you is named 测试用户/);
    assert.match(JSON.stringify(requestBodies[1]), /asks “我是谁”/);
    assert.match(JSON.stringify(requestBodies[1]), /City Hall shared knowledge is retrieved by the Agent City platform/);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
