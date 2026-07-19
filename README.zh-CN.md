# Agent City

[English](README.md) | [简体中文](README.zh-CN.md)

Agent City 是一个开源、自托管的像素风 AI 工作空间，用一座持续运转的城市来组织 Agent、工具、知识、任务和服务入口。

建筑是功能入口，居民代表不同的 Agent。整座城市既是一个可视化启动器，也是一个本地优先的 AI 工作控制台。

> **项目状态：** 早期 Alpha。自托管 Web 版本已经可以使用，macOS 桌面版仍在持续开发中。1.0 发布前，界面和本地数据格式仍可能调整。

## 为什么做 Agent City

传统 AI 控制台通常把所有内容压缩成列表和标签页。Agent City 使用空间化方式呈现工作，让职责和关系更容易理解：

- 建筑按照用途组织工具和工作流；
- 城市居民代表不同 Agent 及其职责；
- 城市地图让服务、任务、技能和知识一目了然；
- 主题系统让每个人都能定制并分享自己的工作空间。

Agent City 当前不包含游戏经济系统。项目重点是实用的工作组织、本地数据所有权，以及对重要操作的人工确认。

## 当前能力

- 自由布置建筑、地面、道路、装饰和完整主题城市。
- 通过城市建筑打开自托管服务或外部工具。
- 为本地持久化 Agent 配置职责、技能和独立工作空间。
- 在全局“模型管理”中统一配置 OpenAI、Gemini、DeepSeek、豆包或其他 OpenAI 兼容模型。
- 支持 Chat Completions 与 Responses 两种模型协议，并在分配给 Agent 前验证文本和 Function Calling。
- 运行 Agent 任务，并对文件修改等操作进行人工审批。
- 维护 Markdown 知识文档，并把知识分配给指定 Agent。
- 查看任务历史、工具调用、审批、错误和最终结果。
- 创建周期任务，并接收桌面通知。
- 导入和导出城市布局。
- 浏览经过审核的社区主题、下载完整素材包并查看 GitHub 点赞数。
- 通过 Docker 运行 Web 版，或使用 macOS Tauri 桌面版。

## 产品导览

### 不再是一个扁平的 AI 控制台

城市地图把 Agent、工具、知识、任务和服务入口放到一个可见的空间中。建筑保留真实功能，周围的地形、道路和装饰可以自由调整和更换主题。

![包含建筑、居民、道路和主题场景的 Agent City 总览](docs/screenshots/city-overview.webp)

### 在市政厅统一管理所有 Agent

市政厅集中展示 Agent 的职责、所属建筑、运行状态、已连接模型、已掌握技能和当前工作。

![市政厅 Agent 管理界面](docs/screenshots/agent-management.webp)

### 与 Agent 进行持续对话

每位居民都可以维护连续对话、访问获准的工作目录、制定计划、调用授权工具，并展示完整执行记录。下图中的个人显示名称已在公开前隐藏。

![Agent 对话、每日计划和执行记录](docs/screenshots/agent-conversation.webp)

### 让建筑成为真实工作空间

任务大厅按照收件箱、待办、进行中和已完成组织工作，并允许被分配的 Agent 读取和处理建筑任务。

![包含任务状态列和可编辑事项的任务大厅](docs/screenshots/todo-hall.webp)

### 安装前先审查技能

技能大厅可以读取本地 `SKILL.md` 或经过审核的 URL，由公会管理员解释技能行为，并在安装前展示用法、限制和权限声明。

![技能大厅审查和安装界面](docs/screenshots/skill-installation.webp)

## 模型管理

模型连接统一在设置中的“模型管理”维护，Agent 不再重复填写 Provider、Base URL 和 API Key。

内置快速模板包括：

- OpenAI
- Gemini
- DeepSeek
- 豆包

其他 OpenAI 兼容服务可以通过“自定义模型”添加。每个模型需要选择 `Chat Completions` 或 `Responses` 协议，并通过两次最小请求验证：

1. 验证地址、认证、Model ID 和文本返回；
2. 强制执行一次 Function Calling，确认模型可用于 Agent City。

验证失败的模型可以保存为草稿，但不能启用、设为默认或分配给 Agent。

## 隐私与安全

Agent City 坚持本地优先：

- 城市状态和任务历史保存在本地 SQLite 数据库中。
- 运行数据库、本地 Agent 配置、构建产物和临时文件不会提交到版本控制。
- 桌面封包始终从空白种子数据库启动，不会包含开发者本机的城市、Agent、对话或密钥。
- macOS 上的 API Key 保存于 Keychain；数据库、Agent JSON 和 API 响应均不返回明文密钥。
- 每个 Agent 只能访问用户明确选择的工作目录。
- 文件写入、移动、重命名和删除必须经过审批。
- 只读网页请求会阻止回环地址、私有网络、云元数据地址、不安全跳转和超大响应。
- Agent City 不再包含 Google OAuth、Gmail 或 Google Calendar 权限。

