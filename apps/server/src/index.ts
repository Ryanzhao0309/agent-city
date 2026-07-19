import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { db, deleteSecret, getLayout, listSecrets, saveLayoutToDb, saveSecret } from "./db.js";
import {
  createModelProfile,
  deleteModelProfile,
  getModelProfile,
  getModelProfileSecret,
  listAvailableLegacyModelSecrets,
  listModelProfiles,
  markModelProfileValidation,
  updateModelProfile,
  type ModelProfileInput,
} from "./modelProfiles.js";
import { validateModelConnection } from "./modelGateway.js";
import {
  auditInstalledSkills,
  fetchSkillFromUrl,
  deleteSkillFromAgents,
  deleteWorkspaceFile,
  getWorkspaceFilePath,
  installSkillForAgents,
  listAgentConfigs,
  listWorkspaceFiles,
  previewSkillContent,
  readAgentConfig,
  saveAgentConfig,
  saveCitySkill,
  saveWorkspaceFile,
} from "./agentStore.js";
import {
  cancelAgentRun,
  availableToolNamesForAgent,
  createAgentRun,
  createSessionTurn,
  generateWorkflowDraft,
  getAgentRun,
  listAgentRuns,
  listRunApprovals,
  listRunEvents,
  listRunInvocations,
  parseScheduledTaskWithModel,
  recoverAgentRuns,
  reviewInstructionSkill,
  retryAgentRun,
  resolveApproval,
  subscribeRunEvents,
} from "./agentRuntime.js";
import { appendMessage, attachMessageRun, createSession, deleteSession, getSession, listMessages, listSessions, updateMessage } from "./sessionService.js";
import {
  archiveScheduledTask,
  claimDueScheduledTasks,
  createScheduledTask,
  getScheduledTask,
  listScheduledTasks,
  migrateLegacyScheduledTasks,
  parseScheduledTaskDraft,
  releaseScheduledTaskLease,
  updateScheduledTask,
  type ScheduledTask,
  type ScheduledTaskDraft,
} from "./scheduledTaskService.js";
import { automaticMemoryEnabled, deleteMemory, listMemories, setAutomaticMemoryEnabled, updateMemory, upsertMemory, type MemoryKind } from "./memoryService.js";
import {
  createCityKnowledgeDocument,
  deleteCityKnowledgeDocument,
  getCityKnowledgeDocument,
  listAgentCityKnowledge,
  listCityKnowledgeDocuments,
  reindexAgentKnowledge,
  searchKnowledge,
  setCityKnowledgeAssignments,
  updateCityKnowledgeDocument,
} from "./knowledgeService.js";
import {
  listWorkflowSkills,
  normalizeWorkflowSkill,
  publishWorkflowSkill,
  saveWorkflowDraft,
  validateWorkflowSkill,
  validateWorkflowDraft,
} from "./workflow.js";
import {
  latestDesktopNotificationCursor,
  listDesktopNotificationEvents,
  type DesktopNotificationEvent,
} from "./desktopNotificationService.js";
import { getPublishedThemeCatalog } from "./themeCatalogService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
const API_ONLY = process.env.AGENT_CITY_API_ONLY === "1";

const app = Fastify({ logger: true });

const skillAudit = auditInstalledSkills();
if (skillAudit.disabled.length) {
  app.log.warn({ disabledSkills: skillAudit.disabled }, "Invalid installed skills were disabled");
}
const migratedScheduledTasks = migrateLegacyScheduledTasks();
if (migratedScheduledTasks) app.log.info({ migratedScheduledTasks }, "Legacy timed tasks migrated");

const desktopOrigins = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  "http://127.0.0.1:5174",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
]);

app.addHook("onRequest", async (req, reply) => {
  const origin = req.headers.origin;
  if (origin && desktopOrigins.has(origin)) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Vary", "Origin");
    reply.header("Access-Control-Allow-Headers", "Content-Type, Last-Event-ID");
    reply.header("Access-Control-Allow-Methods", "GET,PUT,PATCH,POST,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") {
    return reply.code(204).send();
  }
});

// --- API -------------------------------------------------------------
app.get("/api/city", async () => getLayout());

app.get("/api/themes/catalog", async (_req, reply) => {
  try {
    reply.header("Cache-Control", "public, max-age=300");
    return await getPublishedThemeCatalog();
  } catch (error) {
    app.log.warn({ error }, "Theme catalog unavailable");
    return reply.code(502).send({ error: "主题目录暂时不可用，请稍后重试。" });
  }
});

app.put("/api/city", async (req, reply) => {
  const body = req.body;
  if (!body || typeof body !== "object") {
    return reply.code(400).send({ error: "Invalid layout payload" });
  }
  saveLayoutToDb(body);
  return { ok: true };
});

function modelProfileUsage(profileId: string): string[] {
  return Object.entries(listAgentConfigs())
    .filter(([, config]) => {
      const brain = isRecord(config.brain) ? config.brain : {};
      return brain.modelProfileId === profileId;
    })
    .map(([agentId]) => agentId);
}

app.get("/api/model-profiles", async () => ({
  profiles: listModelProfiles().map((profile) => ({ ...profile, assignedAgentCount: modelProfileUsage(profile.id).length })),
  legacySecretRefs: listAvailableLegacyModelSecrets(),
}));

