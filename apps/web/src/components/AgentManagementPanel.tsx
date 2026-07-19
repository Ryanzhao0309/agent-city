import { useEffect, useMemo, useState } from "react";
import { CHARACTER_LIBRARY, getAllCharacters } from "../data/npcCatalog";
import { useCityStore } from "../store/cityStore";
import type { AgentRunStatus, NpcDefinition } from "../types";
import { getCharacterDisplayName } from "../utils/agentStatus";

type CreateMode = "preset" | "blank";

const runStatusLabel: Partial<Record<AgentRunStatus, string>> = {
  queued: "排队中",
  running: "执行中",
  waiting_approval: "等待审批",
  waiting_user: "等待回复",
  succeeded: "刚刚完成",
  failed: "执行失败",
  cancelled: "已取消",
};

export function AgentManagementPanel({ onLeaveCityHall }: { onLeaveCityHall: () => void }) {
  const buildings = useCityStore((state) => state.buildings);
  const buildingResidents = useCityStore((state) => state.buildingResidents);
  const customCharacters = useCityStore((state) => state.customCharacters);
  const characterConfigs = useCityStore((state) => state.characterConfigs);
  const npcs = useCityStore((state) => state.npcs);
  const assignResident = useCityStore((state) => state.assignResident);
  const createCharacter = useCityStore((state) => state.createCharacter);
  const openCharacterConfig = useCityStore((state) => state.openCharacterConfig);
  const openCharacterChat = useCityStore((state) => state.openCharacterChat);
  const [selectedId, setSelectedId] = useState("mayor");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const activeCharacters = useMemo(() => {
    const activeIds = new Set(["mayor", ...Object.values(buildingResidents), ...customCharacters.map((item) => item.id)]);
    return getAllCharacters(customCharacters).filter((character) => activeIds.has(character.id));
  }, [buildingResidents, customCharacters]);

  const visibleCharacters = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return activeCharacters;
    return activeCharacters.filter((character) => {
      const config = characterConfigs[character.id];
      return [getCharacterDisplayName(character, config), character.role, character.homeLine]
        .some((value) => value.toLowerCase().includes(normalized));
    });
  }, [activeCharacters, characterConfigs, query]);

  useEffect(() => {
    if (!activeCharacters.some((item) => item.id === selectedId)) {
      setSelectedId(activeCharacters[0]?.id ?? "mayor");
    }
  }, [activeCharacters, selectedId]);

  const selected = activeCharacters.find((character) => character.id === selectedId) ?? activeCharacters[0] ?? null;
  const assignment = selected
    ? Object.entries(buildingResidents).find(([, characterId]) => characterId === selected.id)
    : undefined;
  const assignedBuilding = assignment ? buildings.find((building) => building.id === assignment[0]) ?? null : null;
  const selectedConfig = selected ? characterConfigs[selected.id] : undefined;
  const selectedNpc = assignment ? npcs[assignment[0]] : undefined;
  const configuredCount = activeCharacters.filter((character) => characterConfigs[character.id]?.brain.enabled).length;
  const workingCount = activeCharacters.filter((character) => {
    const buildingId = Object.entries(buildingResidents).find(([, id]) => id === character.id)?.[0];
    const status = buildingId ? npcs[buildingId]?.runtimeStatus : undefined;
    return status === "running" || status === "queued";
  }).length;

  function leaveAnd(action: () => void) {
    onLeaveCityHall();
    window.setTimeout(action, 0);
  }

  function changeBuilding(nextBuildingId: string) {
    if (!selected) return;
    if (assignment?.[0] && assignment[0] !== nextBuildingId) assignResident(assignment[0], null);
    if (nextBuildingId) assignResident(nextBuildingId, selected.id);
  }

  return (
    <section className="agent-management" aria-label="Agent 管理">
      <div className="agent-management__toolbar">
        <div className="agent-stat-row">
          <Stat value={activeCharacters.length} label="全部 Agent" />
          <Stat value={configuredCount} label="已连接大脑" />
          <Stat value={workingCount} label="正在工作" />
          <Stat value={Math.max(0, buildings.length - Object.keys(buildingResidents).length)} label="空闲建筑" />
        </div>
        <button className="agent-primary-button" onClick={() => setCreateOpen(true)}>新建 Agent</button>
      </div>

      <div className="agent-management__body">
        <aside className="agent-roster">
          <div className="agent-roster__heading">
            <div>
              <strong>城市 Agent</strong>
              <span>{activeCharacters.length} 位成员</span>
            </div>
            <input
              aria-label="搜索 Agent"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索名称、职责"
            />
          </div>
          <div className="agent-roster__list">
            {visibleCharacters.map((character) => {
              const config = characterConfigs[character.id];
              const buildingEntry = Object.entries(buildingResidents).find(([, id]) => id === character.id);
              const building = buildingEntry ? buildings.find((item) => item.id === buildingEntry[0]) : null;
              const npc = buildingEntry ? npcs[buildingEntry[0]] : undefined;
              const status = getAgentActivity(config?.brain.enabled ?? false, npc?.runtimeStatus, npc?.presence);
              return (
                <button
                  key={character.id}
                  className={`agent-roster-card${selected?.id === character.id ? " is-selected" : ""}`}
                  onClick={() => setSelectedId(character.id)}
                >
                  <AgentPortrait character={character} />
                  <span className="agent-roster-card__copy">
                    <strong>{getCharacterDisplayName(character, config)}</strong>
                    <small>{character.role}</small>
                    <span>{building?.name ?? "尚未入驻建筑"}</span>
                  </span>
                  <span className={`agent-status-dot is-${status.tone}`} title={status.label} />
                </button>
              );
            })}
            {!visibleCharacters.length && <div className="agent-empty-search">没有找到匹配的 Agent</div>}
          </div>
        </aside>

        {selected && (
          <main className="agent-detail">
            <header className="agent-detail__hero">
              <AgentPortrait character={selected} large />
              <div className="agent-detail__identity">
                <div className="agent-detail__name-row">
                  <div>
                    <span className="agent-detail__kicker">{selected.custom ? "自定义 Agent" : selected.id === "mayor" ? "初始 Agent" : "预设 Agent"}</span>
                    <h3>{getCharacterDisplayName(selected, selectedConfig)}</h3>
                  </div>
                  <StatusBadge
                    brainEnabled={selectedConfig?.brain.enabled ?? false}
                    runtimeStatus={selectedNpc?.runtimeStatus}
                    presence={selectedNpc?.presence}
                  />
                </div>
                <p>{selected.homeLine}</p>
                <div className="agent-detail__actions">
                  <button className="agent-primary-button" onClick={() => leaveAnd(() => openCharacterChat(selected.id))}>开始对话</button>
                  <button className="agent-secondary-button" onClick={() => leaveAnd(() => openCharacterConfig(selected.id))}>配置 Agent</button>
                </div>
              </div>
            </header>

            <div className="agent-detail__grid">
              <section className="agent-info-card">
                <span className="agent-info-card__label">所在建筑</span>
                <strong>{assignedBuilding?.name ?? "尚未分配"}</strong>
                <select value={assignedBuilding?.id ?? ""} onChange={(event) => changeBuilding(event.target.value)}>
                  <option value="">不分配建筑</option>
                  {buildings.map((building) => {
                    const occupantId = buildingResidents[building.id];
                    const occupant = occupantId && occupantId !== selected.id
                      ? getAllCharacters(customCharacters).find((item) => item.id === occupantId)
                      : null;
                    return (
                      <option key={building.id} value={building.id}>
                        {building.name}{occupant ? ` · 当前 ${getCharacterDisplayName(occupant, characterConfigs[occupant.id])}` : ""}
                      </option>
                    );
                  })}
                </select>
              </section>

              <section className="agent-info-card">
                <span className="agent-info-card__label">当前在做</span>
                <strong>{getCurrentWork(selected, selectedConfig?.brain.enabled ?? false, selectedNpc?.runtimeStatus, selectedNpc?.line)}</strong>
                <span>{selectedConfig?.schedule?.enabled ? `${selectedConfig.schedule.startTime}–${selectedConfig.schedule.endTime} · ${selectedConfig.schedule.timezone}` : "未启用工作日程"}</span>
              </section>

              <section className="agent-info-card">
                <span className="agent-info-card__label">AI Brain</span>
                <strong>{selectedConfig?.brain.enabled ? selectedConfig.brain.modelProfileId ? "已绑定全局模型" : "已启用，待选择模型" : "未连接"}</strong>
                <span>{selectedConfig?.brain.enabled ? "模型库统一管理" : "配置后可执行真实任务"}</span>
              </section>

              <section className="agent-info-card">
                <span className="agent-info-card__label">职责与能力</span>
                <strong>{selected.role}</strong>
                <span>{selectedConfig?.learnedSkills?.length ?? 0} 个已学习技能</span>
              </section>
            </div>

            <section className="agent-profile-card">
              <div>
                <span className="agent-info-card__label">Agent 简介</span>
                <strong>关于 {getCharacterDisplayName(selected, selectedConfig)}</strong>
              </div>
              <p>{selectedConfig?.files.identity || `${selected.name} 是城市中的${selected.role}。`}</p>
            </section>
          </main>
        )}
      </div>

      {createOpen && (
        <CreateAgentDialog
          buildings={buildings}
          buildingResidents={buildingResidents}
          onClose={() => setCreateOpen(false)}
          onCreate={(input) => {
            const id = createCharacter(input);
            if (input.buildingId) assignResident(input.buildingId, id);
            setSelectedId(id);
            setCreateOpen(false);
          }}
        />
      )}
    </section>
  );
}

