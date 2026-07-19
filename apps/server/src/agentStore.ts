import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { dataDir } from "./db.js";

const agentsDir = path.join(dataDir, "agents");
const citySkillsDir = path.join(dataDir, "skills");
const MAX_SKILL_BYTES = 256 * 1024;
const MAX_WORKSPACE_FILE_BYTES = 5 * 1024 * 1024;
const MAX_WORKSPACE_CONTEXT_BYTES = 48 * 1024;

export interface LearnedSkillRecord {
  id: string;
  slug: string;
  name: string;
  icon: string;
  summary: string;
  sourceUrl: string;
  installedAt: string;
  skillPath?: string;
  commitSha?: string;
  contentHash?: string;
  requestedCapabilities?: string[];
  valid?: boolean;
  disabledReason?: string;
}

export type AgentCapabilityMode = "none" | "read" | "write-with-approval";

export interface AgentPermissionsRecord {
  workspace?: AgentCapabilityMode;
  gmail?: "none" | "read" | "draft";
  calendar?: AgentCapabilityMode;
  web?: "none" | "read";
  cityData?: AgentCapabilityMode;
  // Legacy fields are retained while old layouts migrate.
  cityDataReadonly?: boolean;
  directory?: "none" | "city-data-readonly" | "project-readonly" | "approval-required";
}

export interface AgentConfigRecord {
  displayName?: string;
  brain?: unknown;
  files?: unknown;
  permissions?: AgentPermissionsRecord;
  workspaceRoot?: string;
  managedWorkspace?: "city-skills";
  learnedSkillIds?: string[];
  learnedSkills?: LearnedSkillRecord[];
  skillEnabledById?: Record<string, boolean>;
  schedule?: unknown;
  timedTasks?: unknown;
  configFilePath?: string;
}

export interface AgentWorkspaceFile {
  name: string;
  path: string;
  size: number;
  updatedAt: string;
  mimeType?: string;
}

export interface SkillInstallPayload {
  id?: string;
  slug?: string;
  name: string;
  icon: string;
  summary: string;
  sourceUrl: string;
  content: string;
  commitSha?: string;
  contentHash?: string;
  requestedCapabilities?: string[];
}

function ensureAgentsDir() {
  fs.mkdirSync(agentsDir, { recursive: true });
}

export function isSafeSlug(value: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,79}$/.test(value);
}

export function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "skill";
}

function assertAgentId(agentId: string) {
  if (!/^[a-z0-9][a-z0-9-_]{0,79}$/i.test(agentId)) {
    throw new Error("Invalid agent id.");
  }
}

function agentDir(agentId: string) {
  assertAgentId(agentId);
  return path.join(agentsDir, agentId);
}

function agentConfigPath(agentId: string) {
  return path.join(agentDir(agentId), "agent.json");
}

function agentWorkspaceDir(agentId: string) {
  if (readAgentConfig(agentId)?.managedWorkspace === "city-skills") {
    fs.mkdirSync(citySkillsDir, { recursive: true });
    return citySkillsDir;
  }
  return path.join(agentDir(agentId), "workspace");
}

function safeFileName(fileName: string): string {
  const base = path.basename(fileName).replace(/[^a-zA-Z0-9._ -]+/g, "_").trim();
  if (!base || base === "." || base === "..") throw new Error("Invalid file name.");
  return base.slice(0, 160);
}

function withConfigPath(agentId: string, config: AgentConfigRecord): AgentConfigRecord {
  const legacyDirectory = config.permissions?.directory;
  const cityData = config.permissions?.cityData ??
    (config.permissions?.cityDataReadonly || legacyDirectory === "city-data-readonly" ? "read" : "none");
  const workspace = config.permissions?.workspace ??
    (legacyDirectory === "project-readonly" ? "read" : legacyDirectory === "approval-required" ? "write-with-approval" : "none");
  return {
    ...config,
    permissions: {
      ...config.permissions,
      workspace,
      gmail: config.permissions?.gmail ?? "none",
      calendar: config.permissions?.calendar ?? "none",
      web: config.permissions?.web ?? "none",
      cityData,
    },
    configFilePath: agentConfigPath(agentId),
    learnedSkillIds: config.learnedSkillIds ?? config.learnedSkills?.map((skill) => skill.id) ?? [],
    learnedSkills: config.learnedSkills ?? [],
    skillEnabledById: config.skillEnabledById ?? {},
  };
}