app.post("/api/model-profiles", async (req, reply) => {
  if (!isRecord(req.body)) return reply.code(400).send({ error: "Invalid model profile payload." });
  try { return reply.code(201).send({ profile: createModelProfile(req.body as ModelProfileInput) }); }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "模型保存失败。" }); }
});

app.put("/api/model-profiles/:profileId", async (req, reply) => {
  const profileId = (req.params as { profileId?: string }).profileId ?? "";
  if (!isRecord(req.body)) return reply.code(400).send({ error: "Invalid model profile payload." });
  try { return { profile: updateModelProfile(profileId, req.body as ModelProfileInput) }; }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "模型更新失败。" }); }
});

app.post("/api/model-profiles/:profileId/test", async (req, reply) => {
  const profileId = (req.params as { profileId?: string }).profileId ?? "";
  const profile = getModelProfile(profileId);
  if (!profile) return reply.code(404).send({ error: "模型配置不存在。" });
  const apiKey = getModelProfileSecret(profileId);
  if (!apiKey) {
    const failed = markModelProfileValidation(profileId, "failed", "尚未配置 API Key。");
    return reply.code(400).send({ error: "尚未配置 API Key。", profile: failed });
  }
  try {
    await validateModelConnection(profile, apiKey);
    return { profile: markModelProfileValidation(profileId, "verified", null) };
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型连接测试失败。";
    const failed = markModelProfileValidation(profileId, "failed", message);
    return reply.code(400).send({ error: message, profile: failed });
  }
});

app.delete("/api/model-profiles/:profileId", async (req, reply) => {
  const profileId = (req.params as { profileId?: string }).profileId ?? "";
  const assignedAgents = modelProfileUsage(profileId);
  if (assignedAgents.length) {
    return reply.code(409).send({ error: `该模型仍被 ${assignedAgents.join("、")} 使用，请先解除绑定。`, assignedAgents });
  }
  try { deleteModelProfile(profileId); return { ok: true }; }
  catch (error) { return reply.code(404).send({ error: error instanceof Error ? error.message : "模型删除失败。" }); }
});

app.get("/api/agents", async () => ({ agents: listAgentConfigs() }));

app.get("/api/agents/:agentId", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  try {
    return { agent: readAgentConfig(agentId) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Invalid agent id." });
  }
});

app.put("/api/agents/:agentId", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const body = req.body;
  if (!isRecord(body)) {
    return reply.code(400).send({ error: "Invalid agent config payload." });
  }
  try {
    return { agent: saveAgentConfig(agentId, body) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Agent save failed." });
  }
});

app.get("/api/agents/:agentId/scheduled-tasks", async (req) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  return { tasks: listScheduledTasks(agentId) };
});

app.post("/api/agents/:agentId/scheduled-tasks/draft", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  if (!readAgentConfig(agentId) || !getString(body.message).trim()) return reply.code(400).send({ error: "员工和任务描述不能为空。" });
  const config = readAgentConfig(agentId);
  const schedule = isRecord(config?.schedule) ? config.schedule : {};
  const message = getString(body.message);
  const timezone = getString(body.timezone) || getString(schedule.timezone) || "Asia/Shanghai";
  try { return { draft: await parseScheduledTaskWithModel(agentId, message, timezone), parser: "model" }; }
  catch { return { draft: parseScheduledTaskDraft(message, timezone), parser: "deterministic" }; }
});

app.post("/api/agents/:agentId/scheduled-tasks", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  const scheduleType = getString(body.scheduleType);
  if (!readAgentConfig(agentId) || !["once", "daily", "weekly", "monthly"].includes(scheduleType) || !isRecord(body.schedule)) {
    return reply.code(400).send({ error: "定时任务参数无效。" });
  }
  try {
    const draft: ScheduledTaskDraft = {
      title: getString(body.title), prompt: getString(body.prompt), scheduleType: scheduleType as ScheduledTaskDraft["scheduleType"],
      schedule: body.schedule, timezone: getString(body.timezone) || "Asia/Shanghai", confidence: 1, reason: "用户确认",
    };
    return reply.code(201).send({ task: createScheduledTask(agentId, draft, getString(body.sourceSessionId) || null) });
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "定时任务创建失败。" }); }
});

app.patch("/api/scheduled-tasks/:taskId", async (req, reply) => {
  const taskId = (req.params as { taskId?: string }).taskId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  try {
    return { task: updateScheduledTask(taskId, {
      ...(typeof body.title === "string" ? { title: body.title } : {}),
      ...(typeof body.prompt === "string" ? { prompt: body.prompt } : {}),
      ...(["once", "daily", "weekly", "monthly"].includes(getString(body.scheduleType)) ? { scheduleType: getString(body.scheduleType) as ScheduledTaskDraft["scheduleType"] } : {}),
      ...(isRecord(body.schedule) ? { schedule: body.schedule } : {}),
      ...(typeof body.timezone === "string" ? { timezone: body.timezone } : {}),
      ...(["active", "paused", "completed", "archived"].includes(getString(body.status)) ? { status: getString(body.status) as ScheduledTask["status"] } : {}),
    }) };
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "定时任务更新失败。" }); }
});

