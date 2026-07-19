import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buildingTypes, useCityStore } from "../store/cityStore";
import { getAssignedResident } from "../data/npcCatalog";
import { BUILDING_IMAGES } from "../pixelArt/imageAssets";
import { filterAvailableProjectAssets, getAvailableProjectAssets } from "../data/localAssets";
import { categoryColor } from "../utils/categoryColors";
import { getCharacterDisplayName } from "../utils/agentStatus";
import { getBuildingPurpose, isSystemPurpose } from "../utils/buildingPurpose";
import { getCustomBuildingSize } from "../utils/customBuildingSize";
import { apiUrl } from "../services/api";
import { canPlace, getPlacedBuildingSize, TERRAIN_SUBDIV } from "../utils/grid";
import type {
  BuildingPurpose,
  CustomSceneAsset,
  PlacedBuilding,
  PlacedDecoration,
} from "../types";

const PURPOSE_OPTIONS: Array<{ value: BuildingPurpose; label: string; description: string }> = [
  {
    value: "agent-home",
    label: "智能体之家",
    description: "让一个智能体入驻，负责聊天和管理这一块事情。",
  },
  {
    value: "bookmarks",
    label: "书签管理大厅",
    description: "管理分组书签，后续可让智能体读取并帮你查找入口。",
  },
  {
    value: "generic",
    label: "普通建筑",
    description: "仅作为视觉建筑展示，暂时没有特殊自动化功能。",
  },
];

const SYSTEM_PURPOSE_LABELS: Record<BuildingPurpose, string> = {
  "agent-home": "智能体之家",
  bookmarks: "书签管理大厅",
  "city-hall": "城市管理中心",
  "skill-hall": "技能大厅",
  "todo-hall": "待办大厅",
  "server-manager": "服务器管理大厅",
  "theme-hall": "主题大厅",
  generic: "普通建筑",
};

const BUILDING_TYPE_LABELS: Record<string, string> = {
  "city-hall": "城市大厅",
  "agent-home": "智能体之家",
  "task-hall": "待办大厅",
  "skill-market": "技能大厅",
  archive: "档案馆",
  "data-center": "数据中心",
  "server-room": "服务器机房",
  "theme-hall": "主题大厅",
  "custom-link": "自定义建筑",
};

const CATEGORY_LABELS: Record<string, string> = {
  core: "核心",
  agents: "智能体",
  work: "工作",
  knowledge: "知识",
  ops: "运维",
  custom: "自定义",
};

const APPEARANCE_GROUP_LABELS: Record<string, string> = {
  "megalithic-single-pack": "巨石村庄",
  "changan-pack": "长安街",
  "sky-observatory-pack": "天空观星台",
  cyberpunk: "赛博朋克",
};

interface AppearanceOption {
  id: string;
  groupId: string;
  groupLabel: string;
  name: string;
  imageUrl: string;
  size?: [number, number];
  customAssetId?: string;
  customImageUrl?: string;
}

function PanelShell({ children }: { children: ReactNode }) {
  return createPortal(
    <aside data-ui-surface="sidebar" style={panelStyle} onMouseDown={(event) => event.stopPropagation()}>
      {children}
    </aside>,
    document.body
  );
}