export function listAgentConfigs(): Record<string, AgentConfigRecord> {
  ensureAgentsDir();
  const result: Record<string, AgentConfigRecord> = {};
  for (const entry of fs.readdirSync(agentsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    try {
      const config = readAgentConfig(entry.name);
      if (config) result[entry.name] = config;
    } catch {
      continue;
    }
  }
  return result;
}

export function readAgentConfig(agentId: string): AgentConfigRecord | null {
  const filePath = agentConfigPath(agentId);
  if (!fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as AgentConfigRecord;
  return withConfigPath(agentId, parsed);
}

export function saveAgentConfig(agentId: string, config: AgentConfigRecord): AgentConfigRecord {
  const dir = agentDir(agentId);
  fs.mkdirSync(dir, { recursive: true });
  const next = withConfigPath(agentId, config);
  fs.writeFileSync(agentConfigPath(agentId), JSON.stringify(next, null, 2));
  return next;
}

export function listWorkspaceFiles(agentId: string): AgentWorkspaceFile[] {
  const dir = agentWorkspaceDir(agentId);
  fs.mkdirSync(dir, { recursive: true });
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const filePath = path.join(dir, entry.name);
      const stat = fs.statSync(filePath);
      return {
        name: entry.name,
        path: filePath,
        size: stat.size,
        updatedAt: stat.mtime.toISOString(),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getWorkspaceFilePath(agentId: string, fileName: string): string {
  const dir = agentWorkspaceDir(agentId);
  const safeName = safeFileName(fileName);
  const filePath = path.resolve(dir, safeName);
  const root = path.resolve(dir);
  if (!filePath.startsWith(root + path.sep) && filePath !== root) {
    throw new Error("Invalid workspace path.");
  }
  return filePath;
}

export function saveWorkspaceFile(agentId: string, fileName: string, data: Buffer): AgentWorkspaceFile {
  if (data.byteLength > MAX_WORKSPACE_FILE_BYTES) {
    throw new Error("Workspace file is too large.");
  }
  const dir = agentWorkspaceDir(agentId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = getWorkspaceFilePath(agentId, fileName);
  fs.writeFileSync(filePath, data);
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
  };
}

export function deleteWorkspaceFile(agentId: string, fileName: string): void {
  const filePath = getWorkspaceFilePath(agentId, fileName);
  if (!fs.existsSync(filePath)) return;
  fs.unlinkSync(filePath);
}

export function readWorkspaceFile(agentId: string, fileName: string): { fileName: string; encoding: "utf8" | "base64"; content: string } {
  const filePath = getWorkspaceFilePath(agentId, fileName);
  if (!fs.existsSync(filePath)) throw new Error("File not found.");
  const buffer = fs.readFileSync(filePath);
  const extension = path.extname(fileName).toLowerCase();
  if (isReadableWorkspaceExtension(extension)) {
    return {
      fileName: path.basename(filePath),
      encoding: "utf8",
      content: buffer.toString("utf8").slice(0, MAX_WORKSPACE_CONTEXT_BYTES),
    };
  }
  return {
    fileName: path.basename(filePath),
    encoding: "base64",
    content: buffer.toString("base64").slice(0, MAX_WORKSPACE_CONTEXT_BYTES),
  };
}

export function getWorkspaceContext(agentId: string): string {
  const files = listWorkspaceFiles(agentId).slice(0, 30);
  if (!files.length) return "No workspace files yet.";
  return files
    .map((file) => `- ${file.name} (${file.size} bytes, updated ${file.updatedAt})`)
    .join("\n");
}

export function getWorkspaceReadableContext(agentId: string): string {
  const files = listWorkspaceFiles(agentId).slice(0, 12);
  if (!files.length) return "No readable workspace files yet.";
  let usedBytes = 0;
  const parts: string[] = [];
  for (const file of files) {
    const extension = path.extname(file.name).toLowerCase();
    if (!isReadableWorkspaceExtension(extension)) {
      parts.push(`## ${file.name}\nBinary or unsupported preview type. The file exists in this agent workspace.`);
      continue;
    }
    const filePath = getWorkspaceFilePath(agentId, file.name);
    const remaining = MAX_WORKSPACE_CONTEXT_BYTES - usedBytes;
    if (remaining <= 0) break;
    const content = fs.readFileSync(filePath, "utf8").slice(0, remaining);
    usedBytes += Buffer.byteLength(content, "utf8");
    parts.push(`## ${file.name}\n${content}`);
  }
  return parts.join("\n\n") || "No readable workspace files yet.";
}

function isReadableWorkspaceExtension(extension: string): boolean {
  return [
    ".txt",
    ".md",
    ".csv",
    ".tsv",
    ".json",
    ".jsonl",
    ".xml",
    ".html",
    ".css",
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".py",
    ".sql",
    ".log",
    ".yaml",
    ".yml",
  ].includes(extension);
}

export async function fetchSkillFromUrl(sourceUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    throw new Error("Invalid URL.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed.");
  }
  if (parsed.hostname !== "github.com" && parsed.hostname !== "raw.githubusercontent.com") {
    throw new Error("首版只支持 GitHub 仓库、目录、blob 或 raw SKILL.md；其他网页不会被抓取或转换成技能。");
  }

  const githubCandidates = await discoverGithubSkills(parsed);
  const candidates = githubCandidates.length ? githubCandidates.map((item) => item.url) : githubSkillCandidates(parsed);
  let lastError = "";
  const previews: Awaited<ReturnType<typeof fetchSkillCandidate>>[] = [];
  for (const candidate of candidates) {
    try {
      const metadata = githubCandidates.find((item) => item.url.toString() === candidate.toString());
      previews.push(await fetchSkillCandidate(candidate, sourceUrl, metadata?.sha));
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Skill URL request failed.";
    }
  }
  if (previews.length) {
    return {
      ...previews[0],
      alternatives: previews.map(({ content, ...preview }) => preview),
    };
  }
  throw new Error(lastError || "没有找到真实的 SKILL.md。请粘贴 SKILL.md raw URL 或 GitHub skill 目录。");
}

export function previewSkillContent(fileName: string, content: string) {
  const normalizedFileName = path.basename(fileName.trim() || "SKILL.md");
  if (!/\.md$/i.test(normalizedFileName)) {
    throw new Error("请上传 Markdown 技能文档（.md）。");
  }
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_BYTES) {
    throw new Error("Skill file is too large.");
  }
  if (looksLikeHtml(content, "")) {
    throw new Error("上传内容是 HTML，不是真正的 SKILL.md。");
  }
  if (!looksLikeSkillMarkdown(content)) {
    throw new Error("这个文件不像 Codex skill。需要包含 frontmatter name/description 或明确的 Markdown 标题。");
  }
  const fallbackName = normalizedFileName
    .replace(/\.md$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
  const name = inferTitle(content) || fallbackName || "Uploaded Skill";
  return {
    name,
    icon: "🧩",
    summary: inferSummary(content),
    sourceUrl: `local-upload:${normalizedFileName}`,
    contentPreview: content.slice(0, 4000),
    content,
    slug: slugify(name),
    contentHash: crypto.createHash("sha256").update(content).digest("hex"),
    requestedCapabilities: inferRequestedCapabilities(content),
  };
}

async function fetchSkillCandidate(parsed: URL, sourceUrl: string, commitSha?: string) {
  const response = await fetch(parsed.toString(), {
    headers: { "User-Agent": "Agent-City-Skill-Installer" },
  });
  if (!response.ok) {
    throw new Error(`Skill URL request failed: ${response.status}`);
  }
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_SKILL_BYTES) {
    throw new Error("Skill file is too large.");
  }
  const content = await response.text();
  if (Buffer.byteLength(content, "utf8") > MAX_SKILL_BYTES) {
    throw new Error("Skill file is too large.");
  }
  if (looksLikeHtml(content, response.headers.get("content-type") ?? "")) {
    throw new Error("这个 URL 返回的是网页 HTML，不是真正的 SKILL.md。请使用 raw SKILL.md 或 GitHub skill 目录。");
  }
  if (!looksLikeSkillMarkdown(content)) {
    throw new Error("这个文件不像 Codex skill。需要包含 SKILL.md 内容、frontmatter name/description 或明确的 Markdown 标题。");
  }
  const name = inferTitle(content) || titleFromUrl(parsed);
  const summary = inferSummary(content);
  const contentHash = crypto.createHash("sha256").update(content).digest("hex");
  return {
    name,
    icon: "🧩",
    summary,
    sourceUrl,
    contentPreview: content.slice(0, 4000),
    content,
    slug: slugify(name),
    resolvedUrl: parsed.toString(),
    commitSha,
    contentHash,
    requestedCapabilities: inferRequestedCapabilities(content),
  };
}

interface GithubSkillCandidate {
  url: URL;
  sha?: string;
}

async function discoverGithubSkills(url: URL): Promise<GithubSkillCandidate[]> {
  if (url.hostname !== "github.com") return [];
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2 || parts[2] === "blob") return [];
  const [owner, repo] = parts;
  const requestedBranch = parts[2] === "tree" ? parts[3] : "";
  const requestedDir = parts[2] === "tree" ? parts.slice(4).join("/") : "";
  const repoResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "Agent-City-Skill-Installer" },
  });
  if (!repoResponse.ok) return [];
  const repoInfo = await repoResponse.json() as { default_branch?: string };
  const branch = requestedBranch || repoInfo.default_branch || "main";
  const treeResponse = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    { headers: { Accept: "application/vnd.github+json", "User-Agent": "Agent-City-Skill-Installer" } }
  );
  if (!treeResponse.ok) return [];
  const tree = await treeResponse.json() as { tree?: Array<{ path?: string; type?: string; sha?: string }> };
  return (tree.tree ?? [])
    .filter((item) => item.type === "blob" && item.path?.endsWith("SKILL.md"))
    .filter((item) => !requestedDir || item.path === `${requestedDir}/SKILL.md` || item.path?.startsWith(`${requestedDir}/`))
    .slice(0, 30)
    .map((item) => ({
      url: new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${item.path}`),
      sha: item.sha,
    }));
}

function githubSkillCandidates(url: URL): URL[] {
  if (url.hostname === "raw.githubusercontent.com") return [url];
  if (url.hostname !== "github.com") return [url];
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length < 2) return [url];
  const [owner, repo] = parts;
  if (parts[2] === "blob" && parts[3]) {
    return [new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${parts.slice(3).join("/")}`)];
  }
  if (parts[2] === "tree" && parts[3]) {
    const branch = parts[3];
    const dir = parts.slice(4).join("/");
    const suffix = dir ? `${dir}/SKILL.md` : "SKILL.md";
    return [new URL(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${suffix}`)];
  }
  return [
    new URL(`https://raw.githubusercontent.com/${owner}/${repo}/main/SKILL.md`),
    new URL(`https://raw.githubusercontent.com/${owner}/${repo}/master/SKILL.md`),
  ];
}

function looksLikeHtml(content: string, contentType: string): boolean {
  return /text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(content) || /^\s*<html[\s>]/i.test(content);
}

function looksLikeSkillMarkdown(content: string): boolean {
  return (
    /^---[\s\S]*?\nname:\s*.+/m.test(content) ||
    /^---[\s\S]*?\ndescription:\s*.+/m.test(content) ||
    /^#\s+.+/m.test(content) ||
    /(^|\n)##\s+(When to use|Instructions|Usage|Tools|Skill)/i.test(content)
  );
}

function inferRequestedCapabilities(content: string): string[] {
  const frontmatter = content.match(/^---\s*\n([\s\S]*?)\n---/m)?.[1] ?? "";
  const inline = frontmatter.match(/^capabilities:\s*\[([^\]]*)\]/m)?.[1];
  if (inline) {
    return inline.split(",").map((item) => item.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean).slice(0, 20);
  }
  const block = frontmatter.match(/^capabilities:\s*\n((?:\s*-\s*.+\n?)*)/m)?.[1] ?? "";
  return [...block.matchAll(/^\s*-\s*(.+)$/gm)].map((match) => match[1].trim()).filter(Boolean).slice(0, 20);
}

