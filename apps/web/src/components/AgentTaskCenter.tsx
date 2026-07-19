import { useCallback, useEffect, useState, type CSSProperties } from "react";
import type { AgentApproval, AgentRun, AgentRunEvent, AgentToolInvocation, AgentWorkSchedule, ScheduledTask, ScheduledTaskDraft } from "../types";
import { useCityStore } from "../store/cityStore";
import {
  cancelAgentRun,
  createAgentRun,
  getAgentRun,
  listAgentRuns,
  resolveAgentApproval,
  retryAgentRun,
  subscribeAgentRunEvents,
} from "../services/agentRunService";
import {
  archiveScheduledTask,
  createScheduledTask,
  listScheduledTasks,
  parseScheduledTask,
  runScheduledTaskNow,
  updateScheduledTask,
} from "../services/scheduledTaskService";

const statusLabel: Record<AgentRun["status"], string> = {
  queued: "排队中",
  running: "执行中",
  waiting_approval: "等待审批",
  waiting_user: "等待补充",
  succeeded: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

export function AgentTaskCenter({ agentId, sourceSessionId, onClose }: { agentId: string; sourceSessionId?: string; onClose: () => void }) {
  const config = useCityStore((state) => state.characterConfigs[agentId]);
  const updateSchedule = useCityStore((state) => state.updateCharacterSchedule);
  const [activeTab, setActiveTab] = useState<"scheduled" | "runs">("scheduled");
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [scheduledTasks, setScheduledTasks] = useState<ScheduledTask[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<AgentApproval[]>([]);
  const [events, setEvents] = useState<AgentRunEvent[]>([]);
  const [invocations, setInvocations] = useState<AgentToolInvocation[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [nextRuns, nextScheduledTasks] = await Promise.all([listAgentRuns(agentId), listScheduledTasks(agentId)]);
      setRuns(nextRuns);
      setScheduledTasks(nextScheduledTasks);
      const id = selectedId ?? nextRuns[0]?.id ?? null;
      if (!selectedId && id) setSelectedId(id);
      if (id) {
        const detail = await getAgentRun(id);
        setApprovals(detail.approvals);
        setInvocations(detail.invocations);
        setEvents(detail.events);
      } else {
        setApprovals([]);
        setEvents([]);
        setInvocations([]);
      }
    } catch (value) {
      setError(value instanceof Error ? value.message : "任务读取失败。");
    }
  }, [agentId, selectedId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!selectedId) return;
    return subscribeAgentRunEvents(selectedId, (event) => {
      setEvents((current) => current.some((item) => item.id === event.id) ? current : [...current, event]);
      if (["approval_required", "approval_resolved", "completed", "failed", "cancelled", "waiting_user"].includes(event.type)) {
        void refresh();
      }
    });
  }, [selectedId, refresh]);

  async function submitTask() {
    const prompt = draft.trim();
    if (!prompt || busy) return;
    setBusy(true);
    setError("");
    try {
      const run = await createAgentRun(agentId, prompt);
      setDraft("");
      setSelectedId(run.id);
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "任务创建失败。");
    } finally {
      setBusy(false);
    }
  }

  async function decide(approval: AgentApproval, decision: "approved" | "denied") {
    setBusy(true);
    setError("");
    try {
      await resolveAgentApproval(approval.id, decision);
      await refresh();
    } catch (value) {
      setError(value instanceof Error ? value.message : "审批失败。");
    } finally {
      setBusy(false);
    }
  }

  const selected = runs.find((run) => run.id === selectedId) ?? runs[0] ?? null;

  return (
    <div style={backdropStyle} onClick={onClose}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <strong style={{ fontSize: 17 }}>任务中心</strong>
            <div style={mutedStyle}>管理定时任务，并查看每一次真实执行结果</div>
          </div>
          <button style={iconButtonStyle} onClick={onClose} aria-label="关闭任务中心" title="关闭">×</button>
        </header>

        <nav style={tabsStyle}>
          <button style={{ ...tabStyle, ...(activeTab === "scheduled" ? activeTabStyle : {}) }} onClick={() => setActiveTab("scheduled")}>定时任务</button>
          <button style={{ ...tabStyle, ...(activeTab === "runs" ? activeTabStyle : {}) }} onClick={() => setActiveTab("runs")}>执行记录</button>
        </nav>

        {activeTab === "scheduled" ? (
          <ScheduledTasksPanel
            agentId={agentId}
            sourceSessionId={sourceSessionId}
            tasks={scheduledTasks}
            runs={runs.filter((run) => Boolean(run.scheduledTaskId) || run.source === "schedule")}
            schedule={config?.schedule}
            onScheduleUpdate={(patch) => updateSchedule(agentId, patch)}
            onChanged={refresh}
          />
        ) : <>
        <div style={composerStyle}>
          <input
            style={inputStyle}
            value={draft}
            placeholder="交给这个 Agent 一项办公任务"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") void submitTask(); }}
          />
          <button style={primaryButtonStyle} onClick={() => void submitTask()} disabled={!draft.trim() || busy}>开始</button>
        </div>

        {error && <div style={errorStyle}>{error}</div>}

        <div style={bodyStyle}>
          <aside style={listStyle}>
            {runs.length ? runs.map((run) => (
              <button
                key={run.id}
                style={{ ...runButtonStyle, ...(run.id === selected?.id ? runButtonActiveStyle : {}) }}
                onClick={() => setSelectedId(run.id)}
              >
                <span style={runTitleStyle}>{run.title}</span>
                <span style={{ ...statusStyle, color: run.status === "failed" ? "#fca5a5" : run.status === "waiting_approval" ? "var(--ac-kicker)" : run.status === "succeeded" ? "#86efac" : "var(--ac-accent-text)" }}>
                  {statusLabel[run.status]}
                </span>
              </button>
            )) : <div style={emptyStyle}>还没有任务</div>}
          </aside>

          <main style={detailStyle}>
            {selected ? (
              <>
                <div style={detailHeaderStyle}>
                  <div>
                    <strong>{selected.title}</strong>
                    <div style={mutedStyle}>{new Date(selected.createdAt).toLocaleString("zh-CN")} · {statusLabel[selected.status]}</div>
                  </div>
                  <div style={{ display: "flex", gap: 7 }}>
                    {selected.status === "failed" && <button style={primaryButtonStyle} onClick={() => void retryAgentRun(selected.id).then(refresh).catch((value) => setError(value instanceof Error ? value.message : "重试失败。"))}>从安全点重试</button>}
                    {!["succeeded", "failed", "cancelled"].includes(selected.status) && (
                      <button style={dangerGhostStyle} onClick={() => void cancelAgentRun(selected.id).then(refresh)}>取消</button>
                    )}
                  </div>
                </div>

                {approvals.filter((item) => item.status === "pending").map((approval) => (
                  <article key={approval.id} style={approvalStyle}>
                    <div style={approvalHeadingStyle}>
                      <div>
                        <div style={approvalRiskStyle}>{approval.risk === "destructive" ? "危险操作" : approval.risk === "external" ? "外部发送" : "写入操作"}</div>
                        <strong style={approvalTitleStyle}>{approval.summary}</strong>
                      </div>
                      <span style={approvalPendingStyle}>需要你的确认</span>
                    </div>
                    {(approval.workflowSkillId || approval.workflowNodeId) && <div style={mutedStyle}>流程 {approval.workflowSkillId ?? "-"} · 节点 {approval.workflowNodeId ?? "-"}</div>}
                    <pre style={argsStyle}>{JSON.stringify(approval.args, null, 2).slice(0, 3000)}</pre>
                    <div style={approvalActionsStyle}>
                      <button style={denyButtonStyle} disabled={busy} onClick={() => void decide(approval, "denied")}>拒绝</button>
                      <button style={approveButtonStyle} disabled={busy} onClick={() => void decide(approval, "approved")}>批准执行</button>
                    </div>
                  </article>
                ))}

                {selected.error && <div style={errorStyle}>{selected.error}</div>}
                {selected.resultText && <div style={resultStyle}>{selected.resultText}</div>}
                {invocations.length > 0 && <section style={timelineStyle}>
                  <strong style={{ fontSize: 12 }}>工具调用</strong>
                  {invocations.map((invocation) => <details key={invocation.id} style={invocationStyle}>
                    <summary><strong>{invocation.toolName}</strong> · {invocationStatusLabel(invocation)}{invocation.workflowNodeId ? ` · 节点 ${invocation.workflowNodeId}` : ""}</summary>
                    <div style={mutedStyle}>{invocation.impactSummary}</div>
                    <pre style={argsStyle}>{JSON.stringify({ input: invocation.args, output: invocation.result, error: invocation.error }, null, 2).slice(0, 12000)}</pre>
                  </details>)}
                </section>}
                {events.length > 0 && (
                  <section style={timelineStyle}>
                    <strong style={{ fontSize: 12 }}>执行时间线</strong>
                    {events.map((event) => (
                      <div key={event.id} style={eventStyle}>
                        <span style={eventDotStyle} />
                        <span style={{ fontWeight: 800 }}>{eventLabel(event.type)}</span>
                        <time style={{ marginLeft: "auto", color: "#64748b" }}>{new Date(event.createdAt).toLocaleTimeString("zh-CN")}</time>
                      </div>
                    ))}
                  </section>
                )}
                {!selected.resultText && !selected.error && !approvals.some((item) => item.status === "pending") && (
                  <div style={emptyStyle}>{selected.status === "running" ? "Agent 正在执行任务..." : "任务正在等待处理。"}</div>
                )}
              </>
            ) : <div style={emptyStyle}>选择一个任务查看详情</div>}
          </main>
        </div>
        </>}
      </section>
    </div>
  );
}

