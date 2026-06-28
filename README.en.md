# DesignTrace

**[中文](README.zh-CN.md)** · **English**

Local design project timeline browser — browse folders, preview work, and trace activity over time.

---

## Screenshots

![DesignTrace overview — dark theme](docs/screenshots/overview-dark.png)

*Dark theme — main layout with search, preview area, timeline filters, calendar, and status bar.*

| Area | Description |
|------|-------------|
| Top bar | Folder picker, search, theme toggle |
| Center | Hero preview & slideshow |
| Bottom | Year/month filters, scope & extension filters, timeline cards |
| Left | Monthly activity calendar |

> After selecting a folder, project cards and previews appear on the timeline.

---

## Overview

DesignTrace is a single-page web app that reads a local folder (via the browser File System Access API), treats each first-level subfolder as a project, and displays them on an interactive timeline with previews, filters, and a monthly activity calendar.

All processing happens in your browser. Files are never uploaded.

## Live demo & download

| | URL |
|---|---|
| **Live** | https://wonvy.github.io/DesignTrace/ |
| **Download** | https://github.com/Wonvy/DesignTrace/releases/latest/download/DesignTrace.html |
| **CDN mirror** | https://cdn.jsdelivr.net/gh/Wonvy/DesignTrace@main/DesignTrace.html |

Enable GitHub Pages once: **Repository Settings → Pages → Build and deployment → Source: GitHub Actions**.  
Pushes to `main` trigger [pages.yml](.github/workflows/pages.yml) — no `gh-pages` branch required.

## Requirements

- **Browser:** Chrome or Edge (File System Access API)
- **Access:** Must be served over `http://localhost` or `https://` (not `file://`)
- **Node.js:** 18+ (for the dev server and build script only)

## Quick start

```bash
npm start
```

Open `http://127.0.0.1:8080` (port may increment if 8080 is busy).

1. Click **选择文件夹** (Pick folder) and grant read access.
2. Projects appear on the timeline; select a card to preview images and files.
3. Use the calendar on the left and year/month controls to navigate by period.

## Project folder layout

Each **direct child folder** of the root becomes a project when its name matches a serial (`870 家书`) or date pattern. **Pure container folders** (e.g. `#2026`) are scanned recursively for date- or serial-named subfolders. Deeper nested folders become separate projects only when date- or serial-named; ordinary subfolders are merged into their parent project.

Supported naming examples:

| Pattern | Example | Timeline date |
|--------|---------|----------------|
| Serial + title | `870 家书` | From design files (PSD, AI, …) or latest file modification time |
| Date in folder name | `24年3月15日 项目名` | Parsed from name, or overridden by file times |
| Plain name | `My Project` | From file modification times |

Display for serial names: title shows **家书**, kicker shows **#870**.

## Features

- **Timeline** — drag, zoom, autoplay, card previews (up to 4 recent images)
- **Calendar heatmap** — monthly activity by project count
- **Filters** — scope, file extension, image size (preferences saved in `localStorage`)
- **Hero slideshow** — large preview, file list, fullscreen mode
- **Theme** — light / dark, follows system or manual toggle
- **Paths** — shown in Windows-style backslashes (`\`); click status bar path to copy
- **Persistence** — last folder (IndexedDB), selected project, filters, theme, heatmap collapse state

## Scripts

| Command | Description |
|---------|-------------|
| `npm start` | Start static server on `127.0.0.1:8080` |
| `npm run build:single` | Build `dist/DesignTrace.html` (all-in-one file) |
| `npm run check` | Syntax-check `server.js` and `public/app.js` |

## Single-file build

```bash
npm run build:standalone
```

Output: `dist/DesignTrace.html`. All CSS/JS from `public/index.html` are inlined automatically. The build fails if any external `<script src>` or `<link rel="stylesheet">` remains.

## GitHub Pages & Releases

**Pages** — push to `main` → [pages.yml](.github/workflows/pages.yml) builds and deploys via **GitHub Actions** (`index.html` at site root).

**Release** — push a version tag → [release.yml](.github/workflows/release.yml) uploads `DesignTrace.html`:

```bash
git push origin main
git tag v1.0.0
git push origin v1.0.0
```

## Project structure

```
DesignTrace/
├── public/
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── scripts/
│   ├── build-standalone.js
│   └── build-single-html.js
├── dist/
│   └── DesignTrace.html    # generated
├── .github/workflows/
│   ├── pages.yml
│   ├── release.yml
│   └── ci.yml
├── docs/
│   └── screenshots/
├── server.js
└── package.json
```

## Privacy

DesignTrace reads folders only with your explicit permission. Data stays on your machine; no analytics or remote storage.

## License

Private prototype (`"private": true` in `package.json`). Adjust licensing as needed for your distribution.