function CreateAgentDialog({
  buildings,
  buildingResidents,
  onClose,
  onCreate,
}: {
  buildings: ReturnType<typeof useCityStore.getState>["buildings"];
  buildingResidents: Record<string, string>;
  onClose: () => void;
  onCreate: (input: { name: string; role: string; personality: string; templateCharacterId: string; defaultBuildingType: string; buildingId: string }) => void;
}) {
  const [mode, setMode] = useState<CreateMode>("preset");
  const [presetId, setPresetId] = useState("hermes");
  const preset = CHARACTER_LIBRARY.find((item) => item.id === presetId) ?? CHARACTER_LIBRARY[1];
  const [name, setName] = useState(preset.name);
  const [role, setRole] = useState(preset.role);
  const [personality, setPersonality] = useState(preset.homeLine);
  const [buildingId, setBuildingId] = useState("");

  function switchMode(nextMode: CreateMode) {
    setMode(nextMode);
    if (nextMode === "blank") {
      setName("");
      setRole("");
      setPersonality("");
      setBuildingId("");
    } else {
      setName(preset.name);
      setRole(preset.role);
      setPersonality(preset.homeLine);
    }
  }

  function choosePreset(character: NpcDefinition) {
    setPresetId(character.id);
    setName(character.name);
    setRole(character.role);
    setPersonality(character.homeLine);
    const matchingBuilding = buildings.find((building) => building.type === character.defaultBuildingType && !buildingResidents[building.id]);
    setBuildingId(matchingBuilding?.id ?? "");
  }

  const templateId = mode === "preset" ? presetId : "visitor";
  const template = CHARACTER_LIBRARY.find((item) => item.id === templateId) ?? CHARACTER_LIBRARY[0];

  return (
    <div className="agent-create-backdrop" onClick={onClose}>
      <section className="agent-create-dialog" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <span>添加城市成员</span>
            <h3>新建 Agent</h3>
          </div>
          <button className="agent-dialog-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="agent-create-tabs">
          <button className={mode === "preset" ? "is-active" : ""} onClick={() => switchMode("preset")}>从预设创建</button>
          <button className={mode === "blank" ? "is-active" : ""} onClick={() => switchMode("blank")}>从空白创建</button>
        </div>

        {mode === "preset" && (
          <div className="agent-preset-grid">
            {CHARACTER_LIBRARY.filter((item) => item.id !== "mayor").map((character) => (
              <button key={character.id} className={presetId === character.id ? "is-selected" : ""} onClick={() => choosePreset(character)}>
                <AgentPortrait character={character} />
                <span><strong>{character.name}</strong><small>{character.role}</small></span>
              </button>
            ))}
          </div>
        )}

        <div className="agent-create-form">
          <label><span>Agent 名称</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：内容策划" /></label>
          <label><span>主要职责</span><input value={role} onChange={(event) => setRole(event.target.value)} placeholder="这个 Agent 负责什么" /></label>
          <label className="is-wide"><span>简介 / 初始人格</span><textarea value={personality} onChange={(event) => setPersonality(event.target.value)} placeholder="描述他的工作方式、专长和沟通风格" /></label>
          <label className="is-wide"><span>初始建筑（可选）</span><select value={buildingId} onChange={(event) => setBuildingId(event.target.value)}><option value="">暂不分配</option>{buildings.map((building) => <option key={building.id} value={building.id}>{building.name}{buildingResidents[building.id] ? " · 将替换当前 Agent" : ""}</option>)}</select></label>
        </div>

        <footer>
          <div className="agent-create-preview"><AgentPortrait character={template} /><span><strong>{name.trim() || "未命名 Agent"}</strong><small>{role.trim() || "等待定义职责"}</small></span></div>
          <div><button className="agent-secondary-button" onClick={onClose}>取消</button><button className="agent-primary-button" disabled={!name.trim()} onClick={() => onCreate({ name, role, personality, templateCharacterId: templateId, defaultBuildingType: buildings.find((item) => item.id === buildingId)?.type ?? template.defaultBuildingType, buildingId })}>创建 Agent</button></div>
        </footer>
      </section>
    </div>
  );
}

