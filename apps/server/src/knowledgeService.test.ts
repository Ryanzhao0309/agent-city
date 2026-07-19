import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("private workspace knowledge index follows file updates and deletion", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-knowledge-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { deleteWorkspaceFile, saveAgentConfig, saveWorkspaceFile } = await import("./agentStore.js");
  const { reindexAgentKnowledge, searchKnowledge } = await import("./knowledgeService.js");
  saveAgentConfig("knowledge-agent", {
    displayName: "Knowledge Agent",
    brain: { enabled: false, provider: "local", baseUrl: "", model: "", apiKeyRef: "", temperature: 0 },
    files: {}, permissions: { workspace: "none", web: "none", cityData: "none" },
  });
  try {
    saveWorkspaceFile("knowledge-agent", "policy.md", Buffer.from("# 报销制度\n差旅住宿上限是 800 元。"));
    await reindexAgentKnowledge("knowledge-agent");
    assert.equal(searchKnowledge("knowledge-agent", "住宿上限")[0]?.fileName, "policy.md");

    saveWorkspaceFile("knowledge-agent", "policy.md", Buffer.from("# 报销制度\n差旅住宿上限调整为 900 元。"));
    await reindexAgentKnowledge("knowledge-agent");
    assert.match(searchKnowledge("knowledge-agent", "900")[0]?.excerpt ?? "", /900/);

    deleteWorkspaceFile("knowledge-agent", "policy.md");
    await reindexAgentKnowledge("knowledge-agent");
    assert.deepEqual(searchKnowledge("knowledge-agent", "900"), []);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

test("city knowledge documents are assigned, indexed, updated, and revoked per agent", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-shared-knowledge-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const { saveAgentConfig } = await import("./agentStore.js");
  const {
    createCityKnowledgeDocument,
    deleteCityKnowledgeDocument,
    listAgentCityKnowledge,
    searchKnowledge,
    setCityKnowledgeAssignments,
    updateCityKnowledgeDocument,
  } = await import("./knowledgeService.js");
  for (const agentId of ["agent-a", "agent-b"]) {
    saveAgentConfig(agentId, {
      displayName: agentId,
      brain: { enabled: false, provider: "local", baseUrl: "", model: "", apiKeyRef: "", temperature: 0 },
      files: {}, permissions: { workspace: "none", web: "none", cityData: "none" },
    });
  }
  try {
    const document = await createCityKnowledgeDocument({
      title: "客服共识",
      fileName: "support.md",
      content: "# 客服共识\n退款申请需要在 48 小时内响应。",
      agentIds: ["agent-a"],
    });
    assert.equal(listAgentCityKnowledge("agent-a")[0]?.id, document.id);
    assert.equal(listAgentCityKnowledge("agent-b").length, 0);
    assert.match(searchKnowledge("agent-a", "48 小时")[0]?.excerpt ?? "", /48 小时/);
    assert.equal(searchKnowledge("agent-b", "48 小时").length, 0);

    await updateCityKnowledgeDocument(document.id, { content: "# 客服共识\n城市管理者称为测试用户。" });
    assert.match(searchKnowledge("agent-a", "我是谁 测试用户")[0]?.excerpt ?? "", /测试用户/);

    await updateCityKnowledgeDocument(document.id, { content: "# 客服共识\n退款申请需要在 24 小时内响应。" });
    assert.match(searchKnowledge("agent-a", "24 小时")[0]?.excerpt ?? "", /24 小时/);

    await setCityKnowledgeAssignments(document.id, ["agent-b"]);
    assert.equal(searchKnowledge("agent-a", "24 小时").length, 0);
    assert.match(searchKnowledge("agent-b", "24 小时")[0]?.excerpt ?? "", /24 小时/);

    assert.equal(await deleteCityKnowledgeDocument(document.id), true);
    assert.equal(searchKnowledge("agent-b", "24 小时").length, 0);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