app.delete("/api/scheduled-tasks/:taskId", async (req, reply) => {
  try { return { task: archiveScheduledTask((req.params as { taskId?: string }).taskId ?? "") }; }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "定时任务归档失败。" }); }
});

app.post("/api/scheduled-tasks/:taskId/run", async (req, reply) => {
  const task = getScheduledTask((req.params as { taskId?: string }).taskId ?? "");
  if (!task) return reply.code(404).send({ error: "定时任务不存在。" });
  try { return reply.code(202).send({ run: startScheduledTaskRun(task, new Date().toISOString(), true) }); }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "立即执行失败。" }); }
});

app.post("/api/agent-runs", async (req, reply) => {
  const body = req.body;
  if (!isRecord(body) || typeof body.agentId !== "string" || typeof body.prompt !== "string") {
    return reply.code(400).send({ error: "agentId and prompt are required." });
  }
  try {
    const run = createAgentRun(body.agentId, {
      title: typeof body.title === "string" ? body.title : body.prompt.slice(0, 120),
      prompt: body.prompt,
      request: isRecord(body.request) ? body.request : {},
    }, body.source === "schedule" ? "schedule" : body.source === "chat" ? "chat" : "manual");
    return reply.code(202).send({ run });
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Task creation failed." });
  }
});

app.get("/api/agent-runs", async (req) => {
  const query = isRecord(req.query) ? req.query : {};
  return { runs: listAgentRuns(typeof query.agentId === "string" ? query.agentId : undefined) };
});

app.get("/api/agent-runs/:runId", async (req, reply) => {
  const runId = (req.params as { runId?: string }).runId ?? "";
  const run = getAgentRun(runId);
  if (!run) return reply.code(404).send({ error: "Task not found." });
  return { run, approvals: listRunApprovals(runId), invocations: listRunInvocations(runId), events: listRunEvents(runId) };
});

app.delete("/api/agent-runs/:runId", async (req, reply) => {
  try {
    return { run: cancelAgentRun((req.params as { runId?: string }).runId ?? "") };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Task cancellation failed." });
  }
});

app.post("/api/agent-approvals/:approvalId", async (req, reply) => {
  const body = req.body;
  const decision = isRecord(body) && body.decision === "approved" ? "approved" : isRecord(body) && body.decision === "denied" ? "denied" : null;
  if (!decision) return reply.code(400).send({ error: "decision must be approved or denied." });
  try {
    return { run: await resolveApproval((req.params as { approvalId?: string }).approvalId ?? "", decision) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Approval failed." });
  }
});

app.get("/api/agent-runs/:runId/events", async (req, reply) => {
  const runId = (req.params as { runId?: string }).runId ?? "";
  if (!getAgentRun(runId)) return reply.code(404).send({ error: "Task not found." });
  const after = Number((isRecord(req.query) ? req.query.after : 0) ?? 0);
  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": req.headers.origin && desktopOrigins.has(req.headers.origin) ? req.headers.origin : "",
  });
  for (const event of listRunEvents(runId, Number.isFinite(after) ? after : 0)) {
    reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  }
  const unsubscribe = subscribeRunEvents((value) => {
    const event = value as { id: number; runId: string; type: string };
    if (event.runId === runId) reply.raw.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 20_000);
  req.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});

function desktopNotificationAgentName(agentId: string): string {
  try {
    const config = readAgentConfig(agentId);
    return config && typeof config.displayName === "string" && config.displayName.trim()
      ? config.displayName.trim()
      : agentId;
  } catch {
    return agentId;
  }
}

app.get("/api/desktop-notifications/cursor", async () => ({
  cursor: latestDesktopNotificationCursor(db),
}));

app.get("/api/desktop-notifications/events", async (req, reply) => {
  const query = isRecord(req.query) ? req.query : {};
  const headerCursor = Number(req.headers["last-event-id"] ?? 0);
  const queryCursor = Number(query.after ?? 0);
  const initialCursor = Number.isFinite(headerCursor) && headerCursor > 0
    ? headerCursor
    : Number.isFinite(queryCursor) && queryCursor > 0
      ? queryCursor
      : 0;
  let lastSent = Math.floor(initialCursor);
  let replaying = true;
  const bufferedEventIds: number[] = [];

  reply.hijack();
  reply.raw.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": req.headers.origin && desktopOrigins.has(req.headers.origin) ? req.headers.origin : "",
  });

  const writeEvent = (event: DesktopNotificationEvent) => {
    if (event.id <= lastSent) return;
    reply.raw.write(`id: ${event.id}\nevent: desktop_notification\ndata: ${JSON.stringify(event)}\n\n`);
    lastSent = event.id;
  };
  const writeEventsAfter = (after: number) => {
    let batchCursor = after;
    for (let batch = 0; batch < 20; batch += 1) {
      const events = listDesktopNotificationEvents(db, batchCursor, 500, desktopNotificationAgentName);
      for (const event of events) writeEvent(event);
      if (events.length < 500) break;
      batchCursor = events[events.length - 1].id;
    }
  };
  const unsubscribe = subscribeRunEvents((value) => {
    const event = value as { id?: number };
    if (!Number.isFinite(event.id)) return;
    if (replaying) {
      bufferedEventIds.push(Number(event.id));
      return;
    }
    writeEventsAfter(lastSent);
  });

  writeEventsAfter(lastSent);
  replaying = false;
  if (bufferedEventIds.length) writeEventsAfter(lastSent);

  const heartbeat = setInterval(() => reply.raw.write(": heartbeat\n\n"), 20_000);
  req.raw.on("close", () => { clearInterval(heartbeat); unsubscribe(); });
});

