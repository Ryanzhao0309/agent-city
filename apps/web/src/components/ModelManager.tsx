import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { ModelProfile, ModelProfileDraft, ModelProtocol, ModelTemplate } from "../types";
import {
  createModelProfile,
  deleteModelProfile,
  listModelProfiles,
  testModelProfile,
  updateModelProfile,
} from "../services/modelProfileService";

const templateCatalog: Record<ModelTemplate, { label: string; baseUrl: string; protocol: ModelProtocol; legacySecretRef?: string }> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", protocol: "openai-responses", legacySecretRef: "OPENAI_API_KEY" },
  gemini: { label: "Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", protocol: "openai-chat", legacySecretRef: "GEMINI_API_KEY" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com", protocol: "openai-chat", legacySecretRef: "DEEPSEEK_API_KEY" },
  doubao: { label: "豆包", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", protocol: "openai-responses", legacySecretRef: "DOUBAO_API_KEY" },
  custom: { label: "自定义", baseUrl: "", protocol: "openai-chat" },
};

function blankDraft(template: ModelTemplate = "custom"): ModelProfileDraft {
  const preset = templateCatalog[template];
  return {
    name: template === "custom" ? "" : preset.label,
    template,
    protocol: preset.protocol,
    baseUrl: preset.baseUrl,
    model: "",
    apiKey: "",
    temperature: 0.2,
    maxTokens: 8192,
    extraBody: {},
  };
}

function profileDraft(profile: ModelProfile): ModelProfileDraft {
  return {
    name: profile.name, template: profile.template, protocol: profile.protocol,
    baseUrl: profile.baseUrl, model: profile.model, apiKey: "",
    temperature: profile.temperature, maxTokens: profile.maxTokens, extraBody: profile.extraBody,
    enabled: profile.enabled, isDefault: profile.isDefault,
  };
}

const statusText: Record<ModelProfile["validationStatus"], string> = {
  verified: "已验证",
  failed: "验证失败",
  unverified: "未验证",
};

export function ModelManager() {
  const [profiles, setProfiles] = useState<ModelProfile[]>([]);
  const [legacySecretRefs, setLegacySecretRefs] = useState<string[]>([]);
  const [editing, setEditing] = useState<ModelProfile | null | undefined>(undefined);
  const [draft, setDraft] = useState<ModelProfileDraft>(blankDraft());
  const [extraBodyText, setExtraBodyText] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh() {
    const result = await listModelProfiles();
    setProfiles(result.profiles);
    setLegacySecretRefs(result.legacySecretRefs);
  }

  useEffect(() => { void refresh().catch((error) => setMessage(error instanceof Error ? error.message : "模型列表加载失败。")); }, []);

  const endpoint = useMemo(() => {
    const base = draft.baseUrl.trim().replace(/\/+$/, "");
    if (!base) return "请填写 Base URL";
    if (/\/(responses|chat\/completions)$/i.test(base)) return base;
    return `${base}${draft.protocol === "openai-chat" ? "/chat/completions" : "/responses"}`;
  }, [draft.baseUrl, draft.protocol]);

  function startCreate(template: ModelTemplate) {
    const next = blankDraft(template);
    const legacy = templateCatalog[template].legacySecretRef;
    if (legacy && legacySecretRefs.includes(legacy)) next.legacySecretRef = legacy;
    setEditing(null);
    setDraft(next);
    setExtraBodyText("{}");
    setMessage("");
  }

  function startEdit(profile: ModelProfile) {
    setEditing(profile);
    setDraft(profileDraft(profile));
    setExtraBodyText(JSON.stringify(profile.extraBody, null, 2));
    setMessage("");
  }

  async function save(testAfter = false) {
    setBusy(true);
    setMessage(testAfter ? "正在保存并测试，测试会发送两次最小模型请求…" : "正在保存草稿…");
    try {
      let extraBody: Record<string, unknown>;
      try {
        const parsed = JSON.parse(extraBodyText);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
        extraBody = parsed;
      } catch { throw new Error("额外请求参数必须是有效的 JSON 对象。"); }
      const payload = { ...draft, extraBody };
      let saved = editing
        ? await updateModelProfile(editing.id, payload)
        : await createModelProfile(payload);
      if (testAfter) saved = await testModelProfile(saved.id);
      await refresh();
      setEditing(saved);
      setDraft(profileDraft(saved));
      setExtraBodyText(JSON.stringify(saved.extraBody, null, 2));
      setMessage(testAfter ? "连接和 Function Calling 校验通过。" : "已保存为草稿。验证通过后才可启用。 ");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模型保存失败。");
      await refresh().catch(() => undefined);
    } finally { setBusy(false); }
  }

  async function setEnabled(profile: ModelProfile, enabled: boolean) {
    setBusy(true);
    try {
      await updateModelProfile(profile.id, { enabled, isDefault: enabled ? profile.isDefault : false });
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "模型状态更新失败。"); }
    finally { setBusy(false); }
  }

  async function setDefault(profile: ModelProfile) {
    setBusy(true);
    try { await updateModelProfile(profile.id, { enabled: true, isDefault: true }); await refresh(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "默认模型设置失败。"); }
    finally { setBusy(false); }
  }

  async function remove(profile: ModelProfile) {
    if (!window.confirm(`删除模型“${profile.name}”？对应的专用 Keychain 密钥也会清除。`)) return;
    setBusy(true);
    try { await deleteModelProfile(profile.id); await refresh(); setEditing(undefined); setMessage("模型已删除。"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "模型删除失败。"); }
    finally { setBusy(false); }
  }

  return (
    <section style={sectionStyle}>
      <div style={headerStyle}>
        <div>
          <h3 style={titleStyle}>模型管理</h3>
          <p style={hintStyle}>模型连接只配置一次。通过连接与工具调用校验后，才能分配给城市 Agent。</p>
        </div>
        <button style={primaryButtonStyle} onClick={() => startCreate("custom")}>添加自定义模型</button>
      </div>

      <div style={templateRowStyle}>
        {(Object.keys(templateCatalog) as ModelTemplate[]).filter((item) => item !== "custom").map((template) => (
          <button key={template} style={templateButtonStyle} onClick={() => startCreate(template)}>
            添加 {templateCatalog[template].label}
          </button>
        ))}
      </div>

      {profiles.length === 0 ? (
        <div style={emptyStyle}>还没有模型。选择上方模板或添加自定义模型。</div>
      ) : (
        <div style={cardGridStyle}>
          {profiles.map((profile) => (
            <article key={profile.id} style={{ ...cardStyle, opacity: profile.enabled ? 1 : 0.78 }}>
              <div style={cardHeaderStyle}>
                <div>
                  <strong style={cardNameStyle}>{profile.name}</strong>
                  <div style={metaStyle}>{templateCatalog[profile.template].label} · {profile.protocol === "openai-chat" ? "Chat" : "Responses"}</div>
                </div>
                <span style={{ ...badgeStyle, ...statusBadgeStyle(profile.validationStatus) }}>{statusText[profile.validationStatus]}</span>
              </div>
              <div style={modelIdStyle}>{profile.model}</div>
              <div style={metaStyle}>{profile.assignedAgentCount} 个 Agent 使用{profile.isDefault ? " · 默认模型" : ""}</div>
              {profile.validationError && <div style={errorStyle}>{profile.validationError}</div>}
              <div style={actionRowStyle}>
                <button style={secondaryButtonStyle} onClick={() => startEdit(profile)}>编辑</button>
                <button style={secondaryButtonStyle} disabled={busy} onClick={() => void testModelProfile(profile.id).then(refresh).catch((error) => { setMessage(error.message); void refresh(); })}>测试</button>
                <button style={secondaryButtonStyle} disabled={busy || profile.validationStatus !== "verified"} onClick={() => void setEnabled(profile, !profile.enabled)}>{profile.enabled ? "停用" : "启用"}</button>
                <button style={secondaryButtonStyle} disabled={busy || !profile.enabled || profile.validationStatus !== "verified" || profile.isDefault} onClick={() => void setDefault(profile)}>设为默认</button>
                <button style={dangerButtonStyle} disabled={busy || profile.assignedAgentCount > 0} onClick={() => void remove(profile)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      )}

      {editing !== undefined && createPortal((
        <div style={formOverlayStyle} onClick={() => setEditing(undefined)}>
          <div style={formStyle} onClick={(event) => event.stopPropagation()}>
            <div style={formHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>{editing ? "编辑模型" : "新建模型"}</div>
                <h3 style={formTitleStyle}>{draft.name || "未命名模型"}</h3>
              </div>
              <button aria-label="关闭模型表单" style={closeButtonStyle} onClick={() => setEditing(undefined)}>关闭</button>
            </div>
            <div style={formGridStyle}>
              <Field label="名称"><input style={inputStyle} value={draft.name} placeholder="例如 豆包 2.0 Lite" onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
              <Field label="Provider">
                <select style={inputStyle} value={draft.template} onChange={(e) => {
                  const template = e.target.value as ModelTemplate;
                  const preset = templateCatalog[template];
                  setDraft({ ...draft, template, baseUrl: preset.baseUrl || draft.baseUrl, protocol: preset.protocol });
                }}>
                  {(Object.keys(templateCatalog) as ModelTemplate[]).map((template) => <option key={template} value={template}>{templateCatalog[template].label}</option>)}
                </select>
              </Field>
              <Field label="Base URL"><input style={inputStyle} value={draft.baseUrl} placeholder="https://api.example.com/v1" onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} /></Field>
              <Field label="Model ID"><input style={inputStyle} value={draft.model} placeholder="复制服务商提供的准确模型 ID" onChange={(e) => setDraft({ ...draft, model: e.target.value })} /></Field>
              <Field label="接口协议">
                <select style={inputStyle} value={draft.protocol} onChange={(e) => setDraft({ ...draft, protocol: e.target.value as ModelProtocol })}>
                  <option value="openai-chat">OpenAI Chat Completions</option>
                  <option value="openai-responses">OpenAI Responses</option>
                </select>
              </Field>
              <Field label="API Key">
                <input style={inputStyle} type="password" autoComplete="off" value={draft.apiKey ?? ""} placeholder={editing?.hasApiKey ? "留空则保留当前密钥" : "粘贴 API Key"} onChange={(e) => setDraft({ ...draft, apiKey: e.target.value, legacySecretRef: undefined })} />
                {!editing && draft.legacySecretRef && <div style={legacyHintStyle}>已检测到旧版安全密钥；API Key 留空时将安全复用。</div>}
              </Field>
              <Field label="Temperature"><input style={inputStyle} type="number" min={0} max={2} step={0.1} value={draft.temperature ?? ""} onChange={(e) => setDraft({ ...draft, temperature: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
              <Field label="Max Tokens"><input style={inputStyle} type="number" min={1} value={draft.maxTokens ?? ""} onChange={(e) => setDraft({ ...draft, maxTokens: e.target.value === "" ? null : Number(e.target.value) })} /></Field>
            </div>
            <div style={endpointStyle}><span>最终请求地址</span><code>{endpoint}</code></div>
            <Field label="额外请求参数（extra_body JSON）"><textarea style={textareaStyle} rows={7} value={extraBodyText} onChange={(e) => setExtraBodyText(e.target.value)} /></Field>
            <div style={footerStyle}>
              <span style={messageStyle}>{message}</span>
              <button style={secondaryButtonStyle} disabled={busy} onClick={() => void save(false)}>保存草稿</button>
              <button style={primaryButtonStyle} disabled={busy} onClick={() => void save(true)}>保存并测试</button>
            </div>
          </div>
        </div>
      ), document.body)}
      {editing === undefined && message && <div style={globalMessageStyle}>{message}</div>}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label style={fieldStyle}><span style={labelStyle}>{label}</span>{children}</label>;
}

function statusBadgeStyle(status: ModelProfile["validationStatus"]): CSSProperties {
  if (status === "verified") return { color: "#34d399", borderColor: "rgba(52,211,153,.35)", background: "rgba(16,185,129,.10)" };
  if (status === "failed") return { color: "#fca5a5", borderColor: "rgba(248,113,113,.35)", background: "rgba(239,68,68,.10)" };
  return { color: "var(--ac-muted)", borderColor: "var(--ac-border)", background: "var(--ac-surface-raised)" };
}

const sectionStyle: CSSProperties = { border: "1px solid var(--ac-border)", borderRadius: 12, padding: 16, background: "var(--ac-surface)" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start" };
const titleStyle: CSSProperties = { margin: 0, fontSize: 16, color: "var(--ac-text)" };
const hintStyle: CSSProperties = { margin: "5px 0 0", color: "var(--ac-muted)", fontSize: 12, lineHeight: 1.5 };
const templateRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, marginTop: 14 };
const templateButtonStyle: CSSProperties = { padding: "8px 11px", borderRadius: 8, border: "1px solid var(--ac-border)", background: "var(--ac-surface-raised)", color: "var(--ac-text)", cursor: "pointer", fontWeight: 700 };
const primaryButtonStyle: CSSProperties = { padding: "9px 14px", borderRadius: 9, border: "1px solid rgba(96,165,250,.5)", background: "#2563eb", color: "white", cursor: "pointer", fontWeight: 800 };
const secondaryButtonStyle: CSSProperties = { padding: "7px 10px", borderRadius: 7, border: "1px solid var(--ac-border)", background: "var(--ac-surface-raised)", color: "var(--ac-text)", cursor: "pointer", fontWeight: 700 };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: "#fca5a5" };
const cardGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginTop: 14 };
const cardStyle: CSSProperties = { padding: 13, borderRadius: 10, border: "1px solid var(--ac-border)", background: "var(--ac-surface-raised)" };
const cardHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 };
const cardNameStyle: CSSProperties = { color: "var(--ac-text)", fontSize: 14 };
const metaStyle: CSSProperties = { color: "var(--ac-muted)", fontSize: 11, marginTop: 4 };
const modelIdStyle: CSSProperties = { color: "var(--ac-accent-text)", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12, marginTop: 12, overflowWrap: "anywhere" };
const badgeStyle: CSSProperties = { border: "1px solid", borderRadius: 999, padding: "4px 8px", fontSize: 10, fontWeight: 800, whiteSpace: "nowrap" };
const errorStyle: CSSProperties = { color: "#fca5a5", background: "rgba(239,68,68,.08)", padding: 8, borderRadius: 7, marginTop: 9, fontSize: 11, overflowWrap: "anywhere" };
const actionRowStyle: CSSProperties = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 };
const emptyStyle: CSSProperties = { padding: 28, textAlign: "center", color: "var(--ac-muted)", border: "1px dashed var(--ac-border)", borderRadius: 10, marginTop: 14 };
const formOverlayStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 300000, display: "grid", placeItems: "center", padding: 28, background: "rgba(3,7,18,.72)", backdropFilter: "blur(8px)" };
const formStyle: CSSProperties = { width: "min(920px, calc(100vw - 40px))", maxHeight: "calc(100vh - 50px)", overflowY: "auto", padding: 24, borderRadius: 18, border: "1px solid var(--ac-border)", background: "var(--ac-surface)", boxShadow: "0 30px 90px rgba(0,0,0,.45)" };
const formHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 };
const eyebrowStyle: CSSProperties = { color: "var(--ac-accent-text)", fontSize: 11, fontWeight: 900, textTransform: "uppercase", letterSpacing: ".12em" };
const formTitleStyle: CSSProperties = { margin: "5px 0 0", color: "var(--ac-text)", fontSize: 21 };
const closeButtonStyle: CSSProperties = { ...secondaryButtonStyle, padding: "7px 11px" };
const formGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "14px 18px" };
const fieldStyle: CSSProperties = { display: "grid", gap: 7, minWidth: 0 };
const labelStyle: CSSProperties = { color: "var(--ac-text)", fontSize: 12, fontWeight: 800 };
const inputStyle: CSSProperties = { width: "100%", boxSizing: "border-box", padding: "11px 12px", borderRadius: 9, border: "1px solid var(--ac-border)", background: "var(--ac-surface-raised)", color: "var(--ac-text)", outline: "none" };
const textareaStyle: CSSProperties = { ...inputStyle, resize: "vertical", marginTop: 0, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", lineHeight: 1.5 };
const endpointStyle: CSSProperties = { display: "grid", gap: 5, margin: "14px 0", padding: 11, borderRadius: 9, background: "rgba(96,165,250,.08)", color: "var(--ac-muted)", fontSize: 11 };
const footerStyle: CSSProperties = { position: "sticky", bottom: -24, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 9, margin: "18px -24px -24px", padding: "14px 24px", flexWrap: "wrap", background: "var(--ac-surface)", borderTop: "1px solid var(--ac-border)" };
const messageStyle: CSSProperties = { marginRight: "auto", color: "var(--ac-muted)", fontSize: 11, maxWidth: 480 };
const globalMessageStyle: CSSProperties = { marginTop: 10, color: "var(--ac-muted)", fontSize: 11 };
const legacyHintStyle: CSSProperties = { color: "#34d399", fontSize: 10, marginTop: 2 };