function titleFromSlug(value: string): string {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getAssetGroup(asset: CustomSceneAsset): { id: string; label: string } {
  if (asset.source === "upload" || asset.url.startsWith("data:")) {
    return { id: "uploads", label: "上传素材" };
  }
  const match = asset.url.match(/^\/buildings\/([^/]+)\//);
  const id = match?.[1] ?? "project";
  return { id, label: APPEARANCE_GROUP_LABELS[id] ?? titleFromSlug(id) };
}

function isLegacyRootBuildingAsset(asset: CustomSceneAsset): boolean {
  return (
    asset.source === "project" &&
    /^\/buildings\/[^/]+\.(?:png|webp)$/i.test(asset.url)
  );
}

function createAppearanceOptions(customAssets: CustomSceneAsset[]): AppearanceOption[] {
  const builtInUrls = new Set(Object.values(BUILDING_IMAGES));
  const defaultOptions = Object.values(buildingTypes).map((bt): AppearanceOption => ({
    id: `default-${bt.type}`,
    groupId: "megalithic-single-pack",
    groupLabel: APPEARANCE_GROUP_LABELS["megalithic-single-pack"],
    name: BUILDING_TYPE_LABELS[bt.type] ?? bt.name,
    imageUrl: BUILDING_IMAGES[bt.type],
    size: bt.size,
    customAssetId: undefined,
    customImageUrl: BUILDING_IMAGES[bt.type],
  }));

  const projectOptions = customAssets
    .filter(
      (asset) =>
        asset.kind === "building" &&
        !builtInUrls.has(asset.url) &&
        !isLegacyRootBuildingAsset(asset)
    )
    .map((asset): AppearanceOption => {
      const group = getAssetGroup(asset);
      return {
        id: asset.id,
        groupId: group.id,
        groupLabel: group.label,
        name: asset.name,
        imageUrl: asset.url,
        size: getCustomBuildingSize(asset.url),
        customAssetId: asset.id,
        customImageUrl: asset.url,
      };
    });

  return [...defaultOptions, ...projectOptions];
}

function decorationOverlapsArea(
  decoration: PlacedDecoration,
  x: number,
  y: number,
  size: [number, number]
): boolean {
  const areaX = x * TERRAIN_SUBDIV;
  const areaY = y * TERRAIN_SUBDIV;
  return (
    decoration.x >= areaX &&
    decoration.x < areaX + size[0] * TERRAIN_SUBDIV &&
    decoration.y >= areaY &&
    decoration.y < areaY + size[1] * TERRAIN_SUBDIV
  );
}

export function BuildingConfigPanel() {
  const selectedId = useCityStore((s) => s.selectedId);
  const buildings = useCityStore((s) => s.buildings);
  const updateBuilding = useCityStore((s) => s.updateBuilding);
  const removeBuilding = useCityStore((s) => s.removeBuilding);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const buildMode = useCityStore((s) => s.buildMode);
  const openSkillHall = useCityStore((s) => s.openSkillHall);
  const openCityHall = useCityStore((s) => s.openCityHall);
  const openTodoHall = useCityStore((s) => s.openTodoHall);
  const npcs = useCityStore((s) => s.npcs);
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const openCharacterLibrary = useCityStore((s) => s.openCharacterLibrary);
  const openCharacterConfig = useCityStore((s) => s.openCharacterConfig);
  const openCharacterChat = useCityStore((s) => s.openCharacterChat);
  const sendNpcWalking = useCityStore((s) => s.sendNpcWalking);
  const returnNpcHome = useCityStore((s) => s.returnNpcHome);
  const openBookmarkManager = useCityStore((s) => s.openBookmarkManager);
  const openServerDashboard = useCityStore((s) => s.openServerDashboard);
  const buildingBookmarks = useCityStore((s) => s.buildingBookmarks);
  const customAssets = useCityStore((s) => s.customAssets);
  const installedThemePacks = useCityStore((s) => s.installedThemePacks);
  const grid = useCityStore((s) => s.grid);
  const decorations = useCityStore((s) => s.decorations);
  const upsertCustomAssets = useCityStore((s) => s.upsertCustomAssets);
  const showLaunchToast = useCityStore((s) => s.showLaunchToast);

  const building = buildings.find((b) => b.id === selectedId) ?? null;
  const bt = building ? buildingTypes[building.type] : null;
  const imageSrc = building ? building.customImageUrl ?? BUILDING_IMAGES[building.type] : null;
  const resident = building ? getAssignedResident(building, buildingResidents, customCharacters) : null;
  const residentConfig = resident ? characterConfigs[resident.id] : undefined;
  const npcState = building ? npcs[building.id] : null;
  const purpose = building ? getBuildingPurpose(building) : "generic";
  const bookmarkCount = building
    ? (buildingBookmarks[building.id] ?? []).reduce((count, group) => count + group.bookmarks.length, 0)
    : 0;

  const [name, setName] = useState("");
  const [purposeDraft, setPurposeDraft] = useState<BuildingPurpose>("generic");
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  useEffect(() => {
    setName(building?.name ?? "");
    setPurposeDraft(building ? getBuildingPurpose(building) : "generic");
  }, [building?.id, building?.purpose]);

  useEffect(() => {
    if (!building) return;
    upsertCustomAssets(getAvailableProjectAssets(installedThemePacks));
    let cancelled = false;
    fetch(apiUrl("/api/assets"))
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (cancelled || !Array.isArray(data?.assets)) return;
        upsertCustomAssets(filterAvailableProjectAssets(data.assets as CustomSceneAsset[], installedThemePacks));
      })
      .catch(() => {
        if (!cancelled) showLaunchToast("项目素材扫描失败，请确认后端服务正在运行。");
      });
    return () => {
      cancelled = true;
    };
  }, [building?.id, installedThemePacks, showLaunchToast, upsertCustomAssets]);

  if (!building || !bt) {
    return (
      <PanelShell>
        <div style={{ fontSize: 12, color: "var(--ac-muted)" }}>
          点击建筑可以查看 Agent、让 Agent 外出散步，并管理建筑。
        </div>
      </PanelShell>
    );
  }

  const accent = categoryColor(bt.category);
  const buildingMessage =
    purpose === "bookmarks"
      ? "这里是书签管理大厅。你可以设置分组书签，让 Agent 帮你查找、整理和解释这些入口。"
      : purpose === "city-hall"
      ? "这里是城市管理中心。这里负责市政大厅 Agent 和城市管理事务；全局设置与 API Key 在右下角齿轮里。"
      : purpose === "todo-hall"
      ? "这里是待办大厅。你可以按 Inbox、待办、进行中和完成来管理城市任务。"
      : purpose === "server-manager"
      ? "这里是服务器管理大厅。后续可以接入环境、内存、进程和服务仪表盘。"
      : purpose === "skill-hall"
      ? "这里是技能大厅。你可以安装城市技能，让不同建筑获得新的能力。"
      : "这里是城市建筑。你可以设置它的用途、外观，以及这个建筑负责的事情。";
  const appearanceOptions = createAppearanceOptions(filterAvailableProjectAssets(customAssets, installedThemePacks));
  const canCollectBuilding = buildMode;
  function handleSave() {
    updateBuilding(building!.id, {
      name,
      purpose: isSystemPurpose(purpose) ? purpose : purposeDraft,
    });
  }

  function canApplyAppearance(option: AppearanceOption): boolean {
    const size = option.size ?? getPlacedBuildingSize(building!, buildingTypes);
    return (
      canPlace(building!.x, building!.y, size, grid, buildings, buildingTypes, building!.id) &&
      !decorations.some((decoration) => decorationOverlapsArea(decoration, building!.x, building!.y, size))
    );
  }

  function applyAppearance(option: AppearanceOption) {
    if (!canApplyAppearance(option)) {
      showLaunchToast("当前位置空间不足，无法切换成这个建筑外观。");
      return;
    }
    updateBuilding(building!.id, {
      customAssetId: option.customAssetId,
      customImageUrl: option.customImageUrl,
      size: option.size,
    });
    setAppearanceOpen(false);
  }

  return (
    <PanelShell>
      <div style={panelHeaderStyle}>
        <div
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
            background: `${accent}22`,
            borderRadius: 8,
            padding: 4,
            boxSizing: "border-box",
            overflow: "hidden",
          }}
        >
          {imageSrc && (
            <img
              src={imageSrc}
              alt={bt.name}
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition: "center bottom",
              }}
            />
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <strong style={{ color: "var(--ac-text)", fontSize: 14 }}>
            {bt.icon} {BUILDING_TYPE_LABELS[building.type] ?? bt.name}
          </strong>
          <div>
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                color: "var(--ac-text-soft)",
                background: "var(--ac-surface)",
                border: "1px solid var(--ac-border)",
                padding: "2px 6px",
                borderRadius: 999,
              }}
            >
              {CATEGORY_LABELS[bt.category] ?? bt.category}
            </span>
          </div>
        </div>
        <button style={closeBtnStyle} onClick={() => selectBuilding(null)}>
          ×
        </button>
      </div>

      <BuildingInfoCard
        title={SYSTEM_PURPOSE_LABELS[purpose]}
        message={buildingMessage}
      />

      {resident ? (
        <>
          {purpose !== "bookmarks" && (
            <ResidentCard
              name={getCharacterDisplayName(resident, residentConfig)}
              role={resident.role}
              spriteUrl={resident.spriteUrl}
              accent={resident.accent}
              line={
                npcState?.line ??
                (npcState?.presence === "walking" ? resident.walkingLine : resident.homeLine)
              }
              walking={npcState?.presence === "walking"}
              onWalk={() => sendNpcWalking(building.id)}
              onReturn={() => returnNpcHome(building.id)}
              onChange={() => openCharacterLibrary(building.id)}
              onConfigure={() => openCharacterConfig(resident.id)}
              onChat={() => openCharacterChat(resident.id)}
            />
          )}
        </>
      ) : (
        <section style={emptyResidentStyle}>
          <div style={{ fontSize: 12, color: "var(--ac-text-soft)", fontWeight: 900 }}>还没有设置 Agent</div>
          <p style={{ margin: "6px 0 9px", color: "var(--ac-muted)", fontSize: 11, lineHeight: 1.4 }}>
            选择一个角色来管理这个建筑，并配置它的 AI Brain。
          </p>
          <button style={secondaryBtnStyle} onClick={() => openCharacterLibrary(building.id)}>
            设置 Agent
          </button>
        </section>
      )}

      {purpose === "bookmarks" && (
        <section style={bookmarkCardStyle}>
          <div style={{ fontSize: 12, color: "var(--ac-text)", fontWeight: 900 }}>书签大厅</div>
          <p style={{ margin: "6px 0 9px", color: "var(--ac-muted)", fontSize: 11, lineHeight: 1.4 }}>
            {bookmarkCount
              ? `这里已保存 ${bookmarkCount} 个书签。`
              : "还没有书签。添加分组、网址和备注后，Agent 之后就能读取和检索。"}
          </p>
          <button style={secondaryBtnStyle} onClick={() => openBookmarkManager(building.id)}>
            管理书签
          </button>
        </section>
      )}

      {(purpose === "skill-hall" || purpose === "city-hall" || purpose === "todo-hall" || purpose === "server-manager") && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {purpose === "skill-hall" && (
            <button style={secondaryBtnStyle} onClick={openSkillHall}>
              打开技能大厅
            </button>
          )}
          {purpose === "city-hall" && (
            <button style={secondaryBtnStyle} onClick={openCityHall}>
              打开市政大厅
            </button>
          )}
          {purpose === "todo-hall" && (
            <button style={secondaryBtnStyle} onClick={openTodoHall}>
              打开待办大厅
            </button>
          )}
          {purpose === "server-manager" && (
            <button style={secondaryBtnStyle} onClick={openServerDashboard}>
              打开服务器仪表盘
            </button>
          )}
        </div>
      )}

      <label style={labelStyle}>建筑名称</label>
      <input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} />

      <label style={labelStyle}>建筑属性</label>
      {isSystemPurpose(purpose) ? (
        <div style={readonlyFieldStyle}>{SYSTEM_PURPOSE_LABELS[purpose]}</div>
      ) : (
        <select
          style={inputStyle}
          value={purposeDraft}
          onChange={(e) => setPurposeDraft(e.target.value as BuildingPurpose)}
        >
          {PURPOSE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
      {!isSystemPurpose(purposeDraft) && (
        <p style={{ fontSize: 10, color: "var(--ac-muted)", margin: "5px 0 0", lineHeight: 1.35 }}>
          {PURPOSE_OPTIONS.find((option) => option.value === purposeDraft)?.description}
        </p>
      )}

      <label style={labelStyle}>建筑外观</label>
      <button style={appearanceButtonStyle} onClick={() => setAppearanceOpen(true)}>
        <img src={imageSrc ?? ""} alt="" draggable={false} style={appearanceButtonImageStyle} />
        <span style={{ minWidth: 0, flex: 1 }}>
          <span style={{ display: "block", color: "var(--ac-text)", fontSize: 12, fontWeight: 900 }}>
            更换建筑外观
          </span>
          <span style={{ display: "block", color: "var(--ac-muted)", fontSize: 10 }}>
            当前 {building.size?.join("×") ?? bt.size.join("×")} · 打开素材库
          </span>
        </span>
      </button>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={primaryBtnStyle} onClick={handleSave}>
          保存
        </button>
        {canCollectBuilding && (
          <button style={dangerBtnStyle} onClick={() => removeBuilding(building!.id)}>
            收回侧边栏
          </button>
        )}
      </div>

      {appearanceOpen && (
        <AppearancePickerModal
          building={building}
          options={appearanceOptions}
          canApply={canApplyAppearance}
          onApply={applyAppearance}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
    </PanelShell>
  );
}

function AppearancePickerModal({
  building,
  options,
  canApply,
  onApply,
  onClose,
}: {
  building: PlacedBuilding;
  options: AppearanceOption[];
  canApply: (option: AppearanceOption) => boolean;
  onApply: (option: AppearanceOption) => void;
  onClose: () => void;
}) {
  const groups = options.reduce<Array<{ id: string; label: string; options: AppearanceOption[] }>>(
    (acc, option) => {
      let group = acc.find((item) => item.id === option.groupId);
      if (!group) {
        group = { id: option.groupId, label: option.groupLabel, options: [] };
        acc.push(group);
      }
      group.options.push(option);
      return acc;
    },
    []
  );
  const initialGroup =
    groups.find((group) => group.options.some((option) => option.customAssetId === building.customAssetId)) ??
    groups.find((group) => group.options.some((option) => !building.customAssetId && option.id === `default-${building.type}`)) ??
    groups[0];
  const [activeGroupId, setActiveGroupId] = useState(initialGroup?.id ?? "megalithic-single-pack");
  const [selectedId, setSelectedId] = useState(() => {
    if (building.customAssetId) return building.customAssetId;
    return `default-${building.type}`;
  });
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  const selected = options.find((option) => option.id === selectedId) ?? activeGroup?.options[0];
  const selectedCanApply = selected ? canApply(selected) : false;

  if (!activeGroup || !selected) return null;

  return createPortal(
    <div style={modalBackdropStyle} onMouseDown={onClose}>
      <section data-ui-surface="panel" style={appearanceModalStyle} onMouseDown={(event) => event.stopPropagation()}>
        <div style={appearanceModalHeaderStyle}>
          <div>
            <div style={appearanceModalEyebrowStyle}>BUILDING SKINS</div>
            <h2 style={appearanceModalTitleStyle}>更换建筑外观</h2>
          </div>
          <button style={modalCloseBtnStyle} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={appearanceTabsStyle}>
          {groups.map((group) => (
            <button
              key={group.id}
              style={{
                ...appearanceTabStyle,
                ...(group.id === activeGroupId ? appearanceTabActiveStyle : {}),
              }}
              onClick={() => {
                setActiveGroupId(group.id);
                setSelectedId(group.options[0]?.id ?? selectedId);
              }}
            >
              {group.label}
              <span style={appearanceTabCountStyle}>{group.options.length}</span>
            </button>
          ))}
        </div>

        <div style={appearanceGridStyle}>
          {activeGroup.options.map((option) => {
            const active = option.id === selectedId;
            const available = canApply(option);
            const size = option.size ?? getPlacedBuildingSize(building, buildingTypes);
            return (
              <button
                key={option.id}
                style={{
                  ...appearanceCardStyle,
                  borderColor: active ? "var(--ac-kicker)" : "rgba(96,165,250,0.24)",
                  boxShadow: active ? "0 0 0 2px rgba(255,226,138,0.28)" : "none",
                  opacity: available ? 1 : 0.56,
                }}
                onClick={() => setSelectedId(option.id)}
              >
                <div style={appearanceCardImageWrapStyle}>
                  <img src={option.imageUrl} alt={option.name} draggable={false} style={appearanceCardImageStyle} />
                </div>
                <div style={appearanceCardNameStyle}>{option.name}</div>
                <div style={appearanceCardMetaStyle}>
                  {size[0]}×{size[1]} {available ? "可应用" : "空间不足"}
                </div>
              </button>
            );
          })}
        </div>

        <div style={appearanceFooterStyle}>
          <div style={appearancePreviewStyle}>
            <img src={selected.imageUrl} alt={selected.name} draggable={false} style={appearancePreviewImageStyle} />
            <div>
              <div style={{ color: "var(--ac-text)", fontSize: 13, fontWeight: 950 }}>{selected.name}</div>
              <div style={{ color: "var(--ac-muted)", fontSize: 11 }}>
                {selected.groupLabel} · {(selected.size ?? getPlacedBuildingSize(building, buildingTypes)).join("×")}
              </div>
            </div>
          </div>
          <button
            style={{
              ...primaryBtnStyle,
              opacity: selectedCanApply ? 1 : 0.5,
              cursor: selectedCanApply ? "pointer" : "not-allowed",
            }}
            disabled={!selectedCanApply}
            onClick={() => onApply(selected)}
          >
            应用外观
          </button>
        </div>
      </section>
    </div>,
    document.body
  );
}

function BuildingInfoCard({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <section style={{ ...buildingInfoStyle, borderColor: "var(--ac-border)", background: "var(--ac-surface)" }}>
      <div style={{ ...buildingInfoTitleStyle, color: "var(--ac-text)" }}>{title}</div>
      <p style={buildingInfoTextStyle}>{message}</p>
    </section>
  );
}

function ResidentCard({
  name,
  role,
  spriteUrl,
  accent,
  line,
  walking,
  onWalk,
  onReturn,
  onChange,
  onConfigure,
  onChat,
}: {
  name: string;
  role: string;
  spriteUrl: string;
  accent: string;
  line: string;
  walking: boolean;
  onWalk: () => void;
  onReturn: () => void;
  onChange: () => void;
  onConfigure: () => void;
  onChat: () => void;
}) {
  return (
    <section
      style={{
        borderRadius: 14,
        border: "1px solid var(--ac-border)",
        background: "var(--ac-field)",
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ ...residentAvatarStyle, background: `${accent}33`, borderColor: `${accent}88` }}>
          <img
            src={spriteUrl}
            alt={name}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition: "center bottom",
              imageRendering: "pixelated",
            }}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 900, color: "var(--ac-text)" }}>{name}</div>
          <div style={{ fontSize: 10, color: "var(--ac-muted)", marginTop: 2 }}>{role}</div>
        </div>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9,
            fontWeight: 900,
            color: walking ? "var(--ac-contrast-text)" : "#166534",
            background: walking ? "var(--ac-contrast-bg)" : "rgba(34,197,94,.12)",
            border: walking ? "1px solid var(--ac-contrast-bg)" : "1px solid rgba(34,197,94,.22)",
            borderRadius: 999,
            padding: "4px 8px",
          }}
        >
          {walking ? "散步中" : "在家"}
        </span>
      </div>
      <p style={{ margin: "9px 0", color: "var(--ac-text-soft)", fontSize: 11, lineHeight: 1.45 }}>{line}</p>
      <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
        <button style={primarySmallBtnStyle} onClick={onChat}>
          对话
        </button>
        <button style={walking ? warningBtnStyle : secondaryBtnStyle} onClick={walking ? onReturn : onWalk}>
          {walking ? "回家" : "出去转转"}
        </button>
        <button style={secondaryBtnStyle} onClick={onChange}>
          更换角色
        </button>
        <button style={secondaryBtnStyle} onClick={onConfigure}>
          AI Brain
        </button>
      </div>
    </section>
  );
}