function ScheduledTasksPanel({
  agentId,
  sourceSessionId,
  tasks,
  runs,
  schedule,
  onScheduleUpdate,
  onChanged,
}: {
  agentId: string;
  sourceSessionId?: string;
  tasks: ScheduledTask[];
  runs: AgentRun[];
  schedule?: AgentWorkSchedule;
  onScheduleUpdate: (patch: Partial<AgentWorkSchedule>) => void;
  onChanged: () => Promise<void>;
}) {
  const [naturalInput, setNaturalInput] = useState("");
  const [draft, setDraft] = useState<ScheduledTaskDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState("");
  const [taskFilter, setTaskFilter] = useState<"all" | "pending" | "paused">("all");
  const [runFilter, setRunFilter] = useState<"all" | "succeeded" | "failed">("all");
  const visibleTasks = tasks.filter((task) => taskFilter === "all" || (taskFilter === "pending" ? task.status === "active" : task.status === "paused"));
  const visibleRuns = runs.filter((run) => runFilter === "all" || (runFilter === "succeeded" ? run.status === "succeeded" : ["failed", "cancelled"].includes(run.status)));
  const completed = runs.filter((run) => run.status === "succeeded").length;
  const workdays = schedule?.workdays ?? [1, 2, 3, 4, 5];

  async function parseDraft() {
    if (!naturalInput.trim() || busy) return;
    setBusy(true); setLocalError("");
    try { setDraft(await parseScheduledTask(agentId, naturalInput, schedule?.timezone || "Asia/Shanghai")); setEditingId(null); }
    catch (value) { setLocalError(value instanceof Error ? value.message : "无法解析任务时间。"); }
    finally { setBusy(false); }
  }

  async function saveDraft() {
    if (!draft || busy) return;
    setBusy(true); setLocalError("");
    try {
      if (editingId) await updateScheduledTask(editingId, draft);
      else await createScheduledTask(agentId, draft, sourceSessionId);
      setDraft(null); setEditingId(null); setNaturalInput(""); await onChanged();
    } catch (value) { setLocalError(value instanceof Error ? value.message : "保存定时任务失败。"); }
    finally { setBusy(false); }
  }

  function editTask(task: ScheduledTask) {
    setEditingId(task.id);
    setDraft({ title: task.title, prompt: task.prompt, scheduleType: task.scheduleType, schedule: task.schedule, timezone: task.timezone, confidence: 1, reason: "编辑已有任务" });
  }

  async function mutate(action: () => Promise<unknown>) {
    setBusy(true); setLocalError("");
    try { await action(); await onChanged(); }
    catch (value) { setLocalError(value instanceof Error ? value.message : "操作失败。"); }
    finally { setBusy(false); }
  }

  return <div style={scheduledPageStyle}>
    <div style={scheduledHeadingStyle}>
      <div><strong style={{ fontSize: 14 }}>定时任务</strong><div style={mutedStyle}>管理周期任务，并查看每次自动执行的结果</div></div>
      <label style={scheduleSwitchStyle}><input type="checkbox" checked={schedule?.enabled ?? false} onChange={(event) => onScheduleUpdate({ enabled: event.target.checked })} />启用自动执行</label>
    </div>
    <div style={scheduleSettingsStyle}>
      <label>时钟<select style={compactInputStyle} value={schedule?.clock ?? "server"} onChange={(event) => onScheduleUpdate({ clock: event.target.value as "server" | "local" })}><option value="server">服务器</option><option value="local">本地电脑</option></select></label>
      <label>时区<input style={{ ...compactInputStyle, width: 130 }} value={schedule?.timezone ?? "Asia/Shanghai"} onChange={(event) => onScheduleUpdate({ timezone: event.target.value })} /></label>
      <label>工作时间<input type="time" style={compactInputStyle} value={schedule?.startTime ?? "09:00"} onChange={(event) => onScheduleUpdate({ startTime: event.target.value })} />–<input type="time" style={compactInputStyle} value={schedule?.endTime ?? "18:00"} onChange={(event) => onScheduleUpdate({ endTime: event.target.value })} /></label>
      <label>位置<input style={{ ...compactInputStyle, width: 130 }} value={schedule?.location ?? ""} placeholder="市政大厅" onChange={(event) => onScheduleUpdate({ location: event.target.value })} /></label>
      <div style={weekdayRowStyle}>{weekdayOptions.map((day) => <button key={day.value} style={{ ...weekdayButtonStyle, ...(workdays.includes(day.value) ? weekdayActiveStyle : {}) }} onClick={() => onScheduleUpdate({ workdays: workdays.includes(day.value) ? workdays.filter((value) => value !== day.value) : [...workdays, day.value].sort() })}>{day.label}</button>)}</div>
    </div>
    <div style={scheduledComposerStyle}>
      <input style={inputStyle} value={naturalInput} placeholder="例如：2分钟后搜索当天新闻；每周一上午9点整理行业简报" onChange={(event) => setNaturalInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void parseDraft(); }} />
      <button style={primaryButtonStyle} disabled={!naturalInput.trim() || busy} onClick={() => void parseDraft()}>生成草案</button>
    </div>
    {localError && <div style={errorStyle}>{localError}</div>}
    {draft && <ScheduleDraftEditor draft={draft} editing={Boolean(editingId)} busy={busy} onChange={setDraft} onCancel={() => { setDraft(null); setEditingId(null); }} onSave={() => void saveDraft()} />}
    <div style={statGridStyle}>
      <div style={statCardStyle}><strong>{tasks.filter((task) => task.status === "active").length}</strong><span>待执行</span></div>
      <div style={statCardStyle}><strong>{completed}</strong><span>已完成</span></div>
      <div style={statCardStyle}><strong>{runs.length}</strong><span>执行记录</span></div>
    </div>
    <section style={scheduledSectionStyle}>
      <div style={sectionTitleRowStyle}><strong>任务列表</strong><div style={filterRowStyle}>{(["all", "pending", "paused"] as const).map((filter) => <button key={filter} style={{ ...filterButtonStyle, ...(taskFilter === filter ? filterButtonActiveStyle : {}) }} onClick={() => setTaskFilter(filter)}>{filter === "all" ? "全部" : filter === "pending" ? "待执行" : "已暂停"}</button>)}</div></div>
      <div style={tableHeaderStyle}><span>定时任务</span><span>计划</span><span>状态</span><span>下次执行</span><span>操作</span></div>
      {visibleTasks.length ? visibleTasks.map((task) => <div key={task.id} style={tableRowStyle}>
        <div><strong>{task.title}</strong><div style={mutedStyle}>{task.prompt}</div></div>
        <div style={planCellStyle}>{scheduleLabel(task)}</div>
        <span style={{ ...taskStatusPillStyle, ...(task.status === "active" ? enabledPillStyle : pausedPillStyle) }}>{taskStatusLabel(task.status)} · {task.runCount}次</span>
        <span style={mutedStyle}>{task.nextRunAt ? formatDate(task.nextRunAt, task.timezone) : "—"}<br />{task.lastStatus ? `上次：${task.lastStatus}` : "尚未执行"}</span>
        <div style={{ ...rowActionsStyle, flexWrap: "wrap" }}><button style={rowActionStyle} disabled={busy} onClick={() => editTask(task)}>编辑</button><button style={rowActionStyle} disabled={busy} onClick={() => void mutate(() => updateScheduledTask(task.id, { status: task.status === "active" ? "paused" : "active" }))}>{task.status === "active" ? "暂停" : "恢复"}</button><button style={rowActionStyle} disabled={busy} onClick={() => void mutate(() => runScheduledTaskNow(task.id))}>立即执行</button><button style={deleteActionStyle} disabled={busy} onClick={() => void mutate(() => archiveScheduledTask(task.id))}>归档</button></div>
      </div>) : <div style={emptyTableStyle}>暂无符合条件的定时任务</div>}
    </section>
    <section style={scheduledSectionStyle}>
      <div style={sectionTitleRowStyle}><strong>执行记录</strong><div style={filterRowStyle}>{(["all", "succeeded", "failed"] as const).map((filter) => <button key={filter} style={{ ...filterButtonStyle, ...(runFilter === filter ? filterButtonActiveStyle : {}) }} onClick={() => setRunFilter(filter)}>{filter === "all" ? "全部" : filter === "succeeded" ? "已完成" : "失败 / 跳过"}</button>)}</div></div>
      <div style={runTableHeaderStyle}><span>定时任务</span><span>状态</span><span>计划时间</span><span>完成时间</span><span>最近结果</span></div>
      {visibleRuns.length ? visibleRuns.slice(0, 30).map((run) => <div key={run.id} style={runTableRowStyle}><strong>{run.title}</strong><span>{statusLabel[run.status]}</span><span>{run.scheduledFor ? new Date(run.scheduledFor).toLocaleString("zh-CN") : new Date(run.createdAt).toLocaleString("zh-CN")}</span><span>{run.finishedAt ? new Date(run.finishedAt).toLocaleString("zh-CN") : "—"}</span><span style={runResultStyle}>{run.error || run.resultText || "—"}</span></div>) : <div style={emptyTableStyle}>暂无自动执行记录</div>}
    </section>
  </div>;
}