app.post("/api/agent-sessions", async (req, reply) => {
  const body = isRecord(req.body) ? req.body : {};
  const agentId = getString(body.agentId);
  if (!agentId || !readAgentConfig(agentId)) return reply.code(400).send({ error: "有效的 agentId 是必需的。" });
  const session = createSession(agentId, getString(body.title) || "新对话", getString(body.userId) || "local-user");
  if (Array.isArray(body.messages)) {
    for (const item of body.messages.slice(-100)) {
      if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant")) continue;
      const content = getString(item.content).trim();
      if (content) appendMessage(session.id, item.role, content, {
        metadata: {
          imported: true,
          ...(isRecord(item.metadata) && Array.isArray(item.metadata.attachments)
            ? { attachments: item.metadata.attachments.slice(0, 5) }
            : {}),
        },
      });
    }
  }
  return reply.code(201).send({ session: getSession(session.id) });
});

app.get("/api/agent-sessions", async (req) => {
  const query = isRecord(req.query) ? req.query : {};
  return { sessions: listSessions(getString(query.agentId) || undefined) };
});

app.get("/api/agent-sessions/:sessionId/messages", async (req, reply) => {
  const sessionId = (req.params as { sessionId?: string }).sessionId ?? "";
  const session = getSession(sessionId);
  if (!session) return reply.code(404).send({ error: "会话不存在。" });
  return { session, messages: listMessages(sessionId) };
});

app.delete("/api/agent-sessions/:sessionId", async (req, reply) => {
  const sessionId = (req.params as { sessionId?: string }).sessionId ?? "";
  try {
    if (!deleteSession(sessionId)) return reply.code(404).send({ error: "会话不存在。" });
    return reply.code(204).send();
  } catch (error) {
    return reply.code(409).send({ error: error instanceof Error ? error.message : "会话删除失败。" });
  }
});

app.post("/api/agent-sessions/:sessionId/turns", async (req, reply) => {
  const sessionId = (req.params as { sessionId?: string }).sessionId ?? "";
  const session = getSession(sessionId);
  const body = isRecord(req.body) ? req.body : {};
  const message = getString(body.message).trim();
  if (!session) return reply.code(404).send({ error: "会话不存在。" });
  if (!message) return reply.code(400).send({ error: "消息不能为空。" });
  try {
    return reply.code(202).send(createSessionTurn(session.agentId, message, {
      sessionId,
      request: isRecord(body.request) ? body.request : {},
      attachments: body.attachments,
    }));
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "任务创建失败。" });
  }
});

app.post("/api/agent-runs/:runId/cancel", async (req, reply) => {
  try { return { run: cancelAgentRun((req.params as { runId?: string }).runId ?? "") }; }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "取消失败。" }); }
});

app.post("/api/agent-runs/:runId/retry", async (req, reply) => {
  try { return { run: retryAgentRun((req.params as { runId?: string }).runId ?? "") }; }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "重试失败。" }); }
});

app.get("/api/agents/:agentId/memories", async (req) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const query = isRecord(req.query) ? req.query : {};
  return { memories: listMemories(getString(query.userId) || "local-user", agentId), autoMemoryEnabled: automaticMemoryEnabled(agentId) };
});

app.patch("/api/agents/:agentId/memory-settings", async (req) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  return { autoMemoryEnabled: setAutomaticMemoryEnabled(agentId, body.autoMemoryEnabled !== false) };
});

app.post("/api/agents/:agentId/memories", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  try {
    return reply.code(201).send({ memory: upsertMemory(
      getString(body.userId) || "local-user",
      agentId,
      getString(body.kind) as MemoryKind,
      getString(body.key),
      getString(body.content),
      { importance: typeof body.importance === "number" ? body.importance : undefined },
    ) });
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "记忆保存失败。" }); }
});

app.patch("/api/agents/:agentId/memories/:memoryId", async (req, reply) => {
  const { agentId = "", memoryId = "" } = req.params as { agentId?: string; memoryId?: string };
  const body = isRecord(req.body) ? req.body : {};
  try {
    return { memory: updateMemory(getString(body.userId) || "local-user", agentId, memoryId, {
      content: typeof body.content === "string" ? body.content : undefined,
      importance: typeof body.importance === "number" ? body.importance : undefined,
      metadata: isRecord(body.metadata) ? body.metadata : undefined,
    }) };
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "记忆更新失败。" }); }
});

app.delete("/api/agents/:agentId/memories/:memoryId", async (req, reply) => {
  const { agentId = "", memoryId = "" } = req.params as { agentId?: string; memoryId?: string };
  const query = isRecord(req.query) ? req.query : {};
  if (!deleteMemory(getString(query.userId) || "local-user", agentId, memoryId)) return reply.code(404).send({ error: "记忆不存在。" });
  return { ok: true };
});

