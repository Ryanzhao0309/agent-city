import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { AppThemeMode, CityTimeOfDay } from "../types";
import { useCityStore } from "../store/cityStore";
import { deleteSecret, listSecrets, saveSecret, type SecretStatus } from "../services/secretsService";
import {
  disableDesktopNotifications,
  enableDesktopNotifications,
  getDesktopNotificationState,
  refreshDesktopNotificationPermission,
  sendDesktopTestNotification,
  subscribeDesktopNotificationState,
  type DesktopNotificationState,
} from "../services/desktopNotificationService";
import { ModelManager } from "./ModelManager";

const themeOptions: Array<{ value: AppThemeMode; label: string }> = [
  { value: "system", label: "跟随系统" },
  { value: "dark", label: "深色" },
  { value: "light", label: "浅色" },
];

const timeOptions: Array<{ value: CityTimeOfDay; label: string }> = [
  { value: "auto", label: "自动" },
  { value: "day", label: "白天" },
  { value: "night", label: "黑夜" },
];

const languageOptions = [
  { value: "zh-CN", label: "简体中文" },
  { value: "en-US", label: "English" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
];

const secretSlots = [
  {
    key: "BRAVE_SEARCH_API_KEY",
    name: "Brave Search API",
    hint: "用于新闻、购物和行业检索；未配置时自动降级到 DuckDuckGo HTML 搜索。",
    guideUrl: "https://api.search.brave.com/app/keys",
  },
];

export function SettingsModal() {
  const open = useCityStore((s) => s.settingsOpen);
  const closeSettings = useCityStore((s) => s.closeSettings);
  const saveLayout = useCityStore((s) => s.save);
  const cityName = useCityStore((s) => s.cityName);
  const cityLordName = useCityStore((s) => s.cityLordName);
  const managementLanguage = useCityStore((s) => s.managementLanguage);
  const themeMode = useCityStore((s) => s.themeMode);
  const timeOfDay = useCityStore((s) => s.timeOfDay);
  const showBuildingStatusIndicators = useCityStore((s) => s.showBuildingStatusIndicators);
  const showBuildingLabels = useCityStore((s) => s.showBuildingLabels);
  const allowNpcOffRoad = useCityStore((s) => s.allowNpcOffRoad);
  const ignoreBuildingCollisionForNpc = useCityStore((s) => s.ignoreBuildingCollisionForNpc);
  const setCityName = useCityStore((s) => s.setCityName);
  const setCityLordName = useCityStore((s) => s.setCityLordName);
  const setManagementLanguage = useCityStore((s) => s.setManagementLanguage);
  const setThemeMode = useCityStore((s) => s.setThemeMode);
  const setTimeOfDay = useCityStore((s) => s.setTimeOfDay);
  const setShowBuildingStatusIndicators = useCityStore((s) => s.setShowBuildingStatusIndicators);
  const setShowBuildingLabels = useCityStore((s) => s.setShowBuildingLabels);
  const setNpcMovementOptions = useCityStore((s) => s.setNpcMovementOptions);
  const refreshSecretStatus = useCityStore((s) => s.refreshSecretStatus);
  const [draftCityName, setDraftCityName] = useState(cityName);
  const [draftCityLordName, setDraftCityLordName] = useState(cityLordName);
  const [draftSecrets, setDraftSecrets] = useState<Record<string, string>>({});
  const [secrets, setSecrets] = useState<SecretStatus[]>([]);
  const [status, setStatus] = useState<Record<string, string>>({});
  const [notificationState, setNotificationState] = useState<DesktopNotificationState>(getDesktopNotificationState);
  const [notificationBusy, setNotificationBusy] = useState(false);

  const secretMap = useMemo(
    () => new Map(secrets.map((secret) => [secret.key, secret])),
    [secrets]
  );

  useEffect(() => {
    if (!open) return;
    setDraftCityName(cityName);
    setDraftCityLordName(cityLordName);
    void refreshSecrets();
  }, [open, cityName, cityLordName]);

  useEffect(() => subscribeDesktopNotificationState(setNotificationState), []);

  useEffect(() => {
    if (open) void refreshDesktopNotificationPermission().then(setNotificationState);
  }, [open]);

  if (!open) return null;

  function persist(action: () => void) {
    action();
    window.setTimeout(() => void saveLayout(), 0);
  }

  async function refreshSecrets() {
    setSecrets(await listSecrets());
  }

  async function saveCityBasics() {
    setCityName(draftCityName.trim() || "Agent City");
    setCityLordName(draftCityLordName.trim());
    await saveLayout();
  }

  async function handleSecretSave(key: string) {
    const value = draftSecrets[key]?.trim();
    if (!value) {
      setStatus((current) => ({ ...current, [key]: "请输入新的 API key。" }));
      return;
    }
    try {
      setStatus((current) => ({ ...current, [key]: "saving..." }));
      await saveSecret(key, value);
      setDraftSecrets((current) => ({ ...current, [key]: "" }));
      await refreshSecrets();
      await refreshSecretStatus();
      setStatus((current) => ({ ...current, [key]: "saved" }));
    } catch (error) {
      setStatus((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : "save failed",
      }));
    }
  }

  async function handleSecretDelete(key: string) {
    try {
      setStatus((current) => ({ ...current, [key]: "deleting..." }));
      await deleteSecret(key);
      await refreshSecrets();
      await refreshSecretStatus();
      setStatus((current) => ({ ...current, [key]: "deleted" }));
    } catch (error) {
      setStatus((current) => ({
        ...current,
        [key]: error instanceof Error ? error.message : "delete failed",
      }));
    }
  }

  async function handleNotificationToggle(checked: boolean) {
    setNotificationBusy(true);
    try {
      if (checked) await enableDesktopNotifications();
      else disableDesktopNotifications();
    } finally {
      setNotificationBusy(false);
    }
  }

  async function handleTestNotification() {
    setNotificationBusy(true);
    try {
      await sendDesktopTestNotification();
      setNotificationState((current) => ({ ...current, message: "测试通知已发送" }));
    } catch (error) {
      setNotificationState((current) => ({ ...current, message: error instanceof Error ? error.message : "测试通知发送失败" }));
    } finally {
      setNotificationBusy(false);
    }
  }

  return (
    <div style={backdropStyle} onClick={closeSettings}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>Settings</div>
            <h2 style={titleStyle}>城市显示与行为</h2>
          </div>
          <button style={closeStyle} onClick={closeSettings} aria-label="Close settings">
            ×
          </button>
        </header>

        <main style={contentStyle}>
          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>城市</h3>
            <div style={formGridStyle}>
              <label style={fieldStyle}>
                <span>城市名称</span>
                <input
                  style={inputStyle}
                  value={draftCityName}
                  onChange={(event) => setDraftCityName(event.target.value)}
                  onBlur={() => void saveCityBasics()}
                />
              </label>
              <label style={fieldStyle}>
                <span>Agent 称呼你为</span>
                <input
                  style={inputStyle}
                  value={draftCityLordName}
                  placeholder="例如：城主、老板、队长"
                  onChange={(event) => setDraftCityLordName(event.target.value)}
                  onBlur={() => void saveCityBasics()}
                />
              </label>
              <label style={fieldStyle}>
                <span>管理语言</span>
                <select
                  style={inputStyle}
                  value={managementLanguage}
                  onChange={(event) => persist(() => setManagementLanguage(event.target.value))}
                >
                  {languageOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>主题</h3>
            <Segmented
              value={themeMode}
              options={themeOptions}
              onChange={(value) => persist(() => setThemeMode(value as AppThemeMode))}
            />
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>时间</h3>
            <Segmented
              value={timeOfDay}
              options={timeOptions}
              onChange={(value) => persist(() => setTimeOfDay(value as CityTimeOfDay))}
            />
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>地图显示</h3>
            <SettingToggle
              label="显示红点状态"
              checked={showBuildingStatusIndicators}
              onChange={(checked) => persist(() => setShowBuildingStatusIndicators(checked))}
            />
            <SettingToggle
              label="显示建筑名字"
              checked={showBuildingLabels}
              onChange={(checked) => persist(() => setShowBuildingLabels(checked))}
            />
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>NPC 行走</h3>
            <SettingToggle
              label="允许 NPC 在非地砖上行走"
              checked={allowNpcOffRoad}
              onChange={(checked) => persist(() => setNpcMovementOptions({ allowNpcOffRoad: checked }))}
            />
            <SettingToggle
              label="排除建筑碰撞体积"
              checked={ignoreBuildingCollisionForNpc}
              onChange={(checked) => persist(() => setNpcMovementOptions({ ignoreBuildingCollisionForNpc: checked }))}
            />
          </section>

          <section style={sectionStyle}>
            <div style={notificationHeaderStyle}>
              <div>
                <h3 style={sectionTitleStyle}>桌面通知</h3>
                <p style={notificationHintStyle}>定时任务完成、失败或需要你处理时，通过 macOS 系统通知提醒你。</p>
              </div>
              <span style={{
                ...notificationBadgeStyle,
                color: notificationState.permission === "granted" ? "#047857" : "var(--ac-text-muted)",
                background: notificationState.permission === "granted" ? "#ecfdf5" : "var(--ac-surface-strong)",
              }}>
                {notificationState.permission === "granted" ? "已授权" : notificationState.available ? "未授权" : "仅桌面版"}
              </span>
            </div>
            <label style={{ ...toggleRowStyle, opacity: notificationState.available ? 1 : 0.55 }}>
              <span>推送任务结果与待处理状态</span>
              <input
                type="checkbox"
                checked={notificationState.enabled}
                disabled={!notificationState.available || notificationBusy}
                onChange={(event) => void handleNotificationToggle(event.target.checked)}
                style={checkboxStyle}
              />
            </label>
            <div style={notificationStatusRowStyle}>
              <span style={notificationMessageStyle}>{notificationState.message}</span>
              <button
                style={notificationTestButtonStyle}
                disabled={!notificationState.enabled || notificationState.permission !== "granted" || notificationBusy}
                onClick={() => void handleTestNotification()}
              >
                发送测试通知
              </button>
            </div>
          </section>

          <ModelManager />

          <section className="settings-api-section" style={apiSectionStyle}>
            <div style={apiSectionHeaderStyle}>
              <div>
                <h3 style={{ ...sectionTitleStyle, color: "var(--ac-text)", fontSize: 16 }}>联网搜索密钥</h3>
                <p style={apiSectionHintStyle}>Google 集成与联网搜索密钥只保存在本机 Keychain。</p>
              </div>
              <span style={apiSecurityBadgeStyle}>本机安全存储</span>
            </div>
            <div style={secretsGridStyle}>
              {secretSlots.map((slot) => {
                const configured = secretMap.get(slot.key)?.configured;
                return (
                  <div key={slot.key} className="settings-api-card" style={secretCardStyle}>
                    <div style={secretHeaderStyle}>
                      <div>
                        <div style={secretNameStyle}>{slot.name}</div>
                        <div style={secretKeyStyle}>{slot.key}</div>
                      </div>
                      <span
                        className={`settings-api-status settings-api-status--${configured ? "configured" : "empty"}`}
                        style={configured ? configuredStyle : missingStyle}
                      >
                        {configured ? "configured" : "empty"}
                      </span>
                    </div>
                    <p style={hintStyle}>{slot.hint}</p>
                    <a
                      style={guideLinkStyle}
                      href={slot.guideUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      申请 / 查看 API Key 指引
                    </a>
                    <input
                      className="settings-api-input"
                      style={apiKeyInputStyle}
                      type="password"
                      autoComplete="off"
                      placeholder={configured ? "输入新 key 会覆盖后端密钥" : "粘贴 API key"}
                      value={draftSecrets[slot.key] ?? ""}
                      onChange={(event) =>
                        setDraftSecrets((current) => ({ ...current, [slot.key]: event.target.value }))
                      }
                    />
                    <div style={secretActionsStyle}>
                      <button className="settings-api-save" style={saveSecretBtnStyle} onClick={() => void handleSecretSave(slot.key)}>
                        Save
                      </button>
                      <button className="settings-api-clear" style={clearSecretBtnStyle} onClick={() => void handleSecretDelete(slot.key)}>
                        Clear
                      </button>
                      <span style={statusStyle}>{status[slot.key]}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section style={sectionStyle}>
            <h3 style={sectionTitleStyle}>关于 Agent City</h3>
            <p style={aboutTextStyle}>
              Agent City 是采用 GNU AGPL v3.0 发布的自由开源软件，不提供任何明示或暗示的担保。
            </p>
            <div style={aboutLinksStyle}>
              <a
                style={guideLinkStyle}
                href="https://github.com/Ryanzhao0309/agent-city"
                target="_blank"
                rel="noreferrer"
              >
                查看源代码
              </a>
              <a
                style={guideLinkStyle}
                href="https://github.com/Ryanzhao0309/agent-city/blob/main/LICENSE"
                target="_blank"
                rel="noreferrer"
              >
                GNU AGPL v3.0 许可证
              </a>
            </div>
          </section>
        </main>
      </section>
    </div>
  );
}

function Segmented({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-segmented" style={segmentedStyle}>
      {options.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.value}
            className={`settings-segmented__option${active ? " is-active" : ""}`}
            style={segmentStyle}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SettingToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label style={toggleRowStyle}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} style={checkboxStyle} />
    </label>
  );
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 250000,
  background: "var(--ac-backdrop)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(820px, 94vw)",
  maxHeight: "90vh",
  overflow: "hidden",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  boxShadow: "0 28px 80px rgba(0,0,0,0.55)",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "18px 20px",
  borderBottom: "1px solid var(--ac-border)",
  background: "linear-gradient(180deg, var(--ac-surface-raised), var(--ac-panel))",
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
  fontSize: 22,
  letterSpacing: 0,
};

const closeStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 28,
  lineHeight: 1,
};

const contentStyle: CSSProperties = {
  padding: 18,
  display: "grid",
  gap: 14,
  maxHeight: "calc(90vh - 86px)",
  overflowY: "auto",
};

const sectionStyle: CSSProperties = {
  border: "1px solid var(--ac-border)",
  borderRadius: 8,
  padding: 14,
  background: "var(--ac-glass)",
  display: "grid",
  gap: 10,
};

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: "var(--ac-text-soft)",
};

const segmentedStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 12,
};

const segmentStyle: CSSProperties = {
  minHeight: 48,
  borderRadius: 10,
  fontWeight: 900,
  cursor: "pointer",
  transition: "background .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease, transform .16s ease",
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 16,
  padding: "10px 0",
  color: "var(--ac-text-soft)",
  fontSize: 13,
  fontWeight: 800,
};

const checkboxStyle: CSSProperties = {
  width: 20,
  height: 20,
  accentColor: "#60a5fa",
};

const notificationHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const notificationHintStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "var(--ac-text-muted)",
  fontSize: 12,
  lineHeight: 1.5,
};

const notificationBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  border: "1px solid var(--ac-border)",
  borderRadius: 999,
  padding: "5px 9px",
  fontSize: 10,
  fontWeight: 900,
};

const notificationStatusRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const notificationMessageStyle: CSSProperties = {
  color: "var(--ac-text-muted)",
  fontSize: 11,
  lineHeight: 1.45,
};

const notificationTestButtonStyle: CSSProperties = {
  flex: "0 0 auto",
  minHeight: 34,
  border: "1px solid var(--ac-border)",
  borderRadius: 7,
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  padding: "0 12px",
  fontWeight: 850,
  cursor: "pointer",
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  fontWeight: 900,
};

const inputStyle: CSSProperties = {
  width: "100%",
  minHeight: 38,
  borderRadius: 7,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  padding: "0 10px",
  fontWeight: 750,
};

const secretsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
  gap: 16,
};

const apiSectionStyle: CSSProperties = {
  border: "1px solid var(--ac-border)",
  borderRadius: 16,
  padding: 18,
  background: "var(--ac-surface)",
  display: "grid",
  gap: 16,
  boxShadow: "0 10px 34px rgba(0,0,0,0.18)",
};

const apiSectionHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};

const apiSectionHintStyle: CSSProperties = {
  margin: "5px 0 0",
  color: "var(--ac-muted)",
  fontSize: 11,
  lineHeight: 1.5,
};

const apiSecurityBadgeStyle: CSSProperties = {
  flex: "0 0 auto",
  borderRadius: 999,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  padding: "5px 9px",
  fontSize: 10,
  fontWeight: 900,
};

const secretCardStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  borderRadius: 14,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  padding: 16,
  color: "var(--ac-text)",
  boxShadow: "0 8px 24px rgba(0,0,0,0.2), 0 2px 6px rgba(0,0,0,0.12)",
  transition: "transform .18s ease, box-shadow .18s ease, border-color .18s ease",
};

const secretHeaderStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 10,
};

const secretNameStyle: CSSProperties = {
  color: "var(--ac-text)",
  fontSize: 14,
  fontWeight: 950,
};

const secretKeyStyle: CSSProperties = {
  marginTop: 2,
  color: "var(--ac-muted)",
  fontSize: 10,
  fontWeight: 900,
};

const hintStyle: CSSProperties = {
  margin: 0,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  lineHeight: 1.45,
};

const guideLinkStyle: CSSProperties = {
  justifySelf: "start",
  color: "var(--ac-kicker)",
  fontSize: 12,
  fontWeight: 900,
  textDecoration: "none",
};

const aboutTextStyle: CSSProperties = {
  margin: 0,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  lineHeight: 1.6,
};

const aboutLinksStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 16,
};

const configuredStyle: CSSProperties = {
  alignSelf: "start",
  borderRadius: 999,
  background: "rgba(16,185,129,0.14)",
  color: "#6ee7b7",
  border: "1px solid rgba(52,211,153,0.42)",
  padding: "4px 8px",
  fontSize: 10,
  fontWeight: 950,
};

const missingStyle: CSSProperties = {
  ...configuredStyle,
  background: "var(--ac-control)",
  border: "1px solid var(--ac-border)",
  color: "var(--ac-muted)",
};

const secretActionsStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto auto minmax(0, 1fr)",
  gap: 7,
  alignItems: "center",
};

const apiKeyInputStyle: CSSProperties = {
  ...inputStyle,
  minHeight: 42,
  borderRadius: 9,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  boxShadow: "inset 0 1px 2px rgba(0,0,0,0.2)",
};

const saveSecretBtnStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-control-hover)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontWeight: 900,
  padding: "0 13px",
  boxShadow: "0 4px 10px rgba(15,23,42,0.15)",
};

const clearSecretBtnStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 8,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text-soft)",
  cursor: "pointer",
  fontWeight: 900,
  padding: "0 13px",
};

const statusStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 11,
  overflow: "hidden",
  textOverflow: "ellipsis",
};
