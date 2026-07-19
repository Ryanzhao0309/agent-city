import crypto from "node:crypto";
import { db } from "./db.js";

export type WorkflowNodeType =
  | "collect_info"
  | "knowledge_query"
  | "tool_call"
  | "decision"
  | "confirmation"
  | "response"
  | "handoff";

export type WorkflowCondition =
  | { type: "always" }
  | { type: "slot_present"; slot: string }
  | { type: "equals"; slot: string; value: string | number | boolean }
  | { type: "user_confirmed" }
  | { type: "tool_success" }
  | { type: "tool_failed" };

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  name: string;
  instruction: string;
  expectedSlots: string[];
  allowedTools: string[];
  completionRule: WorkflowCondition;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  condition: WorkflowCondition;
  priority: number;
}

export interface WorkflowSkill {
  id: string;
  version: string;
  name: string;
  description: string;
  triggerIntents: string[];
  requiredSlots: string[];
  startNodeId: string;
  terminalNodeIds: string[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const NODE_TYPES = new Set<WorkflowNodeType>([
  "collect_info", "knowledge_query", "tool_call", "decision", "confirmation", "response", "handoff",
]);
const CONDITION_TYPES = new Set([
  "always", "slot_present", "equals", "user_confirmed", "tool_success", "tool_failed",
]);

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))]
    : [];
}

function condition(value: unknown): WorkflowCondition {
  const input = record(value);
  const type = typeof input.type === "string" && CONDITION_TYPES.has(input.type) ? input.type : "always";
  if (type === "slot_present") return { type, slot: String(input.slot ?? "").trim() };
  if (type === "equals") {
    const raw = input.value;
    const expected = typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean" ? raw : "";
    return { type, slot: String(input.slot ?? "").trim(), value: expected };
  }
  return { type } as WorkflowCondition;
}

export function normalizeWorkflowSkill(value: unknown): WorkflowSkill {
  const input = record(value);
  const id = String(input.id ?? `workflow-${crypto.randomUUID()}`).trim();
  const nodes = Array.isArray(input.nodes) ? input.nodes.map((item): WorkflowNode => {
    const node = record(item);
    const rawType = String(node.type ?? "response") as WorkflowNodeType;
    return {
      id: String(node.id ?? "").trim(),
      type: NODE_TYPES.has(rawType) ? rawType : "response",
      name: String(node.name ?? node.id ?? "未命名步骤").trim(),
      instruction: String(node.instruction ?? "").trim(),
      expectedSlots: strings(node.expectedSlots),
      allowedTools: strings(node.allowedTools),
      completionRule: condition(node.completionRule),
    };
  }) : [];
  const edges = Array.isArray(input.edges) ? input.edges.map((item): WorkflowEdge => {
    const edge = record(item);
    return {
      from: String(edge.from ?? "").trim(),
      to: String(edge.to ?? "").trim(),
      condition: condition(edge.condition),
      priority: Number.isFinite(Number(edge.priority)) ? Number(edge.priority) : 0,
    };
  }) : [];
  return {
    id,
    version: String(input.version ?? "1.0.0").trim() || "1.0.0",
    name: String(input.name ?? "未命名流程").trim(),
    description: String(input.description ?? "").trim(),
    triggerIntents: strings(input.triggerIntents),
    requiredSlots: strings(input.requiredSlots),
    startNodeId: String(input.startNodeId ?? nodes[0]?.id ?? "").trim(),
    terminalNodeIds: strings(input.terminalNodeIds),
    nodes,
    edges,
  };
}

/**
 * Repair references that can be resolved without guessing user intent.
 * Model-generated drafts occasionally contain a removed terminal id or omit
 * the slot on a condition whose source node has exactly one expected slot.
 */
export function repairWorkflowSkill(value: unknown): WorkflowSkill {
  const skill = normalizeWorkflowSkill(value);
  const ids = new Set(skill.nodes.map((node) => node.id));
  const outgoing = new Set(skill.edges.map((edge) => edge.from));
  const terminalNodeIds = skill.terminalNodeIds.filter((id) => ids.has(id));
  if (!terminalNodeIds.length) {
    terminalNodeIds.push(...skill.nodes
      .filter((node) => !outgoing.has(node.id) && (node.type === "response" || node.type === "handoff"))
      .map((node) => node.id));
  }

  const inferSlot = (value: WorkflowCondition, candidates: string[]): WorkflowCondition => {
    if ((value.type !== "slot_present" && value.type !== "equals") || value.slot || candidates.length !== 1) return value;
    return { ...value, slot: candidates[0] };
  };
  const nodes = skill.nodes.map((node) => ({
    ...node,
    completionRule: inferSlot(node.completionRule, node.expectedSlots),
  }));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const edges = skill.edges.map((edge) => ({
    ...edge,
    condition: inferSlot(edge.condition, nodeById.get(edge.from)?.expectedSlots ?? []),
  }));

  return { ...skill, terminalNodeIds: [...new Set(terminalNodeIds)], nodes, edges };
}

