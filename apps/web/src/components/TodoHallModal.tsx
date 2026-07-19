import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import { useCityStore } from "../store/cityStore";
import type { BuildingTaskStatus } from "../types";
import { getBuildingPurpose } from "../utils/buildingPurpose";
import { getAssignedResident } from "../data/npcCatalog";
import { getCharacterDisplayName } from "../utils/agentStatus";
import { BuildingAgentGuide } from "./BuildingAgentGuide";

const STATUS_OPTIONS: Array<{ id: BuildingTaskStatus; label: string; hint: string }> = [
  { id: "inbox", label: "Inbox", hint: "先收进来，稍后整理" },
  { id: "todo", label: "待办", hint: "已经确定要做" },
  { id: "doing", label: "进行中", hint: "当前正在推进" },
  { id: "done", label: "完成", hint: "已经结束归档" },
];

interface TaskPointerDrag {
  taskId: string;
  title: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  dragging: boolean;
}

export function TodoHallModal() {
  const open = useCityStore((s) => s.todoHallOpen);
  const close = useCityStore((s) => s.closeTodoHall);
  const buildings = useCityStore((s) => s.buildings);
  const buildingResidents = useCityStore((s) => s.buildingResidents);
  const customCharacters = useCityStore((s) => s.customCharacters);
  const characterConfigs = useCityStore((s) => s.characterConfigs);
  const buildingTasks = useCityStore((s) => s.buildingTasks);
  const addBuildingTask = useCityStore((s) => s.addBuildingTask);
  const updateBuildingTask = useCityStore((s) => s.updateBuildingTask);
  const removeBuildingTask = useCityStore((s) => s.removeBuildingTask);
  const openCharacterLibrary = useCityStore((s) => s.openCharacterLibrary);
  const openCharacterConfig = useCityStore((s) => s.openCharacterConfig);
  const openCharacterChat = useCityStore((s) => s.openCharacterChat);
  const [activeStatus, setActiveStatus] = useState<BuildingTaskStatus>("inbox");
  const [draft, setDraft] = useState("");
  const [pointerDrag, setPointerDrag] = useState<TaskPointerDrag | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<BuildingTaskStatus | null>(null);
  const pointerDragRef = useRef<TaskPointerDrag | null>(null);
  const pointerListenerCleanupRef = useRef<(() => void) | null>(null);
  const todoHall = buildings.find((building) => getBuildingPurpose(building) === "todo-hall") ?? null;
  const resident = todoHall ? getAssignedResident(todoHall, buildingResidents, customCharacters) : null;
  const residentConfig = resident ? characterConfigs[resident.id] : undefined;
  const tasks = todoHall ? buildingTasks[todoHall.id] ?? [] : [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        STATUS_OPTIONS.map((status) => [
          status.id,
          tasks.filter((task) => task.status === status.id).length,
        ])
      ) as Record<BuildingTaskStatus, number>,
    [tasks]
  );
  const visibleTasks = tasks.filter((task) => task.status === activeStatus);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function handleWindowBlur() {
      clearPointerDrag();
    }
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [close, open]);

  if (!open) return null;

  function submit() {
    const title = draft.trim();
    if (!todoHall || !title) return;
    addBuildingTask(todoHall.id, title, activeStatus);
    setDraft("");
  }

  function updatePointerDrag(next: TaskPointerDrag | null) {
    pointerDragRef.current = next;
    setPointerDrag(next);
  }

  function clearPointerDrag() {
    pointerListenerCleanupRef.current?.();
    pointerListenerCleanupRef.current = null;
    updatePointerDrag(null);
    setDragOverStatus(null);
  }

  function moveTaskToStatus(taskId: string | null, status: BuildingTaskStatus) {
    const task = tasks.find((item) => item.id === taskId);
    if (todoHall && task && task.status !== status) {
      updateBuildingTask(todoHall.id, task.id, { status });
    }
    setActiveStatus(status);
  }

  function statusAtPoint(x: number, y: number): BuildingTaskStatus | null {
    const element = document.elementFromPoint(x, y) as HTMLElement | null;
    const value = element?.closest<HTMLElement>("[data-todo-status]")?.dataset.todoStatus;
    return STATUS_OPTIONS.some((item) => item.id === value) ? value as BuildingTaskStatus : null;
  }

  function startPointerDrag(event: ReactPointerEvent<HTMLButtonElement>, taskId: string, title: string) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const initial: TaskPointerDrag = {
      taskId,
      title,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      dragging: false,
    };
    updatePointerDrag(initial);

    const handleMove = (moveEvent: PointerEvent) => {
      const current = pointerDragRef.current;
      if (!current || current.pointerId !== moveEvent.pointerId) return;
      const distance = Math.hypot(moveEvent.clientX - current.startX, moveEvent.clientY - current.startY);
      const dragging = current.dragging || distance >= 6;
      updatePointerDrag({ ...current, x: moveEvent.clientX, y: moveEvent.clientY, dragging });
      if (dragging) {
        moveEvent.preventDefault();
        setDragOverStatus(statusAtPoint(moveEvent.clientX, moveEvent.clientY));
      }
    };
    const handleUp = (upEvent: PointerEvent) => {
      const current = pointerDragRef.current;
      if (!current || current.pointerId !== upEvent.pointerId) return;
      if (current.dragging) {
        upEvent.preventDefault();
        const status = statusAtPoint(upEvent.clientX, upEvent.clientY);
        if (status) moveTaskToStatus(current.taskId, status);
      }
      clearPointerDrag();
    };
    const handleCancel = (cancelEvent: PointerEvent) => {
      if (pointerDragRef.current?.pointerId === cancelEvent.pointerId) clearPointerDrag();
    };
    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp, { passive: false });
    window.addEventListener("pointercancel", handleCancel);
    pointerListenerCleanupRef.current = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleCancel);
    };
  }

  return (
    <>
    <div style={backdropStyle} onClick={close}>
      <section data-ui-surface="panel" style={modalStyle} onClick={(event) => event.stopPropagation()}>
        <header style={headerStyle}>
          <div>
            <div style={eyebrowStyle}>待办大厅</div>
            <h2 style={titleStyle}>{todoHall?.name ?? "待办大厅"}</h2>
          </div>
          <button style={closeStyle} onClick={close} aria-label="关闭待办大厅">×</button>
        </header>

        {todoHall && resident ? (
          <div style={agentWrapStyle}>
            <BuildingAgentGuide
              resident={resident}
              name={getCharacterDisplayName(resident, residentConfig)}
              role={resident.role}
              spriteUrl={resident.spriteUrl}
              accent={resident.accent}
              message="这个 Agent 入驻待办大厅，可以读取这里的任务、状态和备注，并在聊天时帮你整理优先级。"
              onChat={() => openCharacterChat(resident.id)}
              onConfigure={() => openCharacterConfig(resident.id)}
              onChange={() => openCharacterLibrary(todoHall.id)}
            />
          </div>
        ) : (
          <div style={emptyAgentStyle}>
            <span>还没有为待办大厅分配 Agent。分配后，Agent 聊天时可以读取这里的待办事项。</span>
            {todoHall && <button style={secondaryBtnStyle} onClick={() => openCharacterLibrary(todoHall.id)}>设置 Agent</button>}
          </div>
        )}

        <div style={summaryGridStyle}>
          {STATUS_OPTIONS.map((status) => (
            <div
              key={status.id}
              data-todo-status={status.id}
              role="button"
              tabIndex={0}
              style={{
                ...statusTabStyle,
                borderColor: dragOverStatus === status.id ? "#f59e0b" : activeStatus === status.id ? "var(--ac-selected-border)" : "var(--ac-border)",
                background: dragOverStatus === status.id ? "rgba(245,158,11,.14)" : activeStatus === status.id ? "var(--ac-selected)" : "var(--ac-surface)",
                boxShadow: dragOverStatus === status.id ? "0 12px 28px rgba(245,158,11,.2)" : statusTabStyle.boxShadow,
                transform: dragOverStatus === status.id ? "translateY(-3px)" : "none",
              }}
              onClick={() => setActiveStatus(status.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setActiveStatus(status.id);
                }
              }}
              aria-label={`${status.label}，${counts[status.id]} 项；可将任务拖到这里`}
            >
              <span style={statusCountStyle}>{counts[status.id]}</span>
              <strong>{status.label}</strong>
              <small>{status.hint}</small>
            </div>
          ))}
        </div>

        <div style={composerStyle}>
          <input
            style={inputStyle}
            value={draft}
            placeholder={`添加到 ${STATUS_OPTIONS.find((item) => item.id === activeStatus)?.label}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
          />
          <button style={primaryBtnStyle} onClick={submit}>添加任务</button>
        </div>

        <main style={taskListStyle}>
          {visibleTasks.length ? (
            visibleTasks.map((task) => (
              <article
                key={task.id}
                style={{
                  ...taskCardStyle,
                  opacity: pointerDrag?.taskId === task.id && pointerDrag.dragging ? .45 : 1,
                  transform: pointerDrag?.taskId === task.id && pointerDrag.dragging ? "scale(.985)" : "none",
                }}
              >
                <button
                  type="button"
                  style={{ ...dragHandleStyle, cursor: pointerDrag?.taskId === task.id ? "grabbing" : "grab" }}
                  onPointerDown={(event) => startPointerDrag(event, task.id, task.title)}
                  aria-label={`拖动任务「${task.title}」到其他状态`}
                  title="按住并拖到上方状态分组"
                >
                  ⠿
                </button>
                <button
                  style={{
                    ...checkBtnStyle,
                    borderColor: task.status === "done" ? "#dc2626" : "var(--ac-contrast-bg)",
                    color: task.status === "done" ? "#dc2626" : "var(--ac-contrast-bg)",
                    boxShadow: task.status === "done"
                      ? "0 4px 12px rgba(220,38,38,.2)"
                      : "0 4px 12px rgba(15,23,42,.14)",
                  }}
                  onClick={() =>
                    updateBuildingTask(todoHall!.id, task.id, {
                      status: task.status === "done" ? "todo" : "done",
                    })
                  }
                  aria-label={task.status === "done" ? "标记为待办" : "标记完成"}
                  aria-pressed={task.status === "done"}
                >
                  {task.status === "done" ? "✓" : ""}
                </button>
                <div style={{ minWidth: 0 }}>
                  <div style={taskTitleStyle}>{task.title}</div>
                  <input
                    style={noteInputStyle}
                    value={task.note ?? ""}
                    placeholder="备注 / 下一步 / 负责人"
                    onChange={(event) => updateBuildingTask(todoHall!.id, task.id, { note: event.target.value })}
                  />
                </div>
                <select
                  style={statusSelectStyle}
                  value={task.status}
                  onChange={(event) =>
                    updateBuildingTask(todoHall!.id, task.id, { status: event.target.value as BuildingTaskStatus })
                  }
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status.id} value={status.id}>{status.label}</option>
                  ))}
                </select>
                <button style={dangerBtnStyle} onClick={() => removeBuildingTask(todoHall!.id, task.id)} aria-label="删除任务">
                  ×
                </button>
              </article>
            ))
          ) : (
            <div style={emptyStyle}>这个分组还没有任务。</div>
          )}
        </main>
      </section>
    </div>
    {pointerDrag?.dragging && createPortal(
      <div style={{ ...dragPreviewStyle, left: pointerDrag.x + 14, top: pointerDrag.y + 14 }}>
        <span style={dragPreviewHandleStyle}>⠿</span>
        <div style={{ minWidth: 0 }}>
          <strong style={dragPreviewTitleStyle}>{pointerDrag.title}</strong>
          <small style={dragPreviewHintStyle}>{dragOverStatus ? `放入${STATUS_OPTIONS.find((item) => item.id === dragOverStatus)?.label}` : "拖到上方状态卡"}</small>
        </div>
      </div>,
      document.body
    )}
    </>
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
  width: "min(1080px, 95vw)",
  maxHeight: "90vh",
  overflow: "hidden",
  borderRadius: 22,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-panel)",
  color: "var(--ac-text)",
  display: "flex",
  flexDirection: "column",
  boxShadow: "var(--ac-shadow)",
  backdropFilter: "blur(28px) saturate(1.16)",
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
  fontWeight: 950,
};

const titleStyle: CSSProperties = {
  margin: "3px 0 0",
  fontSize: 25,
  letterSpacing: 0,
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

const summaryGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  padding: "0 18px 16px",
  borderBottom: "1px solid var(--ac-border)",
};

const agentWrapStyle: CSSProperties = {
  padding: "16px 18px 0",
};

const emptyAgentStyle: CSSProperties = {
  margin: 16,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 10,
  borderRadius: 14,
  border: "1px dashed var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-muted)",
  padding: 14,
  fontSize: 13,
};

const statusTabStyle: CSSProperties = {
  minHeight: 92,
  border: "1px solid",
  borderRadius: 14,
  color: "var(--ac-text-soft)",
  cursor: "pointer",
  display: "grid",
  gap: 3,
  padding: 13,
  boxShadow: "0 7px 22px rgba(15,23,42,.05)",
  textAlign: "left",
  transition: "transform .16s ease, border-color .16s ease, background .16s ease, box-shadow .16s ease",
};

const statusCountStyle: CSSProperties = {
  color: "var(--ac-accent-text)",
  fontSize: 20,
  fontWeight: 950,
};

const composerStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 8,
  padding: "0 18px 16px",
};

const inputStyle: CSSProperties = {
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text)",
  padding: "0 10px",
  fontSize: 13,
};

const primaryBtnStyle: CSSProperties = {
  minHeight: 44,
  borderRadius: 12,
  border: "1px solid rgba(96,165,250,0.4)",
  background: "#60a5fa",
  color: "var(--ac-field)",
  cursor: "pointer",
  fontWeight: 950,
  padding: "0 14px",
};

const secondaryBtnStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 10,
  border: "1px solid rgba(147,197,253,0.28)",
  background: "var(--ac-surface-raised)",
  color: "var(--ac-accent-text)",
  cursor: "pointer",
  fontWeight: 900,
  padding: "0 10px",
  whiteSpace: "nowrap",
};

const taskListStyle: CSSProperties = {
  overflowY: "auto",
  padding: "0 18px 18px",
  display: "grid",
  gap: 10,
};

const taskCardStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "20px 28px minmax(0, 1fr) 116px 30px",
  alignItems: "center",
  gap: 8,
  borderRadius: 14,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  padding: "11px 12px",
  boxShadow: "0 6px 20px rgba(15,23,42,.04)",
  transition: "opacity .16s ease, transform .16s ease, box-shadow .16s ease",
};

const dragHandleStyle: CSSProperties = {
  width: 20,
  height: 34,
  display: "grid",
  placeItems: "center",
  padding: 0,
  border: 0,
  borderRadius: 7,
  background: "transparent",
  color: "var(--ac-muted)",
  fontSize: 18,
  lineHeight: 1,
  touchAction: "none",
  userSelect: "none",
};

const dragPreviewStyle: CSSProperties = {
  position: "fixed",
  zIndex: 500000,
  width: 270,
  minHeight: 58,
  display: "grid",
  gridTemplateColumns: "22px minmax(0, 1fr)",
  alignItems: "center",
  gap: 10,
  padding: "11px 13px",
  borderRadius: 13,
  border: "1px solid var(--ac-selected-border)",
  background: "var(--ac-surface-strong)",
  color: "var(--ac-text)",
  boxShadow: "0 18px 44px rgba(15,23,42,.24)",
  backdropFilter: "blur(18px)",
  pointerEvents: "none",
  transform: "rotate(1deg)",
};

const dragPreviewHandleStyle: CSSProperties = {
  color: "var(--ac-muted)",
  fontSize: 19,
};

const dragPreviewTitleStyle: CSSProperties = {
  display: "block",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  fontSize: 12,
};

const dragPreviewHintStyle: CSSProperties = {
  display: "block",
  marginTop: 4,
  color: "var(--ac-muted)",
  fontSize: 10,
};

const checkBtnStyle: CSSProperties = {
  width: 26,
  height: 26,
  display: "grid",
  placeItems: "center",
  borderRadius: 8,
  border: "1.5px solid",
  background: "transparent",
  cursor: "pointer",
  fontWeight: 950,
  fontSize: 16,
  lineHeight: 1,
  transition: "border-color .16s ease, color .16s ease, box-shadow .16s ease, transform .16s ease",
};

const taskTitleStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "var(--ac-text)",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const noteInputStyle: CSSProperties = {
  width: "100%",
  marginTop: 5,
  border: 0,
  borderBottom: "1px solid var(--ac-border)",
  background: "transparent",
  color: "var(--ac-muted)",
  padding: "4px 0",
  fontSize: 11,
};

const statusSelectStyle: CSSProperties = {
  minHeight: 30,
  borderRadius: 9,
  border: "1px solid var(--ac-border)",
  background: "var(--ac-field)",
  color: "var(--ac-text-soft)",
  fontSize: 12,
};

const dangerBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: 9,
  border: "1px solid rgba(248,113,113,0.4)",
  background: "rgba(127,29,29,0.45)",
  color: "#fecaca",
  cursor: "pointer",
  fontSize: 18,
  lineHeight: "20px",
};

const emptyStyle: CSSProperties = {
  borderRadius: 8,
  border: "1px dashed var(--ac-border)",
  background: "var(--ac-glass)",
  color: "var(--ac-muted)",
  padding: 18,
  textAlign: "center",
  fontSize: 13,
};
