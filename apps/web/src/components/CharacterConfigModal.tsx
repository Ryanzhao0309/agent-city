import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { createDefaultCharacterConfig, getCharacterById } from "../data/npcCatalog";
import { useCityStore } from "../store/cityStore";
import { getCharacterDisplayName } from "../utils/agentStatus";
import type { CharacterCoreFiles, ModelProviderType } from "../types";
import { openExternalUrl, selectWorkingDirectory } from "../services/desktopService";
import {
  disconnectGoogle,
  getGoogleStatus,
  startGoogleOAuth,
  type GoogleConnectionStatus,
} from "../services/agentRunService";
import { SkillIcon } from "./SkillIcon";
import { listAgentKnowledgeDocuments, type KnowledgeDocument } from "../services/knowledgeLibraryService";

const providerOptions: { value: ModelProviderType; label: string }[] = [
  { value: "openai-compatible", label: "OpenAI Compatible" },
  { value: "gemini", label: "Gemini" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "kimi", label: "Kimi" },
  { value: "doubao", label: "豆包" },
  { value: "qwen", label: "通义千问" },
  { value: "local", label: "Local" },
  { value: "custom", label: "Custom" },
];

const providerCatalog: Record<
  ModelProviderType,
  {
    baseUrl: string;
    apiKeyRef: string;
    models: string[];
  }
> = {
  deepseek: {
    baseUrl: "https://api.deepseek.com",
    apiKeyRef: "DEEPSEEK_API_KEY",
    models: ["deepseek-chat", "deepseek-reasoner"],
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKeyRef: "GEMINI_API_KEY",
    models: ["gemini-3.5-flash", "gemini-3.5-pro", "gemini-2.5-flash"],
  },
  kimi: {
    baseUrl: "https://api.moonshot.cn/v1",
    apiKeyRef: "KIMI_API_KEY",
    models: ["kimi-k2-0711-preview", "moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k"],
  },
  doubao: {
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    apiKeyRef: "DOUBAO_API_KEY",
    models: ["doubao-seed-1-6-250615", "doubao-seed-1-6-thinking-250615", "doubao-1-5-pro-32k-250115"],
  },
  qwen: {
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    apiKeyRef: "QWEN_API_KEY",
    models: ["qwen-plus", "qwen-turbo", "qwen-max", "qwen3-max"],
  },
  "openai-compatible": {
    baseUrl: "https://api.openai.com/v1",
    apiKeyRef: "OPENAI_API_KEY",
    models: ["gpt-5", "gpt-5-mini", "gpt-5-nano"],
  },
  local: {
    baseUrl: "http://localhost:11434/v1",
    apiKeyRef: "",
    models: ["llama3.1", "qwen2.5", "mistral"],
  },
  custom: {
    baseUrl: "",
    apiKeyRef: "OPENAI_API_KEY",
    models: [],
  },
};

const coreFileLabels: { key: keyof CharacterCoreFiles; label: string; rows: number }[] = [
  { key: "user", label: "user.md", rows: 4 },
  { key: "identity", label: "identity.md", rows: 4 },
  { key: "agent", label: "agent.md", rows: 5 },
  { key: "memory", label: "memory.md", rows: 4 },
  { key: "tools", label: "tools.md", rows: 4 },
];