function ScheduleDraftEditor({ draft, editing, busy, onChange, onCancel, onSave }: { draft: ScheduledTaskDraft; editing: boolean; busy: boolean; onChange: (draft: ScheduledTaskDraft) => void; onCancel: () => void; onSave: () => void }) {
  const schedule = draft.schedule;
  const updateSchedule = (patch: Record<string, unknown>) => onChange({ ...draft, schedule: { ...schedule, ...patch } });
  return <section style={draftEditorStyle}>
    <div style={sectionTitleRowStyle}><div><strong>{editing ? "编辑定时任务" : "确认任务草案"}</strong><div style={mutedStyle}>{draft.reason} · 置信度 {Math.round(draft.confidence * 100)}%</div></div><button style={rowActionStyle} onClick={onCancel}>取消</button></div>
    <div style={draftGridStyle}>
      <label>标题<input style={inputStyle} value={draft.title} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label>
      <label>执行指令<textarea style={{ ...inputStyle, minHeight: 62, resize: "vertical" }} value={draft.prompt} onChange={(event) => onChange({ ...draft, prompt: event.target.value })} /></label>
      <label>类型<select style={inputStyle} value={draft.scheduleType} onChange={(event) => { const scheduleType = event.target.value as ScheduledTaskDraft["scheduleType"]; onChange({ ...draft, scheduleType, schedule: scheduleType === "once" ? { runAt: new Date(Date.now() + 3_600_000).toISOString() } : scheduleType === "weekly" ? { time: "09:00", weekdays: [1] } : scheduleType === "monthly" ? { time: "09:00", dayOfMonth: 1 } : { time: "09:00" } }); }}><option value="once">一次性</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label>
      <label>时区<input style={inputStyle} value={draft.timezone} onChange={(event) => onChange({ ...draft, timezone: event.target.value })} /></label>
      {draft.scheduleType === "once" ? <label>执行时间<input type="datetime-local" style={inputStyle} value={isoToLocalInput(String(schedule.runAt ?? ""))} onChange={(event) => updateSchedule({ runAt: new Date(event.target.value).toISOString() })} /></label> : <label>执行时间<input type="time" style={inputStyle} value={String(schedule.time ?? "09:00")} onChange={(event) => updateSchedule({ time: event.target.value })} /></label>}
      {draft.scheduleType === "weekly" && <div><span style={mutedStyle}>执行星期</span><div style={weekdayRowStyle}>{weekdayOptions.map((day) => { const days = Array.isArray(schedule.weekdays) ? schedule.weekdays.map(Number) : []; return <button key={day.value} style={{ ...weekdayButtonStyle, ...(days.includes(day.value) ? weekdayActiveStyle : {}) }} onClick={() => updateSchedule({ weekdays: days.includes(day.value) ? days.filter((value) => value !== day.value) : [...days, day.value].sort() })}>{day.label}</button>; })}</div></div>}
      {draft.scheduleType === "monthly" && <label>每月日期<input type="number" min={1} max={31} style={inputStyle} value={Number(schedule.dayOfMonth ?? 1)} onChange={(event) => updateSchedule({ dayOfMonth: Math.max(1, Math.min(31, Number(event.target.value))) })} /></label>}
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", padding: 12 }}><button style={primaryButtonStyle} disabled={busy || !draft.title.trim() || !draft.prompt.trim()} onClick={onSave}>{editing ? "保存修改" : "确认并创建"}</button></div>
  </section>;
}

