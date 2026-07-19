import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { SkillDefinition, SkillGroup } from "../types";
import {
  previewSkillFile,
  previewSkillUrl,
  reviewSkillWithAgent,
  saveCitySkillToLibrary,
  type SkillAdminReview,
  type SkillUrlPreview,
} from "../services/agentService";
import { useCityStore } from "../store/cityStore";
import { getAllCharacters } from "../data/npcCatalog";
import { getCharacterDisplayName } from "../utils/agentStatus";
import { getBuildingPurpose } from "../utils/buildingPurpose";
import { skillIconChoices } from "../data/skillIconChoices";
import { SkillIcon } from "./SkillIcon";

function isRealSkillContent(skill: SkillDefinition): boolean {
  const content = skill.content ?? skill.contentPreview ?? "";
  return Boolean(content.trim()) && !/^\s*<!doctype html/i.test(content) && !/^\s*<html[\s>]/i.test(content);
}

function skillDisplaySummary(skill: SkillDefinition): string {
  const content = skill.content ?? skill.contentPreview ?? "";
  const frontmatter = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s*\r?\n|$)/)?.[1] ?? "";
  const lines = frontmatter.split(/\r?\n/);
  const fieldIndex = lines.findIndex((line) => /^description\s*:/.test(line));
  let description = "";
  if (fieldIndex >= 0) {
    const raw = lines[fieldIndex].replace(/^description\s*:\s*/, "").trim();
    if (raw === ">" || raw === "|" || raw === ">-" || raw === "|-") {
      const continuation: string[] = [];
      for (let index = fieldIndex + 1; index < lines.length; index += 1) {
        if (!/^\s+/.test(lines[index])) break;
        continuation.push(lines[index].trim());
      }
      description = continuation.join(raw.startsWith("|") ? "\n" : " ").trim();
    } else {
      description = ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'")))
        ? raw.slice(1, -1).trim()
        : raw;
    }
  }
  return (description || skill.summary).slice(0, 1_200);
}

