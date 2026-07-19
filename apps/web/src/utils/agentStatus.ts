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

const providerSecretRef: Record<string, string> = {
  deepseek: "DEEPSEEK_API_KEY",
  gemini: "GEMINI_API_KEY",
  kimi: "KIMI_API_KEY",
  doubao: "DOUBAO_API_KEY",
  qwen: "QWEN_API_KEY",
  "openai-compatible": "OPENAI_API_KEY",
};

export function getCharacterDisplayName(
  character: NpcDefinition | null,
  config: CharacterRuntimeConfig | undefined
): string {
  return config?.displayName?.trim() || character?.name || "未分配";
}

export function getExpectedSecretRef(config: CharacterRuntimeConfig | undefined): string {
  if (!config) return "";
  return config.brain.apiKeyRef || providerSecretRef[config.brain.provider] || "";
}

export function getBuildingAgentStatus({
  resident,
  config,
  npc,
  configuredSecretKeys = [],
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
  const modelReady = Boolean(config?.brain.model);
  const secretRef = getExpectedSecretRef(config);
  const secretReady =
    config?.brain.provider === "local" || (Boolean(secretRef) && configuredSecretKeys.includes(secretRef));
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
      ? `${residentName} 已配置 ${config?.brain.provider} / ${config?.brain.model}。`
      : missing.join(" / "),
  };
}
