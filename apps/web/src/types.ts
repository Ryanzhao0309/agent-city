export interface BuildingType {
  type: string;
  name: string;
  category: string;
  size: [number, number]; // [cols, rows]
  color: string;
  icon: string;
  locked?: boolean;
  description: string;
}

export type BuildingPurpose =
  | "agent-home"
  | "bookmarks"
  | "city-hall"
  | "skill-hall"
  | "todo-hall"
  | "server-manager"
  | "theme-hall"
  | "generic";

export interface PlacedBuilding {
  id: string;
  type: string;
  x: number;
  y: number;
  name: string; // user-editable label, defaults to the type's name
  purpose?: BuildingPurpose;
  customAssetId?: string;
  customImageUrl?: string;
  size?: [number, number];
}

export interface BookmarkItem {
  id: string;
  title: string;
  url: string;
  note?: string;
}

export interface BookmarkGroup {
  id: string;
  name: string;
  bookmarks: BookmarkItem[];
}

export type BuildingTaskStatus = "inbox" | "todo" | "doing" | "done";

export interface BuildingTask {
  id: string;
  title: string;
  status: BuildingTaskStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export type CustomAssetKind = "terrain" | "decoration" | "building";
export type RoadRotation = 0 | 90 | 180 | 270;

export interface CustomSceneAsset {
  id: string;
  kind: CustomAssetKind;
  name: string;
  url: string;
  source: "project" | "upload";
}

export interface PlacedCustomAsset {
  id: string;
  assetId: string;
  kind: CustomAssetKind;
  name: string;
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: RoadRotation;
}

export type MapSurrounding =
  | "plain"
  | "sea"
  | "forest"
  | "megalithic"
  | "lava"
  | "undersea"
  | "toy-workshop"
  | "changan-city"
  | "sky-observatory"
  | "volcanic-forge"
  | "polar-crystal";

export type TerrainType = "grass" | "stone" | "water" | "lava-flow" | "lava-cracked";

export type DecorationType =
  | "tree-round"
  | "tree-pine"
  | "tree-wide"
  | "tree-dry"
  | "shrub-cluster"
  | "volcano-active"
  | "volcano-dormant"
  | "volcano-caldera";

export interface PlacedDecoration {
  id: string;
  type: DecorationType;
  // Decoration coordinates use terrain sub-cells: each building grid cell is 2x2.
  x: number;
  y: number;
}

export interface LayoutSchemeSnapshot {
  buildings: PlacedBuilding[];
  decorations?: PlacedDecoration[];
  npcs?: Record<string, PlacedNpcState>;
  buildingResidents?: Record<string, string>;
  buildingBookmarks?: Record<string, BookmarkGroup[]>;
  buildingTasks?: Record<string, BuildingTask[]>;
  placedCustomAssets?: PlacedCustomAsset[];
  mapSurrounding?: MapSurrounding;
  ground?: Record<string, TerrainType>;
  groundResolution?: number;
  blockedWalkCells?: Record<string, true>;
  blockedWalkResolution?: number;
  autoRoadCells?: Record<string, true>;
}

export interface LayoutScheme {
  id: string;
  name: string;
  slot: 1 | 2 | 3;
  updatedAt: string;
  previewDataUrl?: string;
  snapshot: LayoutSchemeSnapshot;
}

export type NpcPresence = "home" | "walking";
export type NpcMood = "idle" | "curious" | "busy" | "happy";
export type NpcDirection = "down" | "right" | "up" | "left";

export interface NpcWalkSprite {
  url: string;
  columns: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  displayWidth: number;
  displayHeight: number;
}

export interface PlacedNpcState {
  presence: NpcPresence;
  x: number;
  y: number;
  direction?: NpcDirection;
  line?: string;
  mood?: NpcMood;
  runtimeStatus?: AgentRunStatus;
}

export interface NpcDefinition {
  id: string;
  defaultBuildingType: string;
  name: string;
  role: string;
  icon: string;
  spriteUrl: string;
  walkSprite?: NpcWalkSprite;
  accent: string;
  homeLine: string;
  walkingLine: string;
  agentKey?: string;
  custom?: boolean;
}

export type AppThemeMode = "system" | "light" | "dark";
export type CityTimeOfDay = "auto" | "day" | "night";

export interface ThemePackAssetDefinition {
  id: string;
  kind: CustomAssetKind;
  name: string;
  url: string;
}

export interface ThemePackDefinition {
  id: string;
  name: string;
  kind: "skin" | "terrain" | "complete";
  icon: string;
  summary: string;
  previewUrl: string;
  creatorName?: string;
  creatorUrl?: string;
  version?: string;
  license?: string;
  minAgentCityVersion?: string;
  sourceUrl?: string;
  likeUrl?: string;
  likeIssueNumber?: number;
  downloadCount?: number;
  likeCount?: number;
  builtIn?: boolean;
  remote?: boolean;
  mapSurrounding?: MapSurrounding;
  assetIds?: string[];
  buildingSkins?: Record<string, string>;
  assets?: ThemePackAssetDefinition[];
  installedAt?: string;
}

export interface DeviceIntegration {
  id: string;
  name: string;
  url: string;
  status: "unknown" | "online" | "offline";
  lastCheckedAt?: string;
}

export interface AiBrainConfig {
  enabled: boolean;
  modelProfileId: string;
}

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
  assignedAgentCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ModelProfileDraft {
  name: string;
  template: ModelTemplate;
  protocol: ModelProtocol;
  baseUrl: string;
  model: string;
  apiKey?: string;
  legacySecretRef?: string;
  temperature: number | null;
  maxTokens: number | null;
  extraBody: Record<string, unknown>;
  enabled?: boolean;
  isDefault?: boolean;
}

export interface CharacterCoreFiles {
  user: string;
  identity: string;
  agent: string;
  memory: string;
  tools: string;
}

export type AgentDirectoryPermission = "none" | "city-data-readonly" | "project-readonly" | "approval-required";
export type AgentCapabilityMode = "none" | "read" | "write-with-approval";

export interface AgentPermissions {
  workspace: AgentCapabilityMode;
  web: "none" | "read";
  cityData: AgentCapabilityMode;
  cityDataReadonly?: boolean;
  directory?: AgentDirectoryPermission;
}

export type AgentScheduleClock = "server" | "local";

export interface AgentWorkSchedule {
  enabled: boolean;
  clock: AgentScheduleClock;
  timezone: string;
  workdays: number[];
  startTime: string;
  endTime: string;
  location: string;
}

export interface AgentTimedTask {
  id: string;
  title: string;
  time: string;
  days: number[];
  location: string;
  enabled: boolean;
}

export interface LearnedSkill {
  id: string;
  slug: string;
  name: string;
  icon: string;
  summary: string;
  sourceUrl: string;
  installedAt: string;
  skillPath?: string;
  commitSha?: string;
  contentHash?: string;
  requestedCapabilities?: string[];
  valid?: boolean;
  disabledReason?: string;
}

export interface CharacterRuntimeConfig {
  displayName?: string;
  brain: AiBrainConfig;
  files: CharacterCoreFiles;
  permissions?: AgentPermissions;
  workspaceRoot?: string;
  managedWorkspace?: "city-skills";
  learnedSkillIds?: string[];
  learnedSkills?: LearnedSkill[];
  skillEnabledById?: Record<string, boolean>;
  schedule?: AgentWorkSchedule;
  timedTasks?: AgentTimedTask[];
  configFilePath?: string;
}

export type AgentRunStatus = "queued" | "running" | "waiting_approval" | "waiting_user" | "succeeded" | "failed" | "cancelled";

export interface AgentRun {
  id: string;
  agentId: string;
  status: AgentRunStatus;
  source: "chat" | "manual" | "schedule";
  title: string;
  input: Record<string, unknown>;
  resultText: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
  sessionId?: string | null;
  interactionMode?: "chat" | "manual" | "schedule";
  currentStage?: string;
  route?: Record<string, unknown> | null;
  state?: Record<string, unknown> | null;
  assistantMessageId?: string | null;
  scheduledTaskId?: string | null;
  scheduledFor?: string | null;
}

export type ScheduleType = "once" | "daily" | "weekly" | "monthly";
export type ScheduledTaskStatus = "active" | "paused" | "completed" | "archived";

export interface ScheduledTask {
  id: string;
  agentId: string;
  title: string;
  prompt: string;
  scheduleType: ScheduleType;
  schedule: Record<string, unknown>;
  timezone: string;
  status: ScheduledTaskStatus;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  runCount: number;
  sourceSessionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledTaskDraft {
  title: string;
  prompt: string;
  scheduleType: ScheduleType;
  schedule: Record<string, unknown>;
  timezone: string;
  confidence: number;
  reason: string;
}

export interface AgentRunEvent {
  id: number;
  runId: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AgentApproval {
  id: string;
  runId: string;
  invocationId: string;
  status: string;
  summary: string;
  toolName: string;
  args: Record<string, unknown>;
  risk: "write" | "external" | "destructive";
  workflowSkillId?: string | null;
  workflowNodeId?: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AgentToolInvocation {
  id: string; runId: string; toolCallId: string; toolName: string; args: Record<string, unknown>;
  risk: "read" | "write" | "external" | "destructive"; status: string;
  result: unknown; error: string | null; workflowSkillId: string | null;
  workflowNodeId: string | null; impactSummary: string | null; createdAt: string; completedAt: string | null;
}

export type WorkflowNodeType = "collect_info" | "knowledge_query" | "tool_call" | "decision" | "confirmation" | "response" | "handoff";
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
export interface WorkflowEdge { from: string; to: string; condition: WorkflowCondition; priority: number }
export interface WorkflowSkill {
  id: string; version: string; name: string; description: string; triggerIntents: string[];
  requiredSlots: string[]; startNodeId: string; terminalNodeIds: string[];
  nodes: WorkflowNode[]; edges: WorkflowEdge[];
}
export interface WorkflowValidation { valid: boolean; errors: string[]; warnings: string[] }
export interface WorkflowSkillRecord { skill: WorkflowSkill; status: "draft" | "validated" | "published" | "archived"; updatedAt: string }

export interface AgentMemory {
  id: string;
  userId: string;
  agentId: string;
  kind: "profile" | "preference" | "fact";
  key: string;
  content: string;
  importance: number;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type ChatRole = "user" | "assistant";

export interface ChatAttachment {
  id: string;
  name: string;
  fileName: string;
  mimeType: string;
  size: number;
  kind: "image" | "file";
}

export interface CharacterChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: string;
  runId?: string;
  status?: AgentRunStatus | "waiting_user";
  events?: AgentRunEvent[];
  citations?: Array<Record<string, unknown>>;
  attachments?: ChatAttachment[];
}

export interface CharacterChatSession {
  id: string;
  title: string;
  messages: CharacterChatMessage[];
  createdAt: string;
  updatedAt: string;
  serverSessionId?: string;
  pinned?: boolean;
}

export type SkillRarity = "common" | "rare" | "epic";

export interface SkillGroup {
  id: string;
  name: string;
  createdAt: string;
}

export interface SkillDefinition {
  id: string;
  slug?: string;
  name: string;
  category: string;
  rarity: SkillRarity;
  icon: string;
  summary: string;
  npcPitch: string;
  sourceUrl?: string;
  contentPreview?: string;
  content?: string;
  resolvedUrl?: string;
  commitSha?: string;
  contentHash?: string;
  requestedCapabilities?: string[];
  groupId?: string;
}

export interface CityLayout {
  grid: { cols: number; rows: number };
  buildings: PlacedBuilding[];
  decorations?: PlacedDecoration[];
  npcs?: Record<string, PlacedNpcState>;
  buildingResidents?: Record<string, string>;
  characterConfigs?: Record<string, CharacterRuntimeConfig>;
  customCharacters?: NpcDefinition[];
  characterChats?: Record<string, CharacterChatMessage[]>;
  characterChatSessions?: Record<string, CharacterChatSession[]>;
  activeCharacterChatSessionIds?: Record<string, string>;
  installedSkillIds?: string[];
  installedSkills?: SkillDefinition[];
  skillGroups?: SkillGroup[];
  buildingBookmarks?: Record<string, BookmarkGroup[]>;
  buildingTasks?: Record<string, BuildingTask[]>;
  customAssets?: CustomSceneAsset[];
  placedCustomAssets?: PlacedCustomAsset[];
  mapSurrounding?: MapSurrounding;
  /**
   * Sparse map of "x,y" -> terrain type. Cells not present default to grass.
   * Coordinates are in terrain sub-cell units (see TERRAIN_SUBDIV), not
   * building grid cells - groundResolution marks which coordinate space a
   * saved layout uses so old layouts can be migrated forward.
   */
  ground?: Record<string, TerrainType>;
  groundResolution?: number;
  blockedWalkCells?: Record<string, true>;
  blockedWalkResolution?: number;
  autoRoadCells?: Record<string, true>;
  cityName?: string;
  managementLanguage?: string;
  cityLordName?: string;
  showBuildingStatusIndicators?: boolean;
  showBuildingLabels?: boolean;
  hideBuildingsInBuildMode?: boolean;
  themeMode?: AppThemeMode;
  timeOfDay?: CityTimeOfDay;
  allowNpcOffRoad?: boolean;
  ignoreBuildingCollisionForNpc?: boolean;
  installedThemePacks?: ThemePackDefinition[];
  activeThemePackId?: string | null;
  glanceDashboardUrl?: string;
  deviceIntegrations?: DeviceIntegration[];
  layoutSchemes?: LayoutScheme[];
  activeLayoutSchemeId?: string | null;
}