export function SkillHallModal() {
  const skillHallOpen = useCityStore((s) => s.skillHallOpen);
  const closeSkillHall = useCityStore((s) => s.closeSkillHall);
  const installUrlSkillForCharacters = useCityStore((s) => s.installUrlSkillForCharacters);
  const addInstalledSkill = useCityStore((s) => s.addInstalledSkill);
  const updateInstalledSkill = useCityStore((s) => s.updateInstalledSkill);
  const removeInstalledSkill = useCityStore((s) => s.removeInstalledSkill);
  const installedSkills = useCityStore((s) => s.installedSkills);
  const skillGroups = useCityStore((s) => s.skillGroups);
  const createSkillGroup = useCityStore((s) => s.createSkillGroup);
  const renameSkillGroup = useCityStore((s) => s.renameSkillGroup);
  const removeSkillGroup = useCityStore((s) => s.removeSkillGroup);
  const assignSkillToGroup = useCityStore((s) => s.assignSkillToGroup);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const skillLearningProgress = useCityStore((s) => s.skillLearningProgress);
  const buildings = useCityStore((s) => s.buildings);
  const selectBuilding = useCityStore((s) => s.selectBuilding);
  const [skillUrl, setSkillUrl] = useState("");
  const [preview, setPreview] = useState<SkillUrlPreview | null>(null);
  const [adminReview, setAdminReview] = useState<SkillAdminReview | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [installStatus, setInstallStatus] = useState("");
  const [learningSkill, setLearningSkill] = useState<SkillDefinition | null>(null);
  const [editingSkill, setEditingSkill] = useState<SkillDefinition | null>(null);
  const [activeGroupId, setActiveGroupId] = useState("all");
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!skillHallOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (editingSkill) setEditingSkill(null);
      else if (groupManagerOpen) setGroupManagerOpen(false);
      else if (learningSkill && !skillLearningProgress.active) setLearningSkill(null);
      else if (!learningSkill) closeSkillHall();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeSkillHall, editingSkill, groupManagerOpen, learningSkill, skillHallOpen, skillLearningProgress.active]);

  useEffect(() => {
    if (!skillHallOpen) return;
    installedSkills.forEach((skill) => {
      const summary = skillDisplaySummary(skill);
      if (summary !== skill.summary) updateInstalledSkill(skill.id, { summary });
    });
  }, [installedSkills, skillHallOpen, updateInstalledSkill]);

  const learnedCountBySkillId = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.values(characterConfigs).forEach((config) => {
      (config.learnedSkills ?? []).forEach((skill) => {
        counts[skill.id] = (counts[skill.id] ?? 0) + 1;
        counts[skill.slug] = (counts[skill.slug] ?? 0) + 1;
      });
    });
    return counts;
  }, [characterConfigs]);
  const skillHallBuilding = buildings.find((building) => getBuildingPurpose(building) === "skill-hall") ?? null;
  const skillAdminId = skillHallBuilding ? buildingResidents[skillHallBuilding.id] ?? null : null;
  const skillAdmin = getAllCharacters(customCharacters).find((character) => character.id === skillAdminId) ?? null;
  const skillAdminName = skillAdmin
    ? getCharacterDisplayName(skillAdmin, characterConfigs[skillAdmin.id])
    : "技能管理员";
  const visibleSkills = installedSkills.filter((skill) =>
    activeGroupId === "all"
      ? true
      : activeGroupId === "ungrouped"
        ? !skill.groupId || !skillGroups.some((group) => group.id === skill.groupId)
        : skill.groupId === activeGroupId
  );
  const activeGroupName = activeGroupId === "all"
    ? "全部技能"
    : activeGroupId === "ungrouped"
      ? "未分组"
      : skillGroups.find((group) => group.id === activeGroupId)?.name ?? "技能分组";

  if (!skillHallOpen) return null;

  async function handlePreview() {
    const trimmed = skillUrl.trim();
    if (!trimmed) return;
    try {
      if (!skillAdminId) throw new Error("请先为技能大厅分配一名驻楼管理员，再导入技能。");
      setInstallStatus(`${skillAdminName} 正在读取技能 URL...`);
      const nextPreview = await previewSkillUrl(trimmed);
      await reviewCandidate(nextPreview);
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : "技能预览失败。");
    }
  }

  async function chooseSkillCandidate(resolvedUrl: string) {
    if (!resolvedUrl) return;
    try {
      if (!skillAdminId) throw new Error("请先为技能大厅分配一名驻楼管理员，再导入技能。");
      setInstallStatus(`${skillAdminName} 正在读取选中的 SKILL.md...`);
      const nextPreview = await previewSkillUrl(resolvedUrl);
      await reviewCandidate(nextPreview);
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : "技能候选读取失败。");
    }
  }

  async function handleSkillFile(file: File | null) {
    if (!file) return;
    try {
      if (!skillAdminId) throw new Error("请先为技能大厅分配一名驻楼管理员，再上传 SKILL.md。");
      setInstallStatus(`${skillAdminName} 正在读取 ${file.name}...`);
      const nextPreview = await previewSkillFile(file);
      await reviewCandidate(nextPreview);
    } catch (error) {
      setPreview(null);
      setInstallStatus(error instanceof Error ? error.message : "技能文档读取失败。");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function reviewCandidate(candidate: SkillUrlPreview) {
    if (!skillAdminId) throw new Error("技能大厅尚未分配驻楼管理员。");
    setPreview(candidate);
    setAdminReview(null);
    setEditingSkill(null);
    setLearningSkill(null);
    setReviewing(true);
    setInstallStatus(`${skillAdminName} 正在审阅技能用途、适用场景和使用方法...`);
    try {
      const review = await reviewSkillWithAgent(skillAdminId, candidate);
      setAdminReview(review);
      setPreview({ ...candidate, name: review.name, summary: review.summary });
      setInstallStatus(`${skillAdminName} 已完成审阅。你可以调整名称、简介和图标，然后确认安装。`);
    } finally {
      setReviewing(false);
    }
  }

  async function handleInstallPreview() {
    if (!preview || !adminReview || reviewing) return;
    try {
      await saveCitySkillToLibrary(preview);
      addInstalledSkill({
        id: preview.slug,
        slug: preview.slug,
        name: preview.name,
        category: "导入技能",
        rarity: "rare",
        icon: preview.icon,
        summary: preview.summary,
        npcPitch: preview.summary,
        sourceUrl: preview.sourceUrl,
        contentPreview: preview.contentPreview,
        content: preview.content,
        resolvedUrl: preview.resolvedUrl,
        commitSha: preview.commitSha,
        contentHash: preview.contentHash,
        requestedCapabilities: preview.requestedCapabilities,
      });
      setInstallStatus(`「${preview.name}」已进入技能区。点击技能卡里的“学习”选择 Agent。`);
      setPreview(null);
      setAdminReview(null);
      setSkillUrl("");
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : "技能加入技能栏失败。");
    }
  }

  async function handleLearnSkill() {
    if (!learningSkill || !selectedAgentIds.length) return;
    const content = learningSkill.content ?? learningSkill.contentPreview;
    if (!content || !isRealSkillContent(learningSkill)) {
      setInstallStatus("这个技能不是有效 SKILL.md，无法让 Agent 学习。请删除它，然后用 raw SKILL.md 或 GitHub skill 目录重新安装。");
      return;
    }
    try {
      setInstallStatus(`正在让 ${selectedAgentIds.length} 个 Agent 学习「${learningSkill.name}」...`);
      await installUrlSkillForCharacters(selectedAgentIds, {
        id: learningSkill.id,
        slug: learningSkill.slug ?? learningSkill.id,
        name: learningSkill.name,
        icon: learningSkill.icon,
        summary: skillDisplaySummary(learningSkill),
        sourceUrl: learningSkill.sourceUrl ?? "",
        contentPreview: learningSkill.contentPreview ?? content.slice(0, 4000),
        content,
        resolvedUrl: learningSkill.resolvedUrl,
        commitSha: learningSkill.commitSha,
        contentHash: learningSkill.contentHash,
        requestedCapabilities: learningSkill.requestedCapabilities,
      });
      setInstallStatus(`学习完成：「${learningSkill.name}」现在能被已选 Agent 使用。`);
      setLearningSkill(null);
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : "学习失败。");
    }
  }

  function startLearning(skill: SkillDefinition) {
    if (!isRealSkillContent(skill)) {
      setInstallStatus("这个技能栏条目是网页/无效内容，不是真技能。请删除后用 SKILL.md 重新安装。");
      return;
    }
    setLearningSkill(skill);
    setEditingSkill(null);
    setPreview(null);
    setSelectedAgentIds(
      Object.entries(characterConfigs)
        .filter(([, config]) => (config.learnedSkills ?? []).some((item) =>
          item.id === skill.id || item.slug === skill.slug
        ))
        .map(([characterId]) => characterId)
    );
  }

  function startEditing(skill: SkillDefinition) {
    setEditingSkill(skill);
    setLearningSkill(null);
    setPreview(null);
  }

  function saveEditingSkill() {
    if (!editingSkill) return;
    updateInstalledSkill(editingSkill.id, editingSkill);
    setInstallStatus(`已更新「${editingSkill.name}」。`);
    setEditingSkill(null);
  }

  async function deleteSkill(skill: SkillDefinition) {
    const approved = window.confirm(`删除技能栏里的「${skill.name}」？已学习的 Agent 会取消启用这个技能。`);
    if (!approved) return;
    try {
      setInstallStatus(`正在删除「${skill.name}」并清理 Agent 技能目录...`);
      await removeInstalledSkill(skill.id);
      if (learningSkill?.id === skill.id) setLearningSkill(null);
      if (editingSkill?.id === skill.id) setEditingSkill(null);
      setInstallStatus(`已从技能栏删除「${skill.name}」。`);
    } catch (error) {
      setInstallStatus(error instanceof Error ? error.message : "删除技能失败。");
    }
  }

  function toggleAgent(characterId: string) {
    setSelectedAgentIds((current) =>
      current.includes(characterId)
        ? current.filter((id) => id !== characterId)
        : [...current, characterId]
    );
  }

  function editBuilding() {
    if (!skillHallBuilding) return;
    selectBuilding(skillHallBuilding.id);
  }

  return (
    <div style={backdropStyle} onClick={closeSkillHall}>
      <section
        aria-modal="true"
        role="dialog"
        aria-label="技能大厅"
        onClick={(event) => event.stopPropagation()}
        data-ui-surface="panel" style={modalStyle}
      >
        <div style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>技能大厅</div>
            <h2 style={titleStyle}>安装城市技能</h2>
          </div>
          <div style={headerActionsStyle}>
            {skillHallBuilding && (
              <button onClick={editBuilding} style={editBtnStyle}>
                编辑建筑
              </button>
            )}
            <button onClick={closeSkillHall} style={closeStyle} aria-label="关闭技能大厅">
              ×
            </button>
          </div>
        </div>

        <div style={installPanelStyle}>
          <div style={installHeaderStyle}>
            <div>
              <div style={sectionKickerStyle}>导入技能</div>
              <div style={sectionTitleStyle}>安装真实 Agent 技能</div>
              <div style={adminLineStyle}>
                {skillAdminId ? `由驻楼管理员 ${skillAdminName} 审阅后安装` : "尚未分配驻楼管理员，暂时不能导入"}
              </div>
            </div>
            <div style={installActionsStyle}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".md,text/markdown,text/plain"
                hidden
                onChange={(event) => void handleSkillFile(event.target.files?.[0] ?? null)}
              />
              <button style={{ ...uploadButtonStyle, opacity: skillAdminId && !reviewing ? 1 : 0.45 }} disabled={!skillAdminId || reviewing} onClick={() => fileInputRef.current?.click()}>
                上传 SKILL.md
              </button>
              <button style={{ ...installButtonStyle, opacity: skillAdminId && !reviewing ? 1 : 0.45 }} disabled={!skillAdminId || reviewing} onClick={handlePreview}>
                读取 URL
              </button>
            </div>
          </div>
          <div style={urlRowStyle}>
            <input
              style={urlInputStyle}
              value={skillUrl}
              placeholder="粘贴 SKILL.md 或 GitHub blob/raw URL"
              onChange={(event) => setSkillUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void handlePreview();
              }}
            />
          </div>
          {preview && (
            <div style={previewPanelStyle}>
              <div style={reviewHeaderStyle}>
                <div style={reviewAvatarStyle}>{skillAdmin?.icon || "AI"}</div>
                <div>
                  <div style={reviewTitleStyle}>{reviewing ? `${skillAdminName} 正在审阅…` : `${skillAdminName} 的技能审阅`}</div>
                  <div style={reviewSubTitleStyle}>管理员只分析技能内容，不会执行文档中的脚本或提升权限。</div>
                </div>
              </div>
              {adminReview && (
                <div style={reviewBodyStyle}>
                  <div style={reviewBlockStyle}>
                    <span style={reviewLabelStyle}>适用场景</span>
                    <div style={reviewTagsStyle}>
                      {adminReview.suitableFor.map((item) => <span key={item} style={reviewTagStyle}>{item}</span>)}
                    </div>
                  </div>
                  <div style={reviewBlockStyle}>
                    <span style={reviewLabelStyle}>如何使用</span>
                    <div style={reviewTextStyle}>{adminReview.howToUse}</div>
                  </div>
                  {adminReview.cautions.length > 0 && (
                    <div style={reviewBlockStyle}>
                      <span style={reviewLabelStyle}>注意事项</span>
                      <div style={reviewTextStyle}>{adminReview.cautions.join("；")}</div>
                    </div>
                  )}
                </div>
              )}
              {preview.alternatives && preview.alternatives.length > 1 && (
                <label style={{ ...previewFieldStyle, marginBottom: 10 }}>
                  <span style={smallLabelStyle}>仓库内发现多个 SKILL.md</span>
                  <select
                    style={urlInputStyle}
                    value={preview.resolvedUrl ?? ""}
                    onChange={(event) => void chooseSkillCandidate(event.target.value)}
                  >
                    {preview.alternatives.map((candidate) => (
                      <option key={candidate.resolvedUrl} value={candidate.resolvedUrl}>{candidate.name} · {candidate.resolvedUrl}</option>
                    ))}
                  </select>
                </label>
              )}
              <div style={previewFieldsStyle}>
                <label style={previewFieldStyle}>
                  <span style={smallLabelStyle}>图标</span>
                  <input
                    style={urlInputStyle}
                    value={preview.icon}
                    onChange={(event) => setPreview({ ...preview, icon: event.target.value })}
                  />
                </label>
                <label style={previewFieldStyle}>
                  <span style={smallLabelStyle}>技能名称</span>
                  <input
                    style={urlInputStyle}
                    value={preview.name}
                    onChange={(event) => setPreview({ ...preview, name: event.target.value })}
                  />
                </label>
                <label style={{ ...previewFieldStyle, gridColumn: "1 / -1" }}>
                  <span style={smallLabelStyle}>技能介绍</span>
                  <textarea
                    style={{ ...urlInputStyle, minHeight: 58, resize: "vertical" }}
                    value={preview.summary}
                    onChange={(event) => setPreview({ ...preview, summary: event.target.value })}
                  />
                </label>
              </div>
              <div style={{ color: "var(--ac-muted)", fontSize: 10, lineHeight: 1.5, marginBottom: 8 }}>
                <div>来源：{preview.resolvedUrl ?? preview.sourceUrl}</div>
                {preview.commitSha && <div>提交：{preview.commitSha.slice(0, 12)}</div>}
                {preview.contentHash && <div>SHA-256：{preview.contentHash.slice(0, 16)}...</div>}
                <div>
                  能力声明：{preview.requestedCapabilities?.length ? preview.requestedCapabilities.join("、") : "无；安装技能不会自动获得任何权限"}
                </div>
              </div>
              <div style={iconPickerStyle} aria-label="选择技能图标">
                {skillIconChoices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    title={choice.name}
                    aria-label={`选择${choice.name}图标`}
                    aria-pressed={preview.icon === choice.src}
                    style={{
                      ...iconChoiceStyle,
                      borderColor: preview.icon === choice.src ? "var(--ac-kicker)" : "var(--ac-border)",
                      boxShadow: preview.icon === choice.src ? "0 0 0 2px color-mix(in srgb, var(--ac-kicker) 28%, transparent)" : "none",
                    }}
                    onClick={() => setPreview({ ...preview, icon: choice.src })}
                  >
                    <SkillIcon icon={choice.src} />
                  </button>
                ))}
              </div>
              <button
                style={{ ...confirmInstallStyle, opacity: adminReview && !reviewing ? 1 : 0.45 }}
                disabled={!adminReview || reviewing}
                onClick={handleInstallPreview}
              >
                {reviewing ? "管理员审阅中…" : `确认并由 ${skillAdminName} 安装`}
              </button>
            </div>
          )}
          {installStatus && <div style={installStatusStyle}>{installStatus}</div>}
        </div>

        <div style={skillLibraryStyle}>
          <aside style={groupSidebarStyle} aria-label="技能分组">
            <div style={groupSidebarHeaderStyle}>
              <span>技能分组</span>
              <button style={manageGroupsButtonStyle} onClick={() => setGroupManagerOpen(true)}>管理</button>
            </div>
            <GroupFilterButton
              label="全部技能"
              count={installedSkills.length}
              active={activeGroupId === "all"}
              onClick={() => setActiveGroupId("all")}
            />
            <GroupFilterButton
              label="未分组"
              count={installedSkills.filter((skill) => !skill.groupId || !skillGroups.some((group) => group.id === skill.groupId)).length}
              active={activeGroupId === "ungrouped"}
              onClick={() => setActiveGroupId("ungrouped")}
            />
            <div style={groupDividerStyle} />
            {skillGroups.map((group) => (
              <GroupFilterButton
                key={group.id}
                label={group.name}
                count={installedSkills.filter((skill) => skill.groupId === group.id).length}
                active={activeGroupId === group.id}
                onClick={() => setActiveGroupId(group.id)}
              />
            ))}
            {!skillGroups.length && <div style={noGroupHintStyle}>还没有自定义分组</div>}
            <button style={newGroupButtonStyle} onClick={() => setGroupManagerOpen(true)}>新建分组</button>
          </aside>

          <section style={skillShelfStyle} aria-label={activeGroupName}>
            <div style={skillShelfHeaderStyle}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <strong>{activeGroupName}</strong>
                <span>{visibleSkills.length} 个技能</span>
              </div>
              {activeGroupId !== "all" && <button style={showAllButtonStyle} onClick={() => setActiveGroupId("all")}>查看全部</button>}
            </div>
            <div style={gridStyle}>
              {visibleSkills.length ? visibleSkills.map((skill) => (
                <article key={skill.id} style={shelfCardStyle}>
                  <div style={shelfCardTopStyle}>
                    <div style={shelfIconStyle}><SkillIcon icon={skill.icon} /></div>
                    <div style={{ minWidth: 0 }}>
                      <div style={shelfNameStyle}>{skill.name}</div>
                      <div style={shelfMetaStyle}>
                        {isRealSkillContent(skill) ? `${learnedCountBySkillId[skill.id] ?? 0} 个 Agent 已学习` : "无效技能内容"}
                      </div>
                    </div>
                  </div>
                  <p style={shelfSummaryStyle}>{skillDisplaySummary(skill)}</p>
                  <label style={skillGroupSelectLabelStyle}>
                    <span>所属分组</span>
                    <select
                      aria-label={`设置 ${skill.name} 分组`}
                      style={skillGroupSelectStyle}
                      value={skill.groupId && skillGroups.some((group) => group.id === skill.groupId) ? skill.groupId : ""}
                      onChange={(event) => assignSkillToGroup(skill.id, event.target.value || null)}
                    >
                      <option value="">未分组</option>
                      {skillGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                    </select>
                  </label>
                  <div style={shelfActionsStyle}>
                    <button style={shelfActionStyle} onClick={() => startEditing(skill)}>管理</button>
                    <button style={shelfActionStyle} onClick={() => void deleteSkill(skill)}>删除</button>
                    <button
                      style={{
                        ...shelfPrimaryActionStyle,
                        opacity: isRealSkillContent(skill) ? 1 : 0.45,
                        cursor: isRealSkillContent(skill) ? "pointer" : "not-allowed",
                      }}
                      onClick={() => startLearning(skill)}
                    >
                      学习
                    </button>
                  </div>
                </article>
              )) : (
                <div style={{ ...emptyShelfStyle, gridColumn: "1 / -1" }}>
                  {installedSkills.length
                    ? `「${activeGroupName}」里还没有技能。可在技能卡的“所属分组”中移动技能。`
                    : "还没有真实技能。可以从上方上传 SKILL.md，或粘贴 GitHub URL。"}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
      {learningSkill && (
        <div
          style={learningBackdropStyle}
          onClick={(event) => {
            event.stopPropagation();
            if (!skillLearningProgress.active) setLearningSkill(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-label={`选择学习 ${learningSkill.name} 的 Agent`}
            style={learningDialogStyle}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={learningDialogHeaderStyle}>
              <div style={learningTitleStyle}>
                <span style={learningIconStyle}><SkillIcon icon={learningSkill.icon} /></span>
                <div>
                  <div style={learningEyebrowStyle}>分配技能</div>
                  <div>谁来学习「{learningSkill.name}」？</div>
                </div>
              </div>
              <button
                style={learningCloseStyle}
                disabled={skillLearningProgress.active}
                onClick={() => setLearningSkill(null)}
                aria-label="关闭 Agent 选择"
              >
                ×
              </button>
            </div>
            <p style={learningHintStyle}>选择一个或多个 Agent。已经学会该技能的员工会预先选中。</p>
            <div style={agentPickerStyle}>
              {getAllCharacters(customCharacters).map((character) => {
                const checked = selectedAgentIds.includes(character.id);
                const config = characterConfigs[character.id];
                return (
                  <button
                    key={character.id}
                    type="button"
                    style={{
                      ...agentChipStyle,
                      borderColor: checked ? "var(--ac-text)" : "var(--ac-border)",
                      background: checked ? "var(--ac-selected)" : "var(--ac-surface-raised)",
                    }}
                    onClick={() => toggleAgent(character.id)}
                  >
                    <span style={{ ...agentCheckStyle, background: checked ? "var(--ac-text)" : "transparent", color: checked ? "var(--ac-panel)" : "transparent" }}>✓</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={agentNameStyle}>{getCharacterDisplayName(character, config)}</span>
                      <span style={agentRoleStyle}>{character.role}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {skillLearningProgress.active && (
              <div style={progressWrapStyle}>
                <div style={progressMetaStyle}>
                  <span>{skillLearningProgress.label}</span>
                  <span>{skillLearningProgress.percent}%</span>
                </div>
                <div style={progressTrackStyle}>
                  <div style={{ ...progressFillStyle, width: `${skillLearningProgress.percent}%` }} />
                </div>
              </div>
            )}
            <div style={learningFooterStyle}>
              <span style={learningCountStyle}>已选择 {selectedAgentIds.length} 个 Agent</span>
              <button
                style={{ ...confirmInstallStyle, opacity: selectedAgentIds.length ? 1 : 0.45 }}
                disabled={!selectedAgentIds.length || skillLearningProgress.active}
                onClick={() => void handleLearnSkill()}
              >
                {skillLearningProgress.active ? "正在学习…" : "确认学习"}
              </button>
            </div>
          </section>
        </div>
      )}
      {groupManagerOpen && (
        <SkillGroupManagerDialog
          groups={skillGroups}
          skillCountByGroup={Object.fromEntries(skillGroups.map((group) => [group.id, installedSkills.filter((skill) => skill.groupId === group.id).length]))}
          onCreate={(name) => {
            const id = createSkillGroup(name);
            if (id) setActiveGroupId(id);
            return id;
          }}
          onRename={renameSkillGroup}
          onRemove={(groupId) => {
            removeSkillGroup(groupId);
            if (activeGroupId === groupId) setActiveGroupId("ungrouped");
          }}
          onClose={() => setGroupManagerOpen(false)}
        />
      )}
      {editingSkill && (
        <SkillEditorDialog
          skill={editingSkill}
          onChange={setEditingSkill}
          onSave={saveEditingSkill}
          onClose={() => setEditingSkill(null)}
        />
      )}
    </div>
  );
}

function SkillEditorDialog({
  skill,
  onChange,
  onSave,
  onClose,
}: {
  skill: SkillDefinition;
  onChange: (skill: SkillDefinition) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <div style={groupManagerBackdropStyle} onClick={(event) => { event.stopPropagation(); onClose(); }}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label={`管理技能 ${skill.name}`}
        style={skillEditorDialogStyle}
        onClick={(event) => event.stopPropagation()}
      >
        <header style={groupManagerHeaderStyle}>
          <div>
            <div style={sectionKickerStyle}>技能信息</div>
            <h3 style={groupManagerTitleStyle}>管理技能</h3>
            <div style={skillEditorSubtitleStyle}>调整名称、介绍和展示图标</div>
          </div>
          <button style={learningCloseStyle} onClick={onClose} aria-label="关闭技能管理">×</button>
        </header>

        <div style={skillEditorBodyStyle}>
          <div style={skillEditorFieldsStyle}>
            <label style={previewFieldStyle}>
              <span style={smallLabelStyle}>图标路径</span>
              <input style={urlInputStyle} value={skill.icon} onChange={(event) => onChange({ ...skill, icon: event.target.value })} />
            </label>
            <label style={previewFieldStyle}>
              <span style={smallLabelStyle}>技能名称</span>
              <input style={urlInputStyle} value={skill.name} onChange={(event) => onChange({ ...skill, name: event.target.value })} />
            </label>
            <label style={{ ...previewFieldStyle, gridColumn: "1 / -1" }}>
              <span style={smallLabelStyle}>技能介绍</span>
              <textarea
                style={{ ...urlInputStyle, minHeight: 110, resize: "vertical" }}
                value={skill.summary}
                onChange={(event) => onChange({ ...skill, summary: event.target.value })}
              />
            </label>
          </div>

          <div>
            <div style={skillIconPickerHeadingStyle}>选择展示图标</div>
            <div style={skillEditorIconPickerStyle} aria-label="选择技能图标">
              {skillIconChoices.map((choice) => (
                <button
                  key={choice.id}
                  type="button"
                  title={choice.name}
                  aria-label={`选择${choice.name}图标`}
                  aria-pressed={skill.icon === choice.src}
                  style={{
                    ...iconChoiceStyle,
                    border: skill.icon === choice.src ? "2px solid var(--ac-kicker)" : "2px solid var(--ac-border)",
                    boxShadow: skill.icon === choice.src ? "0 0 0 2px color-mix(in srgb, var(--ac-kicker) 28%, transparent)" : "none",
                  }}
                  onClick={() => onChange({ ...skill, icon: choice.src })}
                >
                  <SkillIcon icon={choice.src} />
                </button>
              ))}
            </div>
          </div>
        </div>

        <footer style={skillEditorFooterStyle}>
          <button style={shelfActionStyle} onClick={onClose}>取消</button>
          <button style={confirmInstallStyle} onClick={onSave}>保存技能信息</button>
        </footer>
      </section>
    </div>
  );
}

function GroupFilterButton({ label, count, active, onClick }: { label: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button
      style={{ ...groupFilterButtonStyle, ...(active ? activeGroupFilterButtonStyle : {}) }}
      aria-pressed={active}
      onClick={onClick}
    >
      <span>{label}</span>
      <span style={groupCountStyle}>{count}</span>
    </button>
  );
}

function SkillGroupManagerDialog({
  groups,
  skillCountByGroup,
  onCreate,
  onRename,
  onRemove,
  onClose,
}: {
  groups: SkillGroup[];
  skillCountByGroup: Record<string, number>;
  onCreate: (name: string) => string;
  onRename: (groupId: string, name: string) => void;
  onRemove: (groupId: string) => void;
  onClose: () => void;
}) {
  const [newName, setNewName] = useState("");
  const [draftNames, setDraftNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(groups.map((group) => [group.id, group.name]))
  );

  useEffect(() => {
    setDraftNames((current) => Object.fromEntries(groups.map((group) => [group.id, current[group.id] ?? group.name])));
  }, [groups]);

  function createGroup() {
    if (!newName.trim()) return;
    const id = onCreate(newName);
    if (id) setNewName("");
  }

  return (
    <div style={groupManagerBackdropStyle} onClick={(event) => { event.stopPropagation(); onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label="管理技能分组" style={groupManagerDialogStyle} onClick={(event) => event.stopPropagation()}>
        <header style={groupManagerHeaderStyle}>
          <div>
            <div style={sectionKickerStyle}>技能整理</div>
            <h3 style={groupManagerTitleStyle}>管理技能分组</h3>
          </div>
          <button style={learningCloseStyle} onClick={onClose} aria-label="关闭分组管理">×</button>
        </header>

        <div style={createGroupRowStyle}>
          <label style={{ ...previewFieldStyle, flex: 1 }}>
            <span style={smallLabelStyle}>新分组名称</span>
            <input
              style={urlInputStyle}
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") createGroup(); }}
              placeholder="例如：内容创作、数据分析"
              autoFocus
            />
          </label>
          <button style={{ ...confirmInstallStyle, opacity: newName.trim() ? 1 : 0.45 }} disabled={!newName.trim()} onClick={createGroup}>新建分组</button>
        </div>

        <div style={groupManagerListStyle}>
          {groups.map((group) => {
            const draftName = draftNames[group.id] ?? group.name;
            const changed = draftName.trim() && draftName.trim() !== group.name;
            return (
              <div key={group.id} style={groupManagerRowStyle}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <input
                    aria-label={`${group.name} 分组名称`}
                    style={{ ...urlInputStyle, minHeight: 38 }}
                    value={draftName}
                    onChange={(event) => setDraftNames((current) => ({ ...current, [group.id]: event.target.value }))}
                    onKeyDown={(event) => { if (event.key === "Enter" && changed) onRename(group.id, draftName); }}
                  />
                  <div style={groupManagerMetaStyle}>{skillCountByGroup[group.id] ?? 0} 个技能</div>
                </div>
                <button style={{ ...shelfActionStyle, opacity: changed ? 1 : 0.45 }} disabled={!changed} onClick={() => onRename(group.id, draftName)}>保存名称</button>
                <button
                  style={deleteGroupButtonStyle}
                  onClick={() => {
                    if (window.confirm(`删除分组「${group.name}」？组内技能会回到“未分组”。`)) onRemove(group.id);
                  }}
                >
                  删除
                </button>
              </div>
            );
          })}
          {!groups.length && <div style={emptyGroupManagerStyle}>还没有分组。创建第一个分组后，就可以在技能卡上进行归类。</div>}
        </div>

        <footer style={groupManagerFooterStyle}>
          <span>删除分组不会删除技能，只会把技能移回“未分组”。</span>
          <button style={confirmInstallStyle} onClick={onClose}>完成</button>
        </footer>
      </section>
    </div>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240000,
  background: "var(--ac-backdrop)",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(1120px, 95vw)",
  maxHeight: "90vh",
  overflowY: "auto",
  overflowX: "hidden",
  borderRadius: 22,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  boxShadow: "var(--ac-shadow)",
  backdropFilter: "blur(28px) saturate(1.16)",
  color: "var(--ac-text)",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "20px 24px 18px",
  borderBottom: "1px solid var(--ac-border)",
  background: "transparent",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "var(--ac-kicker)",
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: 25,
  letterSpacing: 0,
};

const headerActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const editBtnStyle: CSSProperties = {
  height: 40,
  padding: "0 15px",
  borderRadius: 11,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 900,
};

const closeStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 11,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: "28px",
};

const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
  gap: 14,
  minHeight: 150,
};

const installPanelStyle: CSSProperties = {
  margin: "14px 16px 0",
  padding: 16,
  display: "grid",
  gap: 10,
  background: "var(--ac-surface)",
  border: "1px solid var(--ac-border)",
  borderRadius: 14,
};
const installHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
};

const installActionsStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const sectionKickerStyle: CSSProperties = {
  color: "var(--ac-kicker)",
  fontSize: 10,
  fontWeight: 950,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const sectionTitleStyle: CSSProperties = {
  marginTop: 2,
  color: "var(--ac-text)",
  fontSize: 14,
  fontWeight: 950,
};

const adminLineStyle: CSSProperties = {
  marginTop: 4,
  color: "var(--ac-muted)",
  fontSize: 10,
  fontWeight: 750,
};

const urlRowStyle: CSSProperties = {
  display: "flex",
  gap: 8,
};

const urlInputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  minHeight: 42,
  borderRadius: 11,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "8px 9px",
  fontSize: 12,
};

const installButtonStyle: CSSProperties = {
  borderRadius: 11,
  border: "1px solid rgba(59,130,246,.35)",
  background: "#3b82f6",
  color: "#fff",
  padding: "9px 15px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
  flexShrink: 0,
};

const uploadButtonStyle: CSSProperties = {
  ...installButtonStyle,
  border: "1px solid var(--ac-border)",
  background: "#fff",
  color: "#111827",
  boxShadow: "0 5px 16px rgba(15,23,42,.08)",
};

const previewPanelStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  padding: 12,
};

const reviewHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  paddingBottom: 10,
  borderBottom: "1px solid var(--ac-border)",
};

const reviewAvatarStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 11,
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  fontSize: 18,
  fontWeight: 950,
};

const reviewTitleStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 12,
  fontWeight: 950,
};

const reviewSubTitleStyle: CSSProperties = {
  marginTop: 2,
  color: "var(--ac-muted)",
  fontSize: 9,
  lineHeight: 1.4,
};

const reviewBodyStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 9,
  padding: 10,
  borderRadius: 11,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
};

const reviewBlockStyle: CSSProperties = {
  display: "grid",
  alignContent: "start",
  gap: 5,
};

const reviewLabelStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 10,
  fontWeight: 950,
};

const reviewTagsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
};

const reviewTagStyle: CSSProperties = {
  padding: "4px 7px",
  borderRadius: 999,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-text-soft)",
  fontSize: 9,
  fontWeight: 800,
};