const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: "max(12px, env(safe-area-inset-top))",
  right: "max(12px, env(safe-area-inset-right))",
  bottom: "max(12px, env(safe-area-inset-bottom))",
  zIndex: 150000,
  width: "min(392px, calc(100dvw - 24px))",
  maxWidth: "calc(100dvw - 24px)",
  padding: 18,
  boxSizing: "border-box",
  background: "var(--ac-panel)",
  border: "1px solid var(--ac-border)",
  borderRadius: 20,
  overflowY: "auto",
  overflowX: "hidden",
  overscrollBehavior: "contain",
  pointerEvents: "auto",
  boxShadow: "var(--ac-shadow)",
  backdropFilter: "blur(28px) saturate(1.18)",
};

const panelHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 11,
  margin: "-2px -2px 4px",
  paddingBottom: 13,
  borderBottom: "1px solid var(--ac-border)",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  color: "var(--ac-muted)",
  marginTop: 8,
  marginBottom: 4,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  fontSize: 13,
  boxSizing: "border-box",
};

const appearanceButtonStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: 10,
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  cursor: "pointer",
  textAlign: "left",
};

const appearanceButtonImageStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  objectFit: "contain",
  objectPosition: "center bottom",
  borderRadius: 7,
  background: "var(--ac-glass)",
  flexShrink: 0,
};

const modalBackdropStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 200000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 28,
  background: "var(--ac-backdrop)",
  backdropFilter: "blur(3px)",
};

const appearanceModalStyle: React.CSSProperties = {
  width: "min(980px, 92vw)",
  maxHeight: "86vh",
  display: "flex",
  flexDirection: "column",
  borderRadius: 18,
  border: "1px solid var(--ac-border)",
  background: "linear-gradient(180deg, var(--ac-control) 0%, var(--ac-glass) 100%)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.56)",
  overflow: "hidden",
};

const appearanceModalHeaderStyle: React.CSSProperties = {
  minHeight: 86,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "20px 26px 18px",
  borderBottom: "1px solid var(--ac-border)",
  color: "var(--ac-text)",
};

const appearanceModalEyebrowStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  letterSpacing: 2,
  color: "var(--ac-kicker)",
};

const appearanceModalTitleStyle: React.CSSProperties = {
  margin: "3px 0 0",
  fontSize: 28,
  lineHeight: 1.08,
  fontWeight: 950,
  color: "var(--ac-text)",
};

const modalCloseBtnStyle: React.CSSProperties = {
  width: 46,
  height: 46,
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-text)",
  fontSize: 32,
  lineHeight: "38px",
  fontWeight: 950,
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255,255,255,.08)",
};

const appearanceTabsStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  padding: "14px 18px 12px",
  overflowX: "auto",
  background: "var(--ac-surface)",
};

const appearanceTabStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  padding: "9px 14px",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-text-soft)",
  cursor: "pointer",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const appearanceTabActiveStyle: React.CSSProperties = {
  background: "rgba(37,99,235,.46)",
  borderColor: "rgba(147,197,253,.72)",
  color: "var(--ac-text)",
  boxShadow: "0 0 0 2px rgba(96,165,250,.18)",
};

const appearanceTabCountStyle: React.CSSProperties = {
  minWidth: 20,
  padding: "1px 6px",
  borderRadius: 999,
  background: "var(--ac-glass)",
  fontSize: 11,
};

const appearanceGridStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
  gap: 14,
  padding: 16,
  background: "var(--ac-surface)",
};

const appearanceCardStyle: React.CSSProperties = {
  minHeight: 166,
  borderRadius: 14,
  border: "1px solid rgba(96,165,250,0.24)",
  background: "linear-gradient(180deg, var(--ac-control) 0%, var(--ac-glass) 100%)",
  padding: 9,
  cursor: "pointer",
  color: "var(--ac-text)",
  textAlign: "left",
};

const appearanceCardImageWrapStyle: React.CSSProperties = {
  height: 100,
  borderRadius: 11,
  background: "radial-gradient(circle at 50% 20%, rgba(255,255,255,0.35), rgba(255,255,255,0.06) 52%, var(--ac-glass))",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  marginBottom: 8,
  border: "1px solid var(--ac-border)",
};