function validateCondition(value: WorkflowCondition, label: string, errors: string[]): void {
  if ((value.type === "slot_present" || value.type === "equals") && !value.slot) {
    errors.push(`${label} 缺少 slot。`);
  }
}

export function validateWorkflowSkill(value: unknown, availableTools?: Set<string>): WorkflowValidation {
  const skill = normalizeWorkflowSkill(value);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!skill.id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(skill.id)) errors.push("流程 id 格式无效。");
  if (!skill.name) errors.push("流程名称不能为空。");
  if (!skill.nodes.length) errors.push("流程至少需要一个节点。");
  const ids = new Set<string>();
  for (const node of skill.nodes) {
    if (!node.id) errors.push("节点 id 不能为空。");
    else if (ids.has(node.id)) errors.push(`节点 id 重复：${node.id}`);
    ids.add(node.id);
    if (!node.instruction) warnings.push(`节点 ${node.id || node.name} 没有执行说明。`);
    validateCondition(node.completionRule, `节点 ${node.id} 的完成条件`, errors);
    for (const tool of node.allowedTools) {
      if (availableTools && !availableTools.has(tool)) errors.push(`节点 ${node.id} 引用了不存在或未授权的工具：${tool}`);
    }
  }
  if (!ids.has(skill.startNodeId)) errors.push("startNodeId 不存在。");
  if (!skill.terminalNodeIds.length) errors.push("流程至少需要一个终止节点。");
  for (const terminal of skill.terminalNodeIds) if (!ids.has(terminal)) errors.push(`终止节点不存在：${terminal}`);
  for (const edge of skill.edges) {
    if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`边 ${edge.from} → ${edge.to} 引用了不存在的节点。`);
    validateCondition(edge.condition, `边 ${edge.from} → ${edge.to} 的条件`, errors);
  }

  const adjacency = new Map<string, string[]>();
  for (const id of ids) adjacency.set(id, []);
  for (const edge of skill.edges) if (ids.has(edge.from) && ids.has(edge.to)) adjacency.get(edge.from)!.push(edge.to);
  const reachable = new Set<string>();
  const visit = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const next of adjacency.get(id) ?? []) visit(next);
  };
  if (ids.has(skill.startNodeId)) visit(skill.startNodeId);
  for (const id of ids) if (!reachable.has(id)) errors.push(`节点不可达：${id}`);
  for (const id of reachable) {
    if ((adjacency.get(id) ?? []).length === 0 && !skill.terminalNodeIds.includes(id)) errors.push(`非终止节点没有后续边：${id}`);
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycle = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of adjacency.get(id) ?? []) if (cycle(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  if (skill.startNodeId && cycle(skill.startNodeId)) errors.push("流程包含循环；首版工作流只支持有向无环图。");
  for (const terminal of skill.terminalNodeIds) {
    if ((adjacency.get(terminal) ?? []).length) errors.push(`终止节点 ${terminal} 不能有后续边。`);
    const node = skill.nodes.find((item) => item.id === terminal);
    if (node && node.type !== "response" && node.type !== "handoff") errors.push(`终止节点 ${terminal} 必须是 response 或 handoff。`);
  }
  return { valid: errors.length === 0, errors, warnings };
}

export function saveWorkflowDraft(value: unknown, sourceSkillId?: string): WorkflowSkill {
  const skill = repairWorkflowSkill(value);
  const createdAt = new Date().toISOString();
  const existing = db.prepare("SELECT status FROM workflow_skill WHERE id = ? AND version = ?").get(skill.id, skill.version) as
    | { status: string }
    | undefined;
  if (existing?.status === "published") throw new Error("已发布版本不可修改，请创建新版本。");
  db.prepare(`INSERT INTO workflow_skill
    (id, version, name, description, status, definition_json, source_skill_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, ?, ?)
    ON CONFLICT(id, version) DO UPDATE SET name=excluded.name, description=excluded.description,
      definition_json=excluded.definition_json, source_skill_id=excluded.source_skill_id, updated_at=excluded.updated_at`).run(
    skill.id, skill.version, skill.name, skill.description, JSON.stringify(skill), sourceSkillId ?? null, createdAt, createdAt,
  );
  return skill;
}

export function validateWorkflowDraft(value: unknown, availableTools?: Set<string>): { skill: WorkflowSkill; validation: WorkflowValidation } {
  const skill = saveWorkflowDraft(value);
  const validation = validateWorkflowSkill(skill, availableTools);
  db.prepare("UPDATE workflow_skill SET status=?, updated_at=? WHERE id=? AND version=?")
    .run(validation.valid ? "validated" : "draft", new Date().toISOString(), skill.id, skill.version);
  return { skill, validation };
}

export function publishWorkflowSkill(id: string, version: string, agentIds: string[] = [], availableTools?: Set<string>): WorkflowSkill {
  const row = db.prepare("SELECT definition_json, status FROM workflow_skill WHERE id = ? AND version = ?").get(id, version) as
    | { definition_json: string; status: string }
    | undefined;
  if (!row) throw new Error("流程草稿不存在。");
  const skill = normalizeWorkflowSkill(JSON.parse(row.definition_json));
  const result = validateWorkflowSkill(skill, availableTools);
  if (!result.valid) throw new Error(result.errors.join("\n"));
  if (row.status !== "validated") throw new Error("流程必须先通过显式校验才能发布。");
  const timestamp = new Date().toISOString();
  db.prepare("UPDATE workflow_skill SET status = 'published', published_at = ?, updated_at = ? WHERE id = ? AND version = ?")
    .run(timestamp, timestamp, id, version);
  for (const agentId of agentIds) {
    db.prepare(`INSERT INTO agent_workflow_binding (agent_id, skill_id, version, enabled, created_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(agent_id, skill_id) DO UPDATE SET version=excluded.version, enabled=1`).run(agentId, id, version, timestamp);
  }
  return skill;
}

export function listWorkflowSkills(status?: string): Array<{ skill: WorkflowSkill; status: string; updatedAt: string }> {
  const rows = (status
    ? db.prepare("SELECT * FROM workflow_skill WHERE status = ? ORDER BY updated_at DESC").all(status)
    : db.prepare("SELECT * FROM workflow_skill ORDER BY updated_at DESC").all()) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    skill: normalizeWorkflowSkill(JSON.parse(String(row.definition_json))),
    status: String(row.status),
    updatedAt: String(row.updated_at),
  }));
}