const reviewTextStyle: CSSProperties = {
  color: "var(--ac-text-soft)",
  fontSize: 10,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const previewFieldsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "80px minmax(0, 1fr)",
  gap: 8,
};

const previewFieldStyle: CSSProperties = {
  display: "grid",
  gap: 4,
};

const smallLabelStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 10,
  fontWeight: 900,
};

const iconPickerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, 48px)",
  gap: 8,
  maxHeight: 176,
  overflowY: "auto",
  padding: "4px 2px",
};

const iconChoiceStyle: CSSProperties = {
  width: 48,
  height: 48,
  padding: 2,
  borderRadius: 10,
  border: "2px solid var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 22,
};

const agentPickerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 9,
};

const agentChipStyle: CSSProperties = {
  minWidth: 0,
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  color: "var(--ac-text)",
  padding: "11px 12px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: 10,
  textAlign: "left",
  boxShadow: "0 5px 18px rgba(15,23,42,.05)",
};

const confirmInstallStyle: CSSProperties = {
  ...installButtonStyle,
  justifySelf: "start",
};

const installStatusStyle: CSSProperties = {
  color: "var(--ac-text-soft)",
  fontSize: 11,
  lineHeight: 1.35,
};

const learningTitleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  color: "var(--ac-text)",
  fontSize: 13,
  fontWeight: 950,
};

const learningBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 240010,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(15, 23, 42, .38)",
  backdropFilter: "blur(8px)",
};

const learningDialogStyle: CSSProperties = {
  width: "min(620px, 92vw)",
  maxHeight: "min(720px, 86vh)",
  overflowY: "auto",
  display: "grid",
  gap: 16,
  padding: 20,
  borderRadius: 20,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  boxShadow: "0 28px 80px rgba(15,23,42,.28)",
};

const learningDialogHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
};

const learningEyebrowStyle: CSSProperties = {
  marginBottom: 3,
  color: "var(--ac-kicker)",
  fontSize: 10,
  fontWeight: 950,
  letterSpacing: 1.1,
};

const learningCloseStyle: CSSProperties = {
  ...closeStyle,
  width: 38,
  height: 38,
  flexShrink: 0,
};

const learningHintStyle: CSSProperties = {
  margin: "-5px 0 0",
  color: "var(--ac-muted)",
  fontSize: 12,
  lineHeight: 1.5,
};

const agentCheckStyle: CSSProperties = {
  width: 22,
  height: 22,
  borderRadius: 7,
  border: "1.5px solid var(--ac-text)",
  display: "grid",
  placeItems: "center",
  flexShrink: 0,
  fontSize: 13,
};

const agentNameStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
  fontWeight: 950,
};

const agentRoleStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  color: "var(--ac-muted)",
  fontSize: 10,
  fontWeight: 700,
};

const learningFooterStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  paddingTop: 4,
};

const learningCountStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 11,
  fontWeight: 850,
};

const learningIconStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  borderRadius: 7,
  background: "rgba(255,226,138,0.14)",
  border: "1px solid rgba(255,226,138,0.24)",
};

const progressWrapStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const progressMetaStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  color: "var(--ac-text-soft)",
  fontSize: 11,
  fontWeight: 900,
};

const progressTrackStyle: CSSProperties = {
  height: 8,
  borderRadius: 999,
  background: "var(--ac-border)",
  overflow: "hidden",
};

const progressFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: 999,
  background: "linear-gradient(90deg, var(--ac-kicker), #38bdf8)",
  transition: "width 220ms ease",
};

const shelfCardStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid rgba(255,226,138,0.2)",
  background: "var(--ac-surface-raised)",
  padding: 10,
  display: "grid",
  gap: 8,
};

const shelfCardTopStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
};

const shelfIconStyle: CSSProperties = {
  width: 38,
  height: 38,
  borderRadius: 7,
  display: "grid",
  placeItems: "center",
  background: "rgba(255,226,138,0.13)",
  border: "1px solid rgba(255,226,138,0.24)",
  fontSize: 20,
  flexShrink: 0,
};

const shelfNameStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 13,
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const shelfMetaStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 10,
  marginTop: 2,
  fontWeight: 800,
};

const shelfSummaryStyle: CSSProperties = {
  margin: 0,
  color: "var(--ac-text-soft)",
  fontSize: 11,
  lineHeight: 1.38,
  minHeight: 30,
  display: "-webkit-box",
  WebkitLineClamp: 5,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const shelfActionsStyle: CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 6,
  flexWrap: "wrap",
};

const shelfActionStyle: CSSProperties = {
  borderRadius: 5,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-text-soft)",
  padding: "5px 8px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
};

const shelfPrimaryActionStyle: CSSProperties = {
  ...shelfActionStyle,
  borderColor: "rgba(255,226,138,0.4)",
  background: "var(--ac-kicker)",
  color: "#1f2937",
};

const emptyShelfStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-muted)",
  padding: 12,
  fontSize: 12,
};

const skillLibraryStyle: CSSProperties = {
  margin: "20px 16px 16px",
  minHeight: 260,
  display: "grid",
  gridTemplateColumns: "190px minmax(0, 1fr)",
  overflow: "hidden",
  border: "1px solid var(--ac-border)",
  borderRadius: 14,
  background: "var(--ac-surface)",
};

const groupSidebarStyle: CSSProperties = {
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 5,
  borderRight: "1px solid var(--ac-border)",
  background: "color-mix(in srgb, var(--ac-surface-raised) 60%, transparent)",
};