const weekdayOptions = [{ value: 1, label: "一" }, { value: 2, label: "二" }, { value: 3, label: "三" }, { value: 4, label: "四" }, { value: 5, label: "五" }, { value: 6, label: "六" }, { value: 0, label: "日" }];

function daysLabel(days: number[]): string {
  if (days.length === 7) return "每天";
  if ([1, 2, 3, 4, 5].every((day) => days.includes(day)) && days.length === 5) return "工作日";
  const labels = ["日", "一", "二", "三", "四", "五", "六"];
  return days.map((day) => `周${labels[day]}`).join("、") || "未设置";
}

function scheduleLabel(task: ScheduledTask): string { if (task.scheduleType === "once") return `一次 · ${formatDate(String(task.schedule.runAt ?? ""), task.timezone)}`; if (task.scheduleType === "daily") return `每天 ${String(task.schedule.time ?? "09:00")}`; if (task.scheduleType === "weekly") return `${daysLabel(Array.isArray(task.schedule.weekdays) ? task.schedule.weekdays.map(Number) : [])} ${String(task.schedule.time ?? "09:00")}`; return `每月${Number(task.schedule.dayOfMonth ?? 1)}日 ${String(task.schedule.time ?? "09:00")}`; }
function taskStatusLabel(status: ScheduledTask["status"]): string { return ({ active: "待执行", paused: "已暂停", completed: "已完成", archived: "已归档" })[status]; }
function formatDate(value: string, timezone: string): string { const date = new Date(value); return Number.isNaN(date.getTime()) ? "待确认" : date.toLocaleString("zh-CN", { timeZone: timezone, month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }); }
function isoToLocalInput(value: string): string { const date = new Date(value); if (Number.isNaN(date.getTime())) return ""; const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000); return local.toISOString().slice(0, 16); }

