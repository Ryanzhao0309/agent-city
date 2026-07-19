import fs from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import readXlsxFile from "read-excel-file/node";
import { PDFParse } from "pdf-parse";
import type { AgentConfigRecord } from "./agentStore.js";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RESULT_CHARS = 80_000;
const MAX_LIST_ENTRIES = 500;
const WRITABLE_EXTENSIONS = new Set([".md", ".txt", ".csv"]);
const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".csv", ".tsv", ".json", ".jsonl", ".xml", ".html", ".css",
  ".js", ".jsx", ".ts", ".tsx", ".py", ".sql", ".log", ".yaml", ".yml",
]);

export interface WorkingFileEntry {
  path: string;
  name: string;
  kind: "file" | "directory";
  size: number;
  updatedAt: string;
}

function requireRoot(config: AgentConfigRecord): string {
  if (config.permissions?.workspace === "none" || !config.workspaceRoot) {
    throw new Error("这个 Agent 还没有获得本地工作文件夹权限。");
  }
  if (!path.isAbsolute(config.workspaceRoot)) throw new Error("工作文件夹必须是绝对路径。");
  if (!fs.existsSync(config.workspaceRoot)) throw new Error("授权的工作文件夹不存在，请重新选择。");
  const root = fs.realpathSync(config.workspaceRoot);
  if (!fs.statSync(root).isDirectory()) throw new Error("授权路径不是文件夹。");
  return root;
}

function existingAncestor(target: string): string {
  let current = target;
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

export function resolveWorkingPath(config: AgentConfigRecord, relativePath = ".", allowMissing = false): string {
  const root = requireRoot(config);
  if (path.isAbsolute(relativePath)) throw new Error("只能使用工作文件夹内的相对路径。");
  const normalized = path.normalize(relativePath || ".");
  if (normalized === ".." || normalized.startsWith(`..${path.sep}`)) throw new Error("路径不能离开授权的工作文件夹。");
  const target = path.resolve(root, normalized);
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error("路径不能离开授权的工作文件夹。");
  const ancestor = existingAncestor(target);
  const realAncestor = fs.realpathSync(ancestor);
  if (realAncestor !== root && !realAncestor.startsWith(root + path.sep)) {
    throw new Error("路径通过符号链接离开了授权的工作文件夹。");
  }
  if (!allowMissing && !fs.existsSync(target)) throw new Error("文件或文件夹不存在。");
  if (fs.existsSync(target)) {
    const realTarget = fs.realpathSync(target);
    if (realTarget !== root && !realTarget.startsWith(root + path.sep)) {
      throw new Error("路径通过符号链接离开了授权的工作文件夹。");
    }
    return realTarget;
  }
  return target;
}

export function listWorkingFiles(config: AgentConfigRecord, relativePath = "."): WorkingFileEntry[] {
  const root = requireRoot(config);
  const start = resolveWorkingPath(config, relativePath);
  if (!fs.statSync(start).isDirectory()) throw new Error("目标不是文件夹。");
  const entries: WorkingFileEntry[] = [];
  const visit = (directory: string) => {
    if (entries.length >= MAX_LIST_ENTRIES) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entries.length >= MAX_LIST_ENTRIES) break;
      if (entry.name === ".DS_Store" || entry.name === "node_modules" || entry.name === ".git") continue;
      const fullPath = path.join(directory, entry.name);
      let stat: fs.Stats;
      try {
        stat = fs.lstatSync(fullPath);
      } catch {
        continue;
      }
      if (stat.isSymbolicLink()) continue;
      const kind = stat.isDirectory() ? "directory" : "file";
      entries.push({
        path: path.relative(root, fullPath) || ".",
        name: entry.name,
        kind,
        size: stat.isFile() ? stat.size : 0,
        updatedAt: stat.mtime.toISOString(),
      });
      if (stat.isDirectory()) visit(fullPath);
    }
  };
  visit(start);
  return entries;
}

