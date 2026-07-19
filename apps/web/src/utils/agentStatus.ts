import type {
  CharacterRuntimeConfig,
  NpcDefinition,
  PlacedBuilding,
  PlacedNpcState,
} from "../types";

export interface BuildingAgentStatus {
  residentName: string;
  presence: "home" | "walking" | "none";
  brainEnabled: boolean;
  modelReady: boolean;
  secretReady: boolean;
  ready: boolean;
  label: string;
  detail: string;
}

export function getCharacterDisplayName(
  character: NpcDefinition | null,
  config: CharacterRuntimeConfig | undefined
): string {
  return config?.displayName?.trim() || character?.name || "未分配";
}

export function getBuildingAgentStatus({
  resident,
  config,
  npc,
}: {
  building: PlacedBuilding;
  resident: NpcDefinition | null;
  config?: CharacterRuntimeConfig;
  npc?: PlacedNpcState;
  configuredSecretKeys?: string[];
}): BuildingAgentStatus {
  if (!resident) {
    return {
      residentName: "未分配 Agent",
      presence: "none",
      brainEnabled: false,
      modelReady: false,
      secretReady: false,
      ready: false,
      label: "停工",
      detail: "没有 Agent 管理这个建筑。",
    };
  }

  const residentName = getCharacterDisplayName(resident, config);
  const brainEnabled = Boolean(config?.brain.enabled);
  const modelReady = Boolean(config?.brain.modelProfileId);
  const secretReady = modelReady;
  const ready = brainEnabled && modelReady && secretReady;
  const presence = npc?.presence === "walking" ? "walking" : "home";

  const missing: string[] = [];
  if (!brainEnabled) missing.push("AI Brain 未启用");
  if (!modelReady) missing.push("模型未选择");
  if (!secretReady) missing.push("后端密钥未绑定");

  return {
    residentName,
    presence,
    brainEnabled,
    modelReady,
    secretReady,
    ready,
    label: ready ? "运行中" : "停工",
    detail: ready
      ? `${residentName} 已绑定全局模型。`
      : missing.join(" / "),
  };
}