function eventLabel(type: string): string {
  return ({
    received: "已接收", routed: "已选择执行路线", memory_recalled: "已读取记忆",
    workflow_started: "流程已开始", workflow_resumed: "流程已恢复", slot_updated: "信息已更新",
    knowledge_searched: "已检索档案", tool_requested: "请求工具", approval_required: "等待审批",
    approval_resolved: "审批已处理", tool_completed: "工具已完成", step_advanced: "进入下一步",
    reply_streaming: "正在生成交付", memory_saved: "记忆已保存", waiting_user: "等待补充信息",
    completed: "已完成", failed: "执行失败", cancelled: "已取消",
  } as Record<string, string>)[type] ?? type;
}

function invocationStatusLabel(invocation: AgentToolInvocation): string {
  if (invocation.toolName !== "search_web") return invocation.status;
  if (invocation.status === "failed") return "无结果 / 失败";
  const result = invocation.result as { results?: Array<{ provider?: string }> } | null;
  const provider = result?.results?.[0]?.provider;
  if (provider === "brave") return "有结果 · Brave";
  if (provider === "duckduckgo") return "降级搜索 · DuckDuckGo";
  return invocation.status === "succeeded" ? "请求成功" : invocation.status;
}

const backdropStyle: CSSProperties = { position: "fixed", inset: 0, zIndex: 450000, background: "rgba(3,7,18,0.72)", display: "grid", placeItems: "center", padding: 18 };
const modalStyle: CSSProperties = { width: "min(980px, 96vw)", height: "min(720px, 92vh)", display: "flex", flexDirection: "column", overflow: "hidden", borderRadius: 8, border: "1px solid var(--ac-border)", background: "var(--ac-surface)", color: "var(--ac-text)", boxShadow: "0 28px 90px rgba(0,0,0,0.65)" };
const headerStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", borderBottom: "1px solid var(--ac-border)", background: "var(--ac-surface-raised)" };
const tabsStyle: CSSProperties = { display: "flex", gap: 18, padding: "0 16px", borderBottom: "1px solid var(--ac-border)", background: "var(--ac-surface-raised)" };
const tabStyle: CSSProperties = { minHeight: 42, border: 0, borderBottom: "2px solid transparent", background: "transparent", color: "var(--ac-muted)", padding: "0 4px", fontWeight: 850, cursor: "pointer" };
const activeTabStyle: CSSProperties = { borderBottomColor: "#3b82f6", color: "var(--ac-text)" };
const mutedStyle: CSSProperties = { marginTop: 3, color: "var(--ac-muted)", fontSize: 11 };
const iconButtonStyle: CSSProperties = { width: 34, height: 34, borderRadius: 6, border: "1px solid var(--ac-border)", color: "var(--ac-text-soft)", background: "var(--ac-field)", fontSize: 22, cursor: "pointer" };
const composerStyle: CSSProperties = { display: "flex", gap: 8, padding: 12, borderBottom: "1px solid var(--ac-border)" };
const inputStyle: CSSProperties = { flex: 1, minWidth: 0, borderRadius: 6, border: "1px solid var(--ac-border)", background: "var(--ac-field)", color: "var(--ac-text)", padding: "10px 12px", fontSize: 13 };
const primaryButtonStyle: CSSProperties = { border: 0, borderRadius: 6, background: "#3b82f6", color: "white", padding: "0 18px", fontWeight: 800, cursor: "pointer" };
const bodyStyle: CSSProperties = { flex: 1, minHeight: 0, display: "grid", gridTemplateColumns: "260px minmax(0, 1fr)" };
const listStyle: CSSProperties = { overflowY: "auto", padding: 10, borderRight: "1px solid var(--ac-border)", background: "var(--ac-surface)" };
const runButtonStyle: CSSProperties = { width: "100%", minHeight: 64, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, textAlign: "left", border: "1px solid transparent", borderRadius: 6, background: "transparent", color: "var(--ac-text-soft)", padding: "10px 11px", marginBottom: 5, cursor: "pointer" };
const runButtonActiveStyle: CSSProperties = { background: "var(--ac-control)", borderColor: "rgba(96,165,250,0.42)" };
const runTitleStyle: CSSProperties = { width: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 800, fontSize: 12 };
const statusStyle: CSSProperties = { fontSize: 10, fontWeight: 800 };
const detailStyle: CSSProperties = { minWidth: 0, overflowY: "auto", padding: 18 };
const detailHeaderStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14 };
const approvalStyle: CSSProperties = { padding: 16, marginBottom: 16, borderRadius: 14, border: "2px solid #f59e0b", background: "var(--ac-surface-strong)", boxShadow: "0 10px 28px rgba(245,158,11,0.16), inset 4px 0 0 #f59e0b" };
const approvalHeadingStyle: CSSProperties = { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 14, marginBottom: 10 };
const approvalRiskStyle: CSSProperties = { color: "#b45309", fontSize: 10, lineHeight: 1, letterSpacing: ".08em", fontWeight: 950, marginBottom: 7 };
const approvalTitleStyle: CSSProperties = { display: "block", color: "var(--ac-text)", fontSize: 16, lineHeight: 1.4 };
const approvalPendingStyle: CSSProperties = { flex: "0 0 auto", borderRadius: 999, background: "#f59e0b", color: "#111827", padding: "6px 9px", fontSize: 10, fontWeight: 950 };
const argsStyle: CSSProperties = { maxHeight: 190, overflow: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 12, borderRadius: 10, border: "1px solid var(--ac-border)", background: "var(--ac-field)", color: "var(--ac-text-soft)", fontSize: 10, lineHeight: 1.55 };
const approvalActionsStyle: CSSProperties = { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 };
const denyButtonStyle: CSSProperties = { minHeight: 38, borderRadius: 9, border: "1px solid rgba(220,38,38,0.3)", background: "#fff", color: "#dc2626", padding: "8px 16px", fontWeight: 900, cursor: "pointer" };
const approveButtonStyle: CSSProperties = { minHeight: 38, borderRadius: 9, border: "1px solid #166534", background: "#166534", color: "#fff", padding: "8px 18px", fontWeight: 900, cursor: "pointer", boxShadow: "0 5px 14px rgba(22,101,52,0.22)" };
const dangerGhostStyle: CSSProperties = { borderRadius: 6, border: "1px solid rgba(248,113,113,0.35)", background: "transparent", color: "#fca5a5", padding: "6px 10px", cursor: "pointer" };
const timelineStyle: CSSProperties = { marginTop: 16, padding: 12, border: "1px solid var(--ac-border)", borderRadius: 7, background: "var(--ac-glass)" };
const eventStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 8, minHeight: 28, color: "var(--ac-text-soft)", fontSize: 10, borderBottom: "1px solid var(--ac-border)" };
const eventDotStyle: CSSProperties = { width: 6, height: 6, borderRadius: "50%", background: "#60a5fa", flex: "0 0 auto" };
const invocationStyle: CSSProperties = { marginTop: 8, padding: 8, borderRadius: 6, background: "rgba(2,6,23,.45)", color: "var(--ac-text-soft)", fontSize: 10 };
const resultStyle: CSSProperties = { whiteSpace: "pre-wrap", lineHeight: 1.65, padding: 14, borderRadius: 7, background: "var(--ac-surface)", border: "1px solid var(--ac-border)", color: "var(--ac-text-soft)", fontSize: 13 };
const emptyStyle: CSSProperties = { color: "#64748b", padding: 18, textAlign: "center", fontSize: 12 };
const errorStyle: CSSProperties = { margin: 10, padding: "9px 12px", borderRadius: 6, color: "#fecaca", background: "rgba(127,29,29,0.35)", border: "1px solid rgba(248,113,113,0.32)", fontSize: 12 };
const scheduledPageStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: "auto", padding: 16, background: "var(--ac-surface)" };
const scheduledHeadingStyle: CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 };
const scheduleSwitchStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 7, color: "var(--ac-text-soft)", fontSize: 11, fontWeight: 800 };
const scheduleSettingsStyle: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, marginTop: 12, padding: 12, border: "1px solid var(--ac-border)", borderRadius: 8, background: "var(--ac-surface-raised)", color: "var(--ac-text-soft)", fontSize: 10 };
const weekdayRowStyle: CSSProperties = { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" };
const weekdayButtonStyle: CSSProperties = { width: 28, height: 28, border: "1px solid var(--ac-border)", borderRadius: 5, background: "var(--ac-field)", color: "var(--ac-muted)", fontSize: 10, cursor: "pointer" };
const weekdayActiveStyle: CSSProperties = { background: "#3b82f6", color: "white", borderColor: "#3b82f6" };
const scheduledComposerStyle: CSSProperties = { display: "flex", gap: 8, marginTop: 14 };
const draftEditorStyle: CSSProperties = { marginTop: 12, border: "1px solid rgba(59,130,246,.45)", borderRadius: 10, background: "var(--ac-surface-raised)", overflow: "hidden" };
const draftGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 10, padding: 12, color: "var(--ac-text-soft)", fontSize: 10 };
const statGridStyle: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 12, marginTop: 14 };
const statCardStyle: CSSProperties = { display: "flex", alignItems: "baseline", gap: 9, minHeight: 66, padding: "14px 16px", borderRadius: 10, background: "var(--ac-surface-raised)", border: "1px solid var(--ac-border)" };
const scheduledSectionStyle: CSSProperties = { marginTop: 16, border: "1px solid var(--ac-border)", borderRadius: 10, overflow: "hidden", background: "var(--ac-surface-raised)" };
const sectionTitleRowStyle: CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--ac-border)" };
const filterRowStyle: CSSProperties = { display: "flex", gap: 5 };
const filterButtonStyle: CSSProperties = { border: 0, borderRadius: 6, background: "transparent", color: "var(--ac-muted)", padding: "5px 8px", fontSize: 10, fontWeight: 800, cursor: "pointer" };
const filterButtonActiveStyle: CSSProperties = { background: "var(--ac-control)", color: "var(--ac-accent-text)" };
const tableHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px,1.5fr) minmax(150px,1fr) 80px 120px 110px", gap: 10, padding: "9px 12px", background: "var(--ac-glass)", color: "var(--ac-muted)", fontSize: 9, fontWeight: 850 };
const tableRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(180px,1.5fr) minmax(150px,1fr) 80px 120px 110px", gap: 10, alignItems: "center", minHeight: 56, padding: "8px 12px", borderTop: "1px solid var(--ac-border)", fontSize: 10 };
const planCellStyle: CSSProperties = { display: "flex", alignItems: "center", gap: 7, color: "var(--ac-muted)", fontSize: 9 };
const compactInputStyle: CSSProperties = { width: 82, border: "1px solid var(--ac-border)", borderRadius: 5, background: "var(--ac-field)", color: "var(--ac-text-soft)", padding: "5px 6px", fontSize: 10 };
const taskStatusPillStyle: CSSProperties = { justifySelf: "start", borderRadius: 999, padding: "4px 7px", fontSize: 9, fontWeight: 900 };
const enabledPillStyle: CSSProperties = { background: "rgba(59,130,246,.14)", color: "var(--ac-accent-text)" };
const pausedPillStyle: CSSProperties = { background: "rgba(100,116,139,.15)", color: "var(--ac-muted)" };
const rowActionsStyle: CSSProperties = { display: "flex", gap: 5 };
const rowActionStyle: CSSProperties = { border: "1px solid var(--ac-border)", borderRadius: 5, background: "var(--ac-field)", color: "var(--ac-text-soft)", padding: "5px 7px", fontSize: 9, fontWeight: 800, cursor: "pointer" };
const deleteActionStyle: CSSProperties = { ...rowActionStyle, color: "#f87171" };
const runTableHeaderStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(160px,1.4fr) 80px 145px 145px minmax(160px,1.4fr)", gap: 10, padding: "9px 12px", background: "var(--ac-glass)", color: "var(--ac-muted)", fontSize: 9, fontWeight: 850 };
const runTableRowStyle: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(160px,1.4fr) 80px 145px 145px minmax(160px,1.4fr)", gap: 10, alignItems: "center", minHeight: 48, padding: "8px 12px", borderTop: "1px solid var(--ac-border)", color: "var(--ac-text-soft)", fontSize: 9 };
const runResultStyle: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--ac-muted)" };
const emptyTableStyle: CSSProperties = { padding: 28, textAlign: "center", color: "var(--ac-muted)", fontSize: 10 };