app.post("/api/agents/:agentId/knowledge/reindex", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  try { return await reindexAgentKnowledge(agentId); }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "索引失败。" }); }
});

app.get("/api/agents/:agentId/knowledge/search", async (req) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const query = isRecord(req.query) ? getString(req.query.q) : "";
  return { citations: searchKnowledge(agentId, query) };
});

app.get("/api/knowledge-documents", async () => ({ documents: listCityKnowledgeDocuments() }));

app.get("/api/knowledge-documents/:documentId", async (req, reply) => {
  const documentId = (req.params as { documentId?: string }).documentId ?? "";
  const document = getCityKnowledgeDocument(documentId);
  return document ? { document } : reply.code(404).send({ error: "知识文档不存在。" });
});

app.post("/api/knowledge-documents", async (req, reply) => {
  const body = isRecord(req.body) ? req.body : {};
  try {
    const document = await createCityKnowledgeDocument({
      title: getString(body.title),
      fileName: getString(body.fileName),
      content: typeof body.content === "string" ? body.content : undefined,
      agentIds: Array.isArray(body.agentIds) ? body.agentIds.filter((id): id is string => typeof id === "string") : [],
    });
    return reply.code(201).send({ document });
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "知识文档创建失败。" });
  }
});

app.put("/api/knowledge-documents/:documentId", async (req, reply) => {
  const documentId = (req.params as { documentId?: string }).documentId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  try {
    return { document: await updateCityKnowledgeDocument(documentId, {
      title: typeof body.title === "string" ? body.title : undefined,
      fileName: typeof body.fileName === "string" ? body.fileName : undefined,
      content: typeof body.content === "string" ? body.content : undefined,
    }) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "知识文档保存失败。" });
  }
});

app.put("/api/knowledge-documents/:documentId/agents", async (req, reply) => {
  const documentId = (req.params as { documentId?: string }).documentId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  try {
    const agentIds = Array.isArray(body.agentIds) ? body.agentIds.filter((id): id is string => typeof id === "string") : [];
    return { document: await setCityKnowledgeAssignments(documentId, agentIds) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "知识分配失败。" });
  }
});

app.delete("/api/knowledge-documents/:documentId", async (req, reply) => {
  const documentId = (req.params as { documentId?: string }).documentId ?? "";
  if (!await deleteCityKnowledgeDocument(documentId)) return reply.code(404).send({ error: "知识文档不存在。" });
  return { ok: true };
});

app.get("/api/agents/:agentId/city-knowledge", async (req) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  return { documents: listAgentCityKnowledge(agentId) };
});

app.get("/api/workflow-skills", async (req) => {
  const query = isRecord(req.query) ? req.query : {};
  return { workflows: listWorkflowSkills(getString(query.status) || undefined) };
});

app.post("/api/workflow-skills/generate", async (req, reply) => {
  const body = isRecord(req.body) ? req.body : {};
  if (!getString(body.agentId) || !getString(body.description)) return reply.code(400).send({ error: "agentId 和 description 是必需的。" });
  try { return await generateWorkflowDraft(getString(body.agentId), getString(body.description), getString(body.sourceSkillId) || undefined); }
  catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "流程生成失败。" }); }
});

app.put("/api/workflow-skills/:skillId", async (req, reply) => {
  const skillId = (req.params as { skillId?: string }).skillId ?? "";
  try {
    const skill = normalizeWorkflowSkill({ ...(isRecord(req.body) ? req.body : {}), id: skillId });
    const saved = saveWorkflowDraft(skill);
    return { skill: saved, validation: validateWorkflowSkill(saved) };
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "流程保存失败。" }); }
});

app.post("/api/workflow-skills/:skillId/validate", async (req) => {
  const skillId = (req.params as { skillId?: string }).skillId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  return validateWorkflowDraft({ ...body, id: skillId });
});

app.post("/api/workflow-skills/:skillId/publish", async (req, reply) => {
  const skillId = (req.params as { skillId?: string }).skillId ?? "";
  const body = isRecord(req.body) ? req.body : {};
  try {
    const agentIds = Array.isArray(body.agentIds) ? body.agentIds.filter((item): item is string => typeof item === "string") : [];
    const allowedSets = agentIds.map(availableToolNamesForAgent);
    const allowedTools = allowedSets.length ? new Set([...allowedSets[0]].filter((name) => allowedSets.every((set) => set.has(name)))) : undefined;
    return { skill: publishWorkflowSkill(skillId, getString(body.version) || "1.0.0",
      agentIds, allowedTools) };
  } catch (error) { return reply.code(400).send({ error: error instanceof Error ? error.message : "流程发布失败。" }); }
});

app.post("/api/skills/preview-url", async (req, reply) => {
  const body = req.body;
  if (!isRecord(body) || typeof body.url !== "string") {
    return reply.code(400).send({ error: "URL is required." });
  }
  try {
    const preview = await fetchSkillFromUrl(body.url.trim());
    return { skill: preview };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Skill preview failed." });
  }
});