export function installSkillForAgents(agentIds: string[], skill: SkillInstallPayload) {
  const slug = skill.slug && isSafeSlug(skill.slug) ? skill.slug : slugify(skill.name);
  if (!isSafeSlug(slug)) throw new Error("Invalid skill slug.");
  const id = skill.id && isSafeSlug(skill.id) ? skill.id : slug;
  const installedAt = new Date().toISOString();
  const results: Record<string, AgentConfigRecord> = {};

  for (const agentId of agentIds) {
    assertAgentId(agentId);
    const config = readAgentConfig(agentId) ?? {};
    const dir = path.join(agentDir(agentId), "skills", slug);
    fs.mkdirSync(dir, { recursive: true });
    const skillPath = path.join(dir, "SKILL.md");
    fs.writeFileSync(skillPath, skill.content);

    const learnedSkill: LearnedSkillRecord = {
      id,
      slug,
      name: skill.name,
      icon: skill.icon || "🧩",
      summary: skill.summary,
      sourceUrl: skill.sourceUrl,
      installedAt,
      skillPath,
      commitSha: skill.commitSha,
      contentHash: skill.contentHash ?? crypto.createHash("sha256").update(skill.content).digest("hex"),
      requestedCapabilities: skill.requestedCapabilities ?? [],
      valid: true,
    };
    const existingSkills = config.learnedSkills ?? [];
    const learnedSkills = [
      learnedSkill,
      ...existingSkills.filter((item) => item.id !== id && item.slug !== slug),
    ];
    const skillEnabledById = { ...(config.skillEnabledById ?? {}), [id]: true };
    results[agentId] = saveAgentConfig(agentId, {
      ...config,
      learnedSkills,
      learnedSkillIds: learnedSkills.map((item) => item.id),
      skillEnabledById,
    });
  }
  return { slug, id, agents: results };
}

