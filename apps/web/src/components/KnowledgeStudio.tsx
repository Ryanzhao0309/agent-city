import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getAllCharacters } from "../data/npcCatalog";
import {
  assignKnowledgeDocument,
  createKnowledgeDocument,
  deleteKnowledgeDocument,
  listKnowledgeDocuments,
  saveKnowledgeDocument,
  type KnowledgeDocument,
} from "../services/knowledgeLibraryService";
import { useCityStore } from "../store/cityStore";
import { getCharacterDisplayName } from "../utils/agentStatus";
import { MarkdownMessage } from "./MarkdownMessage";

function emptyDraft() {
  return { title: "", fileName: "", content: "" };
}

export function KnowledgeStudio() {
  const customCharacters = useCityStore((state) => state.customCharacters);
  const characterConfigs = useCityStore((state) => state.characterConfigs);
  const characters = useMemo(() => getAllCharacters(customCharacters), [customCharacters]);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [assignedAgentIds, setAssignedAgentIds] = useState<string[]>([]);
  const [status, setStatus] = useState("正在读取知识库…");
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selected = documents.find((document) => document.id === selectedId) ?? null;

  useEffect(() => {
    let cancelled = false;
    listKnowledgeDocuments()
      .then((items) => {
        if (cancelled) return;
        setDocuments(items);
        if (items[0]) selectDocument(items[0]);
        else setStatus("还没有知识文档。新建或导入一个 Markdown 文件，建立城市的第一份共识。");
      })
      .catch((error) => !cancelled && setStatus(error instanceof Error ? error.message : "知识库读取失败。"));
    return () => { cancelled = true; };
  }, []);

  function selectDocument(document: KnowledgeDocument) {
    setSelectedId(document.id);
    setDraft({ title: document.title, fileName: document.fileName, content: document.content });
    setAssignedAgentIds(document.agentIds);
    setSettingsOpen(false);
    setStatus("");
  }

  function startNewDocument() {
    setSelectedId(null);
    setDraft({ title: "未命名知识", fileName: "untitled.md", content: "# 未命名知识\n\n在这里记录团队需要共同掌握的事实、原则与方法。\n" });
    setAssignedAgentIds([]);
    setSettingsOpen(false);
    setMode("edit");
    setStatus("");
  }

  async function save() {
    if (!draft.title.trim() || !draft.fileName.trim()) {
      setStatus("请填写文档标题和文件名。");
      return;
    }
    setBusy(true);
    try {
      const saved = selectedId
        ? await saveKnowledgeDocument(selectedId, draft)
        : await createKnowledgeDocument({ ...draft, agentIds: assignedAgentIds });
      setDocuments((current) => [saved, ...current.filter((document) => document.id !== saved.id)]);
      selectDocument(saved);
      setStatus("已保存并更新 Agent 知识索引。");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setBusy(false);
    }
  }

  async function saveAssignments() {
    if (!selectedId) {
      setSettingsOpen(false);
      setStatus("分配将在文档首次保存时生效。");
      return;
    }
    setBusy(true);
    try {
      const updated = await assignKnowledgeDocument(selectedId, assignedAgentIds);
      setDocuments((current) => current.map((document) => document.id === updated.id ? updated : document));
      setSettingsOpen(false);
      setStatus(`已让 ${updated.agentIds.length} 个 Agent 掌握这份知识。`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "知识分配失败。");
    } finally {
      setBusy(false);
    }
  }

  async function removeSelected() {
    if (!selectedId || !window.confirm("确定删除这份知识文档吗？所有 Agent 将不再掌握它。")) return;
    setBusy(true);
    try {
      await deleteKnowledgeDocument(selectedId);
      const remaining = documents.filter((document) => document.id !== selectedId);
      setDocuments(remaining);
      if (remaining[0]) selectDocument(remaining[0]);
      else {
        setSelectedId(null);
        setDraft(emptyDraft());
        setStatus("知识文档已删除。");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "删除失败。");
    } finally {
      setBusy(false);
    }
  }

  async function importMarkdown(file: File) {
    if (!file.name.toLowerCase().endsWith(".md")) {
      setStatus("目前仅支持导入 .md 文件。");
      return;
    }
    const content = await file.text();
    const firstHeading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
    setSelectedId(null);
    setDraft({ title: firstHeading || file.name.replace(/\.md$/i, ""), fileName: file.name, content });
    setAssignedAgentIds([]);
    setSettingsOpen(false);
    setMode("edit");
    setStatus("文档已载入，保存后进入知识库。");
  }

  function toggleAgent(agentId: string) {
    setAssignedAgentIds((current) => current.includes(agentId)
      ? current.filter((id) => id !== agentId)
      : [...current, agentId]);
  }

  return (
    <section style={studioStyle} aria-label="城市知识库">
      <aside style={libraryStyle}>
        <div style={libraryHeaderStyle}>
          <div>
            <div style={kickerStyle}>知识档案</div>
            <h3 style={panelTitleStyle}>文档库</h3>
          </div>
          <span style={countStyle}>{documents.length}</span>
        </div>
        <div style={libraryActionsStyle}>
          <button style={primaryButtonStyle} onClick={startNewDocument}>新建文档</button>
          <button style={secondaryButtonStyle} onClick={() => fileInputRef.current?.click()}>导入 MD</button>
          <input ref={fileInputRef} type="file" accept=".md,text/markdown" hidden onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void importMarkdown(file);
            event.currentTarget.value = "";
          }} />
        </div>
        <div style={documentListStyle}>
          {documents.map((document) => (
            <div key={document.id} style={{ ...documentRowStyle, ...(document.id === selectedId ? selectedDocumentStyle : {}) }}>
              <button style={documentSelectStyle} onClick={() => selectDocument(document)}>
                <strong style={documentTitleStyle}>{document.title}</strong>
                <span style={documentMetaStyle}>{document.fileName} · {document.agentIds.length} 个 Agent</span>
              </button>
              <button style={settingsButtonStyle} aria-label={`设置 ${document.title}`} onClick={() => {
                selectDocument(document);
                setSettingsOpen(true);
              }}>设置</button>
            </div>
          ))}
        </div>
        <div style={libraryFooterStyle}>文档只会提供给已分配的 Agent，并在工作时自动检索。</div>
      </aside>

      <main style={editorShellStyle}>
        {draft.fileName ? (
          <>
            <header style={editorHeaderStyle}>
              <div style={titleFieldsStyle}>
                <input aria-label="文档标题" style={titleInputStyle} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
                <input aria-label="Markdown 文件名" style={fileNameInputStyle} value={draft.fileName} onChange={(event) => setDraft({ ...draft, fileName: event.target.value })} />
              </div>
              <div style={editorActionsStyle}>
                <div style={modeTabsStyle}>
                  <button style={{ ...modeButtonStyle, ...(mode === "edit" ? activeModeStyle : {}) }} onClick={() => setMode("edit")}>编辑</button>
                  <button style={{ ...modeButtonStyle, ...(mode === "preview" ? activeModeStyle : {}) }} onClick={() => setMode("preview")}>预览</button>
                </div>
                <button style={secondaryButtonStyle} onClick={() => setSettingsOpen(true)}>掌握设置</button>
                {selected && <button style={dangerButtonStyle} onClick={() => void removeSelected()}>删除</button>}
                <button style={primaryButtonStyle} disabled={busy} onClick={() => void save()}>{busy ? "保存中…" : "保存文档"}</button>
              </div>
            </header>
            <div style={masteryBarStyle}>
              <span>已掌握：</span>
              {assignedAgentIds.length ? characters.filter((character) => assignedAgentIds.includes(character.id)).map((character) => (
                <span key={character.id} style={agentPillStyle}>{getCharacterDisplayName(character, characterConfigs[character.id])}</span>
              )) : <span style={mutedStyle}>尚未分配 Agent</span>}
            </div>
            {mode === "edit" ? (
              <textarea aria-label="Markdown 内容" spellCheck={false} style={markdownEditorStyle} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
            ) : (
              <div style={previewStyle}><MarkdownMessage text={draft.content} /></div>
            )}
            {status && <div style={statusStyle}>{status}</div>}
          </>
        ) : (
          <div style={emptyStyle}>
            <h3 style={emptyTitleStyle}>建立城市的共同知识</h3>
            <p style={emptyCopyStyle}>新建或导入 Markdown 文档，再决定哪些 Agent 需要掌握它。</p>
            <button style={primaryButtonStyle} onClick={startNewDocument}>新建第一份文档</button>
            {status && <div style={statusStyle}>{status}</div>}
          </div>
        )}
      </main>

      {settingsOpen && (
        <aside style={settingsPanelStyle} aria-label="文档掌握设置">
          <div style={settingsHeaderStyle}>
            <div>
              <div style={kickerStyle}>文档设置</div>
              <h3 style={panelTitleStyle}>谁掌握这份知识</h3>
            </div>
            <button style={closeSettingsStyle} onClick={() => setSettingsOpen(false)}>关闭</button>
          </div>
          <p style={settingsHintStyle}>选中的 Agent 会在每次工作时检索这份文档，并把相关内容作为基础知识。</p>
          <div style={agentListStyle}>
            {characters.map((character) => {
              const checked = assignedAgentIds.includes(character.id);
              return (
                <label key={character.id} style={{ ...agentRowStyle, ...(checked ? selectedAgentRowStyle : {}) }}>
                  <input type="checkbox" checked={checked} onChange={() => toggleAgent(character.id)} />
                  <img src={character.spriteUrl} alt="" style={agentAvatarStyle} />
                  <span style={{ minWidth: 0 }}>
                    <strong style={agentNameStyle}>{getCharacterDisplayName(character, characterConfigs[character.id])}</strong>
                    <small style={agentRoleStyle}>{character.role}</small>
                  </span>
                </label>
              );
            })}
          </div>
          <div style={settingsFooterStyle}>
            <button style={secondaryButtonStyle} onClick={() => setAssignedAgentIds(characters.map((character) => character.id))}>全部选择</button>
            <button style={primaryButtonStyle} disabled={busy} onClick={() => void saveAssignments()}>确认分配</button>
          </div>
        </aside>
      )}
    </section>
  );
}

