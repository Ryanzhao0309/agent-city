import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("model profiles keep secrets out of profile data and require verification before enablement", async () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-city-model-profile-"));
  process.env.AGENT_CITY_DATA_DIR = dataDir;
  const {
    createModelProfile, getModelProfile, getModelProfileSecret, markModelProfileValidation,
    normalizeModelEndpoint, updateModelProfile,
  } = await import("./modelProfiles.js");
  try {
    const created = createModelProfile({
      name: "Doubao", template: "doubao", protocol: "openai-chat",
      baseUrl: "https://ark.example/v3/responses", model: "doubao-test", apiKey: "ark-secret",
      temperature: 0.2, maxTokens: 128, extraBody: {}, enabled: true,
    });
    assert.equal(created.protocol, "openai-responses");
    assert.equal(created.baseUrl, "https://ark.example/v3");
    assert.equal(created.enabled, false);
    assert.equal(created.hasApiKey, true);
    assert.equal(getModelProfileSecret(created.id), "ark-secret");
    assert.doesNotMatch(JSON.stringify(created), /ark-secret/);

    markModelProfileValidation(created.id, "verified", null);
    const enabled = updateModelProfile(created.id, { enabled: true, isDefault: true });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.isDefault, true);

    const edited = updateModelProfile(created.id, { model: "doubao-next" });
    assert.equal(edited.validationStatus, "unverified");
    assert.equal(edited.enabled, false);
    assert.equal(edited.isDefault, false);
    assert.equal(getModelProfile(created.id)?.model, "doubao-next");

    assert.deepEqual(normalizeModelEndpoint("http://localhost:11434/v1/chat/completions", "openai-responses"), {
      baseUrl: "http://localhost:11434/v1", protocol: "openai-chat",
    });
    assert.throws(() => normalizeModelEndpoint("http://public.example/v1", "openai-chat"), /HTTPS/);
    assert.throws(() => createModelProfile({
      name: "Unsafe", template: "custom", protocol: "openai-chat", baseUrl: "https://model.example/v1",
      model: "unsafe", apiKey: "secret", extraBody: { messages: [] },
    }), /核心字段/);
  } finally {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
