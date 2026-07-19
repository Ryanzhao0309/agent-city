import { apiUrl } from "./api";
import { isTauriDesktop } from "./desktopService";
import { useCityStore } from "../store/cityStore";

export type DesktopNotificationStatus = "completed" | "failed" | "approval_required" | "waiting_user";

export interface DesktopNotificationEvent {
  id: number;
  agentId: string;
  agentName: string;
  runId: string;
  taskId: string;
  sessionId: string | null;
  status: DesktopNotificationStatus;
  taskTitle: string;
  summary: string;
  createdAt: string;
}

export type DesktopNotificationPermission = "unavailable" | "unknown" | "granted" | "denied" | "error";

export interface DesktopNotificationState {
  available: boolean;
  enabled: boolean;
  permission: DesktopNotificationPermission;
  connection: "idle" | "connecting" | "connected" | "error";
  message: string;
}

const ENABLED_KEY = "agent-city.desktop-notifications.enabled.v1";
const CURSOR_KEY = "agent-city.desktop-notifications.cursor.v1";
const STATE_EVENT = "agent-city:desktop-notification-state";
const TARGET_PREFIX = "agent-city.desktop-notification-target.";

let runtimeState: DesktopNotificationState = {
  available: isTauriDesktop(),
  enabled: localStorage.getItem(ENABLED_KEY) === "true",
  permission: isTauriDesktop() ? "unknown" : "unavailable",
  connection: "idle",
  message: isTauriDesktop() ? "尚未检查系统权限" : "仅 Agent City 桌面版支持系统通知",
};

function publishState(patch: Partial<DesktopNotificationState>): void {
  runtimeState = { ...runtimeState, ...patch };
  window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: runtimeState }));
}

export function getDesktopNotificationState(): DesktopNotificationState {
  return { ...runtimeState };
}

export function subscribeDesktopNotificationState(listener: (state: DesktopNotificationState) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<DesktopNotificationState>).detail);
  window.addEventListener(STATE_EVENT, handler);
  return () => window.removeEventListener(STATE_EVENT, handler);
}

async function latestCursor(): Promise<number> {
  const response = await fetch(apiUrl("/api/desktop-notifications/cursor"));
  if (!response.ok) throw new Error("无法读取通知事件游标。");
  const data = await response.json() as { cursor?: number };
  return Number.isFinite(data.cursor) ? Math.max(0, Number(data.cursor)) : 0;
}

function storedCursor(): number | null {
  const value = localStorage.getItem(CURSOR_KEY);
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

function saveCursor(cursor: number): void {
  localStorage.setItem(CURSOR_KEY, String(Math.max(0, Math.floor(cursor))));
}

export function truncateNotificationText(value: string, maxCharacters = 160): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  const characters = Array.from(normalized);
  return characters.length <= maxCharacters ? normalized : `${characters.slice(0, maxCharacters - 1).join("")}…`;
}

export async function refreshDesktopNotificationPermission(): Promise<DesktopNotificationState> {
  if (!isTauriDesktop()) {
    publishState({ available: false, permission: "unavailable", connection: "idle", message: "仅 Agent City 桌面版支持系统通知" });
    return getDesktopNotificationState();
  }
  try {
    const { isPermissionGranted } = await import("@tauri-apps/plugin-notification");
    const granted = await isPermissionGranted();
    publishState({ available: true, permission: granted ? "granted" : "unknown", message: granted ? "系统通知权限已授权" : "尚未获得系统通知权限" });
  } catch (error) {
    publishState({ permission: "error", message: error instanceof Error ? error.message : "无法检查通知权限" });
  }
  return getDesktopNotificationState();
}

export async function enableDesktopNotifications(): Promise<boolean> {
  if (!isTauriDesktop()) {
    publishState({ available: false, permission: "unavailable", message: "请在 Agent City 桌面版中开启通知" });
    return false;
  }
  try {
    const { isPermissionGranted, requestPermission } = await import("@tauri-apps/plugin-notification");
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === "granted";
    if (!granted) {
      localStorage.setItem(ENABLED_KEY, "false");
      publishState({ enabled: false, permission: "denied", connection: "idle", message: "系统通知权限未授予，请在 macOS 系统设置中允许 Agent City 通知" });
      return false;
    }
    saveCursor(await latestCursor());
    localStorage.setItem(ENABLED_KEY, "true");
    publishState({ enabled: true, permission: "granted", connection: "connecting", message: "通知已开启，正在连接任务事件流…" });
    return true;
  } catch (error) {
    localStorage.setItem(ENABLED_KEY, "false");
    publishState({ enabled: false, permission: "error", connection: "error", message: error instanceof Error ? error.message : "通知开启失败" });
    return false;
  }
}

export function disableDesktopNotifications(): void {
  localStorage.setItem(ENABLED_KEY, "false");
  publishState({ enabled: false, connection: "idle", message: "桌面通知已关闭，定时任务仍会正常执行" });
}