const studioStyle: CSSProperties = { height: "100%", minHeight: 0, display: "flex", position: "relative", overflow: "hidden", border: "1px solid var(--ac-border)", borderRadius: 16, background: "var(--ac-surface)" };
const libraryStyle: CSSProperties = { width: 300, flexShrink: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--ac-border)", background: "var(--ac-surface-strong)" };
const libraryHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 20px 12px" };
const kickerStyle: CSSProperties = { color: "var(--ac-accent-text)", fontSize: 11, fontWeight: 900, letterSpacing: 1 };
const panelTitleStyle: CSSProperties = { margin: "3px 0 0", fontSize: 18 };
const countStyle: CSSProperties = { width: 30, height: 30, display: "grid", placeItems: "center", borderRadius: 15, background: "var(--ac-selected)", color: "var(--ac-accent-text)", fontWeight: 900 };
const libraryActionsStyle: CSSProperties = { display: "flex", gap: 8, padding: "0 14px 14px" };
const primaryButtonStyle: CSSProperties = { minHeight: 36, padding: "0 14px", border: "1px solid var(--ac-selected-border)", borderRadius: 9, background: "#3b82f6", color: "white", fontWeight: 850, cursor: "pointer" };
const secondaryButtonStyle: CSSProperties = { minHeight: 36, padding: "0 12px", border: "1px solid var(--ac-border)", borderRadius: 9, background: "var(--ac-field)", color: "var(--ac-text-soft)", fontWeight: 800, cursor: "pointer" };
const dangerButtonStyle: CSSProperties = { ...secondaryButtonStyle, color: "#ef4444" };
const documentListStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", padding: "0 10px" };
const documentRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 4, border: "1px solid transparent", borderRadius: 10, marginBottom: 6 };
const selectedDocumentStyle: CSSProperties = { background: "var(--ac-selected)", borderColor: "var(--ac-selected-border)" };
const documentSelectStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4, padding: "11px 8px 11px 12px", border: 0, background: "transparent", color: "var(--ac-text)", textAlign: "left", cursor: "pointer" };
const documentTitleStyle: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 };
const documentMetaStyle: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ac-muted)", fontSize: 10 };
const settingsButtonStyle: CSSProperties = { marginRight: 7, padding: "5px 7px", border: "1px solid var(--ac-border)", borderRadius: 7, background: "var(--ac-field)", color: "var(--ac-muted)", cursor: "pointer", fontSize: 10 };
const libraryFooterStyle: CSSProperties = { padding: 14, borderTop: "1px solid var(--ac-border)", color: "var(--ac-muted)", fontSize: 10, lineHeight: 1.5 };
const editorShellStyle: CSSProperties = { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", background: "var(--ac-surface)" };
const editorHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 16px", borderBottom: "1px solid var(--ac-border)" };
const titleFieldsStyle: CSSProperties = { flex: 1, minWidth: 180, display: "flex", flexDirection: "column", gap: 3 };
const titleInputStyle: CSSProperties = { border: 0, outline: 0, background: "transparent", color: "var(--ac-text)", fontSize: 18, fontWeight: 900 };
const fileNameInputStyle: CSSProperties = { border: 0, outline: 0, background: "transparent", color: "var(--ac-muted)", fontSize: 11 };
const editorActionsStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" };
const modeTabsStyle: CSSProperties = { display: "flex", padding: 3, borderRadius: 9, background: "var(--ac-field)" };
const modeButtonStyle: CSSProperties = { padding: "6px 10px", border: 0, borderRadius: 7, background: "transparent", color: "var(--ac-muted)", cursor: "pointer", fontWeight: 800 };
const activeModeStyle: CSSProperties = { background: "var(--ac-surface-strong)", color: "var(--ac-text)", boxShadow: "0 1px 4px rgba(0,0,0,.15)" };
const masteryBarStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, minHeight: 42, padding: "7px 16px", borderBottom: "1px solid var(--ac-border)", color: "var(--ac-muted)", fontSize: 11, flexWrap: "wrap" };
const agentPillStyle: CSSProperties = { padding: "4px 8px", borderRadius: 99, background: "var(--ac-selected)", color: "var(--ac-accent-text)", fontWeight: 800 };
const mutedStyle: CSSProperties = { color: "var(--ac-muted)" };
const markdownEditorStyle: CSSProperties = { flex: 1, width: "100%", minHeight: 0, resize: "none", boxSizing: "border-box", padding: "22px 26px", border: 0, outline: 0, background: "transparent", color: "var(--ac-text-soft)", font: "13px/1.75 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" };
const previewStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 30px", color: "var(--ac-text-soft)" };
const statusStyle: CSSProperties = { padding: "8px 16px", borderTop: "1px solid var(--ac-border)", color: "var(--ac-muted)", fontSize: 11 };
const emptyStyle: CSSProperties = { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 30 };
const emptyTitleStyle: CSSProperties = { margin: 0, fontSize: 20 };
const emptyCopyStyle: CSSProperties = { maxWidth: 390, color: "var(--ac-muted)", lineHeight: 1.7 };
const settingsPanelStyle: CSSProperties = { position: "absolute", inset: "0 0 0 auto", width: "min(380px, 92%)", display: "flex", flexDirection: "column", zIndex: 4, background: "var(--ac-panel)", borderLeft: "1px solid var(--ac-border)", boxShadow: "-18px 0 50px rgba(0,0,0,.24)" };
const settingsHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: 18, borderBottom: "1px solid var(--ac-border)" };
const closeSettingsStyle: CSSProperties = { border: 0, background: "transparent", color: "var(--ac-muted)", cursor: "pointer", fontWeight: 800 };
const settingsHintStyle: CSSProperties = { margin: 0, padding: "14px 18px", color: "var(--ac-muted)", fontSize: 11, lineHeight: 1.6 };
const agentListStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", padding: "0 12px 12px" };
const agentRowStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", marginBottom: 6, border: "1px solid var(--ac-border)", borderRadius: 10, cursor: "pointer" };
const selectedAgentRowStyle: CSSProperties = { borderColor: "var(--ac-selected-border)", background: "var(--ac-selected)" };
const agentAvatarStyle: CSSProperties = { width: 32, height: 38, objectFit: "contain", objectPosition: "center bottom", imageRendering: "pixelated" };
const agentNameStyle: CSSProperties = { display: "block", color: "var(--ac-text)", fontSize: 12 };
const agentRoleStyle: CSSProperties = { display: "block", marginTop: 2, color: "var(--ac-muted)", fontSize: 10 };
const settingsFooterStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, padding: 14, borderTop: "1px solid var(--ac-border)" };
