import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { getCharacterById } from "../data/npcCatalog";
import { useCityStore } from "../store/cityStore";
import { getCharacterDisplayName } from "../utils/agentStatus";
import {
  deleteWorkspaceFile,
  exportTextToWorkspace,
  listWorkspaceFiles,
  uploadWorkspaceFile,
  workspaceDownloadUrl,
  workspacePreviewUrl,
  type WorkspaceFile,
} from "../services/workspaceService";
import { MarkdownMessage } from "./MarkdownMessage";
import { AgentTaskCenter } from "./AgentTaskCenter";
import { AgentContextPanel } from "./AgentContextPanel";
import { cancelAgentRun, getAgentRun as fetchAgentRun, resolveAgentApproval } from "../services/agentRunService";
import type { AgentApproval, AgentRunEvent, ChatAttachment } from "../types";

interface PendingChatAttachment {
  id: string;
  file: File;
  previewUrl?: string;
}

const CHAT_ATTACHMENT_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.tsv,.json,.jsonl,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.sql,.log,.yaml,.yml,.pdf,.docx,.xlsx";
const CHAT_ATTACHMENT_EXTENSIONS = new Set(CHAT_ATTACHMENT_ACCEPT.split(","));
const MAX_CHAT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_CHAT_ATTACHMENTS = 5;

