import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriDir = path.join(root, "src-tauri");
const resourcesDir = path.join(tauriDir, "resources");
const binariesDir = path.join(tauriDir, "binaries");
const cacheDir = path.join(root, ".tauri-cache");
const nodeVersion = "22.23.1";

function run(command, args, cwd = root) {
  execFileSync(command, args, { cwd, stdio: "inherit" });
}

function targetInfo() {
  if (process.platform !== "darwin") {
    throw new Error("First-phase desktop packaging currently supports macOS only.");
  }
  if (process.arch === "arm64") {
    return { triple: "aarch64-apple-darwin", nodeArch: "arm64" };
  }
  if (process.arch === "x64") {
    return { triple: "x86_64-apple-darwin", nodeArch: "x64" };
  }
  throw new Error(`Unsupported macOS architecture: ${process.arch}`);
}

async function ensureNodeRuntime(nodeArch, triple) {
  mkdirSync(cacheDir, { recursive: true });
  mkdirSync(binariesDir, { recursive: true });
  const archiveName = `node-v${nodeVersion}-darwin-${nodeArch}.tar.xz`;
  const archivePath = path.join(cacheDir, archiveName);
  const baseUrl = `https://nodejs.org/dist/v${nodeVersion}`;
  if (!existsSync(archivePath)) {
    const response = await fetch(`${baseUrl}/${archiveName}`);
    if (!response.ok) throw new Error(`Node runtime download failed: ${response.status}`);
    writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()));
  }

  const sumsResponse = await fetch(`${baseUrl}/SHASUMS256.txt`);
  if (!sumsResponse.ok) throw new Error(`Node checksum download failed: ${sumsResponse.status}`);
  const sums = await sumsResponse.text();
  const expected = sums
    .split("\n")
    .find((line) => line.endsWith(`  ${archiveName}`))
    ?.split(/\s+/)[0];
  const actual = createHash("sha256").update(readFileSync(archivePath)).digest("hex");
  if (!expected || actual !== expected) {
    throw new Error(`Node runtime checksum mismatch for ${archiveName}`);
  }

  const extractDir = path.join(cacheDir, `node-v${nodeVersion}-darwin-${nodeArch}`);
  if (!existsSync(path.join(extractDir, "bin", "node"))) {
    run("tar", ["-xJf", archivePath, "-C", cacheDir]);
  }
  const sidecarPath = path.join(binariesDir, `agent-city-server-${triple}`);
  copyFileSync(path.join(extractDir, "bin", "node"), sidecarPath);
  chmodSync(sidecarPath, 0o755);
}

function createAssetManifest() {
  const publicRoot = path.join(root, "apps/web/public");
  const kinds = [
    ["building", "buildings"],
    ["terrain", "ground"],
    ["decoration", "decorations"],
  ];
  const assets = [];
  for (const [kind, relativeDir] of kinds) {
    const start = path.join(publicRoot, relativeDir);
    const walk = (directory) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (/\.(png|webp)$/i.test(entry.name)) {
          const relative = path.relative(publicRoot, fullPath).split(path.sep).join("/");
          const name = entry.name
            .replace(/\.[^.]+$/, "")
            .replace(/[-_]+/g, " ")
            .replace(/\b\w/g, (character) => character.toUpperCase());
          assets.push({
            id: `project-${kind}-${relative}`,
            kind,
            name,
            url: `/${relative}`,
            source: "project",
          });
        }
      }
    };
    if (existsSync(start)) walk(start);
  }
  writeFileSync(path.join(resourcesDir, "server", "asset-manifest.json"), JSON.stringify(assets));
}

function createSeedData() {
  const seedDir = path.join(resourcesDir, "seed-data");
  mkdirSync(seedDir, { recursive: true });
  const seedDbPath = path.join(seedDir, "agent-city.sqlite");
  if (existsSync(seedDbPath)) rmSync(seedDbPath);

  // Release artifacts must never inherit a developer's local layout, Agent
  // profiles, conversation history, or secrets. The desktop app starts from
  // this empty database and creates its own local state on first launch.
  const seedDb = new DatabaseSync(seedDbPath);
  seedDb.exec(`
    CREATE TABLE city_layout (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE app_secret (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  seedDb.close();
}

async function main() {
  const { triple, nodeArch } = targetInfo();
  run("npm", ["run", "build"], path.join(root, "apps/server"));
  run("npm", ["run", "build"], path.join(root, "apps/web"));

  rmSync(resourcesDir, { recursive: true, force: true });
  mkdirSync(path.join(resourcesDir, "server"), { recursive: true });
  cpSync(path.join(root, "apps/server/dist"), path.join(resourcesDir, "server/dist"), { recursive: true });
  cpSync(path.join(root, "apps/server/node_modules"), path.join(resourcesDir, "server/node_modules"), { recursive: true });
  createAssetManifest();
  createSeedData();
  await ensureNodeRuntime(nodeArch, triple);

  const sidecar = path.join(binariesDir, `agent-city-server-${triple}`);
  if (!statSync(sidecar).size) throw new Error("Prepared sidecar is empty.");
  console.log(`Prepared Tauri resources for ${triple}.`);
}

await main();