export async function extractReadableFile(filePath: string): Promise<{ content: string; truncated: boolean }> {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) throw new Error("目标不是文件。");
  if (stat.size > MAX_FILE_BYTES) throw new Error("文件超过 25 MB，无法作为 Agent 上下文读取。");
  const extension = path.extname(filePath).toLowerCase();
  let content = "";
  if (TEXT_EXTENSIONS.has(extension)) {
    content = fs.readFileSync(filePath, "utf8");
  } else if (extension === ".docx") {
    content = (await mammoth.extractRawText({ path: filePath })).value;
  } else if (extension === ".xlsx") {
    const sheets = await readXlsxFile(filePath);
    content = sheets.map(({ sheet, data }) => {
      const rows = data.map((row) => row.map((cell) => {
        const value = cell instanceof Date ? cell.toISOString() : cell == null ? "" : String(cell);
        return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      }).join(",")).join("\n");
      return `# Sheet: ${sheet}\n${rows}`;
    }).join("\n\n");
  } else if (extension === ".pdf") {
    const parser = new PDFParse({ data: fs.readFileSync(filePath) });
    try {
      content = (await parser.getText()).text;
    } finally {
      await parser.destroy();
    }
  } else {
    throw new Error("首版仅支持读取文本、DOCX、XLSX 和 PDF 文件。");
  }
  return {
    content: content.slice(0, MAX_RESULT_CHARS),
    truncated: content.length > MAX_RESULT_CHARS,
  };
}

export async function readWorkingFile(config: AgentConfigRecord, relativePath: string): Promise<{ path: string; content: string; truncated: boolean }> {
  const filePath = resolveWorkingPath(config, relativePath);
  return { path: relativePath, ...await extractReadableFile(filePath) };
}

export async function searchWorkingFiles(config: AgentConfigRecord, query: string): Promise<Array<{ path: string; excerpt: string }>> {
  const needle = query.trim().toLowerCase();
  if (!needle) throw new Error("搜索词不能为空。");
  const results: Array<{ path: string; excerpt: string }> = [];
  for (const entry of listWorkingFiles(config)) {
    if (results.length >= 30) break;
    if (entry.kind !== "file" || entry.size > MAX_FILE_BYTES) continue;
    if (entry.name.toLowerCase().includes(needle)) {
      results.push({ path: entry.path, excerpt: "文件名匹配" });
      continue;
    }
    try {
      const file = await readWorkingFile(config, entry.path);
      const index = file.content.toLowerCase().indexOf(needle);
      if (index >= 0) results.push({ path: entry.path, excerpt: file.content.slice(Math.max(0, index - 120), index + needle.length + 220) });
    } catch {
      continue;
    }
  }
  return results;
}

export function writeWorkingFile(config: AgentConfigRecord, relativePath: string, content: string): { path: string; bytes: number } {
  if (config.permissions?.workspace !== "write-with-approval") throw new Error("这个 Agent 没有工作文件夹写入权限。");
  const target = resolveWorkingPath(config, relativePath, true);
  const extension = path.extname(target).toLowerCase();
  if (!WRITABLE_EXTENSIONS.has(extension)) throw new Error("首版只能新建或更新 Markdown、TXT、CSV 文件。");
  const data = Buffer.from(content, "utf8");
  if (data.byteLength > MAX_FILE_BYTES) throw new Error("写入内容超过 25 MB。");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, data);
  return { path: relativePath, bytes: data.byteLength };
}

export function moveWorkingFile(config: AgentConfigRecord, from: string, to: string): { from: string; to: string } {
  if (config.permissions?.workspace !== "write-with-approval") throw new Error("这个 Agent 没有工作文件夹写入权限。");
  const source = resolveWorkingPath(config, from);
  const target = resolveWorkingPath(config, to, true);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
  return { from, to };
}

export function deleteWorkingFile(config: AgentConfigRecord, relativePath: string): { path: string } {
  if (config.permissions?.workspace !== "write-with-approval") throw new Error("这个 Agent 没有工作文件夹写入权限。");
  const target = resolveWorkingPath(config, relativePath);
  const stat = fs.statSync(target);
  if (stat.isDirectory()) fs.rmSync(target, { recursive: true });
  else fs.unlinkSync(target);
  return { path: relativePath };
}