export function CharacterChatModal() {
  const characterId = useCityStore((s) => s.characterChatCharacterId);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const configs = useCityStore((s) => s.characterConfigs);
  const chatSessions = useCityStore((s) => s.characterChatSessions);
  const activeSessionIds = useCityStore((s) => s.activeCharacterChatSessionIds);
  const chatStatus = useCityStore((s) => s.chatStatus);
  const chatError = useCityStore((s) => s.chatError);
  const closeCharacterChat = useCityStore((s) => s.closeCharacterChat);
  const openCharacterConfig = useCityStore((s) => s.openCharacterConfig);
  const createCharacterChatSession = useCityStore((s) => s.createCharacterChatSession);
  const selectCharacterChatSession = useCityStore((s) => s.selectCharacterChatSession);
  const toggleCharacterChatSessionPinned = useCityStore((s) => s.toggleCharacterChatSessionPinned);
  const deleteCharacterChatSession = useCityStore((s) => s.deleteCharacterChatSession);
  const sendCharacterChatMessage = useCityStore((s) => s.sendCharacterChatMessage);
  const markCharacterChatRunCancelled = useCityStore((s) => s.markCharacterChatRunCancelled);
  const syncScheduledChatMessages = useCityStore((s) => s.syncScheduledChatMessages);
  const [draft, setDraft] = useState("");
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceStatus, setWorkspaceStatus] = useState("");
  const [taskCenterOpen, setTaskCenterOpen] = useState(false);
  const [contextPanelOpen, setContextPanelOpen] = useState(false);
  const [stoppingRunId, setStoppingRunId] = useState<string | null>(null);
  const [stopError, setStopError] = useState("");
  const [inlineApprovalRunId, setInlineApprovalRunId] = useState<string | null>(null);
  const [inlineApprovals, setInlineApprovals] = useState<AgentApproval[]>([]);
  const [approvalBusyId, setApprovalBusyId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingChatAttachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [attachmentError, setAttachmentError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<PendingChatAttachment[]>([]);

  const character = getCharacterById(characterId, customCharacters);
  const config = characterId ? configs[characterId] : null;
  const sessions = characterId ? chatSessions[characterId] ?? [] : [];
  const activeSessionId = characterId ? activeSessionIds[characterId] : null;
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? sessions[0];
  const sortedSessions = useMemo(
    () =>
      [...sessions].sort((a, b) => {
        if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
        return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
      }),
    [sessions]
  );
  const messages = activeSession?.messages ?? [];
  const activeRunMessage = [...messages].reverse().find((message) =>
    message.role === "assistant" &&
    Boolean(message.runId) &&
    ["queued", "running", "waiting_approval", "waiting_user"].includes(message.status ?? "")
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, chatStatus]);

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;
    listWorkspaceFiles(characterId)
      .then((files) => {
        if (!cancelled) setWorkspaceFiles(files);
      })
      .catch((error) => {
        if (!cancelled) setWorkspaceStatus(error instanceof Error ? error.message : "工作区读取失败。");
      });
    return () => {
      cancelled = true;
    };
  }, [characterId]);

  useEffect(() => {
    if (!characterId) return;
    void syncScheduledChatMessages(characterId).catch(() => undefined);
    const timer = window.setInterval(() => void syncScheduledChatMessages(characterId).catch(() => undefined), 15_000);
    return () => window.clearInterval(timer);
  }, [characterId, syncScheduledChatMessages]);

  useEffect(() => {
    const runId = activeRunMessage?.runId;
    if (!runId) return;
    let disposed = false;
    void fetchAgentRun(runId)
      .then(({ run, approvals }) => {
        if (!disposed && run.status === "cancelled") markCharacterChatRunCancelled(run.id);
        if (!disposed) {
          setInlineApprovalRunId(runId);
          setInlineApprovals(approvals.filter((approval) => approval.status === "pending"));
        }
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [activeRunMessage?.runId, activeRunMessage?.status, markCharacterChatRunCancelled]);

  if (!characterId || !character) return null;
  const activeCharacter = character;
  const displayName = getCharacterDisplayName(activeCharacter, config ?? undefined);

  async function submitDraft() {
    if ((!draft.trim() && !pendingAttachments.length) || chatStatus === "sending" || attachmentBusy) return;
    const next = draft;
    const queuedAttachments = [...pendingAttachments];
    setAttachmentBusy(true);
    setAttachmentError("");
    try {
      const uploaded = await Promise.all(queuedAttachments.map(async (attachment): Promise<ChatAttachment> => {
        const workspaceFile = await uploadWorkspaceFile(activeCharacter.id, attachment.file);
        return {
          id: attachment.id,
          name: attachment.file.name,
          fileName: workspaceFile.name,
          mimeType: attachment.file.type || mimeTypeFromName(attachment.file.name),
          size: attachment.file.size,
          kind: attachment.file.type.startsWith("image/") ? "image" : "file",
        };
      }));
      setDraft("");
      setPendingAttachments([]);
      queuedAttachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      const sendPromise = sendCharacterChatMessage(activeCharacter.id, next, uploaded);
      setAttachmentBusy(false);
      await sendPromise;
      await refreshWorkspace().catch(() => undefined);
    } catch (error) {
      setAttachmentError(error instanceof Error ? error.message : "附件上传失败。");
      setAttachmentBusy(false);
    }
  }

  function addChatAttachments(files: FileList | null) {
    if (!files?.length) return;
    const candidates = Array.from(files);
    const invalid = candidates.find((file) => !CHAT_ATTACHMENT_EXTENSIONS.has(fileExtension(file.name)));
    if (invalid) {
      setAttachmentError(`暂不支持 ${invalid.name}。可发送图片、文本、PDF、DOCX 和 XLSX。`);
      return;
    }
    const oversized = candidates.find((file) => file.size > MAX_CHAT_ATTACHMENT_BYTES);
    if (oversized) {
      setAttachmentError(`${oversized.name} 超过 5 MB。`);
      return;
    }
    if (pendingAttachments.length + candidates.length > MAX_CHAT_ATTACHMENTS) {
      setAttachmentError(`每条消息最多添加 ${MAX_CHAT_ATTACHMENTS} 个附件。`);
      return;
    }
    setAttachmentError("");
    setPendingAttachments((current) => [...current, ...candidates.map((file) => ({
      id: `attachment-${Date.now()}-${crypto.randomUUID()}`,
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
    }))]);
  }

  function removePendingAttachment(id: string) {
    setPendingAttachments((current) => {
      const removed = current.find((attachment) => attachment.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return current.filter((attachment) => attachment.id !== id);
    });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    await submitDraft();
  }

  async function stopCurrentRun() {
    if (!activeRunMessage?.runId || stoppingRunId) return;
    setStoppingRunId(activeRunMessage.runId);
    setStopError("");
    try {
      const run = await cancelAgentRun(activeRunMessage.runId);
      if (run.status === "cancelled") markCharacterChatRunCancelled(run.id);
    } catch (error) {
      setStopError(error instanceof Error ? error.message : "终止当前任务失败。");
    } finally {
      setStoppingRunId(null);
    }
  }

  async function decideInlineApproval(approval: AgentApproval, decision: "approved" | "denied") {
    if (approvalBusyId) return;
    setApprovalBusyId(approval.id);
    setApprovalError("");
    try {
      await resolveAgentApproval(approval.id, decision);
      setInlineApprovals((current) => current.filter((item) => item.id !== approval.id));
    } catch (error) {
      setApprovalError(error instanceof Error ? error.message : "审批失败。");
    } finally {
      setApprovalBusyId(null);
    }
  }

  async function refreshWorkspace() {
    setWorkspaceFiles(await listWorkspaceFiles(activeCharacter.id));
  }

  async function handleFileUpload(file: File | null | undefined) {
    if (!file) return;
    try {
      setWorkspaceStatus(`正在上传 ${file.name}...`);
      await uploadWorkspaceFile(activeCharacter.id, file);
      await refreshWorkspace();
      setWorkspaceStatus(`${file.name} 已进入 ${displayName} 的工作区。`);
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "上传失败。");
    }
  }

  async function exportChat() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const body = [
      `# ${displayName} 对话导出`,
      "",
      ...messages.map((message) => `## ${message.role === "user" ? "你" : displayName}\n\n${message.content}`),
      "",
    ].join("\n");
    try {
      setWorkspaceStatus("正在导出聊天...");
      await exportTextToWorkspace(activeCharacter.id, `chat-${stamp}.md`, body);
      await refreshWorkspace();
      setWorkspaceStatus("聊天已导出到工作区。");
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "导出失败。");
    }
  }

  async function removeWorkspaceFile(fileName: string) {
    const approved = window.confirm(`删除 ${fileName}？`);
    if (!approved) return;
    try {
      setWorkspaceStatus(`正在删除 ${fileName}...`);
      const files = await deleteWorkspaceFile(activeCharacter.id, fileName);
      setWorkspaceFiles(files);
      setWorkspaceStatus(`${fileName} 已删除。`);
    } catch (error) {
      setWorkspaceStatus(error instanceof Error ? error.message : "删除失败。");
    }
  }

  async function removeChatSession(sessionId: string, title: string) {
    if (!window.confirm(`删除对话「${title || "新对话"}」及其中全部消息？此操作无法撤销。`)) return;
    try {
      await deleteCharacterChatSession(activeCharacter.id, sessionId);
    } catch (error) {
      useCityStore.setState({ chatError: error instanceof Error ? error.message : "会话删除失败。" });
    }
  }

  const brainLabel = config?.brain.enabled
    ? config.brain.modelProfileId ? "全局模型已连接" : "待选择模型"
    : "AI Brain 未启用";

  return (
    <>
    <div style={backdropStyle} onClick={closeCharacterChat}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
            <div style={{ ...portraitStyle, borderColor: `${activeCharacter.accent}88` }}>
              <img src={activeCharacter.spriteUrl} alt={activeCharacter.name} draggable={false} style={portraitImgStyle} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={eyebrowStyle}>Agent 对话</div>
              <h2 style={titleStyle}>{displayName}</h2>
              <div style={brainStyle}>{brainLabel}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button style={configBtnStyle} onClick={() => setContextPanelOpen(true)}>
              记忆与档案
            </button>
            <button style={configBtnStyle} onClick={() => setTaskCenterOpen(true)}>
              任务中心
            </button>
            <button style={configBtnStyle} onClick={() => openCharacterConfig(activeCharacter.id)}>
              AI Brain
            </button>
            <button style={closeStyle} onClick={closeCharacterChat} aria-label="关闭 Agent 对话">
              ×
            </button>
          </div>
        </header>

        <div style={chatShellStyle}>
          <aside data-ui-surface="sidebar" style={sidebarStyle}>
            <div style={sidebarHeaderStyle}>
              <span>对话</span>
              <button style={newChatStyle} onClick={() => createCharacterChatSession(activeCharacter.id)}>
                +
              </button>
            </div>
            <div style={sessionListStyle}>
              {sortedSessions.map((session) => (
                <div
                  key={session.id}
                  style={{
                    ...sessionItemStyle,
                    borderColor:
                      session.id === activeSession?.id ? "var(--ac-selected-border)" : "var(--ac-border)",
                    background: session.id === activeSession?.id ? "var(--ac-selected)" : "var(--ac-field)",
                  }}
                >
                  <button
                    style={sessionContentButtonStyle}
                    onClick={() => selectCharacterChatSession(activeCharacter.id, session.id)}
                    title={`${session.title || "新对话"} · ${formatChatSessionTime(session.updatedAt || session.createdAt)}`}
                  >
                    <span style={sessionTitleStyle}>{session.title || "新对话"}</span>
                    <span style={sessionMetaStyle}>
                      {formatChatSessionTime(session.updatedAt || session.createdAt)} · {session.messages.length} 条消息
                    </span>
                  </button>
                  <button
                    style={{
                      ...pinButtonStyle,
                      color: session.pinned ? "var(--ac-kicker)" : "var(--ac-muted)",
                      borderColor: session.pinned ? "rgba(253,230,138,0.45)" : "var(--ac-border)",
                      background: session.pinned ? "rgba(253,230,138,0.12)" : "var(--ac-glass)",
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleCharacterChatSessionPinned(activeCharacter.id, session.id);
                    }}
                    aria-label={session.pinned ? "取消置顶这个对话" : "置顶这个对话"}
                    title={session.pinned ? "取消置顶" : "置顶"}
                  >
                    {session.pinned ? "📌" : "📍"}
                  </button>
                  <button
                    style={deleteSessionButtonStyle}
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeChatSession(session.id, session.title);
                    }}
                    aria-label={`删除对话 ${session.title || "新对话"}`}
                    title="删除对话"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div style={workspaceBoxStyle}>
              <div style={workspaceHeaderStyle}>
                <span>{config?.managedWorkspace === "city-skills" ? "技能目录" : "工作区"}</span>
                <button style={exportBtnStyle} onClick={() => void exportChat()} disabled={!messages.length}>
                  导出聊天
                </button>
              </div>
              <label style={uploadLabelStyle}>
                上传文件
                <input
                  type="file"
                  style={{ display: "none" }}
                  onChange={(event) => {
                    void handleFileUpload(event.target.files?.[0]);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <div style={workspaceFilesStyle}>
                {workspaceFiles.length ? (
                  workspaceFiles.slice(0, 8).map((file) => (
                    <div
                      key={file.name}
                      style={workspaceFileStyle}
                      title={file.name}
                    >
                      <a
                        href={workspaceDownloadUrl(activeCharacter.id, file.name)}
                        style={workspaceFileLinkStyle}
                      >
                        <span style={workspaceFileNameStyle}>{file.name}</span>
                        <span style={workspaceFileMetaStyle}>{Math.ceil(file.size / 1024)} KB</span>
                      </a>
                      <button
                        style={workspaceDeleteStyle}
                        onClick={() => void removeWorkspaceFile(file.name)}
                        aria-label={`删除 ${file.name}`}
                        title="删除文件"
                      >
                        ×
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={workspaceEmptyStyle}>暂无文件</div>
                )}
              </div>
              {workspaceStatus && <div style={workspaceStatusStyle}>{workspaceStatus}</div>}
            </div>
          </aside>

          <main style={chatMainStyle}>
            {!config?.brain.enabled && (
              <div style={offlineStyle}>
                这个 Agent 还没有启用 AI Brain。先配置服务商、模型和设置里的 API Key，再回来聊天。
              </div>
            )}

            <div ref={scrollRef} style={messagesStyle}>
              {messages.length === 0 ? (
                <div style={emptyStyle}>开始和 {displayName} 的新对话。</div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    style={{
                      ...messageStyle,
                      alignSelf: message.role === "user" ? "flex-end" : "flex-start",
                      maxWidth: message.role === "user" ? "88%" : "82%",
                      background: message.role === "user" ? "var(--ac-user-bubble)" : "var(--ac-field)",
                      borderColor: message.role === "user" ? "transparent" : "var(--ac-border)",
                      color: "var(--ac-text)",
                      boxShadow: message.role === "user" ? "none" : messageStyle.boxShadow,
                    }}
                  >
                    {message.role === "assistant" && <div style={messageRoleStyle}>{displayName}</div>}
                    {message.attachments && message.attachments.length > 0 && (
                      <div style={messageAttachmentsStyle}>
                        {message.attachments.map((attachment) => attachment.kind === "image" ? (
                          <a
                            key={attachment.id}
                            href={workspaceDownloadUrl(activeCharacter.id, attachment.fileName)}
                            style={messageImageLinkStyle}
                            title={`下载 ${attachment.name}`}
                          >
                            <img
                              src={workspacePreviewUrl(activeCharacter.id, attachment.fileName)}
                              alt={attachment.name}
                              style={messageImageStyle}
                            />
                            <span style={messageAttachmentNameStyle}>{attachment.name}</span>
                          </a>
                        ) : (
                          <a
                            key={attachment.id}
                            href={workspaceDownloadUrl(activeCharacter.id, attachment.fileName)}
                            style={messageFileStyle}
                            title={`下载 ${attachment.name}`}
                          >
                            <span style={messageFileIconStyle}>↧</span>
                            <span style={{ minWidth: 0 }}>
                              <strong style={messageAttachmentNameStyle}>{attachment.name}</strong>
                              <small style={messageAttachmentMetaStyle}>{formatFileSize(attachment.size)}</small>
                            </span>
                          </a>
                        ))}
                      </div>
                    )}
                    <MarkdownMessage text={message.content} />
                    {message.role === "assistant" && message.status && (
                      <div style={runStatusStyle}>
                        <span style={{ ...runStatusDotStyle, background: message.status === "succeeded" ? "#4ade80" : message.status === "failed" ? "#f87171" : message.status === "waiting_approval" ? "#fbbf24" : "#60a5fa" }} />
                        {runStatusLabel(message.status)}
                        {message.status === "waiting_approval" && (
                          <span style={inlineApprovalHintStyle}>请在当前对话中确认</span>
                        )}
                      </div>
                    )}
                    {message.runId === inlineApprovalRunId && inlineApprovals.map((approval) => (
                      <article key={approval.id} style={inlineApprovalCardStyle}>
                        <div style={inlineApprovalHeaderStyle}>
                          <div>
                            <div style={inlineApprovalRiskStyle}>{approvalRiskLabel(approval.risk)}</div>
                            <strong style={inlineApprovalTitleStyle}>{approval.summary}</strong>
                          </div>
                          <span style={inlineApprovalPendingStyle}>需要确认</span>
                        </div>
                        <pre style={inlineApprovalArgsStyle}>{JSON.stringify(approval.args, null, 2).slice(0, 2400)}</pre>
                        <div style={inlineApprovalActionsStyle}>
                          <button style={inlineDenyStyle} disabled={Boolean(approvalBusyId)} onClick={() => void decideInlineApproval(approval, "denied")}>拒绝</button>
                          <button style={inlineApproveStyle} disabled={Boolean(approvalBusyId)} onClick={() => void decideInlineApproval(approval, "approved")}>{approvalBusyId === approval.id ? "处理中…" : "批准执行"}</button>
                        </div>
                      </article>
                    ))}
                    {message.runId === inlineApprovalRunId && approvalError && <div style={inlineApprovalErrorStyle}>{approvalError}</div>}
                    {message.events && message.events.length > 0 && (
                      <details style={messageTimelineStyle}>
                        <summary style={{ cursor: "pointer", fontWeight: 800 }}>执行记录 · {visibleRunEvents(message.events).length} 步</summary>
                        <div style={{ marginTop: 7 }}>
                          {visibleRunEvents(message.events).slice(-12).map((event) => {
                            const view = eventView(event);
                            return (
                              <div key={event.id} style={messageEventStyle}>
                                <span style={messageEventCopyStyle}>
                                  <strong style={{ color: "var(--ac-text-soft)" }}>{view.label}</strong>
                                  {view.detail && <small style={messageEventDetailStyle}>{view.detail}</small>}
                                </span>
                                <time>{new Date(event.createdAt).toLocaleTimeString("zh-CN")}</time>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    )}
                    {message.citations && message.citations.length > 0 && (
                      <div style={citationBoxStyle}>
                        <strong>引用档案</strong>
                        {message.citations.map((citation, index) => (
                          <div key={`${String(citation.chunkId ?? index)}`} style={citationStyle}>
                            {String(citation.filePath ?? "").startsWith("private:") ? (
                              <a style={{ color: "var(--ac-accent-text)" }} href={workspaceDownloadUrl(activeCharacter.id, String(citation.fileName ?? ""))}>[{index + 1}] {String(citation.fileName ?? "工作区文档")}</a>
                            ) : <>[{index + 1}] {String(citation.fileName ?? citation.documentId ?? "工作区文档")}</>}
                            {citation.sectionPath ? ` · ${String(citation.sectionPath)}` : ""}
                            {typeof citation.excerpt === "string" && citation.excerpt && <details style={{ color: "var(--ac-muted)", marginTop: 3 }}><summary>查看摘录</summary>{citation.excerpt}</details>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
              {chatStatus === "sending" && <div style={thinkingStyle}>{displayName} 正在思考...</div>}
            </div>

            {(chatError || stopError) && <div style={errorStyle}>{stopError || chatError}</div>}
            {attachmentError && <div style={errorStyle}>{attachmentError}</div>}

            <form style={composerStyle} onSubmit={handleSubmit}>
              <input
                ref={attachmentInputRef}
                type="file"
                accept={CHAT_ATTACHMENT_ACCEPT}
                multiple
                style={{ display: "none" }}
                onChange={(event) => {
                  addChatAttachments(event.currentTarget.files);
                  event.currentTarget.value = "";
                }}
              />
              {pendingAttachments.length > 0 && (
                <div style={pendingAttachmentsStyle}>
                  {pendingAttachments.map((attachment) => (
                    <div key={attachment.id} style={pendingAttachmentStyle}>
                      {attachment.previewUrl ? (
                        <img src={attachment.previewUrl} alt="" style={pendingAttachmentImageStyle} />
                      ) : (
                        <span style={pendingAttachmentFileIconStyle}>▤</span>
                      )}
                      <span style={pendingAttachmentCopyStyle}>
                        <strong style={pendingAttachmentNameStyle}>{attachment.file.name}</strong>
                        <small style={pendingAttachmentMetaStyle}>{formatFileSize(attachment.file.size)}</small>
                      </span>
                      <button
                        type="button"
                        style={pendingAttachmentRemoveStyle}
                        onClick={() => removePendingAttachment(attachment.id)}
                        aria-label={`移除附件 ${attachment.file.name}`}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div style={composerRowStyle}>
                <button
                  type="button"
                  style={attachButtonStyle}
                  onClick={() => attachmentInputRef.current?.click()}
                  disabled={attachmentBusy || chatStatus === "sending" || pendingAttachments.length >= MAX_CHAT_ATTACHMENTS}
                  aria-label="添加图片或文件"
                  title="添加图片或文件（单个不超过 5 MB）"
                >
                  📎
                </button>
                <textarea
                  style={textareaStyle}
                  value={draft}
                  placeholder="输入消息，或添加图片和文件 · ⌘/Ctrl + Enter 发送"
                  rows={2}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                      event.preventDefault();
                      void submitDraft();
                    }
                  }}
                />
                {activeRunMessage?.status === "waiting_user" && (
                  <button style={sendStyle} disabled={(!draft.trim() && !pendingAttachments.length) || chatStatus === "sending" || attachmentBusy}>
                    {attachmentBusy ? "上传中" : "发送"}
                  </button>
                )}
                {activeRunMessage ? (
                  <button
                    type="button"
                    style={stopRunStyle}
                    disabled={Boolean(stoppingRunId)}
                    onClick={() => void stopCurrentRun()}
                    aria-label={stoppingRunId ? "正在终止当前任务" : "终止当前任务"}
                    title={stoppingRunId ? "正在终止…" : "终止当前任务"}
                  >
                    <span style={stopRunGlyphStyle} />
                  </button>
                ) : (
                  <button style={sendStyle} disabled={(!draft.trim() && !pendingAttachments.length) || chatStatus === "sending" || attachmentBusy}>
                    {attachmentBusy ? "上传中" : "发送"}
                  </button>
                )}
              </div>
            </form>
          </main>
        </div>
      </section>
    </div>
    {taskCenterOpen && <AgentTaskCenter agentId={activeCharacter.id} sourceSessionId={activeSession?.serverSessionId} onClose={() => setTaskCenterOpen(false)} />}
    {contextPanelOpen && <AgentContextPanel agentId={activeCharacter.id} onClose={() => setContextPanelOpen(false)} />}
    </>
  );
}

function runStatusLabel(status: string): string {
  return ({ running: "执行中", waiting_approval: "等待审批", waiting_user: "等待补充信息", succeeded: "已完成", failed: "失败", cancelled: "已取消", queued: "排队中" } as Record<string, string>)[status] ?? status;
}

function approvalRiskLabel(risk: AgentApproval["risk"]): string {
  return risk === "destructive" ? "危险操作" : risk === "external" ? "外部操作" : "写入操作";
}

function visibleRunEvents(events: AgentRunEvent[]): AgentRunEvent[] {
  const hasAnalyzedIntent = events.some((event) => event.type === "intent_analyzed");
  return events.filter((event) => {
    if (["running", "reply_streaming", "memory_saved", "memory_failed"].includes(event.type)) return false;
    if (event.type === "intent_analyzing" && hasAnalyzedIntent) return false;
    return true;
  });
}

function eventView(event: AgentRunEvent): { label: string; detail?: string } {
  const data = event.data ?? {};
  const value = (key: string) => typeof data[key] === "string" ? String(data[key]).trim() : "";
  const reason = value("reason");
  const toolName = value("toolName") || "工具";
  const selectedSkill = value("selectedSkillName") || value("selectedSkillId");
  const turn = typeof data.turn === "number" ? ` · 第 ${data.turn} 轮` : "";

  switch (event.type) {
    case "received": return { label: "收到请求" };
    case "memory_recalled": return { label: "结合已有记忆" };
    case "intent_analyzing": return { label: "理解用户当前目标" };
    case "intent_analyzed": return { label: `理解需求${value("intent") ? `：${value("intent")}` : ""}`, detail: reason };
    case "routed": {
      if (data.mode === "instruction_skill") return { label: `选择技能${selectedSkill ? `：${selectedSkill}` : ""}`, detail: reason };
      if (data.mode === "workflow_skill") return { label: `选择工作流程${selectedSkill ? `：${selectedSkill}` : ""}`, detail: reason };
      if (data.useKnowledge) return { label: "选择知识检索", detail: reason };
      return { label: "决定直接回答", detail: reason };
    }
    case "model_started": return { label: `思考下一步${turn}` };
    case "model_completed": {
      const toolCalls = Array.isArray(data.toolCalls) ? data.toolCalls.filter((item): item is string => typeof item === "string") : [];
      return toolCalls.length > 0 ? { label: `决定调用工具：${toolCalls.join("、")}` } : { label: "形成回答" };
    }
    case "workflow_started": return { label: "启动工作流程", detail: selectedSkill || value("nodeName") };
    case "workflow_resumed": return { label: "继续工作流程", detail: value("nodeName") };
    case "slot_updated": return { label: "整理已知信息", detail: value("slotName") };
    case "knowledge_searched": return { label: "检索相关资料", detail: value("query") };
    case "tool_requested": return { label: `调用工具：${toolName}`, detail: value("impact") };
    case "approval_required": return { label: "等待操作审批", detail: toolName };
    case "approval_resolved": return { label: "审批已处理", detail: toolName };
    case "tool_completed": return data.error
      ? { label: `工具调用失败：${toolName}`, detail: value("error") }
      : { label: `完成工具：${toolName}` };
    case "step_advanced": return { label: "推进流程步骤", detail: [value("from"), value("to")].filter(Boolean).join(" → ") };
    case "waiting_user": return { label: "等待补充信息", detail: value("question") };
    case "completed": return { label: "完成交付" };
    case "failed": return { label: "执行失败", detail: value("error") };
    case "cancelled": return { label: "停止执行" };
    default: return { label: event.type };
  }
}

function formatChatSessionTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const sameDay =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();
  if (sameDay) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const wasYesterday =
    date.getFullYear() === yesterday.getFullYear() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getDate() === yesterday.getDate();
  if (wasYesterday) {
    return `昨天 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" });
}

function fileExtension(fileName: string): string {
  const match = fileName.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

function mimeTypeFromName(fileName: string): string {
  return ({
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif",
    ".pdf": "application/pdf", ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv", ".json": "application/json",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  } as Record<string, string>)[fileExtension(fileName)] ?? "application/octet-stream";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const backdropStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 250000,
  background: "var(--ac-backdrop)",
  backdropFilter: "blur(5px)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
};

const modalStyle: CSSProperties = {
  width: "min(1120px, 95vw)",
  height: "min(820px, 91vh)",
  borderRadius: 22,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "var(--ac-shadow)",
  backdropFilter: "blur(28px) saturate(1.16)",
  overflow: "hidden",
};

const headerStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  padding: "18px 22px",
  borderBottom: "1px solid var(--ac-border)",
  background: "transparent",
};

const portraitStyle: CSSProperties = {
  width: 44,
  height: 50,
  borderRadius: 11,
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
  fontSize: 10,
  letterSpacing: 1.1,
  textTransform: "uppercase",
  color: "#9bd3ff",
  fontWeight: 900,
};

const titleStyle: CSSProperties = {
  margin: "2px 0 0",
  fontSize: 20,
  letterSpacing: 0,
};

const brainStyle: CSSProperties = {
  marginTop: 3,
  fontSize: 11,
  color: "var(--ac-muted)",
  fontWeight: 800,
};

const configBtnStyle: CSSProperties = {
  minHeight: 38,
  padding: "0 13px",
  borderRadius: 10,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 11,
  fontWeight: 900,
};
const runStatusStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 6, marginTop: 8, color: "var(--ac-muted)", fontSize: 10, fontWeight: 800 };
const runStatusDotStyle: CSSProperties = { width: 6, height: 6, borderRadius: "50%" };
const inlineApprovalHintStyle: CSSProperties = { marginLeft: 4, color: "#b45309", fontWeight: 900 };
const inlineApprovalCardStyle: CSSProperties = { marginTop: 10, padding: 13, borderRadius: 12, border: "1px solid rgba(245,158,11,.55)", background: "rgba(255,247,237,.92)", color: "#1f2937", boxShadow: "inset 4px 0 0 #f59e0b" };
const inlineApprovalHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 };
const inlineApprovalRiskStyle: CSSProperties = { color: "#b45309", fontSize: 9, fontWeight: 950, letterSpacing: ".08em", marginBottom: 4 };
const inlineApprovalTitleStyle: CSSProperties = { display: "block", fontSize: 13, lineHeight: 1.45 };
const inlineApprovalPendingStyle: CSSProperties = { flex: "0 0 auto", borderRadius: 999, background: "#f59e0b", color: "#111827", padding: "4px 7px", fontSize: 9, fontWeight: 950 };
const inlineApprovalArgsStyle: CSSProperties = { maxHeight: 150, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", margin: "9px 0 0", padding: 9, borderRadius: 8, border: "1px solid rgba(180,83,9,.18)", background: "rgba(255,255,255,.72)", color: "#475569", fontSize: 9, lineHeight: 1.45 };
const inlineApprovalActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 9 };
const inlineDenyStyle: CSSProperties = { minHeight: 34, borderRadius: 8, border: "1px solid rgba(220,38,38,.3)", background: "#fff", color: "#dc2626", padding: "6px 13px", fontWeight: 900, cursor: "pointer" };
const inlineApproveStyle: CSSProperties = { minHeight: 34, borderRadius: 8, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "6px 15px", fontWeight: 900, cursor: "pointer" };
const inlineApprovalErrorStyle: CSSProperties = { marginTop: 7, color: "#dc2626", fontSize: 10, fontWeight: 800 };
const messageTimelineStyle: CSSProperties = { marginTop: 8, paddingTop: 7, borderTop: "1px solid var(--ac-border)", color: "var(--ac-muted)", fontSize: 10 };
const messageEventStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, padding: "4px 0" };
const messageEventCopyStyle: CSSProperties = { display: "grid", gap: 2, minWidth: 0 };
const messageEventDetailStyle: CSSProperties = { color: "var(--ac-muted)", fontSize: 9, fontWeight: 500, lineHeight: 1.35 };
const citationBoxStyle: CSSProperties = { marginTop: 8, padding: 8, borderRadius: 6, background: "var(--ac-glass)", color: "var(--ac-text-soft)", fontSize: 10 };
const citationStyle: CSSProperties = { marginTop: 4, color: "var(--ac-accent-text)" };

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

const offlineStyle: CSSProperties = {
  margin: "12px 14px 0",
  padding: "9px 10px",
  borderRadius: 8,
  border: "1px solid rgba(251,191,36,0.34)",
  background: "rgba(245,158,11,.1)",
  color: "#b45309",
  fontSize: 12,
  lineHeight: 1.45,
};

const chatShellStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: "grid",
  gridTemplateColumns: "320px minmax(0, 1fr)",
};

const sidebarStyle: CSSProperties = {
  borderRight: "1px solid var(--ac-border)",
  background: "var(--ac-glass)",
  display: "flex",
  flexDirection: "column",
  minHeight: 0,
};

const sidebarHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 10px",
  color: "var(--ac-text-soft)",
  fontSize: 12,
  fontWeight: 900,
  borderBottom: "1px solid var(--ac-border)",
};

const newChatStyle: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 6,
  border: "1px solid rgba(147,197,253,0.34)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: "18px",
  fontWeight: 900,
};

const sessionListStyle: CSSProperties = {
  overflowY: "auto",
  padding: 10,
  display: "grid",
  gap: 8,
};

const sessionItemStyle: CSSProperties = {
  border: "1px solid",
  borderRadius: 11,
  color: "var(--ac-text)",
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 34px 34px",
  alignItems: "center",
  overflow: "hidden",
};

const sessionContentButtonStyle: CSSProperties = {
  minWidth: 0,
  border: 0,
  background: "transparent",
  color: "inherit",
  cursor: "pointer",
  display: "grid",
  gap: 4,
  padding: "8px 9px",
  textAlign: "left",
};

const sessionTitleStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const sessionMetaStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--ac-muted)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const pinButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  justifySelf: "center",
  borderRadius: 6,
  border: "1px solid",
  cursor: "pointer",
  fontSize: 14,
  lineHeight: "18px",
  fontWeight: 950,
};

const deleteSessionButtonStyle: CSSProperties = {
  width: 28,
  height: 28,
  justifySelf: "center",
  borderRadius: 6,
  border: "1px solid rgba(248,113,113,0.32)",
  background: "rgba(248,113,113,0.08)",
  color: "#fca5a5",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: "18px",
  fontWeight: 900,
};

const workspaceBoxStyle: CSSProperties = {
  borderTop: "1px solid var(--ac-border)",
  padding: 9,
  display: "grid",
  gap: 7,
};

const workspaceHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 6,
  color: "var(--ac-text-soft)",
  fontSize: 12,
  fontWeight: 900,
};

const exportBtnStyle: CSSProperties = {
  borderRadius: 5,
  border: "1px solid rgba(147,197,253,0.26)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-accent-text)",
  padding: "4px 6px",
  fontSize: 10,
  fontWeight: 900,
  cursor: "pointer",
};

const uploadLabelStyle: CSSProperties = {
  borderRadius: 11,
  border: "1px dashed var(--ac-selected-border)",
  background: "var(--ac-field)",
  color: "var(--ac-accent-text)",
  padding: "10px 11px",
  fontSize: 11,
  fontWeight: 900,
  cursor: "pointer",
  textAlign: "center",
};

const workspaceFilesStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  maxHeight: 148,
  overflowY: "auto",
};

const workspaceFileStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 26px",
  alignItems: "center",
  gap: 6,
  borderRadius: 6,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "6px",
};

const workspaceFileLinkStyle: CSSProperties = {
  minWidth: 0,
  display: "grid",
  gap: 2,
  color: "var(--ac-text)",
  textDecoration: "none",
};

const workspaceFileNameStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 900,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const workspaceFileMetaStyle: CSSProperties = {
  fontSize: 9,
  color: "var(--ac-muted)",
};

const workspaceDeleteStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 6,
  border: "1px solid rgba(248,113,113,0.28)",
  background: "rgba(127,29,29,0.42)",
  color: "#fecaca",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: "16px",
};

const workspaceEmptyStyle: CSSProperties = {
  color: "#64748b",
  fontSize: 11,
  padding: "4px 0",
};

const workspaceStatusStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 10,
  lineHeight: 1.35,
};

const chatMainStyle: CSSProperties = {
  minWidth: 0,
  minHeight: 0,
  display: "flex",
  flexDirection: "column",
};

const messagesStyle: CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: 18,
  overflowY: "auto",
};

const emptyStyle: CSSProperties = {
  margin: "auto",
  color: "#64748b",
  fontSize: 13,
};

const messageStyle: CSSProperties = {
  maxWidth: "82%",
  border: "1px solid",
  borderRadius: 15,
  padding: "11px 14px",
  boxShadow: "0 6px 22px rgba(15,23,42,.05)",
};

const messageRoleStyle: CSSProperties = {
  fontSize: 10,
  color: "var(--ac-accent-text)",
  fontWeight: 900,
  marginBottom: 4,
};

const messageAttachmentsStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  marginBottom: 8,
};

const messageImageLinkStyle: CSSProperties = {
  display: "grid",
  gap: 5,
  width: "min(220px, 100%)",
  color: "var(--ac-text)",
  textDecoration: "none",
};

const messageImageStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxHeight: 180,
  objectFit: "cover",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
};

const messageFileStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  minWidth: 190,
  maxWidth: 280,
  padding: "8px 10px",
  borderRadius: 10,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  textDecoration: "none",
};

const messageFileIconStyle: CSSProperties = {
  width: 30,
  height: 30,
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  borderRadius: 8,
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  fontWeight: 900,
};

const messageAttachmentNameStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 11,
  fontWeight: 900,
};

const messageAttachmentMetaStyle: CSSProperties = {
  display: "block",
  marginTop: 2,
  color: "var(--ac-muted)",
  fontSize: 9,
};

const thinkingStyle: CSSProperties = {
  alignSelf: "flex-start",
  color: "var(--ac-muted)",
  fontSize: 12,
  fontStyle: "italic",
};

const errorStyle: CSSProperties = {
  margin: "0 14px 10px",
  padding: "8px 10px",
  borderRadius: 8,
  border: "1px solid rgba(248,113,113,0.38)",
  background: "rgba(239,68,68,.1)",
  color: "#dc2626",
  fontSize: 12,
};

const composerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: 16,
  borderTop: "1px solid var(--ac-border)",
  background: "transparent",
};

const composerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "stretch",
  gap: 10,
};

const attachButtonStyle: CSSProperties = {
  width: 44,
  flex: "0 0 44px",
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  cursor: "pointer",
  fontSize: 18,
};

const pendingAttachmentsStyle: CSSProperties = {
  display: "flex",
  gap: 8,
  overflowX: "auto",
  paddingBottom: 2,
};

const pendingAttachmentStyle: CSSProperties = {
  position: "relative",
  display: "grid",
  gridTemplateColumns: "38px minmax(74px, 1fr) 24px",
  alignItems: "center",
  gap: 7,
  minWidth: 180,
  maxWidth: 260,
  padding: 6,
  border: "1px solid var(--ac-border)",
  borderRadius: 10,
  background: "var(--ac-field)",
  color: "var(--ac-text)",
};

const pendingAttachmentImageStyle: CSSProperties = {
  width: 38,
  height: 38,
  objectFit: "cover",
  borderRadius: 7,
};

const pendingAttachmentFileIconStyle: CSSProperties = {
  width: 38,
  height: 38,
  display: "grid",
  placeItems: "center",
  borderRadius: 7,
  background: "var(--ac-selected)",
  color: "var(--ac-accent-text)",
  fontSize: 18,
};

const pendingAttachmentCopyStyle: CSSProperties = { minWidth: 0 };
const pendingAttachmentNameStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 10,
};
const pendingAttachmentMetaStyle: CSSProperties = { display: "block", marginTop: 2, color: "var(--ac-muted)", fontSize: 9 };
const pendingAttachmentRemoveStyle: CSSProperties = {
  width: 22,
  height: 22,
  border: "none",
  borderRadius: 6,
  background: "rgba(239,68,68,.12)",
  color: "#ef4444",
  cursor: "pointer",
  fontSize: 16,
  lineHeight: 1,
};

const textareaStyle: CSSProperties = {
  flex: 1,
  resize: "none",
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "11px 12px",
  fontSize: 13,
  lineHeight: 1.4,
};

const sendStyle: CSSProperties = {
  alignSelf: "stretch",
  padding: "0 16px",
  borderRadius: 12,
  border: "none",
  background: "#3b82f6",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 900,
  cursor: "pointer",
};

const stopRunStyle: CSSProperties = {
  width: 48,
  height: 48,
  flex: "0 0 auto",
  alignSelf: "center",
  display: "grid",
  placeItems: "center",
  borderRadius: "50%",
  border: "1px solid var(--ac-border)",
  background: "var(--ac-contrast-bg)",
  color: "var(--ac-contrast-text)",
  boxShadow: "0 7px 18px rgba(15,23,42,.18)",
  cursor: "pointer",
};

const stopRunGlyphStyle: CSSProperties = {
  width: 13,
  height: 13,
  borderRadius: 3,
  background: "var(--ac-contrast-text)",
};
