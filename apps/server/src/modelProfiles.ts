import crypto from "node:crypto";
import { db, deleteSecret, getSecretValue, saveSecret } from "./db.js";

export type ModelTemplate = "openai" | "gemini" | "deepseek" | "doubao" | "custom";
export type ModelProtocol = "openai-chat" | "openai-responses";
export type ModelValidationStatus = "unverified" | "verified" | "failed";

export interface ModelProfile {
  id: string;
  name: string;
  template: ModelTemplate;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  temperature: number | null;
  maxTokens: number | null;
  extraBody: Record<string, unknown>;
  enabled: boolean;
  isDefault: boolean;
  validationStatus: ModelValidationStatus;
  validatedAt: string | null;
  validationError: string | null;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProfileInput {
  name?: unknown;
  template?: unknown;
  protocol?: unknown;
  baseUrl?: unknown;
  model?: unknown;
  temperature?: unknown;
  maxTokens?: unknown;
  extraBody?: unknown;
  apiKey?: unknown;
  legacySecretRef?: unknown;
  enabled?: unknown;
  isDefault?: unknown;
}

type ModelProfileRow = {
  id: string; name: string; template: string; protocol: string; base_url: string; model: string;
  secret_ref: string; temperature: number | null; max_tokens: number | null; extra_body_json: string;
  enabled: number; is_default: number; validation_status: string; validated_at: string | null;
  validation_error: string | null; created_at: string; updated_at: string;
};

const templates = new Set<ModelTemplate>(["openai", "gemini", "deepseek", "doubao", "custom"]);
const protocols = new Set<ModelProtocol>(["openai-chat", "openai-responses"]);
const protectedExtraBodyKeys = new Set([
  "model", "messages", "input", "instructions", "tools", "tool_choice", "stream",
  "authorization", "api_key", "previous_response_id", "store",
]);
const legacyModelSecretRefs = new Set(["OPENAI_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "DOUBAO_API_KEY"]);

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function parseExtraBody(value: unknown): Record<string, unknown> {
  const body = typeof value === "string" ? (() => {
    try { return asObject(JSON.parse(value)); }
    catch { throw new Error("额外请求参数必须是有效的 JSON 对象。"); }
  })() : asObject(value);
  const protectedKey = Object.keys(body).find((key) => protectedExtraBodyKeys.has(key.toLowerCase()));
  if (protectedKey) throw new Error(`额外请求参数不能覆盖核心字段：${protectedKey}`);
  return body;
}

export function normalizeModelEndpoint(raw: string, protocol: ModelProtocol): { baseUrl: string; protocol: ModelProtocol } {
  let value = raw.trim().replace(/\/+$/, "");
  let resolved = protocol;
  if (/\/chat\/completions$/i.test(value)) {
    value = value.replace(/\/chat\/completions$/i, "");
    resolved = "openai-chat";
  } else if (/\/responses$/i.test(value)) {
    value = value.replace(/\/responses$/i, "");
    resolved = "openai-responses";
  }
  let url: URL;
  try { url = new URL(value); }
  catch { throw new Error("Base URL 不是有效地址。"); }
  const localHost = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHost)) {
    throw new Error("Base URL 必须使用 HTTPS；本机 localhost 可使用 HTTP。");
  }
  url.search = "";
  url.hash = "";
  return { baseUrl: url.toString().replace(/\/+$/, ""), protocol: resolved };
}

function cleanInput(input: ModelProfileInput) {
  const name = String(input.name ?? "").trim();
  const template = String(input.template ?? "custom") as ModelTemplate;
  const requestedProtocol = String(input.protocol ?? "") as ModelProtocol;
  const model = String(input.model ?? "").trim();
  if (!name) throw new Error("模型名称不能为空。");
  if (!templates.has(template)) throw new Error("不支持的模型模板。");
  if (!protocols.has(requestedProtocol)) throw new Error("请选择 Chat Completions 或 Responses 协议。");
  if (!model) throw new Error("Model ID 不能为空。");
  const endpoint = normalizeModelEndpoint(String(input.baseUrl ?? ""), requestedProtocol);
  const temperature = input.temperature === null || input.temperature === "" || input.temperature === undefined
    ? null : Number(input.temperature);
  const maxTokens = input.maxTokens === null || input.maxTokens === "" || input.maxTokens === undefined
    ? null : Number(input.maxTokens);
  if (temperature !== null && (!Number.isFinite(temperature) || temperature < 0 || temperature > 2)) {
    throw new Error("Temperature 必须在 0 到 2 之间。");
  }
  if (maxTokens !== null && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 1_000_000)) {
    throw new Error("Max Tokens 必须是 1 到 1000000 之间的整数。");
  }
  return {
    name, template, protocol: endpoint.protocol, baseUrl: endpoint.baseUrl, model,
    temperature, maxTokens, extraBody: parseExtraBody(input.extraBody),
  };
}