const appearanceCardImageStyle: React.CSSProperties = {
  width: "92%",
  height: "92%",
  objectFit: "contain",
  objectPosition: "center bottom",
  filter: "drop-shadow(0 8px 6px rgba(0,0,0,0.32))",
};

const appearanceCardNameStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  color: "var(--ac-text)",
  textShadow: "none",
};

const appearanceCardMetaStyle: React.CSSProperties = {
  marginTop: 5,
  padding: "4px 7px",
  borderRadius: 8,
  background: "rgba(96,165,250,0.14)",
  fontSize: 10,
  fontWeight: 900,
  color: "var(--ac-accent-text)",
};

const appearanceFooterStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 14,
  borderTop: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
};

const appearancePreviewStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  minWidth: 0,
};

const appearancePreviewImageStyle: React.CSSProperties = {
  width: 54,
  height: 54,
  objectFit: "contain",
  objectPosition: "center bottom",
  borderRadius: 10,
  background: "var(--ac-glass)",
};

const readonlyFieldStyle: React.CSSProperties = {
  width: "100%",
  minHeight: 32,
  padding: "7px 8px",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  color: "var(--ac-accent-text)",
  fontSize: 12,
  fontWeight: 900,
  boxSizing: "border-box",
};

const primaryBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  background: "#5b7fd6",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: 9,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 800,
};

const primarySmallBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  border: "none",
  background: "#60a5fa",
  color: "var(--ac-field)",
};

const warningBtnStyle: React.CSSProperties = {
  ...secondaryBtnStyle,
  border: "1px solid rgba(217,119,6,.35)",
  background: "#f59e0b",
  color: "#ffffff",
};

const dangerBtnStyle: React.CSSProperties = {
  padding: "6px 14px",
  borderRadius: 6,
  border: "none",
  background: "#c05656",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const closeBtnStyle: React.CSSProperties = {
  marginLeft: "auto",
  background: "transparent",
  border: "none",
  color: "var(--ac-muted)",
  fontSize: 18,
  cursor: "pointer",
  alignSelf: "flex-start",
};

const residentAvatarStyle: React.CSSProperties = {
  width: 38,
  height: 42,
  borderRadius: 6,
  border: "1px solid",
  position: "relative",
  flexShrink: 0,
  imageRendering: "pixelated",
};

const emptyResidentStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px dashed var(--ac-border)",
  background: "var(--ac-surface)",
  padding: 10,
  marginBottom: 12,
};

const buildingInfoStyle: React.CSSProperties = {
  borderRadius: 13,
  border: "1px solid",
  padding: 12,
  margin: "12px 0",
};

const buildingInfoTitleStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  marginBottom: 6,
};

const buildingInfoTextStyle: React.CSSProperties = {
  margin: 0,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  lineHeight: 1.5,
};

const bookmarkCardStyle: React.CSSProperties = {
  borderRadius: 12,
  border: "1px solid rgba(250,204,21,0.24)",
  background: "var(--ac-surface)",
  padding: 12,
  marginBottom: 12,
};