export function saveCitySkill(skill: SkillInstallPayload): AgentWorkspaceFile {
  const slug = skill.slug && isSafeSlug(skill.slug) ? skill.slug : slugify(skill.name);
  if (!isSafeSlug(slug)) throw new Error("Invalid skill slug.");
  if (!skill.content.trim() || looksLikeHtml(skill.content, "") || !looksLikeSkillMarkdown(skill.content)) {
    throw new Error("技能文件不是有效的 SKILL.md。");
  }
  fs.mkdirSync(citySkillsDir, { recursive: true });
  const filePath = path.join(citySkillsDir, `${slug}.md`);
  fs.writeFileSync(filePath, skill.content, "utf8");
  const stat = fs.statSync(filePath);
  return {
    name: path.basename(filePath),
    path: filePath,
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    mimeType: "text/markdown",
  };
}

function deleteCitySkill(skillId: string): void {
  const filePath = path.join(citySkillsDir, `${skillId}.md`);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export function auditInstalledSkills(): { disabled: Array<{ agentId: string; skillId: string; reason: string }> } {
  const disabled: Array<{ agentId: string; skillId: string; reason: string }> = [];
  for (const [agentId, config] of Object.entries(listAgentConfigs())) {
    let changed = false;
    const learnedSkills = (config.learnedSkills ?? []).map((skill) => {
      if (!skill.skillPath || !fs.existsSync(skill.skillPath)) return skill;
      const content = fs.readFileSync(skill.skillPath, "utf8");
      const invalid = looksLikeHtml(content, "") || !looksLikeSkillMarkdown(content);
      if (!invalid) {
        const summary = inferSkillSummary(content);
        if (skill.valid !== true || skill.disabledReason || skill.summary !== summary) changed = true;
        return { ...skill, summary, valid: true, disabledReason: undefined };
      }
      changed = true;
      disabled.push({ agentId, skillId: skill.id, reason: "技能文件不是有效的 SKILL.md，已安全禁用。" });
      return { ...skill, valid: false, disabledReason: "Invalid or HTML skill content." };
    });
    if (changed) {
      const skillEnabledById = { ...(config.skillEnabledById ?? {}) };
      for (const item of disabled.filter((entry) => entry.agentId === agentId)) skillEnabledById[item.skillId] = false;
      saveAgentConfig(agentId, { ...config, learnedSkills, skillEnabledById });
    }
  }
  return { disabled };
}

export function deleteSkillFromAgents(skillId: string) {
  if (!isSafeSlug(skillId)) throw new Error("Invalid skill id.");
  deleteCitySkill(skillId);
  const results: Record<string, AgentConfigRecord> = {};
  const safeRoot = path.resolve(agentsDir);
  for (const [agentId, config] of Object.entries(listAgentConfigs())) {
    const removed = (config.learnedSkills ?? []).filter(
      (skill) => skill.id === skillId || skill.slug === skillId
    );
    if (!removed.length && !(config.learnedSkillIds ?? []).includes(skillId)) continue;
    for (const skill of removed) {
      const dir = path.resolve(agentDir(agentId), "skills", skill.slug);
      if (dir.startsWith(safeRoot + path.sep) && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
    const learnedSkills = (config.learnedSkills ?? []).filter(
      (skill) => skill.id !== skillId && skill.slug !== skillId
    );
    const skillEnabledById = { ...(config.skillEnabledById ?? {}) };
    delete skillEnabledById[skillId];
    removed.forEach((skill) => {
      delete skillEnabledById[skill.id];
      delete skillEnabledById[skill.slug];
    });
    results[agentId] = saveAgentConfig(agentId, {
      ...config,
      learnedSkills,
      learnedSkillIds: learnedSkills.map((skill) => skill.id),
      skillEnabledById,
    });
  }
  return { agents: results };
}

function inferTitle(content: string): string {
  const frontmatterName = frontmatterValue(content, "name");
  if (frontmatterName) return frontmatterName;
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading ?? "";
}

export function inferSkillSummary(content: string): string {
  const description = frontmatterValue(content, "description");
  if (description) return description.slice(0, 1_200);
  const paragraph = content
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .find((part) => part && !part.startsWith("---") && !part.startsWith("#"));
  return (paragraph ?? "Imported skill from URL.").replace(/\s+/g, " ").slice(0, 1_200);
}

function inferSummary(content: string): string {
  return inferSkillSummary(content);
}

function frontmatterValue(content: string, key: string): string {
  const block = content.match(/^---\s*\n([\s\S]*?)\n---/m)?.[1];
  if (!block) return "";
  const lines = block.split("\n");
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const field = new RegExp(`^${escapedKey}:\\s*(.*)$`);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(field);
    if (!match) continue;
    const raw = match[1].trim();
    if (raw === ">" || raw === "|") {
      const parts: string[] = [];
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        if (!/^\s+/.test(lines[cursor])) break;
        parts.push(lines[cursor].trim());
      }
      return parts.join(raw === ">" ? " " : "\n").trim();
    }
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      if (raw.startsWith('"')) {
        try { return String(JSON.parse(raw)).trim(); } catch { /* Fall through to quote stripping. */ }
      }
      return raw.slice(1, -1).trim();
    }
    return raw;
  }
  return "";
}

function titleFromUrl(url: URL): string {
  const leaf = url.pathname.split("/").filter(Boolean).pop() ?? "Imported Skill";
  return leaf.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}