app.post("/api/skills/preview-content", async (req, reply) => {
  const body = req.body;
  if (!isRecord(body) || typeof body.fileName !== "string" || typeof body.content !== "string") {
    return reply.code(400).send({ error: "fileName and content are required." });
  }
  try {
    return { skill: previewSkillContent(body.fileName, body.content) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Skill preview failed." });
  }
});

app.post("/api/skills/review", async (req, reply) => {
  const body = isRecord(req.body) ? req.body : {};
  const skill = isRecord(body.skill) ? body.skill : {};
  if (
    typeof body.agentId !== "string" ||
    typeof skill.name !== "string" ||
    typeof skill.summary !== "string" ||
    typeof skill.sourceUrl !== "string" ||
    typeof skill.content !== "string"
  ) {
    return reply.code(400).send({ error: "agentId and a complete skill draft are required." });
  }
  try {
    return { review: await reviewInstructionSkill(body.agentId, {
      name: skill.name,
      summary: skill.summary,
      sourceUrl: skill.sourceUrl,
      content: skill.content,
    }) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "技能管理员审阅失败。" });
  }
});

app.post("/api/skills/library", async (req, reply) => {
  const body = isRecord(req.body) ? req.body : {};
  const skill = isRecord(body.skill) ? body.skill : {};
  if (
    typeof skill.name !== "string" ||
    typeof skill.icon !== "string" ||
    typeof skill.summary !== "string" ||
    typeof skill.sourceUrl !== "string" ||
    typeof skill.content !== "string"
  ) {
    return reply.code(400).send({ error: "Invalid city skill payload." });
  }
  try {
    const file = saveCitySkill({
      id: typeof skill.id === "string" ? skill.id : undefined,
      slug: typeof skill.slug === "string" ? skill.slug : undefined,
      name: skill.name.trim(),
      icon: skill.icon.trim() || "🧩",
      summary: skill.summary.trim(),
      sourceUrl: skill.sourceUrl.trim(),
      content: skill.content,
      commitSha: typeof skill.commitSha === "string" ? skill.commitSha : undefined,
      contentHash: typeof skill.contentHash === "string" ? skill.contentHash : undefined,
      requestedCapabilities: Array.isArray(skill.requestedCapabilities)
        ? skill.requestedCapabilities.filter((item): item is string => typeof item === "string")
        : [],
    });
    return { file };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "City skill save failed." });
  }
});

app.post("/api/agents/skills/install", async (req, reply) => {
  const body = req.body;
  if (!isRecord(body) || !Array.isArray(body.agentIds) || !isRecord(body.skill)) {
    return reply.code(400).send({ error: "agentIds and skill are required." });
  }
  const agentIds = body.agentIds.filter((item): item is string => typeof item === "string");
  const skill = body.skill;
  if (!agentIds.length) {
    return reply.code(400).send({ error: "Choose at least one agent." });
  }
  if (
    typeof skill.name !== "string" ||
    typeof skill.icon !== "string" ||
    typeof skill.summary !== "string" ||
    typeof skill.sourceUrl !== "string" ||
    typeof skill.content !== "string"
  ) {
    return reply.code(400).send({ error: "Invalid skill payload." });
  }
  try {
    return installSkillForAgents(agentIds, {
      id: typeof skill.id === "string" ? skill.id : undefined,
      slug: typeof skill.slug === "string" ? skill.slug : undefined,
      name: skill.name.trim(),
      icon: skill.icon.trim() || "🧩",
      summary: skill.summary.trim(),
      sourceUrl: skill.sourceUrl.trim(),
      content: skill.content,
      commitSha: typeof skill.commitSha === "string" ? skill.commitSha : undefined,
      contentHash: typeof skill.contentHash === "string" ? skill.contentHash : undefined,
      requestedCapabilities: Array.isArray(skill.requestedCapabilities)
        ? skill.requestedCapabilities.filter((item): item is string => typeof item === "string")
        : [],
    });
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Skill install failed." });
  }
});

app.delete("/api/agents/skills/:skillId", async (req, reply) => {
  const skillId = (req.params as { skillId?: string }).skillId ?? "";
  try {
    return deleteSkillFromAgents(skillId);
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Skill delete failed." });
  }
});

app.get("/api/agents/:agentId/workspace", async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  try {
    return { files: listWorkspaceFiles(agentId) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Workspace list failed." });
  }
});

app.post("/api/agents/:agentId/workspace/upload", { bodyLimit: 7 * 1024 * 1024 }, async (req, reply) => {
  const agentId = (req.params as { agentId?: string }).agentId ?? "";
  const body = req.body;
  if (!isRecord(body) || typeof body.fileName !== "string" || typeof body.contentBase64 !== "string") {
    return reply.code(400).send({ error: "fileName and contentBase64 are required." });
  }
  try {
    const file = saveWorkspaceFile(agentId, body.fileName, Buffer.from(body.contentBase64, "base64"));
    await reindexAgentKnowledge(agentId);
    return { file };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Workspace upload failed." });
  }
});

app.get("/api/agents/:agentId/workspace/download/:fileName", async (req, reply) => {
  const { agentId = "", fileName = "" } = req.params as { agentId?: string; fileName?: string };
  try {
    const filePath = getWorkspaceFilePath(agentId, fileName);
    if (!fs.existsSync(filePath)) {
      return reply.code(404).send({ error: "File not found." });
    }
    const query = isRecord(req.query) ? req.query : {};
    const disposition = getString(query.inline) === "1" ? "inline" : "attachment";
    reply.type(mimeTypeForFile(filePath));
    reply.header("Content-Disposition", `${disposition}; filename="${path.basename(filePath).replace(/"/g, "")}"`);
    return reply.send(fs.createReadStream(filePath));
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Workspace download failed." });
  }
});