export function CharacterConfigModal() {
  const characterId = useCityStore((s) => s.characterConfigCharacterId);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const configs = useCityStore((s) => s.characterConfigs);
  const closeCharacterConfig = useCityStore((s) => s.closeCharacterConfig);
  const updateCharacterBrain = useCityStore((s) => s.updateCharacterBrain);
  const updateCharacterPermissions = useCityStore((s) => s.updateCharacterPermissions);
  const updateCharacterDisplayName = useCityStore((s) => s.updateCharacterDisplayName);
  const updateCharacterCoreFile = useCityStore((s) => s.updateCharacterCoreFile);
  const updateCharacterSkillEnabled = useCityStore((s) => s.updateCharacterSkillEnabled);
  const resetCharacterConfig = useCityStore((s) => s.resetCharacterConfig);
  const [permissionStatus, setPermissionStatus] = useState("");
  const [googleStatus, setGoogleStatus] = useState<GoogleConnectionStatus | null>(null);
  const [knowledgeDocuments, setKnowledgeDocuments] = useState<KnowledgeDocument[]>([]);

  useEffect(() => {
    let active = true;
    getGoogleStatus().then((status) => { if (active) setGoogleStatus(status); }).catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    if (!characterId) {
      setKnowledgeDocuments([]);
      return () => { active = false; };
    }
    listAgentKnowledgeDocuments(characterId)
      .then((documents) => { if (active) setKnowledgeDocuments(documents); })
      .catch(() => { if (active) setKnowledgeDocuments([]); });
    return () => { active = false; };
  }, [characterId]);

  if (!characterId) return null;

  const character = getCharacterById(characterId, customCharacters);
  if (!character) return null;
  const activeCharacter = character;

  const config = configs[characterId] ?? createDefaultCharacterConfig(activeCharacter);
  const displayName = getCharacterDisplayName(activeCharacter, config);
  const providerConfig = providerCatalog[config.brain.provider];
  const modelOptions = providerConfig.models;
  const showCustomConnection =
    config.brain.provider === "custom" || config.brain.provider === "local";

  function handleProviderChange(provider: ModelProviderType) {
    const nextProvider = providerCatalog[provider];
    updateCharacterBrain(activeCharacter.id, {
      provider,
      baseUrl: nextProvider.baseUrl,
      apiKeyRef: nextProvider.apiKeyRef,
      model: nextProvider.models[0] ?? "",
    });
  }

  async function chooseWorkingDirectory() {
    try {
      const selected = await selectWorkingDirectory();
      if (!selected) return;
      updateCharacterPermissions(activeCharacter.id, {
        workspaceRoot: selected,
        workspace: config.permissions?.workspace === "none" ? "read" : config.permissions?.workspace ?? "read",
      });
      setPermissionStatus("工作文件夹已授权给这个 Agent。");
    } catch (error) {
      setPermissionStatus(error instanceof Error ? error.message : "工作文件夹选择失败。");
    }
  }

  async function connectGoogle() {
    try {
      const url = await startGoogleOAuth(["gmail", "calendar"]);
      await openExternalUrl(url);
      setPermissionStatus("请在浏览器完成 Google 授权，完成后返回这里刷新状态。");
    } catch (error) {
      setPermissionStatus(error instanceof Error ? error.message : "Google 授权启动失败。");
    }
  }

  async function refreshGoogle() {
    try { setGoogleStatus(await getGoogleStatus()); }
    catch (error) { setPermissionStatus(error instanceof Error ? error.message : "Google 状态刷新失败。"); }
  }

  return (
    <div style={backdropStyle} onClick={closeCharacterConfig}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ ...portraitStyle, borderColor: `${activeCharacter.accent}88` }}>
              <img src={activeCharacter.spriteUrl} alt={activeCharacter.name} draggable={false} style={portraitImgStyle} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>AI Brain</div>
              <h2 style={titleStyle}>{displayName}</h2>
              <div style={roleStyle}>{activeCharacter.role}</div>
            </div>
          </div>
          <button style={closeStyle} onClick={closeCharacterConfig} aria-label="Close AI brain config">
            ×
          </button>
        </header>

        <div style={contentStyle}>
          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>Model Brain</h3>
              <label style={toggleStyle}>
                <input
                  type="checkbox"
                  checked={config.brain.enabled}
                  onChange={(event) => updateCharacterBrain(activeCharacter.id, { enabled: event.target.checked })}
                />
                Enabled
              </label>
            </div>

            <div style={formGridStyle}>
              <Field label="Agent 名称">
                <input
                  style={inputStyle}
                  value={displayName}
                  placeholder={activeCharacter.name}
                  onChange={(event) => updateCharacterDisplayName(activeCharacter.id, event.target.value)}
                />
              </Field>
              <Field label="Provider">
                <select
                  style={inputStyle}
                  value={config.brain.provider}
                  onChange={(event) => handleProviderChange(event.target.value as ModelProviderType)}
                >
                  {providerOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Model">
                {modelOptions.length > 0 ? (
                  <select
                    style={inputStyle}
                    value={modelOptions.includes(config.brain.model) ? config.brain.model : modelOptions[0]}
                    onChange={(event) => updateCharacterBrain(activeCharacter.id, { model: event.target.value })}
                  >
                    {modelOptions.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    value={config.brain.model}
                    placeholder="model name"
                    onChange={(event) => updateCharacterBrain(activeCharacter.id, { model: event.target.value })}
                  />
                )}
              </Field>
              <Field label="Secret">
                <div style={readOnlyPillStyle}>
                  {providerConfig.apiKeyRef ? `${providerConfig.apiKeyRef} from Settings` : "No API key required"}
                </div>
              </Field>
              {showCustomConnection && (
                <>
                  <Field label="Base URL">
                    <input
                      style={inputStyle}
                      value={config.brain.baseUrl}
                      placeholder="https://your-compatible-api/v1"
                      onChange={(event) => updateCharacterBrain(activeCharacter.id, { baseUrl: event.target.value })}
                    />
                  </Field>
                  <Field label="Secret Key Name">
                    <input
                      style={inputStyle}
                      value={config.brain.apiKeyRef}
                      placeholder="OPENAI_API_KEY"
                      onChange={(event) => updateCharacterBrain(activeCharacter.id, { apiKeyRef: event.target.value })}
                    />
                  </Field>
                </>
              )}
              <Field label={`Creativity / Temperature: ${config.brain.temperature.toFixed(1)}`}>
                <input
                  style={rangeStyle}
                  type="range"
                  min={0}
                  max={1.5}
                  step={0.1}
                  value={config.brain.temperature}
                  onChange={(event) =>
                    updateCharacterBrain(activeCharacter.id, {
                      temperature: Number(event.target.value),
                    })
                  }
                />
                <div style={rangeHintStyle}>
                  低：稳定执行；高：更发散、更有创意。城市 Agent 通常用 0.3-0.8。
                </div>
              </Field>
            </div>
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>办公权限</h3>
              <span style={permissionPillStyle}>按风险审批</span>
            </div>

            <div style={workspacePickerStyle}>
              <div style={{ minWidth: 0 }}>
                <div style={fileLabelStyle}>本地工作文件夹</div>
                <div style={workspacePathStyle}>{config.workspaceRoot || "尚未选择"}</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                {config.workspaceRoot && (
                  <button
                    style={secondaryBtnStyle}
                    onClick={() => updateCharacterPermissions(activeCharacter.id, { workspaceRoot: "", workspace: "none" })}
                  >
                    撤销
                  </button>
                )}
                <button style={smallPrimaryBtnStyle} onClick={() => void chooseWorkingDirectory()}>选择文件夹</button>
              </div>
            </div>

            <div style={permissionGridStyle}>
              <Field label="本地文件">
                <select
                  style={inputStyle}
                  value={config.permissions?.workspace ?? "none"}
                  disabled={!config.workspaceRoot}
                  onChange={(event) => updateCharacterPermissions(activeCharacter.id, { workspace: event.target.value as "none" | "read" | "write-with-approval" })}
                >
                  <option value="none">不允许</option>
                  <option value="read">只读</option>
                  <option value="write-with-approval">读写，写入需审批</option>
                </select>
              </Field>
              <Field label="Gmail">
                <select
                  style={inputStyle}
                  value={config.permissions?.gmail ?? "none"}
                  disabled={!googleStatus?.gmail}
                  onChange={(event) => updateCharacterPermissions(activeCharacter.id, { gmail: event.target.value as "none" | "read" | "draft" })}
                >
                  <option value="none">不允许</option>
                  <option value="read">读取与搜索</option>
                  <option value="draft" disabled={!googleStatus?.gmailDraft}>读取与草稿，发送需审批</option>
                </select>
              </Field>
              <Field label="Google Calendar">
                <select
                  style={inputStyle}
                  value={config.permissions?.calendar ?? "none"}
                  disabled={!googleStatus?.calendar}
                  onChange={(event) => updateCharacterPermissions(activeCharacter.id, { calendar: event.target.value as "none" | "read" | "write-with-approval" })}
                >
                  <option value="none">不允许</option>
                  <option value="read">只读</option>
                  <option value="write-with-approval">读写，变更需审批</option>
                </select>
              </Field>
              <Field label="网页资料">
                <select
                  style={inputStyle}
                  value={config.permissions?.web ?? "none"}
                  onChange={(event) => updateCharacterPermissions(activeCharacter.id, { web: event.target.value as "none" | "read" })}
                >
                  <option value="none">不允许</option>
                  <option value="read">只读搜索与提取</option>
                </select>
              </Field>
              <Field label="城市数据">
                <select
                  style={inputStyle}
                  value={config.permissions?.cityData ?? "none"}
                  onChange={(event) => updateCharacterPermissions(activeCharacter.id, { cityData: event.target.value as "none" | "read" | "write-with-approval" })}
                >
                  <option value="none">不允许</option>
                  <option value="read">只读</option>
                  <option value="write-with-approval">读写，变更需审批</option>
                </select>
              </Field>
            </div>

            <div style={googleConnectionStyle}>
              <div>
                <strong>Google 连接</strong>
                <div style={rangeHintStyle}>
                  {googleStatus?.connected ? `${googleStatus.email || "Google 账号"} · Gmail ${googleStatus.gmail ? (googleStatus.gmailDraft ? "读取与草稿" : "只读") : "未授权"} · Calendar ${googleStatus.calendar ? "已授权" : "未授权"}` : googleStatus?.configured ? "OAuth 已配置，尚未连接账号" : "先在 Settings 配置 Google OAuth Client ID"}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button style={secondaryBtnStyle} onClick={() => void refreshGoogle()}>刷新</button>
                {googleStatus?.connected ? (
                  <button
                    style={secondaryBtnStyle}
                    onClick={() => void disconnectGoogle().then(refreshGoogle).catch((error) => setPermissionStatus(error.message))}
                  >
                    断开
                  </button>
                ) : (
                  <button style={smallPrimaryBtnStyle} onClick={() => void connectGoogle()}>连接 Google</button>
                )}
              </div>
            </div>
            {permissionStatus && <div style={permissionStatusStyle}>{permissionStatus}</div>}
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>已掌握知识</h3>
              <span style={permissionPillStyle}>{knowledgeDocuments.length} 份 Markdown 文档</span>
            </div>
            {knowledgeDocuments.length ? (
              <div style={knowledgeGridStyle}>
                {knowledgeDocuments.map((document) => (
                  <div key={document.id} style={knowledgeRowStyle}>
                    <div style={knowledgeMarkStyle}>MD</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={skillNameStyle}>{document.title}</div>
                      <div style={skillSummaryStyle}>{document.fileName}</div>
                    </div>
                    <span style={knowledgeReadyStyle}>工作时自动读取</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={emptySkillsStyle}>尚未分配公共知识。可在市政大厅的城市知识库中，为这个 Agent 选择需要掌握的文档。</div>
            )}
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>已学会技能</h3>
              <span style={permissionPillStyle}>
                {config.workspaceRoot ? `工作目录：${config.permissions?.workspace === "write-with-approval" ? "审批写入" : "只读"}` : "工作目录：无"}
              </span>
            </div>
            {config.learnedSkills?.length ? (
              <div style={skillsGridStyle}>
                {config.learnedSkills.map((skill) => {
                  const enabled = config.skillEnabledById?.[skill.id] ?? true;
                  return (
                    <div key={skill.id} style={skillRowStyle}>
                      <div style={skillIconStyle}><SkillIcon icon={skill.icon} /></div>
                      <div style={{ minWidth: 0 }}>
                        <div style={skillNameStyle}>{skill.name}</div>
                        <div style={skillSummaryStyle}>{skill.summary}</div>
                        <div style={skillSourceStyle}>{skill.sourceUrl}</div>
                        {skill.valid === false && <div style={{ ...skillSourceStyle, color: "#fca5a5" }}>已安全禁用：{skill.disabledReason || "无效技能内容"}</div>}
                      </div>
                      <label style={skillSwitchStyle}>
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(event) =>
                            updateCharacterSkillEnabled(activeCharacter.id, skill.id, event.target.checked)
                          }
                        />
                        {enabled ? "On" : "Off"}
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={emptySkillsStyle}>还没有学会技能。去技能大厅粘贴 URL 后，可以选择这个 Agent 来学习。</div>
            )}
          </section>

          <section style={sectionStyle}>
            <div style={sectionHeaderStyle}>
              <h3 style={sectionTitleStyle}>Core Files</h3>
              <button style={resetStyle} onClick={() => resetCharacterConfig(activeCharacter.id)}>
                Reset
              </button>
            </div>
            <div style={filesGridStyle}>
              {coreFileLabels.map((file) => (
                <label key={file.key} style={fileStyle}>
                  <span style={fileLabelStyle}>{file.label}</span>
                  <textarea
                    style={textareaStyle}
                    rows={file.rows}
                    value={config.files[file.key]}
                    onChange={(event) => updateCharacterCoreFile(activeCharacter.id, file.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={fieldStyle}>
      <span style={fileLabelStyle}>{label}</span>
      {children}
    </label>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 260000,
  background: "var(--ac-backdrop)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(980px, 96vw)",
  maxHeight: "90vh",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 28px 90px rgba(0,0,0,0.58)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  padding: "16px 18px 12px",
  borderBottom: "1px solid var(--ac-border)",
  background: "linear-gradient(180deg, var(--ac-surface-raised), var(--ac-panel))",
};

const portraitStyle: CSSProperties = {
  width: 48,
  height: 54,
  borderRadius: 6,
  border: "1px solid",
  background: "var(--ac-border)",
  overflow: "hidden",
  flexShrink: 0,
};

const portraitImgStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "contain",
  objectPosition: "center bottom",
  imageRendering: "pixelated",
};

const eyebrowStyle: CSSProperties = {
  fontSize: 11,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#9bd3ff",
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 22,
  letterSpacing: 0,
};

const roleStyle: CSSProperties = {
  marginTop: 2,
  color: "var(--ac-muted)",
  fontSize: 12,
};

const closeStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 24,
  lineHeight: "28px",
};

const contentStyle: CSSProperties = {
  padding: 16,
  overflowY: "auto",
  display: "grid",
  gap: 14,
};

const sectionStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
  padding: 12,
};

const sectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  marginBottom: 10,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  letterSpacing: 0,
};

const permissionPillStyle: CSSProperties = {
  borderRadius: 999,
  border: "1px solid rgba(96,165,250,0.28)",
  background: "rgba(96,165,250,0.12)",
  color: "var(--ac-accent-text)",
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 900,
};

const workspacePickerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 10,
  marginBottom: 10,
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface)",
};

const workspacePathStyle: CSSProperties = {
  marginTop: 5,
  color: "var(--ac-text-soft)",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const permissionGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 9,
};

const googleConnectionStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 10,
  padding: 10,
  borderRadius: 6,
  background: "var(--ac-glass)",
  border: "1px solid var(--ac-border)",
};

const secondaryBtnStyle: CSSProperties = {
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-text-soft)",
  padding: "8px 10px",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const permissionStatusStyle: CSSProperties = {
  marginTop: 9,
  color: "var(--ac-accent-text)",
  fontSize: 11,
};

const skillsGridStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const skillRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 9,
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-raised)",
  padding: 9,
};

const skillIconStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 7,
  display: "grid",
  placeItems: "center",
  background: "rgba(96,165,250,0.14)",
  border: "1px solid rgba(96,165,250,0.24)",
  fontSize: 18,
};

const skillNameStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 13,
  fontWeight: 950,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const skillSummaryStyle: CSSProperties = {
  marginTop: 2,
  color: "var(--ac-text-soft)",
  fontSize: 11,
  lineHeight: 1.35,
};

const skillSourceStyle: CSSProperties = {
  marginTop: 3,
  color: "#64748b",
  fontSize: 9,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const skillSwitchStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  color: "var(--ac-text-soft)",
  fontSize: 11,
  fontWeight: 900,
};

const emptySkillsStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed var(--ac-border)",
  color: "var(--ac-muted)",
  background: "var(--ac-glass)",
  padding: 12,
  fontSize: 12,
};

const smallPrimaryBtnStyle: CSSProperties = {
  borderRadius: 6,
  border: "none",
  background: "#60a5fa",
  color: "var(--ac-field)",
  padding: "0 12px",
  fontSize: 12,
  fontWeight: 950,
  cursor: "pointer",
};

const toggleStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  fontWeight: 900,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  minWidth: 0,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid var(--ac-control-hover)",
  background: "var(--ac-surface)",
  color: "var(--ac-text)",
  padding: "7px 8px",
  fontSize: 12,
};

