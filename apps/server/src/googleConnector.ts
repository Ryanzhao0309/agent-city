import crypto from "node:crypto";
import { db, deleteSecret, getSecretValue, saveSecret } from "./db.js";

const CLIENT_ID_KEY = "GOOGLE_OAUTH_CLIENT_ID";
const CLIENT_SECRET_KEY = "GOOGLE_OAUTH_CLIENT_SECRET";
const REFRESH_TOKEN_KEY = "GOOGLE_OAUTH_REFRESH_TOKEN";
const REDIRECT_URI = process.env.GOOGLE_OAUTH_REDIRECT_URI ?? "http://127.0.0.1:34127/api/google/oauth/callback";
const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const OAUTH_SCOPES = {
  gmail: [GMAIL_READ_SCOPE, GMAIL_COMPOSE_SCOPE],
  calendar: [CALENDAR_EVENTS_SCOPE],
} as const;

db.exec(`
  CREATE TABLE IF NOT EXISTS google_connection (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    email TEXT,
    scopes TEXT NOT NULL DEFAULT '',
    connected_at TEXT,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS google_oauth_state (
    state TEXT PRIMARY KEY,
    verifier TEXT NOT NULL,
    requested_scopes TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );
`);

let accessTokenCache: { token: string; expiresAt: number; scopes: string[] } | null = null;