app.delete("/api/agents/:agentId/workspace/:fileName", async (req, reply) => {
  const { agentId = "", fileName = "" } = req.params as { agentId?: string; fileName?: string };
  try {
    deleteWorkspaceFile(agentId, fileName);
    await reindexAgentKnowledge(agentId);
    return { ok: true, files: listWorkspaceFiles(agentId) };
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Workspace delete failed." });
  }
});

function isValidSecretKey(key: string): boolean {
  return /^[A-Z0-9_]{3,80}$/.test(key);
}

app.get("/api/secrets", async () => ({ secrets: listSecrets() }));

app.put("/api/secrets/:key", async (req, reply) => {
  const key = (req.params as { key?: string }).key ?? "";
  const body = req.body;
  if (!isValidSecretKey(key)) {
    return reply.code(400).send({ error: "Invalid secret key name." });
  }
  if (!isRecord(body) || typeof body.value !== "string" || !body.value.trim()) {
    return reply.code(400).send({ error: "Secret value is required." });
  }
  const value = body.value.trim();
  if (!/^[\x20-\x7E]+$/.test(value)) {
    return reply.code(400).send({ error: "密钥不能包含中文、全角符号或换行，请只粘贴 API Key 本身。" });
  }
  saveSecret(key, value);
  return { key, configured: true };
});

app.delete("/api/secrets/:key", async (req, reply) => {
  const key = (req.params as { key?: string }).key ?? "";
  if (!isValidSecretKey(key)) {
    return reply.code(400).send({ error: "Invalid secret key name." });
  }
  deleteSecret(key);
  return { key, configured: false };
});

type ChatMessage = { role: "user" | "assistant"; content: string };
type ProjectAssetKind = "terrain" | "decoration" | "building";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function mimeTypeForFile(filePath: string): string {
  return ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".pdf": "application/pdf", ".txt": "text/plain; charset=utf-8", ".md": "text/markdown; charset=utf-8",
    ".csv": "text/csv; charset=utf-8", ".json": "application/json; charset=utf-8", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as Record<string, string>)[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function titleFromFile(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function listProjectAssets(kind: ProjectAssetKind, publicRoot: string, relativeDir: string) {
  const dir = path.join(publicRoot, relativeDir);
  if (!fs.existsSync(dir)) return [];
  const files: Array<{ id: string; kind: ProjectAssetKind; name: string; url: string; source: "project" }> = [];
  function walk(currentDir: string) {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!/\.(png|webp)$/i.test(entry.name)) continue;
      const rel = path.relative(publicRoot, fullPath).split(path.sep).join("/");
      files.push({
        id: `project-${kind}-${rel}`,
        kind,
        name: titleFromFile(entry.name),
        url: `/${rel}`,
        source: "project",
      });
    }
  }
  walk(dir);
  return files;
}

app.get("/api/assets", async () => {
  const manifestPath = process.env.AGENT_CITY_ASSET_MANIFEST;
  if (manifestPath && fs.existsSync(manifestPath)) {
    const assets = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    return { assets: Array.isArray(assets) ? assets : [] };
  }
  const publicRoot = process.env.AGENT_CITY_PUBLIC_DIR ?? path.resolve(__dirname, "../../web/public");
  return {
    assets: [
      ...listProjectAssets("building", publicRoot, "buildings"),
      ...listProjectAssets("terrain", publicRoot, "ground"),
      ...listProjectAssets("decoration", publicRoot, "decorations"),
    ],
  };
});

function bytesToMb(value: number): number {
  return Math.round(value / 1024 / 1024);
}

function secondsToRounded(value: number): number {
  return Math.round(value);
}

app.get("/api/server-metrics", async () => {
  const memory = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const cpus = os.cpus();

  return {
    collectedAt: new Date().toISOString(),
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
      uptimeSeconds: secondsToRounded(os.uptime()),
    },
    runtime: {
      node: process.version,
      pid: process.pid,
      appUptimeSeconds: secondsToRounded(process.uptime()),
      cwd: process.cwd(),
    },
    cpu: {
      model: cpus[0]?.model ?? "Unknown CPU",
      cores: cpus.length,
      loadAverage: os.loadavg().map((value) => Number(value.toFixed(2))),
    },
    memory: {
      totalMb: bytesToMb(totalMemory),
      freeMb: bytesToMb(freeMemory),
      usedMb: bytesToMb(usedMemory),
      usedPercent: totalMemory ? Number(((usedMemory / totalMemory) * 100).toFixed(1)) : 0,
      processRssMb: bytesToMb(memory.rss),
      processHeapUsedMb: bytesToMb(memory.heapUsed),
      processHeapTotalMb: bytesToMb(memory.heapTotal),
    },
    services: {
      api: "ok",
      webClient: fs.existsSync(webDist) ? "bundled" : "dev-proxy",
      secretsConfigured: listSecrets().filter((secret) => secret.configured).length,
    },
  };
});

function getMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((item): ChatMessage => ({
      role: item.role === "assistant" ? "assistant" : "user",
      content: getString(item.content),
    }))
    .filter((item) => item.content.trim());
}

app.post("/api/character-chat", async (req, reply) => {
  const body = req.body;
  if (!isRecord(body)) return reply.code(400).send({ error: "Invalid chat payload" });
  const agentId = getString(body.characterId);
  const incomingMessages = getMessages(body.messages);
  const prompt = incomingMessages.at(-1)?.content ?? "";
  if (!agentId || !prompt) return reply.code(400).send({ error: "Agent 和消息不能为空。" });
  try {
    const requestedSessionId = getString(body.sessionId);
    const existing = requestedSessionId ? getSession(requestedSessionId) : null;
    const session = existing?.agentId === agentId ? existing : createSession(agentId, prompt.slice(0, 28));
    const turn = createSessionTurn(agentId, prompt, { sessionId: session.id, request: body });
    return reply.code(202).send({
      message: "任务已接收，请通过事件流获取执行状态和最终回复。",
      ...turn,
      status: "queued",
    });
  } catch (error) {
    return reply.code(400).send({ error: error instanceof Error ? error.message : "Agent 任务创建失败。" });
  }
});

app.post("/api/character-chat-legacy", async (_req, reply) => {
  return reply.code(410).send({ error: "旧版无审批 Agent 工具通道已停用。" });
});

app.get("/api/health", async () => ({ status: "ok" }));

function startScheduledTaskRun(task: ScheduledTask, scheduledFor: string, manual = false) {
  const config = readAgentConfig(task.agentId);
  if (!config) throw new Error("员工配置不存在。");
  const configuredSchedule = isRecord(config.schedule) ? config.schedule : {};
  if (!manual && configuredSchedule.enabled === false) {
    releaseScheduledTaskLease(task.id);
    throw new Error("该员工的自动执行已关闭。");
  }
  const preferredSession = task.sourceSessionId ? getSession(task.sourceSessionId) : null;
  const session = preferredSession && preferredSession.agentId === task.agentId
    ? preferredSession
    : listSessions(task.agentId, 1)[0] ?? createSession(task.agentId, `定时任务：${task.title}`);
  const placeholder = appendMessage(session.id, "assistant", `⏰ 定时任务「${task.title}」已开始执行…`, {
    metadata: { status: "queued", scheduledTaskId: task.id, scheduledFor, scheduledDelivery: true },
  });
  try {
    const run = createAgentRun(task.agentId, {
      title: task.title,
      prompt: task.prompt,
      sessionId: session.id,
      assistantMessageId: placeholder.id,
      scheduledTaskId: task.id,
      scheduledFor,
      manualScheduledRun: manual,
      request: {
        characterName: config.displayName ?? task.agentId,
        managementLanguage: "zh-CN",
        scheduledTaskId: task.id,
        scheduledFor,
        scheduleType: task.scheduleType,
        timezone: task.timezone,
      },
    }, "schedule");
    attachMessageRun(placeholder.id, run.id);
    return run;
  } catch (error) {
    releaseScheduledTaskLease(task.id);
    updateMessage(placeholder.id, `定时任务启动失败：${error instanceof Error ? error.message : "未知错误"}`, {
      status: "failed", scheduledTaskId: task.id, scheduledFor, scheduledDelivery: true,
    });
    throw error;
  }
}

function runScheduledTasks(): void {
  for (const task of claimDueScheduledTasks(new Date(), 20)) {
    try { startScheduledTaskRun(task, task.nextRunAt ?? new Date().toISOString()); }
    catch (error) { app.log.error({ taskId: task.id, error }, "Scheduled task failed to start"); }
  }
}

recoverAgentRuns();
runScheduledTasks();
setInterval(runScheduledTasks, 30_000).unref();

// --- Static web client -------------------------------------------------
// In production the Docker image builds apps/web and copies its dist/
// output next to this file as ./public, so one process serves both the
// UI and the API on a single port/URL.
const webDist = path.resolve(__dirname, "../public");
if (!API_ONLY && fs.existsSync(webDist)) {
  app.register(fastifyStatic, {
    root: webDist,
    wildcard: false,
    setHeaders(res, filePath) {
      if (filePath.endsWith("index.html")) {
        res.header("Cache-Control", "no-cache");
        return;
      }
      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.header("Cache-Control", "public, max-age=31536000, immutable");
        return;
      }
      if (/\.(?:png|webp|jpe?g|gif|svg|woff2?)$/i.test(filePath)) {
        res.header("Cache-Control", "public, max-age=2592000");
        return;
      }
      res.header("Cache-Control", "public, max-age=3600");
    },
  });
  app.setNotFoundHandler((req, reply) => {
    if (req.raw.url?.startsWith("/api")) {
      reply.code(404).send({ error: "Not found" });
      return;
    }
    reply.sendFile("index.html");
  });
} else if (!API_ONLY) {
  app.get("/", async () => ({
    message:
      "Agent City API is running, but no built web client was found at apps/server/public. " +
      "Run `npm run build` in apps/web and copy its dist/ here, or run the web dev server separately.",
  }));
}

app.listen({ port: PORT, host: HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