const readOnlyPillStyle: CSSProperties = {
  minHeight: 34,
  display: "flex",
  alignItems: "center",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid rgba(96,165,250,0.26)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-accent-text)",
  padding: "7px 8px",
  fontSize: 12,
  fontWeight: 900,
};

const rangeStyle: CSSProperties = {
  width: "100%",
  accentColor: "#60a5fa",
};

const rangeHintStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 10,
  lineHeight: 1.35,
};

const filesGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 10,
};

const fileStyle: CSSProperties = {
  display: "grid",
  gap: 5,
};

const fileLabelStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--ac-muted)",
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 0.6,
};

const textareaStyle: CSSProperties = {
  width: "100%",
  minHeight: 96,
  resize: "vertical",
  boxSizing: "border-box",
  borderRadius: 6,
  border: "1px solid var(--ac-control-hover)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text-soft)",
  padding: 8,
  fontSize: 12,
  lineHeight: 1.45,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
};

const knowledgeGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 8,
};

const knowledgeRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "38px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 10,
  padding: 10,
  border: "1px solid var(--ac-border)",
  borderRadius: 8,
  background: "var(--ac-surface-strong)",
};

const knowledgeMarkStyle: CSSProperties = {
  width: 34,
  height: 34,
  display: "grid",
  placeItems: "center",
  borderRadius: 7,
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  fontSize: 9,
  fontWeight: 950,
};

const knowledgeReadyStyle: CSSProperties = {
  padding: "4px 7px",
  borderRadius: 99,
  background: "rgba(74, 222, 128, .12)",
  color: "#4ade80",
  fontSize: 9,
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const resetStyle: CSSProperties = {
  padding: "6px 10px",
  borderRadius: 6,
  border: "1px solid rgba(248,113,113,0.36)",
  background: "#2e1f1f",
  color: "#fecaca",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};
