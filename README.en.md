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

Each **direct child folder** of the root you select becomes one project. Nested folders are scanned for files but are not registered as separate projects.

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
npm run build:single
```

Output: `dist/DesignTrace.html` (~180 KB). CSS and JS are inlined. Still requires `http://localhost` to use folder picker.

## GitHub Releases

Push a version tag to automatically build and publish `DesignTrace.html` as a release asset:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Or create a release in the GitHub **Releases** tab with tag `v0.1.0` — the [Release workflow](.github/workflows/release.yml) will attach the built HTML file.

## Project structure

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
├── docs/
│   └── screenshots/
├── server.js
└── package.json
```

## Privacy

DesignTrace reads folders only with your explicit permission. Data stays on your machine; no analytics or remote storage.

## License

Private prototype (`"private": true` in `package.json`). Adjust licensing as needed for your distribution.