export async function sendDesktopTestNotification(): Promise<void> {
  if (!isTauriDesktop()) throw new Error("测试通知仅支持桌面版。");
  const { isPermissionGranted, sendNotification } = await import("@tauri-apps/plugin-notification");
  if (!await isPermissionGranted()) throw new Error("请先开启并授权桌面通知。");
  sendNotification({ title: "Agent City · 测试通知", body: "桌面消息推送工作正常。", autoCancel: true });
}

const statusLabels: Record<DesktopNotificationStatus, string> = {
  completed: "任务已完成",
  failed: "任务执行失败",
  approval_required: "等待你的审批",
  waiting_user: "等待补充信息",
};

function notificationId(eventId: number): number {
  return Math.max(1, Math.min(2_147_483_647, Math.floor(eventId)));
}

function targetKey(id: number): string {
  return `${TARGET_PREFIX}${id}`;
}

function saveNotificationTarget(event: DesktopNotificationEvent): void {
  localStorage.setItem(targetKey(notificationId(event.id)), JSON.stringify(event));
}

function targetFromNotification(value: { id?: number; extra?: Record<string, unknown> }): DesktopNotificationEvent | null {
  if (value.extra?.event && typeof value.extra.event === "object") return value.extra.event as DesktopNotificationEvent;
  if (!Number.isFinite(value.id)) return null;
  try {
    const raw = localStorage.getItem(targetKey(Number(value.id)));
    return raw ? JSON.parse(raw) as DesktopNotificationEvent : null;
  } catch {
    return null;
  }
}

export async function openDesktopNotificationTarget(event: DesktopNotificationEvent): Promise<void> {
  if (isTauriDesktop()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    const windowHandle = getCurrentWindow();
    await windowHandle.show();
    await windowHandle.unminimize();
    await windowHandle.setFocus();
  }
  const store = useCityStore.getState();
  try { await store.syncScheduledChatMessages(event.agentId); } catch { /* Opening the Agent remains useful if sync is temporarily unavailable. */ }
  const refreshed = useCityStore.getState();
  const session = (refreshed.characterChatSessions[event.agentId] ?? [])
    .find((candidate) => candidate.serverSessionId === event.sessionId);
  if (session) refreshed.selectCharacterChatSession(event.agentId, session.id);
  refreshed.openCharacterChat(event.agentId);
}

let actionListenerInstalled = false;

async function installNotificationActionListener(): Promise<void> {
  if (actionListenerInstalled || !isTauriDesktop()) return;
  const { onAction } = await import("@tauri-apps/plugin-notification");
  await onAction((notification) => {
    const target = targetFromNotification(notification);
    if (target) void openDesktopNotificationTarget(target);
  });
  actionListenerInstalled = true;
}

async function sendTaskNotification(event: DesktopNotificationEvent): Promise<void> {
  saveNotificationTarget(event);
  // The official Tauri desktop plugin delegates immediate notifications to the
  // Web Notification API. Keeping the returned object lets us route a click
  // back to the exact Agent conversation while the app is hidden in the tray.
  const notification = new Notification(`${event.agentName} · ${statusLabels[event.status]}`, {
    body: truncateNotificationText(`${event.taskTitle}：${event.summary}`),
    tag: `agent-city-event-${event.id}`,
    data: event,
  });
  notification.onclick = () => {
    notification.close();
    void openDesktopNotificationTarget(event);
  };
}

export async function startDesktopNotificationStream(): Promise<() => void> {
  if (!isTauriDesktop() || localStorage.getItem(ENABLED_KEY) !== "true") return () => undefined;
  await installNotificationActionListener();
  let cursor = storedCursor();
  if (cursor == null) {
    cursor = await latestCursor();
    saveCursor(cursor);
  }
  publishState({ enabled: true, permission: "granted", connection: "connecting", message: "正在连接任务通知…" });
  const source = new EventSource(apiUrl(`/api/desktop-notifications/events?after=${cursor}`));
  let processing = Promise.resolve();
  source.onopen = () => publishState({ connection: "connected", message: "已连接，Agent City 可在后台推送任务消息" });
  source.onerror = () => publishState({ connection: "error", message: "通知事件流暂时断开，正在自动重连…" });
  source.addEventListener("desktop_notification", (rawEvent) => {
    processing = processing.then(async () => {
      const event = JSON.parse((rawEvent as MessageEvent).data) as DesktopNotificationEvent;
      const consumed = storedCursor() ?? 0;
      if (!Number.isFinite(event.id) || event.id <= consumed) return;
      await sendTaskNotification(event);
      saveCursor(event.id);
    }).catch((error) => {
      publishState({ connection: "error", message: error instanceof Error ? error.message : "系统通知发送失败" });
    });
  });
  return () => {
    source.close();
    publishState({ connection: "idle" });
  };
}
