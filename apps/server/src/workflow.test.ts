import assert from "node:assert/strict";
import test from "node:test";
import { repairWorkflowSkill, validateWorkflowSkill, type WorkflowSkill } from "./workflow.js";

function validWorkflow(): WorkflowSkill {
  return {
    id: "expense-review", version: "1.0.0", name: "报销审核", description: "审核报销材料",
    triggerIntents: ["申请报销"], requiredSlots: ["amount"], startNodeId: "collect", terminalNodeIds: ["reply"],
    nodes: [
      { id: "collect", type: "collect_info", name: "收集资料", instruction: "收集金额", expectedSlots: ["amount"], allowedTools: [], completionRule: { type: "slot_present", slot: "amount" } },
      { id: "reply", type: "response", name: "回复", instruction: "给出结果", expectedSlots: [], allowedTools: [], completionRule: { type: "always" } },
    ],
    edges: [{ from: "collect", to: "reply", condition: { type: "slot_present", slot: "amount" }, priority: 1 }],
  };
}

test("workflow validation accepts a reachable terminating DAG", () => {
  assert.deepEqual(validateWorkflowSkill(validWorkflow()).errors, []);
});

test("workflow validation rejects cycles, unreachable nodes and invalid terminal edges", () => {
  const workflow = validWorkflow();
  workflow.nodes.push({ id: "orphan", type: "response", name: "孤立", instruction: "noop", expectedSlots: [], allowedTools: [], completionRule: { type: "always" } });
  workflow.edges.push({ from: "reply", to: "collect", condition: { type: "always" }, priority: 0 });
  const result = validateWorkflowSkill(workflow);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((item) => item.includes("不可达")));
  assert.ok(result.errors.some((item) => item.includes("循环")));
  assert.ok(result.errors.some((item) => item.includes("终止节点")));
});

test("workflow validation rejects tools outside the published allowlist", () => {
  const workflow = validWorkflow();
  workflow.nodes[0].allowedTools = ["unknown_mutation"];
  const result = validateWorkflowSkill(workflow, new Set(["list_workspace_files"]));
  assert.ok(result.errors.some((item) => item.includes("未授权")));
});

test("workflow repair removes stale terminals and infers an unambiguous condition slot", () => {
  const workflow = validWorkflow();
  workflow.terminalNodeIds = ["removed_reply", "reply"];
  workflow.edges[0].condition = { type: "equals", slot: "", value: "100" };

  const repaired = repairWorkflowSkill(workflow);

  assert.deepEqual(repaired.terminalNodeIds, ["reply"]);
  assert.deepEqual(repaired.edges[0].condition, { type: "equals", slot: "amount", value: "100" });
  assert.deepEqual(validateWorkflowSkill(repaired).errors, []);
});

test("workflow repair infers a response or handoff sink when all terminal references are stale", () => {
  const workflow = validWorkflow();
  workflow.terminalNodeIds = ["removed_reply"];

  const repaired = repairWorkflowSkill(workflow);

  assert.deepEqual(repaired.terminalNodeIds, ["reply"]);
});

test("workflow repair leaves an ambiguous missing slot for validation", () => {
  const workflow = validWorkflow();
  workflow.nodes[0].expectedSlots = ["amount", "currency"];
  workflow.edges[0].condition = { type: "equals", slot: "", value: "CNY" };

  const repaired = repairWorkflowSkill(workflow);

  assert.equal(repaired.edges[0].condition.type, "equals");
  assert.equal("slot" in repaired.edges[0].condition ? repaired.edges[0].condition.slot : undefined, "");
  assert.ok(validateWorkflowSkill(repaired).errors.some((item) => item.includes("缺少 slot")));
});