请勿提交真实凭据。如果你认为密钥或漏洞已经泄露，请按照 [SECURITY.md](SECURITY.md) 处理。

## 项目架构

```text
agent-city/
├── apps/
│   ├── web/          React + Vite + TypeScript 前端
│   └── server/       Fastify API、Agent Runtime 和 SQLite 持久化
├── src-tauri/        macOS 桌面壳
├── scripts/
│   └── prepare-tauri.mjs
├── docs/
│   └── architecture.md
├── Dockerfile
└── docker-compose.yml
```

生产环境由一个进程同时提供 API 和编译后的 Web 客户端。服务端使用 Node 内置的 `node:sqlite`，不需要额外的原生数据库插件或 Node 编译工具链。

组件边界、本地数据行为和社区主题仓库设计参见 [架构说明](docs/architecture.md)。

## 使用 Docker 运行

要求：Docker Engine 和 Docker Compose。

```bash
docker compose up -d --build
```

打开 `http://localhost:3000`。持久化数据保存在名为 `agent-city-data` 的 Docker Volume 中。

停止服务：

```bash
docker compose down
```

## 本地开发

环境要求：

- Node.js 22.5 或更高版本
- npm

按照各应用的 lockfile 安装依赖：

```bash
npm ci
npm --prefix apps/server ci
npm --prefix apps/web ci
```

同时启动前后端开发服务：

```bash
./start-dev.sh
```

然后打开 `http://localhost:5173`。Vite 开发服务器会把 API 请求代理到 3000 端口的 Fastify 服务。

也可以分别启动：

```bash
npm --prefix apps/server run dev
npm --prefix apps/web run dev
```

## 验证修改

```bash
npm --prefix apps/server test
npm --prefix apps/web test
npm --prefix apps/web run build
```

每次 Pull Request 和向 `main` 推送时，仓库 CI 都会执行对应的服务端测试和 Web 构建检查。

## 构建 macOS 桌面版

额外要求：

- macOS
- Rust 和 Cargo
- Tauri 2 所需的平台依赖

安装依赖并构建：

```bash
npm ci
npm --prefix apps/server ci
npm --prefix apps/web ci
npm run desktop:build
```

构建产物：

```text
src-tauri/target/release/bundle/macos/Agent City.app
src-tauri/target/release/bundle/dmg/Agent City_版本号_aarch64.dmg
```

桌面资源、二进制文件、缓存和安装包只在本地生成，不会提交到仓库。

## 下载 macOS 版本

当前公开版本是 Apple Silicon 早期 Alpha：

[下载 Agent City v0.1.2 macOS 版本](https://github.com/Ryanzhao0309/agent-city/releases/tag/v0.1.2)

当前安装包尚未完成 Apple Developer ID 签名和公证，首次打开时 macOS 可能显示安全提示。

## 主题和社区内容

审核通过的社区主题发布在独立的公开仓库 [agent-city-themes](https://github.com/Ryanzhao0309/agent-city-themes)。Agent City 只接受该仓库已审核 `main` 分支中的素材地址。

主题发布流程将贡献与正式上线分开：

1. 贡献者通过 Pull Request 提交主题；
2. 自动检查验证清单、文件、大小和授权信息；
3. 维护者进行预览和测试；
4. 只有审核合并后，主题才会出现在目录中。

主题大厅只负责下载素材包，不会自动修改当前城市。下载完成后，建筑、地面、道路和装饰会出现在建造模式中，建筑素材也会出现在单个建筑的外观设置中。

每个主题以 `themes/theme-id/theme.json` 和 `assets/` 目录保存，素材目录包含 `preview.png` 以及约定的 `buildings/`、`ground/` 和 `decorations/` 文件夹。详细说明参见[主题包接入文档](docs/THEME_PACKAGES.md)和主题仓库的[完整格式规范](https://github.com/Ryanzhao0309/agent-city-themes/blob/main/docs/theme-package-format.md)。

每个正式主题都有一个锁定的 GitHub 展示 Issue。Agent City 读取公开的 👍 数量，并在用户点赞时打开该 Issue；应用不会申请或保存 GitHub Access Token。

主题包只能包含 JSON 和视觉素材，不能包含可执行代码、HTML、SVG 或外部追踪资源。提交作品前请阅读主题仓库的贡献指南和 Manifest Schema。

## 参与贡献

欢迎参与项目。提交 Pull Request 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

请保持每个 PR 目标明确，为行为变更补充测试，并确保提交的代码和美术素材拥有符合项目许可的使用权。

## 开源许可

Agent City 使用 [GNU Affero General Public License v3.0](LICENSE)（`AGPL-3.0-only`）。

该许可证适用于本仓库中由项目贡献者拥有的源代码、文档和原创视觉素材。第三方组件或素材仍受其各自许可证与声明约束。
