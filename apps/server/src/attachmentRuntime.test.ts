import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("chat attachments include readable file contents and image input in the model turn", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-attachments-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { saveAgentConfig, saveWorkspaceFile } = await import("./agentStore.js");
  const { saveSecret } = await import("./db.js");
  const { createAgentRun, getAgentRun } = await import("./agentRuntime.js");

  saveAgentConfig("attachment-agent", {
    displayName: "Attachment Agent",
    brain: {
      enabled: true,
      provider: "custom",
      baseUrl: "https://model.invalid/v1",
      model: "vision-model",
      apiKeyRef: "ATTACHMENT_MODEL_KEY",
      temperature: 0,
    },
    files: { identity: "Test identity", agent: "Inspect user attachments" },
    permissions: { workspace: "none", gmail: "none", calendar: "none", web: "none", cityData: "none" },
  });
  saveSecret("ATTACHMENT_MODEL_KEY", "test-secret");
  saveWorkspaceFile("attachment-agent", "brief.txt", Buffer.from("附件里的项目代号是 Aurora。", "utf8"));
  saveWorkspaceFile("attachment-agent", "pixel.png", Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

  const requestBodies: Array<Record<string, unknown>> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (_input, init) => {
    requestBodies.push(JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>);
    if (requestBodies.length === 1) {
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        userIntent: "查看附件", mode: "answer", selectedSkillId: null, confidence: 1,
        reason: "用户提供了附件", useKnowledge: false,
      }) } }] }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ choices: [{ message: { content: "已查看附件。" } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const run = createAgentRun("attachment-agent", {
      prompt: "请总结附件",
      attachments: [
        { id: "text-1", name: "brief.txt", fileName: "brief.txt", mimeType: "text/plain", size: 40, kind: "file" },
        { id: "image-1", name: "pixel.png", fileName: "pixel.png", mimeType: "image/png", size: 8, kind: "image" },
      ],
    });
    for (let attempt = 0; attempt < 100 && getAgentRun(run.id)?.status !== "succeeded"; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(getAgentRun(run.id)?.status, "succeeded");
    const modelTurn = JSON.stringify(requestBodies[1]);
    assert.match(modelTurn, /Aurora/);
    assert.match(modelTurn, /data:image\/png;base64/);
    assert.match(modelTurn, /image_url/);
  } finally {
    globalThis.fetch = originalFetch;
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