function AgentPortrait({ character, large = false }: { character: NpcDefinition; large?: boolean }) {
  return <span className={`agent-portrait${large ? " is-large" : ""}`} style={{ borderColor: `${character.accent}88`, background: `${character.accent}18` }}><img src={character.spriteUrl} alt="" draggable={false} /></span>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="agent-stat"><strong>{value}</strong><span>{label}</span></div>;
}

function StatusBadge({ brainEnabled, runtimeStatus, presence }: { brainEnabled: boolean; runtimeStatus?: AgentRunStatus; presence?: string }) {
  const status = getAgentActivity(brainEnabled, runtimeStatus, presence);
  return <span className={`agent-status-badge is-${status.tone}`}><span className="agent-status-dot" />{status.label}</span>;
}

function getAgentActivity(brainEnabled: boolean, runtimeStatus?: AgentRunStatus, presence?: string) {
  if (runtimeStatus === "running" || runtimeStatus === "queued") return { label: runStatusLabel[runtimeStatus] ?? "执行中", tone: "working" };
  if (runtimeStatus === "waiting_approval" || runtimeStatus === "waiting_user") return { label: runStatusLabel[runtimeStatus] ?? "等待中", tone: "waiting" };
  if (runtimeStatus === "failed") return { label: "需要处理", tone: "error" };
  if (presence === "walking") return { label: "城市巡查中", tone: "working" };
  if (brainEnabled) return { label: "在线待命", tone: "ready" };
  return { label: "待配置", tone: "idle" };
}

function getCurrentWork(character: NpcDefinition, brainEnabled: boolean, runtimeStatus?: AgentRunStatus, line?: string) {
  if (runtimeStatus === "running") return line || "正在执行用户交办的任务";
  if (runtimeStatus === "queued") return "任务已进入执行队列";
  if (runtimeStatus === "waiting_approval") return "等待你批准下一步操作";
  if (runtimeStatus === "waiting_user") return "等待你补充任务信息";
  if (line) return line;
  return brainEnabled ? "目前待命，随时可以接收任务" : character.homeLine;
}