function base64Url(value: Buffer): string {
  return value.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function requireClientConfig(): { clientId: string; clientSecret: string } {
  const clientId = getSecretValue(CLIENT_ID_KEY) ?? process.env[CLIENT_ID_KEY] ?? "";
  const clientSecret = getSecretValue(CLIENT_SECRET_KEY) ?? process.env[CLIENT_SECRET_KEY] ?? "";
  if (!clientId) throw new Error("请先在设置中配置 GOOGLE_OAUTH_CLIENT_ID。");
  return { clientId, clientSecret };
}

export function getGoogleConnectionStatus() {
  const row = db.prepare("SELECT email, scopes, connected_at FROM google_connection WHERE id = 1").get() as
    | { email: string | null; scopes: string; connected_at: string | null }
    | undefined;
  const scopes = row?.scopes.split(" ").filter(Boolean) ?? [];
  return {
    configured: Boolean(getSecretValue(CLIENT_ID_KEY) ?? process.env[CLIENT_ID_KEY]),
    connected: Boolean(getSecretValue(REFRESH_TOKEN_KEY)),
    email: row?.email ?? null,
    scopes,
    gmail: scopes.includes(GMAIL_READ_SCOPE),
    gmailDraft: scopes.includes(GMAIL_COMPOSE_SCOPE),
    calendar: scopes.includes(CALENDAR_EVENTS_SCOPE),
    connectedAt: row?.connected_at ?? null,
  };
}

export function beginGoogleOAuth(services: string[]): { authUrl: string; expiresAt: string } {
  const { clientId } = requireClientConfig();
  const selected = services.filter((service) => service === "gmail" || service === "calendar") as Array<keyof typeof OAUTH_SCOPES>;
  if (!selected.length) throw new Error("请至少选择 Gmail 或 Calendar。");
  const requestedScopes = [...new Set(["openid", "email", ...selected.flatMap((service) => [...OAUTH_SCOPES[service]])])];
  const state = base64Url(crypto.randomBytes(24));
  const verifier = base64Url(crypto.randomBytes(48));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
  db.prepare("DELETE FROM google_oauth_state WHERE expires_at < datetime('now')").run();
  db.prepare("INSERT INTO google_oauth_state (state, verifier, requested_scopes, expires_at) VALUES (?, ?, ?, ?)")
    .run(state, verifier, requestedScopes.join(" "), expiresAt);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: requestedScopes.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return { authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params}`, expiresAt };
}

export async function completeGoogleOAuth(code: string, state: string): Promise<void> {
  const row = db.prepare("SELECT verifier, requested_scopes, expires_at FROM google_oauth_state WHERE state = ?").get(state) as
    | { verifier: string; requested_scopes: string; expires_at: string }
    | undefined;
  if (!row || new Date(row.expires_at).getTime() < Date.now()) throw new Error("Google 授权请求已过期，请重新连接。");
  db.prepare("DELETE FROM google_oauth_state WHERE state = ?").run(state);
  const { clientId, clientSecret } = requireClientConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      code,
      code_verifier: row.verifier,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const data = await response.json() as { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || `Google token exchange failed: ${response.status}`);
  if (data.refresh_token) saveSecret(REFRESH_TOKEN_KEY, data.refresh_token);
  if (!getSecretValue(REFRESH_TOKEN_KEY)) throw new Error("Google 没有返回 refresh token，请撤销旧授权后重试。");
  const scopes = (data.scope || row.requested_scopes).split(" ").filter(Boolean);
  accessTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000, scopes };
  const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { Authorization: `Bearer ${data.access_token}` } });
  const profile = profileResponse.ok ? await profileResponse.json() as { email?: string } : {};
  db.prepare(`INSERT INTO google_connection (id, email, scopes, connected_at, updated_at)
    VALUES (1, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(id) DO UPDATE SET email = excluded.email, scopes = excluded.scopes, connected_at = excluded.connected_at, updated_at = excluded.updated_at`)
    .run(profile.email ?? null, scopes.join(" "));
}

export function disconnectGoogle(): void {
  deleteSecret(REFRESH_TOKEN_KEY);
  accessTokenCache = null;
  db.prepare("DELETE FROM google_connection WHERE id = 1").run();
}

async function getAccessToken(requiredScopes: readonly string[], signal?: AbortSignal): Promise<string> {
  const status = getGoogleConnectionStatus();
  if (!status.connected || !requiredScopes.every((scope) => status.scopes.includes(scope))) {
    throw new Error("Google 服务未连接，或缺少所需授权。");
  }
  if (accessTokenCache && accessTokenCache.expiresAt > Date.now()) return accessTokenCache.token;
  const refreshToken = getSecretValue(REFRESH_TOKEN_KEY);
  if (!refreshToken) throw new Error("Google refresh token 不存在，请重新连接。");
  const { clientId, clientSecret } = requireClientConfig();
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, ...(clientSecret ? { client_secret: clientSecret } : {}), refresh_token: refreshToken, grant_type: "refresh_token" }),
    signal,
  });
  const data = await response.json() as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || "Google token refresh failed.");
  accessTokenCache = { token: data.access_token, expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000, scopes: status.scopes };
  return data.access_token;
}

async function googleJson(url: string, scopes: readonly string[], init: RequestInit = {}): Promise<unknown> {
  const token = await getAccessToken(scopes, init.signal ?? undefined);
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error((data as { error?: { message?: string } } | null)?.error?.message || `Google API failed: ${response.status}`);
  return data;
}

function decodeBase64Url(value = ""): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export async function searchGmail(query: string, signal?: AbortSignal) {
  const data = await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`, [GMAIL_READ_SCOPE], { signal }) as { messages?: Array<{ id: string; threadId: string }> };
  return data.messages ?? [];
}

export async function readGmail(messageId: string, signal?: AbortSignal) {
  const data = await googleJson(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`, [GMAIL_READ_SCOPE], { signal }) as {
    id?: string; snippet?: string; payload?: { headers?: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<{ mimeType?: string; body?: { data?: string } }> };
  };
  const headers = Object.fromEntries((data.payload?.headers ?? []).map((item) => [item.name.toLowerCase(), item.value]));
  const plainPart = data.payload?.parts?.find((part) => part.mimeType === "text/plain")?.body?.data;
  return { id: data.id, from: headers.from, to: headers.to, subject: headers.subject, date: headers.date, snippet: data.snippet, body: decodeBase64Url(plainPart ?? data.payload?.body?.data) };
}

function rawEmail(to: string, subject: string, body: string): string {
  return base64Url(Buffer.from(`To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${body}`, "utf8"));
}

export async function createGmailDraft(to: string, subject: string, body: string, signal?: AbortSignal) {
  return googleJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts", [GMAIL_COMPOSE_SCOPE], { method: "POST", body: JSON.stringify({ message: { raw: rawEmail(to, subject, body) } }), signal });
}

export async function sendGmailDraft(draftId: string, signal?: AbortSignal) {
  return googleJson("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", [GMAIL_COMPOSE_SCOPE], { method: "POST", body: JSON.stringify({ id: draftId }), signal });
}

export async function listCalendarEvents(timeMin: string, timeMax: string, signal?: AbortSignal) {
  return googleJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&maxResults=50`, [CALENDAR_EVENTS_SCOPE], { signal });
}

export async function createCalendarEvent(event: Record<string, unknown>, signal?: AbortSignal) {
  return googleJson("https://www.googleapis.com/calendar/v3/calendars/primary/events", [CALENDAR_EVENTS_SCOPE], { method: "POST", body: JSON.stringify(event), signal });
}

export async function updateCalendarEvent(eventId: string, event: Record<string, unknown>, signal?: AbortSignal) {
  return googleJson(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, [CALENDAR_EVENTS_SCOPE], { method: "PATCH", body: JSON.stringify(event), signal });
}

export async function deleteCalendarEvent(eventId: string, signal?: AbortSignal) {
  const token = await getAccessToken([CALENDAR_EVENTS_SCOPE], signal);
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` }, signal });
  if (!response.ok && response.status !== 204) throw new Error(`Google Calendar delete failed: ${response.status}`);
  return { deleted: true, eventId };
}
