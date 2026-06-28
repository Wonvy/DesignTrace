# DesignTrace

**Local design project timeline browser — browse folders, preview work, and trace activity over time.**

**本地设计项目时间轴浏览器 — 选择文件夹、预览作品、按时间回顾创作轨迹。**

---

## English

### Overview

DesignTrace is a single-page web app that reads a local folder (via the browser File System Access API), treats each first-level subfolder as a project, and displays them on an interactive timeline with previews, filters, and a monthly activity calendar.

All processing happens in your browser. Files are never uploaded.

### Requirements

- **Browser:** Chrome or Edge (File System Access API)
- **Access:** Must be served over `http://localhost` or `https://` (not `file://`)
- **Node.js:** 18+ (for the dev server and build script only)

### Quick start

```bash
npm start
```

Open `http://127.0.0.1:8080` (port may increment if 8080 is busy).

1. Click **选择文件夹** / **Pick folder** and grant read access.
2. Projects appear on the timeline; select a card to preview images and files.
3. Use the calendar on the left and year/month controls to navigate by period.

### Project folder layout

Each **direct child folder** of the root you select becomes one project. Nested folders are scanned for files but are not registered as separate projects.

Supported naming examples:

| Pattern | Example | Timeline date |
|--------|---------|----------------|
| Serial + title | `870 家书` | From design files (PSD, AI, …) or latest file modification time |
| Date in folder name | `24年3月15日 项目名` | Parsed from name, or overridden by file times |
| Plain name | `My Project` | From file modification times |

Display for serial names: title shows **家书**, kicker shows **#870**.

### Features

- **Timeline** — drag, zoom, autoplay, card previews (up to 4 recent images)
- **Calendar heatmap** — monthly activity by project count
- **Filters** — scope, file extension, image size (preferences saved in `localStorage`)
- **Hero slideshow** — large preview, file list, fullscreen mode
- **Theme** — light / dark, follows system or manual toggle
- **Paths** — shown in Windows-style backslashes (`\`); click status bar path to copy
- **Persistence** — last folder (IndexedDB), selected project, filters, theme, heatmap collapse state

### Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start static server on `127.0.0.1:8080` |
| `npm run build:single` | Build `dist/DesignTrace.html` (all-in-one file) |
| `npm run check` | Syntax-check `server.js` and `public/app.js` |

### Single-file build

```bash
npm run build:single
```

Output: `dist/DesignTrace.html` (~180 KB). CSS and JS are inlined. Still requires `http://localhost` to use folder picker.

### Project structure

```
DesignTrace/
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   └── build-single-html.js
├── dist/
│   └── DesignTrace.html    # generated
├── server.js
└── package.json
```

### Privacy

DesignTrace reads folders only with your explicit permission. Data stays on your machine; no analytics or remote storage.

---

## 中文

### 简介

DesignTrace 是一款纯前端 Web 应用：通过浏览器 **File System Access API** 读取本地文件夹，将**根目录下第一层子文件夹**视为一个项目，并在可交互的时间轴、大图预览和月度日历中展示创作活动。

所有处理均在浏览器本地完成，**不会上传任何文件**。

### 环境要求

- **浏览器：** Chrome 或 Edge（需支持 File System Access API）
- **访问方式：** 须通过 `http://localhost` 或 `https://` 打开（不能直接用 `file://`）
- **Node.js：** 18+（仅用于本地静态服务与构建脚本）

### 快速开始

```bash
npm start
```

浏览器打开 `http://127.0.0.1:8080`（若 8080 被占用，端口会自动递增）。

1. 点击 **选择文件夹**，授权浏览器读取目录。
2. 时间轴上出现项目卡片，点击可预览图片与文件列表。
3. 左侧日历与顶部年/月选择器可按时间段浏览。

### 文件夹组织方式

你选择的根目录下，**每个直接子文件夹**对应一个项目。更深层级的子文件夹会递归扫描其中的文件，但**不会**再单独注册为项目。

支持的命名示例：

| 格式 | 示例 | 时间轴日期来源 |
|------|------|----------------|
| 编号 + 名称 | `870 家书` | 设计源文件（PSD、AI 等）或文件夹内文件修改时间 |
| 名称含日期 | `24年3月15日 项目名` | 从文件夹名解析，可被文件时间覆盖 |
| 普通名称 | `My Project` | 文件夹内文件修改时间 |

编号命名时：标题显示 **家书**，副标题显示 **#870**。

### 功能概览

- **时间轴** — 拖拽、缩放、自动播放，卡片最多展示 4 张最近图片
- **日历热力图** — 按月展示项目活跃程度
- **筛选** — 范围、后缀、图片大小（选项会缓存到 `localStorage`，刷新后保留）
- **大图幻灯** — 主预览区、右侧文件列表、全屏自动播放
- **主题** — 浅色 / 深色，可跟随系统或手动切换
- **路径** — 界面以 Windows 反斜杠 `\` 显示；点击状态栏路径可复制
- **本地记忆** — 上次文件夹、选中项目、筛选条件、主题、热力图折叠状态

### 筛选器说明

| 选项 | 含义 |
|------|------|
| 全部 | 显示所有项目 |
| 同父文件夹 | 与当前选中项目同一父目录 |
| 同根目录 | 与当前项目路径第一段相同（适用于有中间层级的结构） |
| 仅顶层 | 仅显示根下第一层项目（与「全部」在现行扫描规则下通常一致） |
| 仅子文件夹 | 仅显示有父路径的项目（不适用于「870 家书」这类根下一层结构） |

### 命令

| 命令 | 说明 |
|------|------|
| `npm start` | 启动本地静态服务（默认 `127.0.0.1:8080`） |
| `npm run build:single` | 构建单文件 `dist/DesignTrace.html` |
| `npm run check` | 检查 `server.js` 与 `public/app.js` 语法 |

### 单文件版本

```bash
npm run build:single
```

生成 `dist/DesignTrace.html`（约 180 KB），CSS 与 JS 已内联。仍需通过本地 HTTP 服务打开才能使用「选择文件夹」功能。

### 目录结构

```
DesignTrace/
├── public/           # 前端源码
├── scripts/          # 构建脚本
├── dist/             # 构建产物（单文件 HTML）
├── server.js         # 本地静态服务器
└── package.json
```

### 隐私说明

仅在用户授权后读取本地文件夹，数据不离开本机，无统计上报与远程存储。

---

## License

Private prototype (`"private": true` in `package.json`). Adjust licensing as needed for your distribution.