const groupSidebarHeaderStyle: CSSProperties = {
  minHeight: 32,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  padding: "0 5px 5px",
  color: "var(--ac-text)",
  fontSize: 11,
  fontWeight: 950,
};

const manageGroupsButtonStyle: CSSProperties = {
  border: 0,
  background: "transparent",
  color: "var(--ac-accent-text)",
  padding: 3,
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const groupFilterButtonStyle: CSSProperties = {
  minWidth: 0,
  width: "100%",
  minHeight: 36,
  padding: "0 9px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
  border: "1px solid transparent",
  borderRadius: 9,
  background: "transparent",
  color: "var(--ac-muted)",
  fontSize: 11,
  fontWeight: 850,
  textAlign: "left",
  cursor: "pointer",
};

const activeGroupFilterButtonStyle: CSSProperties = {
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-text)",
};

const groupCountStyle: CSSProperties = {
  minWidth: 22,
  height: 20,
  padding: "0 5px",
  display: "inline-grid",
  placeItems: "center",
  borderRadius: 999,
  background: "var(--ac-surface-strong)",
  color: "var(--ac-muted)",
  fontSize: 9,
};

const groupDividerStyle: CSSProperties = { height: 1, margin: "5px 3px", background: "var(--ac-border)" };
const noGroupHintStyle: CSSProperties = { padding: "7px 9px", color: "var(--ac-muted)", fontSize: 9, lineHeight: 1.5 };
const newGroupButtonStyle: CSSProperties = {
  marginTop: "auto",
  minHeight: 34,
  border: "1px dashed var(--ac-selected-border)",
  borderRadius: 9,
  background: "transparent",
  color: "var(--ac-accent-text)",
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const skillShelfStyle: CSSProperties = { minWidth: 0, padding: 14, overflow: "hidden" };
const skillShelfHeaderStyle: CSSProperties = {
  minHeight: 38,
  marginBottom: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};
const showAllButtonStyle: CSSProperties = { ...manageGroupsButtonStyle, padding: "5px 7px" };
const skillGroupSelectLabelStyle: CSSProperties = { display: "grid", gap: 4, color: "var(--ac-muted)", fontSize: 9, fontWeight: 850 };
const skillGroupSelectStyle: CSSProperties = {
  width: "100%",
  height: 32,
  boxSizing: "border-box",
  border: "1px solid var(--ac-border)",
  borderRadius: 7,
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "0 8px",
  fontSize: 10,
};

const groupManagerBackdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 260000,
  display: "grid",
  placeItems: "center",
  padding: 20,
  background: "rgba(15,23,42,.36)",
  backdropFilter: "blur(6px)",
};
const groupManagerDialogStyle: CSSProperties = {
  width: "min(620px, 92vw)",
  maxHeight: "80vh",
  display: "flex",
  flexDirection: "column",
  overflow: "hidden",
  border: "1px solid var(--ac-border)",
  borderRadius: 18,
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  boxShadow: "var(--ac-shadow)",
};
const skillEditorDialogStyle: CSSProperties = {
  ...groupManagerDialogStyle,
  width: "min(900px, 92vw)",
  maxHeight: "86vh",
};
const skillEditorSubtitleStyle: CSSProperties = { marginTop: 4, color: "var(--ac-muted)", fontSize: 10 };
const skillEditorBodyStyle: CSSProperties = { minHeight: 0, overflowY: "auto", padding: 18, display: "grid", gap: 16 };
const skillEditorFieldsStyle: CSSProperties = { display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 10 };
const skillIconPickerHeadingStyle: CSSProperties = { marginBottom: 9, color: "var(--ac-text)", fontSize: 11, fontWeight: 950 };
const skillEditorIconPickerStyle: CSSProperties = { ...iconPickerStyle, maxHeight: 230, gridTemplateColumns: "repeat(auto-fill, 52px)", gap: 9, padding: 4 };
const skillEditorFooterStyle: CSSProperties = { padding: "13px 18px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, borderTop: "1px solid var(--ac-border)", background: "var(--ac-panel)" };
const groupManagerHeaderStyle: CSSProperties = { padding: "17px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--ac-border)" };
const groupManagerTitleStyle: CSSProperties = { margin: "3px 0 0", fontSize: 19 };
const createGroupRowStyle: CSSProperties = { padding: 16, display: "flex", alignItems: "end", gap: 9, borderBottom: "1px solid var(--ac-border)" };
const groupManagerListStyle: CSSProperties = { minHeight: 120, overflowY: "auto", padding: 12, display: "grid", alignContent: "start", gap: 8 };
const groupManagerRowStyle: CSSProperties = { padding: 10, display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--ac-border)", borderRadius: 11, background: "var(--ac-surface-raised)" };
const groupManagerMetaStyle: CSSProperties = { marginTop: 4, color: "var(--ac-muted)", fontSize: 9 };
const deleteGroupButtonStyle: CSSProperties = { ...shelfActionStyle, color: "#ef4444" };
const emptyGroupManagerStyle: CSSProperties = { padding: 28, textAlign: "center", color: "var(--ac-muted)", fontSize: 11, lineHeight: 1.6 };
const groupManagerFooterStyle: CSSProperties = { padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, borderTop: "1px solid var(--ac-border)", color: "var(--ac-muted)", fontSize: 9 };
