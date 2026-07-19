import { useEffect, useState, type CSSProperties } from "react";
import type { AgentMemory } from "../types";
import { deleteAgentMemory, getAutomaticMemoryEnabled, listAgentMemories, reindexAgentKnowledge, setAutomaticMemoryEnabled } from "../services/agentContextService";

export function AgentContextPanel({ agentId, onClose }: { agentId: string; onClose: () => void }) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [autoMemory, setAutoMemory] = useState(true);

  async function refresh() { setMemories(await listAgentMemories(agentId)); }
  useEffect(() => {
    void Promise.all([refresh(), getAutomaticMemoryEnabled(agentId).then(setAutoMemory)]).catch((error) => setStatus(error instanceof Error ? error.message : "记忆读取失败。"));
  }, [agentId]);

  async function reindex() {
    setBusy(true);
    try { const result = await reindexAgentKnowledge(agentId); setStatus(`档案索引完成：更新 ${result.indexed} 个，跳过 ${result.skipped} 个${result.errors.length ? `，失败 ${result.errors.length} 个` : ""}。`); }
    catch (error) { setStatus(error instanceof Error ? error.message : "索引失败。"); }
    finally { setBusy(false); }
  }

  return <div style={backdropStyle} onClick={onClose}>
    <section data-ui-surface="sidebar" style={panelStyle} onClick={(event) => event.stopPropagation()}>
      <header style={headerStyle}><div><strong>记忆与档案</strong><div style={mutedStyle}>长期记忆由对话自动沉淀；性格、身份和行为规则由 AI Brain 中的 Markdown 设置</div></div><button style={closeStyle} onClick={onClose} aria-label="关闭员工上下文" title="关闭">×</button></header>
      <div style={toolbarStyle}><button style={primaryStyle} disabled={busy} onClick={() => void reindex()}>重建档案索引</button><label style={{ ...mutedStyle, display: "flex", gap: 5, alignItems: "center" }}><input type="checkbox" checked={autoMemory} onChange={(event) => { const enabled = event.target.checked; setAutoMemory(enabled); void setAutomaticMemoryEnabled(agentId, enabled); }} />自动沉淀记忆</label><span style={mutedStyle}>文件内容被视为不可信证据，不能改变员工权限。</span></div>
      <div style={memoryNoticeStyle}>这里不再手工定义员工性格，也不手工填写类型和 key。系统只展示模型从对话中识别出的稳定用户信息；不正确的记忆可以删除。</div>
      {status && <div style={statusStyle}>{status}</div>}
      <div style={listStyle}>{memories.length ? memories.map((memory) => <article key={memory.id} style={memoryStyle}>
        <div style={memoryMetaStyle}><span>{memory.kind} / {memory.key}</span><button style={deleteStyle} onClick={() => void deleteAgentMemory(agentId, memory.id).then(refresh)}>删除</button></div>
        <div style={memoryContentStyle}>{memory.content}</div>
      </article>) : <div style={mutedStyle}>还没有服务端长期记忆。</div>}</div>
    </section>
  </div>;
}

const backdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 460000, display: "grid", placeItems: "center", padding: 18, background: "rgba(3,7,18,.76)" };
const panelStyle: CSSProperties = { width: "min(720px,94vw)", maxHeight: "86vh", overflow: "auto", borderRadius: 9, border: "1px solid var(--ac-border)", background: "var(--ac-surface)", color: "var(--ac-text)", padding: 16, boxShadow: "0 28px 90px rgba(0,0,0,.65)" };
const headerStyle: CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start", marginBottom: 12 };
const closeStyle: CSSProperties = { width: 38, height: 38, flex: "0 0 auto", display: "grid", placeItems: "center", borderRadius: 10, border: "1px solid rgba(15,23,42,0.16)", background: "#fff", color: "#111827", boxShadow: "0 4px 12px rgba(15,23,42,0.12)", fontSize: 24, fontWeight: 500, lineHeight: 1, cursor: "pointer" };
const mutedStyle: CSSProperties = { color: "var(--ac-muted)", fontSize: 10, marginTop: 3 };
const toolbarStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: 10, borderRadius: 7, background: "var(--ac-surface-raised)", marginBottom: 10 };
const primaryStyle: CSSProperties = { justifySelf: "start", border: 0, borderRadius: 6, background: "#3b82f6", color: "white", padding: "8px 11px", fontWeight: 800, cursor: "pointer" };
const statusStyle: CSSProperties = { margin: "10px 0", color: "var(--ac-accent-text)", fontSize: 11 };
const listStyle: CSSProperties = { display: "grid", gap: 8, marginTop: 10 };
const memoryStyle: CSSProperties = { padding: 9, borderRadius: 7, background: "var(--ac-surface-raised)", border: "1px solid var(--ac-border)" };
const memoryMetaStyle: CSSProperties = { display: "flex", justifyContent: "space-between", color: "var(--ac-accent-text)", fontSize: 10, fontWeight: 800, marginBottom: 6 };
const deleteStyle: CSSProperties = { border: 0, background: "transparent", color: "#fca5a5", cursor: "pointer", fontSize: 10 };
const memoryNoticeStyle: CSSProperties = { padding: 10, borderRadius: 7, border: "1px solid var(--ac-border)", background: "var(--ac-glass)", color: "var(--ac-muted)", fontSize: 10, lineHeight: 1.55 };
const memoryContentStyle: CSSProperties = { minHeight: 38, padding: "8px 9px", borderRadius: 6, background: "var(--ac-field)", color: "var(--ac-text-soft)", fontSize: 11, lineHeight: 1.5, whiteSpace: "pre-wrap" };
