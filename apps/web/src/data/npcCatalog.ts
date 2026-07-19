import type { CharacterRuntimeConfig, NpcDefinition, PlacedBuilding } from "../types";

export const CHARACTER_LIBRARY: NpcDefinition[] = [
  {
    id: "mayor",
    defaultBuildingType: "city-hall",
    name: "Mayor",
    role: "城市数据管理员",
    icon: "M",
    spriteUrl: "/npcs/mayor.png",
    walkSprite: {
      url: "/player/mayor-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#5b7fd6",
    homeLine: "我在市政大厅整理城市台账和运行状态。",
    walkingLine: "我在街区巡查，确认城市在地面层面也运转顺手。",
  },
  {
    id: "hermes",
    defaultBuildingType: "agent-home",
    name: "Hermes",
    role: "信使 Agent",
    icon: "H",
    spriteUrl: "/npcs/hermes.png",
    walkSprite: {
      url: "/player/hermes-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#7fbf7f",
    homeLine: "路线很安静。接好 AI Brain 后，我就可以开始传递消息。",
    walkingLine: "我在提前熟悉路线，等真实 Hermes Agent 接入。",
    agentKey: "hermes",
  },
  {
    id: "dispatcher",
    defaultBuildingType: "task-hall",
    name: "Dispatcher",
    role: "任务协调 Agent",
    icon: "D",
    spriteUrl: "/npcs/builder.png",
    walkSprite: {
      url: "/player/dispatcher-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#c98a3a",
    homeLine: "队列、清单和发布时间窗口都已经排好。",
    walkingLine: "我在检查瓶颈，尽量让问题不要扩大。",
  },
  {
    id: "guild-keeper",
    defaultBuildingType: "skill-market",
    name: "Guild Keeper",
    role: "技能大厅管理员",
    icon: "G",
    spriteUrl: "/npcs/guild-keeper.png",
    walkSprite: {
      url: "/player/guild-keeper-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#9b6bd6",
    homeLine: "技能卡已经整理好了。城市准备好时就可以安排学习。",
    walkingLine: "我在询问各个建筑想获得什么新技能。",
  },
  {
    id: "archivist",
    defaultBuildingType: "archive",
    name: "Archivist",
    role: "知识档案 Agent",
    icon: "A",
    spriteUrl: "/npcs/gardener.png",
    walkSprite: {
      url: "/player/archivist-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#b0a0d0",
    homeLine: "每段有用记忆都应该有架子和标签。",
    walkingLine: "我在收集散落的笔记，免得它们被日常冲走。",
  },
  {
    id: "analyst",
    defaultBuildingType: "data-center",
    name: "Analyst",
    role: "数据分析 Agent",
    icon: "N",
    spriteUrl: "/npcs/analyst.png",
    walkSprite: {
      url: "/player/analyst-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#4aa3a3",
    homeLine: "仪表盘已经预热，数字目前很听话。",
    walkingLine: "我在核对数据和街区里的实际情况是否一致。",
  },
  {
    id: "operator",
    defaultBuildingType: "server-room",
    name: "Operator",
    role: "服务器运维 Agent",
    icon: "O",
    spriteUrl: "/npcs/operator.png",
    walkSprite: {
      url: "/player/operator-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#8b90bd",
    homeLine: "日志正在流动，服务状态保持稳定。",
    walkingLine: "我在听基础设施有没有异常的声音。",
  },
  {
    id: "cozy-mage",
    defaultBuildingType: "custom-link",
    name: "Cozy Mage",
    role: "魔法研究 Agent",
    icon: "M",
    spriteUrl: "/npcs/cozy-mage.png",
    walkSprite: {
      url: "/player/cozy-mage-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 320,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#7c3aed",
    homeLine: "我在整理咒语笔记和城市里的小小灵感。",
    walkingLine: "我在沿路观察魔法流向，看看哪里需要一点灵感。",
  },
  {
    id: "workplace-woman",
    defaultBuildingType: "custom-link",
    name: "Workplace Lead",
    role: "职场项目 Agent",
    icon: "W",
    spriteUrl: "/npcs/workplace-woman.png",
    walkSprite: {
      url: "/player/workplace-woman-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#0f766e",
    homeLine: "我在整理优先级、会议纪要和下一步行动。",
    walkingLine: "我在巡视项目动线，确认每件事都有清楚的负责人。",
  },
  {
    id: "lava-scout",
    defaultBuildingType: "custom-link",
    name: "Lava Scout",
    role: "熔岩巡路 Agent",
    icon: "L",
    spriteUrl: "/npcs/lava-scout.png",
    walkSprite: {
      url: "/player/lava-scout-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#f97316",
    homeLine: "我在整理火山小径和安全路线，随时可以出门巡查。",
    walkingLine: "我在沿着路面巡查，确认每一步都能安全通过。",
  },
  {
    id: "visitor",
    defaultBuildingType: "custom-link",
    name: "Visitor",
    role: "自定义建筑 Agent",
    icon: "V",
    spriteUrl: "/npcs/volcano-ranger.png",
    walkSprite: {
      url: "/player/visitor-walk-3dir-12f-grid.png",
      columns: 4,
      rows: 3,
      frameWidth: 313,
      frameHeight: 418,
      displayWidth: 42,
      displayHeight: 56,
    },
    accent: "#d68a8a",
    homeLine: "给这个地方配置 URL 后，我会帮你记住它的用途。",
    walkingLine: "我在熟悉这个自定义角落的形状和职责。",
  },
];

export const CHARACTERS_BY_ID: Record<string, NpcDefinition> = Object.fromEntries(
  CHARACTER_LIBRARY.map((character) => [character.id, character])
);

export const DEFAULT_CHARACTER_BY_BUILDING_TYPE: Record<string, string> = Object.fromEntries(
  CHARACTER_LIBRARY.map((character) => [character.defaultBuildingType, character.id])
);

export function getAllCharacters(customCharacters: NpcDefinition[] = []): NpcDefinition[] {
  const merged = new Map<string, NpcDefinition>();
  for (const character of CHARACTER_LIBRARY) merged.set(character.id, character);
  for (const character of customCharacters) merged.set(character.id, character);
  return Array.from(merged.values());
}

export function getCharacterById(
  characterId: string | null | undefined,
  customCharacters: NpcDefinition[] = []
): NpcDefinition | null {
  if (!characterId) return null;
  return customCharacters.find((character) => character.id === characterId) ?? CHARACTERS_BY_ID[characterId] ?? null;
}

export function getDefaultCharacterForBuildingType(
  buildingType: string,
  customCharacters: NpcDefinition[] = []
): NpcDefinition | null {
  const custom = customCharacters.find((character) => character.defaultBuildingType === buildingType);
  return custom ?? getCharacterById(DEFAULT_CHARACTER_BY_BUILDING_TYPE[buildingType]);
}

export function getAssignedResident(
  building: PlacedBuilding,
  buildingResidents: Record<string, string>,
  customCharacters: NpcDefinition[] = []
): NpcDefinition | null {
  return getCharacterById(buildingResidents[building.id], customCharacters);
}

export function createDefaultBuildingResidents(
  buildings: PlacedBuilding[],
  existing: Record<string, string> = {},
  customCharacters: NpcDefinition[] = []
): Record<string, string> {
  const next: Record<string, string> = {};
  const used = new Set<string>();
  const charactersById = Object.fromEntries(getAllCharacters(customCharacters).map((character) => [character.id, character]));
  for (const building of buildings) {
    const existingCharacterId = existing[building.id];
    if (existingCharacterId && !used.has(existingCharacterId) && charactersById[existingCharacterId]) {
      next[building.id] = existingCharacterId;
      used.add(existingCharacterId);
      continue;
    }
    // A new city starts with one real Agent (Mayor). The rest of the built-in
    // characters are templates that users can add from Municipal Management.
    const defaultCharacterId = building.type === "city-hall"
      ? DEFAULT_CHARACTER_BY_BUILDING_TYPE[building.type]
      : undefined;
    if (defaultCharacterId && !used.has(defaultCharacterId)) {
      next[building.id] = defaultCharacterId;
      used.add(defaultCharacterId);
    }
  }
  return next;
};

export function getResidentForBuildingType(
  buildingType: string,
  customCharacters: NpcDefinition[] = []
): NpcDefinition | null {
  return getDefaultCharacterForBuildingType(buildingType, customCharacters);
}

export function createDefaultCharacterConfig(character: NpcDefinition): CharacterRuntimeConfig {
  const isCityManager = character.id === "mayor";
  return {
    displayName: character.name,
    brain: {
      enabled: false,
      modelProfileId: "",
    },
    files: {
      user: `名称：${character.name}\n职责：${character.role}\n默认建筑类型：${character.defaultBuildingType}`,
      identity: `你是 ${character.name}，${character.role}，生活在 Agent City。`,
      agent: [
        `主要工作：管理 ${character.defaultBuildingType} 建筑。`,
        "持续关注城市状态、被分配的建筑、已安装技能和用户请求。",
        "当真实模型连接器启用后，以这个 Agent 的身份回答，而不是作为通用助手回答。",
      ].join("\n"),
      memory: "",
      tools: "",
    },
    permissions: {
      workspace: "none",
      web: "none",
      cityData: isCityManager ? "read" : "none",
      cityDataReadonly: isCityManager,
      directory: isCityManager ? "city-data-readonly" : "none",
    },
    learnedSkillIds: [],
    learnedSkills: [],
    skillEnabledById: {},
    schedule: {
      enabled: false,
      clock: "server",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
      workdays: [1, 2, 3, 4, 5],
      startTime: "09:00",
      endTime: "18:00",
      location: character.defaultBuildingType,
    },
    timedTasks: [],
  };
}

export function createDefaultCharacterConfigs(
  existing: Record<string, CharacterRuntimeConfig> = {},
  customCharacters: NpcDefinition[] = []
): Record<string, CharacterRuntimeConfig> {
  return Object.fromEntries(
    getAllCharacters(customCharacters).map((character) => {
      const defaults = createDefaultCharacterConfig(character);
      const saved = existing[character.id];
      return [
        character.id,
        {
          displayName: saved?.displayName ?? defaults.displayName,
          brain: {
            enabled: Boolean(saved?.brain?.modelProfileId) && Boolean(saved?.brain?.enabled),
            modelProfileId: saved?.brain?.modelProfileId ?? "",
          },
          files: { ...defaults.files, ...saved?.files },
          permissions: {
            workspace:
              saved?.permissions?.workspace ??
              (saved?.permissions?.directory === "project-readonly"
                ? "read"
                : saved?.permissions?.directory === "approval-required"
                  ? "write-with-approval"
                  : defaults.permissions?.workspace ?? "none"),
            web: saved?.permissions?.web ?? defaults.permissions?.web ?? "none",
            cityData:
              saved?.permissions?.cityData ??
              (saved?.permissions?.cityDataReadonly ? "read" : defaults.permissions?.cityData ?? "none"),
            cityDataReadonly:
              saved?.permissions?.cityDataReadonly ?? defaults.permissions?.cityDataReadonly ?? false,
            directory: saved?.permissions?.directory ?? defaults.permissions?.directory ?? "none",
          },
          workspaceRoot: saved?.workspaceRoot,
          managedWorkspace: saved?.managedWorkspace,
          learnedSkillIds: saved?.learnedSkillIds ?? saved?.learnedSkills?.map((skill) => skill.id) ?? [],
          learnedSkills: saved?.learnedSkills ?? [],
          skillEnabledById: saved?.skillEnabledById ?? {},
          schedule: {
            enabled: saved?.schedule?.enabled ?? defaults.schedule?.enabled ?? false,
            clock: saved?.schedule?.clock ?? defaults.schedule?.clock ?? "server",
            timezone: saved?.schedule?.timezone ?? defaults.schedule?.timezone ?? "Asia/Shanghai",
            workdays: saved?.schedule?.workdays ?? defaults.schedule?.workdays ?? [1, 2, 3, 4, 5],
            startTime: saved?.schedule?.startTime ?? defaults.schedule?.startTime ?? "09:00",
            endTime: saved?.schedule?.endTime ?? defaults.schedule?.endTime ?? "18:00",
            location: saved?.schedule?.location ?? defaults.schedule?.location ?? character.defaultBuildingType,
          },
          timedTasks: saved?.timedTasks ?? [],
          configFilePath: saved?.configFilePath,
        },
      ];
    })
  );
}
