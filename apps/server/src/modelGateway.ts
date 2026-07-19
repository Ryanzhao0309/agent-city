import type { ModelProfile } from "./modelProfiles.js";

export interface ModelToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export type ModelContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ModelContentPart[] | null;
  tool_calls?: ModelToolCall[];
  tool_call_id?: string;
}

export interface ModelToolDefinition {
  type: "function";
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export interface ModelResult {
  content: string | null;
  tool_calls?: ModelToolCall[];
}

const endpointFor = (profile: ModelProfile) => `${profile.baseUrl}${profile.protocol === "openai-chat" ? "/chat/completions" : "/responses"}`;

function sanitizedErrorText(text: string): string {
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    const error = typeof data.error === "object" && data.error !== null ? data.error as Record<string, unknown> : data;
    const code = String(error.code ?? data.code ?? "").slice(0, 100);
    const message = String(error.message ?? data.message ?? "").replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").slice(0, 500);
    return [code, message].filter(Boolean).join(": ");
  } catch {
    return text.replace(/Bearer\s+[^\s"']+/gi, "Bearer [redacted]").replace(/ark-[\w-]+|sk-[\w-]+/gi, "[redacted]").slice(0, 500);
  }
}

async function checkedJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    const requestId = response.headers.get("x-request-id") ?? response.headers.get("x-tt-logid") ?? "";
    const detail = sanitizedErrorText(text);
    const requestIdSuffix = requestId && !detail.toLowerCase().includes(requestId.toLowerCase()) ? ` · Request ID ${requestId}` : "";
    throw new Error(`模型接口请求失败：${response.status}${detail ? ` · ${detail}` : ""}${requestIdSuffix}`);
  }
  try { return JSON.parse(text) as Record<string, unknown>; }
  catch { throw new Error("模型接口返回了无法解析的 JSON。"); }
}

function chatBody(profile: ModelProfile, messages: ModelMessage[], tools: ModelToolDefinition[], forceTool: boolean) {
  return {
    ...profile.extraBody,
    model: profile.model,
    messages,
    ...(tools.length ? { tools, tool_choice: forceTool ? "required" : "auto" } : {}),
    ...(profile.temperature === null ? {} : { temperature: profile.temperature }),
    ...(profile.maxTokens === null ? {} : { max_tokens: profile.maxTokens }),
    stream: false,
  };
}

function responsesInput(messages: ModelMessage[]) {
  const input: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "system") continue;
    if (message.role === "tool") {
      input.push({ type: "function_call_output", call_id: message.tool_call_id, output: String(message.content ?? "") });
      continue;
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      if (message.content) input.push({ type: "message", role: "assistant", content: message.content });
      for (const call of message.tool_calls) {
        input.push({ type: "function_call", call_id: call.id, name: call.function.name, arguments: call.function.arguments });
      }
      continue;
    }
    const content = Array.isArray(message.content)
      ? message.content.map((part) => part.type === "text"
        ? { type: "input_text", text: part.text }
        : { type: "input_image", image_url: part.image_url.url })
      : message.content;
    input.push({ type: "message", role: message.role, content });
  }
  return input;
}

function responsesBody(profile: ModelProfile, messages: ModelMessage[], tools: ModelToolDefinition[], forceTool: boolean) {
  const instructions = messages.filter((message) => message.role === "system")
    .map((message) => String(message.content ?? "")).join("\n\n");
  return {
    ...profile.extraBody,
    model: profile.model,
    input: responsesInput(messages),
    ...(instructions ? { instructions } : {}),
    ...(tools.length ? {
      tools: tools.map((tool) => ({ type: "function", name: tool.function.name, description: tool.function.description, parameters: tool.function.parameters })),
      tool_choice: forceTool ? "required" : "auto",
    } : {}),
    ...(profile.temperature === null ? {} : { temperature: profile.temperature }),
    ...(profile.maxTokens === null ? {} : { max_output_tokens: profile.maxTokens }),
    stream: false,
    store: false,
  };
}

export async function requestModel(
  profile: ModelProfile,
  apiKey: string,
  messages: ModelMessage[],
  tools: ModelToolDefinition[] = [],
  options: { signal?: AbortSignal; forceTool?: boolean } = {},
): Promise<ModelResult> {
  const body = profile.protocol === "openai-chat"
    ? chatBody(profile, messages, tools, options.forceTool === true)
    : responsesBody(profile, messages, tools, options.forceTool === true);
  const response = await fetch(endpointFor(profile), {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal: options.signal,
  });
  const data = await checkedJson(response);
  if (profile.protocol === "openai-chat") {
    const choices = Array.isArray(data.choices) ? data.choices as Array<Record<string, unknown>> : [];
    const message = choices[0]?.message as Record<string, unknown> | undefined;
    if (!message) throw new Error("模型没有返回可用消息。");
    return {
      content: typeof message.content === "string" ? message.content : null,
      tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls as ModelToolCall[] : undefined,
    };
  }
  const output = Array.isArray(data.output) ? data.output as Array<Record<string, unknown>> : [];
  const textParts: string[] = [];
  const toolCalls: ModelToolCall[] = [];
  for (const item of output) {
    if (item.type === "function_call") {
      toolCalls.push({
        id: String(item.call_id ?? item.id ?? ""), type: "function",
        function: { name: String(item.name ?? ""), arguments: String(item.arguments ?? "{}") },
      });
    }
    if (item.type === "message" && Array.isArray(item.content)) {
      for (const part of item.content as Array<Record<string, unknown>>) {
        if (part.type === "output_text" && typeof part.text === "string") textParts.push(part.text);
      }
    }
  }
  if (!textParts.length && typeof data.output_text === "string") textParts.push(data.output_text);
  if (!textParts.length && !toolCalls.length) throw new Error("模型没有返回可用消息或工具调用。");
  return { content: textParts.length ? textParts.join("\n") : null, tool_calls: toolCalls.length ? toolCalls : undefined };
}

export async function validateModelConnection(profile: ModelProfile, apiKey: string): Promise<void> {
  await requestModel(profile, apiKey, [{ role: "user", content: "Reply with exactly OK." }], []);
  const tools: ModelToolDefinition[] = [{
    type: "function",
    function: {
      name: "agent_city_connection_check",
      description: "A harmless function used only to verify function calling support.",
      parameters: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"], additionalProperties: false },
    },
  }];
  const result = await requestModel(profile, apiKey, [{ role: "user", content: "Call agent_city_connection_check with ok=true." }], tools, { forceTool: true });
  if (!result.tool_calls?.some((call) => call.function.name === "agent_city_connection_check")) {
    throw new Error("文本连接成功，但模型没有完成 Function Calling 校验。");
  }
}