export function workflowsForAgent(agentId: string): WorkflowSkill[] {
  const rows = db.prepare(`SELECT w.definition_json FROM workflow_skill w
    JOIN agent_workflow_binding b ON b.skill_id=w.id AND b.version=w.version
    WHERE b.agent_id=? AND b.enabled=1 AND w.status='published' ORDER BY w.updated_at DESC`).all(agentId) as Array<{ definition_json: string }>;
  return rows.map((row) => normalizeWorkflowSkill(JSON.parse(row.definition_json)));
}

export function workflowByVersion(id: string, version: string): WorkflowSkill | null {
  const row = db.prepare("SELECT definition_json FROM workflow_skill WHERE id=? AND version=?").get(id, version) as
    | { definition_json: string }
    | undefined;
  return row ? normalizeWorkflowSkill(JSON.parse(row.definition_json)) : null;
}

export function evaluateCondition(
  rule: WorkflowCondition,
  slots: Record<string, unknown>,
  lastToolStatus?: string | null,
): boolean {
  switch (rule.type) {
    case "always": return true;
    case "slot_present": return slots[rule.slot] !== undefined && slots[rule.slot] !== null && slots[rule.slot] !== "";
    case "equals": return slots[rule.slot] === rule.value;
    case "user_confirmed": return slots.confirmation === true || slots.confirmation === "confirmed";
    case "tool_success": return lastToolStatus === "succeeded";
    case "tool_failed": return lastToolStatus === "failed";
  }
}

export function nextWorkflowNode(skill: WorkflowSkill, current: string, slots: Record<string, unknown>, lastToolStatus?: string | null): string | null {
  const edge = skill.edges
    .filter((item) => item.from === current)
    .sort((a, b) => a.priority - b.priority)
    .find((item) => evaluateCondition(item.condition, slots, lastToolStatus));
  return edge?.to ?? null;
}