function rowToProfile(row: ModelProfileRow): ModelProfile {
  let extraBody: Record<string, unknown> = {};
  try { extraBody = asObject(JSON.parse(row.extra_body_json)); } catch { /* Corrupt legacy value is treated as empty. */ }
  return {
    id: row.id, name: row.name, template: row.template as ModelTemplate,
    protocol: row.protocol as ModelProtocol, baseUrl: row.base_url, model: row.model,
    temperature: row.temperature, maxTokens: row.max_tokens, extraBody,
    enabled: row.enabled === 1, isDefault: row.is_default === 1,
    validationStatus: row.validation_status as ModelValidationStatus,
    validatedAt: row.validated_at, validationError: row.validation_error,
    hasApiKey: Boolean(getSecretValue(row.secret_ref)), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function listModelProfiles(): ModelProfile[] {
  return (db.prepare("SELECT * FROM model_profile ORDER BY is_default DESC, updated_at DESC").all() as ModelProfileRow[])
    .map(rowToProfile);
}

export function getModelProfile(id: string): ModelProfile | null {
  const row = db.prepare("SELECT * FROM model_profile WHERE id=?").get(id) as ModelProfileRow | undefined;
  return row ? rowToProfile(row) : null;
}

export function getModelProfileSecret(id: string): string | null {
  const row = db.prepare("SELECT secret_ref FROM model_profile WHERE id=?").get(id) as { secret_ref: string } | undefined;
  return row ? getSecretValue(row.secret_ref) : null;
}

export function createModelProfile(input: ModelProfileInput): ModelProfile {
  const clean = cleanInput(input);
  const id = crypto.randomUUID();
  const secretRef = `MODEL_PROFILE_${id.replace(/-/g, "").toUpperCase()}`;
  const apiKey = String(input.apiKey ?? "").trim();
  const legacySecretRef = String(input.legacySecretRef ?? "").trim();
  if (apiKey && !/^[\x20-\x7E]+$/.test(apiKey)) throw new Error("API Key 包含非法字符。");
  if (apiKey) saveSecret(secretRef, apiKey);
  else if (legacySecretRef && legacyModelSecretRefs.has(legacySecretRef)) {
    const legacyValue = getSecretValue(legacySecretRef);
    if (legacyValue) saveSecret(secretRef, legacyValue);
  }
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO model_profile
    (id,name,template,protocol,base_url,model,secret_ref,temperature,max_tokens,extra_body_json,
     enabled,is_default,validation_status,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,? ,0,0,'unverified',?,?)`)
    .run(id, clean.name, clean.template, clean.protocol, clean.baseUrl, clean.model, secretRef,
      clean.temperature, clean.maxTokens, JSON.stringify(clean.extraBody), now, now);
  return getModelProfile(id)!;
}

export function updateModelProfile(id: string, input: ModelProfileInput): ModelProfile {
  const existingRow = db.prepare("SELECT * FROM model_profile WHERE id=?").get(id) as ModelProfileRow | undefined;
  if (!existingRow) throw new Error("模型配置不存在。");
  const existing = rowToProfile(existingRow);
  const merged: ModelProfileInput = {
    name: input.name ?? existing.name, template: input.template ?? existing.template,
    protocol: input.protocol ?? existing.protocol, baseUrl: input.baseUrl ?? existing.baseUrl,
    model: input.model ?? existing.model,
    temperature: Object.hasOwn(input, "temperature") ? input.temperature : existing.temperature,
    maxTokens: Object.hasOwn(input, "maxTokens") ? input.maxTokens : existing.maxTokens,
    extraBody: input.extraBody ?? existing.extraBody,
  };
  const clean = cleanInput(merged);
  const apiKey = String(input.apiKey ?? "").trim();
  if (apiKey && !/^[\x20-\x7E]+$/.test(apiKey)) throw new Error("API Key 包含非法字符。");
  if (apiKey) saveSecret(existingRow.secret_ref, apiKey);
  const connectionChanged = apiKey.length > 0 || clean.protocol !== existing.protocol || clean.baseUrl !== existing.baseUrl
    || clean.model !== existing.model || JSON.stringify(clean.extraBody) !== JSON.stringify(existing.extraBody);
  const validationStatus = connectionChanged ? "unverified" : existing.validationStatus;
  const requestedEnabled = input.enabled === undefined ? existing.enabled : input.enabled === true;
  const enabled = validationStatus === "verified" && requestedEnabled;
  const requestedDefault = input.isDefault === undefined ? existing.isDefault : input.isDefault === true;
  const isDefault = validationStatus === "verified" && enabled && requestedDefault;
  const now = new Date().toISOString();
  db.exec("BEGIN IMMEDIATE");
  try {
    if (isDefault) db.prepare("UPDATE model_profile SET is_default=0 WHERE id<>?").run(id);
    db.prepare(`UPDATE model_profile SET name=?,template=?,protocol=?,base_url=?,model=?,temperature=?,max_tokens=?,
      extra_body_json=?,enabled=?,is_default=?,validation_status=?,validated_at=?,validation_error=?,updated_at=? WHERE id=?`)
      .run(clean.name, clean.template, clean.protocol, clean.baseUrl, clean.model, clean.temperature,
        clean.maxTokens, JSON.stringify(clean.extraBody), enabled ? 1 : 0, isDefault ? 1 : 0,
        validationStatus, connectionChanged ? null : existing.validatedAt,
        connectionChanged ? null : existing.validationError, now, id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  return getModelProfile(id)!;
}

export function markModelProfileValidation(id: string, status: "verified" | "failed", error: string | null): ModelProfile {
  const now = new Date().toISOString();
  db.prepare(`UPDATE model_profile SET validation_status=?,validated_at=?,validation_error=?,
    enabled=CASE WHEN ?='failed' THEN 0 ELSE enabled END,
    is_default=CASE WHEN ?='failed' THEN 0 ELSE is_default END,updated_at=? WHERE id=?`)
    .run(status, now, error, status, status, now, id);
  return getModelProfile(id)!;
}

export function deleteModelProfile(id: string): void {
  const row = db.prepare("SELECT secret_ref FROM model_profile WHERE id=?").get(id) as { secret_ref: string } | undefined;
  if (!row) throw new Error("模型配置不存在。");
  deleteSecret(row.secret_ref);
  db.prepare("DELETE FROM model_profile WHERE id=?").run(id);
}

export function listAvailableLegacyModelSecrets(): string[] {
  return [...legacyModelSecretRefs].filter((key) => Boolean(getSecretValue(key)));
}
