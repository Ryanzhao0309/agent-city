import assert from "node:assert/strict";
import test from "node:test";
import { requestModel, type ModelMessage, type ModelToolDefinition } from "./modelGateway.js";
import type { ModelProfile } from "./modelProfiles.js";

function profile(protocol: ModelProfile["protocol"]): ModelProfile {
  return {
    id: "profile", name: "Test", template: "custom", protocol,
    baseUrl: "https://model.invalid/v1", model: "test-model", temperature: 0.2,
    maxTokens: 128, extraBody: { thinking: { type: "disabled" } }, enabled: true,
    isDefault: false, validationStatus: "verified", validatedAt: new Date().toISOString(),
    validationError: null, hasApiKey: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}

const tool: ModelToolDefinition = {
  type: "function",
  function: { name: "lookup", description: "Lookup", parameters: { type: "object", properties: {} } },
};

test("chat adapter sends OpenAI messages and parses tool calls", async () => {
  const originalFetch = globalThis.fetch;
  let url = "";
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (input, init) => {
    url = String(input);
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "lookup", arguments: "{}" } }] } }] }), { status: 200 });
  };
  try {
    const result = await requestModel(profile("openai-chat"), "secret", [{ role: "user", content: "hello" }], [tool]);
    assert.equal(url, "https://model.invalid/v1/chat/completions");
    assert.equal(body.model, "test-model");
    assert.equal((body.messages as ModelMessage[])[0].content, "hello");
    assert.equal(result.tool_calls?.[0].function.name, "lookup");
  } finally { globalThis.fetch = originalFetch; }
});

test("responses adapter converts images, functions and tool outputs", async () => {
  const originalFetch = globalThis.fetch;
  let body: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ output: [
      { type: "function_call", call_id: "call-2", name: "lookup", arguments: "{}" },
      { type: "message", content: [{ type: "output_text", text: "done" }] },
    ] }), { status: 200 });
  };
  try {
    const messages: ModelMessage[] = [
      { role: "system", content: "system" },
      { role: "user", content: [{ type: "text", text: "inspect" }, { type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }] },
      { role: "assistant", content: null, tool_calls: [{ id: "old-call", type: "function", function: { name: "lookup", arguments: "{}" } }] },
      { role: "tool", tool_call_id: "old-call", content: "{\"ok\":true}" },
    ];
    const result = await requestModel(profile("openai-responses"), "secret", messages, [tool]);
    assert.equal(body.instructions, "system");
    assert.match(JSON.stringify(body.input), /input_image/);
    assert.match(JSON.stringify(body.input), /function_call_output/);
    assert.equal(result.content, "done");
    assert.equal(result.tool_calls?.[0].id, "call-2");
  } finally { globalThis.fetch = originalFetch; }
});

test("gateway reports provider error details without echoing credentials", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { code: "BadModel", message: "unknown model" } }), {
    status: 404, headers: { "x-request-id": "request-123" },
  });
  try {
    await assert.rejects(
      requestModel(profile("openai-chat"), "sk-super-secret", [{ role: "user", content: "hello" }]),
      (error: Error) => error.message.includes("404") && error.message.includes("BadModel")
        && error.message.includes("request-123") && !error.message.includes("sk-super-secret"),
    );
  } finally { globalThis.fetch = originalFetch; }
});
