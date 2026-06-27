(function () {
  "use strict";

  var state = {
    files: null,
    rootHandle: null,
    projects: [],
    filtered: [],
    selectedIndex: 0,
    hoverIndex: null,
    rootName: "",
    timelineOffset: 0,
    timelineScale: 1,
    dragging: false,
    splitterDragging: false,
    dragStartX: 0,
    dragStartOffset: 0,
    autoplay: null,
    autoplayEnabled: false,
    timelineHovering: false,
    view: "day",
    scopeFilter: "all",
    extFilter: ["all"],
    sizeFilter: "all",
    anchorProjectId: "",
    objectUrlCache: new Map(),
    statusMessage: "",
    previewPath: "",
    previewProjectId: ""
  };

  var els = {
    pickDirectoryButton: document.getElementById("pickDirectoryButton"),
    rescanButton: document.getElementById("rescanButton"),
    searchInput: document.getElementById("searchInput"),
    sortSelect: document.getElementById("sortSelect"),
    themeButton: document.getElementById("themeButton"),
    prevButton: document.getElementById("prevButton"),
    nextButton: document.getElementById("nextButton"),
    slideshowStage: document.getElementById("slideshowStage"),
    heroArtwork: document.getElementById("heroArtwork"),
    heroThumbs: document.getElementById("heroThumbs"),
    heroKicker: document.getElementById("heroKicker"),
    heroTitle: document.getElementById("heroTitle"),
    heroMeta: document.getElementById("heroMeta"),
    scanOverlay: document.getElementById("scanOverlay"),
    scanText: document.getElementById("scanText"),
    timeline: document.getElementById("timeline"),
    autoplayButton: document.getElementById("autoplayButton"),
    scopeFilterSelect: document.getElementById("scopeFilterSelect"),
    extFilterSelect: document.getElementById("extFilterSelect"),
    sizeFilterSelect: document.getElementById("sizeFilterSelect"),
    splitter: document.getElementById("splitter"),
    statusbar: document.querySelector(".statusbar"),
    statusPath: document.getElementById("statusPath"),
    statusFile: document.getElementById("statusFile"),
    statusStats: document.getElementById("statusStats"),
    statusDates: document.getElementById("statusDates")
  };

  var IGNORE_NAMES = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", ".cache", "coverage", "target", "vendor", "venv", ".venv", "__pycache__"]);
  var PREVIEW_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".html"]);
  var IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"]);
  var CODE_EXTENSIONS = new Set([".js", ".ts", ".tsx", ".jsx", ".vue", ".svelte", ".py", ".rs", ".go", ".java", ".cs", ".cpp", ".c", ".html", ".css"]);
  var TYPE_RULES = [
    ["package.json", "Web / Node", 40],
    ["vite.config.js", "Vite App", 20],
    ["next.config.js", "Next.js App", 24],
    ["index.html", "Static Web", 24],
    ["pyproject.toml", "Python", 36],
    ["requirements.txt", "Python", 26],
    ["Cargo.toml", "Rust", 36],
    ["go.mod", "Go", 36],
    ["pom.xml", "Java", 34],
    ["build.gradle", "Java / Gradle", 34],
    ["README.md", "Documented Project", 14]
  ];

  var TIMELINE = {
    cardWidth: 156,
    cardGap: 24,
    minStep: 52,
    padding: 168
  };
  var MAX_FOLDER_DEPTH = 6;
  var IMAGE_SIZE = {
    small: 80 * 1024,
    medium: 512 * 1024,
    large: 2 * 1024 * 1024
  };

  function formatDate(value, compact) {
    if (!value) return "鏈煡鏃堕棿";
    var options = compact
      ? { year: "numeric", month: "2-digit", day: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat("zh-CN", options).format(new Date(value));
  }

  function formatBytes(bytes) {
    if (!bytes) return "0 B";
    var units = ["B", "KB", "MB", "GB", "TB"];
    var size = bytes;
    var unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return size.toFixed(size >= 10 || unit === 0 ? 0 : 1) + " " + units[unit];
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function extension(fileName) {
    var index = fileName.lastIndexOf(".");
    return index >= 0 ? fileName.slice(index).toLowerCase() : "";
  }

  function hashText(value) {
    var hash = 2166136261;
    for (var index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
  }

  function revokeObjectUrls() {
    state.objectUrlCache.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    state.objectUrlCache.clear();
  }

  function objectUrl(file, cacheKey) {
    var key = cacheKey || file.name + ":" + file.lastModified + ":" + file.size;
    if (state.objectUrlCache.has(key)) {
      return state.objectUrlCache.get(key);
    }
    var url = URL.createObjectURL(file);
    state.objectUrlCache.set(key, url);
    return url;
  }

  function openStore() {
    return new Promise(function (resolve, reject) {
      var request = indexedDB.open("DesignTrace", 1);
      request.onupgradeneeded = function () {
        request.result.createObjectStore("settings");
      };
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  async function saveSetting(key, value) {
    var db = await openStore();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("settings", "readwrite");
      tx.objectStore("settings").put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = function () {
        reject(tx.error);
      };
    });
  }

  async function loadSetting(key) {
    var db = await openStore();
    return new Promise(function (resolve, reject) {
      var tx = db.transaction("settings", "readonly");
      var request = tx.objectStore("settings").get(key);
      request.onsuccess = function () {
        resolve(request.result);
      };
      request.onerror = function () {
        reject(request.error);
      };
    });
  }

  function applyTheme(theme) {
    if (theme === "light" || theme === "dark") {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("designtrace:theme", theme);
      els.themeButton.setAttribute("aria-label", theme === "dark" ? "切换到浅色主题" : "切换到深色主题");
      return;
    }
    delete document.documentElement.dataset.theme;
    localStorage.removeItem("designtrace:theme");
    els.themeButton.setAttribute("aria-label", "切换主题");
  }

  function toggleTheme() {
    var explicit = document.documentElement.dataset.theme;
    var systemDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    var current = explicit || (systemDark ? "dark" : "light");
    applyTheme(current === "dark" ? "light" : "dark");
  }

  function updateFolderTooltip() {
    var text = state.rootName
      ? "当前文件夹：" + state.rootName + "\n项目相对路径：" + state.rootName + "/...\n浏览器出于安全考虑不会暴露完整磁盘路径。"
      : "尚未选择文件夹。\n点击后浏览器会请求查看本地文件夹权限。";
    els.pickDirectoryButton.dataset.tooltip = text;
    els.pickDirectoryButton.title = text;
  }

  async function pickDirectory() {
    if ("showDirectoryPicker" in window) {
      try {
        state.rootHandle = await window.showDirectoryPicker({ mode: "read" });
        state.files = null;
        try {
          await saveSetting("rootHandle", state.rootHandle);
        } catch (error) {
          setStatus("已获得目录权限，但当前浏览器没有保存缓存。");
        }
        await scanDirectoryHandle(state.rootHandle, "已保存，下次刷新会自动恢复。");
        return;
      } catch (error) {
        if (error && error.name === "AbortError") return;
      }
    }
    setStatus("当前浏览器不支持目录授权。请使用 Chrome 或 Edge，并通过 localhost 打开。");
  }

  async function rescan() {
    if (state.rootHandle) {
      await scanDirectoryHandle(state.rootHandle, "已重新扫描。");
      return;
    }
    setStatus("还没有选择文件夹。");
  }

  async function scanDirectoryHandle(rootHandle, doneMessage) {
    try {
      revokeObjectUrls();
      state.rootHandle = rootHandle;
      state.rootName = rootHandle.name;
      updateFolderTooltip();
      setScanning(true, "准备读取 " + rootHandle.name + "...");
      setStatus("正在扫描 " + rootHandle.name + "...");

      var buckets = new Map();
      for await (var entry of rootHandle.values()) {
        if (entry.kind !== "directory" || IGNORE_NAMES.has(entry.name)) continue;
        await registerFolderProject(entry, rootHandle.name, entry.name, 0, buckets);
      }

      state.projects = Array.from(buckets.values()).map(toProject).filter(Boolean);
      finishScan(doneMessage || "扫描完成。");
    } catch (error) {
      setStatus("扫描失败，可以重新选择文件夹。");
      throw error;
    } finally {
      setScanning(false);
    }
  }

  async function registerFolderProject(directoryHandle, rootName, relativePath, depth, buckets) {
    if (depth > MAX_FOLDER_DEPTH) return;

    var path = rootName + "/" + relativePath;
    if (buckets.has(path)) return;

    setScanning(true, "正在分析 " + relativePath + "...");
    var bucket = createBucket(directoryHandle.name, path, rootName, relativePath);
    bucket.directoryHandle = directoryHandle;
    await addDirectoryToBucket(bucket, directoryHandle, "", 0);
    buckets.set(path, bucket);

    for await (var entry of directoryHandle.values()) {
      if (entry.kind !== "directory" || IGNORE_NAMES.has(entry.name)) continue;
      await registerFolderProject(entry, rootName, relativePath + "/" + entry.name, depth + 1, buckets);
    }
  }
  async function addDirectoryToBucket(bucket, directoryHandle, basePath, depth) {
    if (depth > MAX_FOLDER_DEPTH) return;
    for await (var entry of directoryHandle.values()) {
      if (entry.kind === "directory") {
        if (IGNORE_NAMES.has(entry.name)) continue;
        bucket.dirNames.add((basePath ? basePath + "/" : "") + entry.name);
        await addDirectoryToBucket(bucket, entry, (basePath ? basePath + "/" : "") + entry.name, depth + 1);
        continue;
      }
      var file = await entry.getFile();
      addFileToBucket(bucket, file, (basePath ? basePath + "/" : "") + entry.name);
    }
  }

  function finishScan(message) {
    var lastSelectedId = localStorage.getItem("designtrace:selectedProjectId");
    state.projects.sort(function (a, b) {
      return new Date(b.lastActiveAt || 0) - new Date(a.lastActiveAt || 0);
    });
    state.selectedIndex = 0;
    state.timelineOffset = 0;
    updateExtensionFilterOptions();
    applyFilters();
    ensureAutoplay();
    if (lastSelectedId) {
      var restoredIndex = state.filtered.findIndex(function (project) {
        return project.id === lastSelectedId;
      });
      if (restoredIndex >= 0) {
        state.selectedIndex = restoredIndex;
      }
    }
    if (state.filtered[state.selectedIndex]) {
      state.anchorProjectId = state.filtered[state.selectedIndex].id;
    }
    state.statusMessage = "";
    centerActiveThumb(false);
    render();
  }

  function createBucket(name, path, parentPath, relativePath) {
    return {
      name: name,
      path: path,
      parentPath: parentPath,
      relativePath: relativePath || name,
      fileNames: new Set(),
      dirNames: new Set(),
      previews: [],
      recentFiles: [],
      fileCount: 0,
      sizeBytes: 0,
      latestModified: 0,
      earliestModified: Number.POSITIVE_INFINITY,
      imageCount: 0,
      codeCount: 0
    };
  }

  function addFileToBucket(bucket, file, relativePath) {
    var segments = relativePath.split("/").filter(Boolean);
    var fileName = segments[segments.length - 1] || file.name;
    var folders = segments.slice(0, -1);
    var ext = extension(fileName);

    folders.forEach(function (_, index) {
      var folderName = folders[index];
      if (!IGNORE_NAMES.has(folderName)) bucket.dirNames.add(folders.slice(0, index + 1).join("/"));
    });

    bucket.fileNames.add(fileName.toLowerCase());
    bucket.fileCount += 1;
    bucket.sizeBytes += file.size;
    bucket.latestModified = Math.max(bucket.latestModified, file.lastModified);
    bucket.earliestModified = Math.min(bucket.earliestModified, file.lastModified);
    if (IMAGE_EXTENSIONS.has(ext)) bucket.imageCount += 1;
    if (CODE_EXTENSIONS.has(ext)) bucket.codeCount += 1;

    var meta = {
      name: fileName,
      path: bucket.path + "/" + relativePath,
      relativePath: relativePath,
      modifiedAt: new Date(file.lastModified).toISOString(),
      sizeBytes: file.size,
      extension: ext,
      file: file
    };

    bucket.recentFiles.push(meta);
    if (PREVIEW_EXTENSIONS.has(ext)) bucket.previews.push(meta);
  }

  function toProject(bucket) {
    var classification = classify(bucket);
    var score = classification.score + Math.min(24, Math.floor(bucket.fileCount / 5));
    if (score < 12 && bucket.fileCount < 3) return null;

    bucket.recentFiles.sort(function (a, b) {
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });

    var imageFiles = bucket.recentFiles
      .filter(function (file) {
        return IMAGE_EXTENSIONS.has(file.extension);
      })
      .map(function (file) {
        return {
          name: file.name,
          path: file.path,
          relativePath: file.relativePath,
          folderKey: fileFolderKey(file.relativePath),
          modifiedAt: file.modifiedAt,
          sizeBytes: file.sizeBytes,
          extension: file.extension,
          file: file.file
        };
      })
      .sort(function (a, b) {
        if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;
        return new Date(b.modifiedAt) - new Date(a.modifiedAt);
      });

    var extensionSet = new Set();
    bucket.recentFiles.forEach(function (file) {
      if (file.extension) extensionSet.add(file.extension);
    });

    return {
      id: hashText(bucket.path),
      name: bucket.name,
      displayName: bucket.relativePath.split("/").join(" / "),
      path: bucket.path,
      parentPath: bucket.parentPath,
      relativePath: bucket.relativePath,
      createdAt: toIso(bucket.earliestModified),
      modifiedAt: toIso(bucket.latestModified),
      lastActiveAt: bucket.recentFiles[0] ? bucket.recentFiles[0].modifiedAt : toIso(bucket.latestModified),
      fileCount: bucket.fileCount,
      folderCount: bucket.dirNames.size,
      sizeBytes: bucket.sizeBytes,
      projectType: classification.type,
      score: score,
      previewFiles: bucket.previews.slice(0, 8),
      recentFiles: bucket.recentFiles.slice(0, 8),
      imageFiles: imageFiles,
      extensions: Array.from(extensionSet).sort(),
      directoryHandle: bucket.directoryHandle || null
    };
  }

  function fileFolderKey(relativePath) {
    if (!relativePath) return "";
    var index = relativePath.lastIndexOf("/");
    return index >= 0 ? relativePath.slice(0, index) : "";
  }

  function classify(bucket) {
    var type = "Folder Project";
    var score = 0;
    TYPE_RULES.forEach(function (rule) {
      if (bucket.fileNames.has(rule[0].toLowerCase())) {
        type = rule[1];
        score += rule[2];
      }
    });
    if (bucket.imageCount >= 4) {
      type = type === "Folder Project" ? "Visual Assets" : type;
      score += 18;
    }
    if (bucket.codeCount >= 8) score += 12;
    if (bucket.fileCount > 8) score += 8;
    return { type: type, score: score };
  }

  function toIso(timestamp) {
    if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
    return new Date(timestamp).toISOString();
  }

  function sizeFilterMinBytes(sizeFilter) {
    if (sizeFilter === "hideSmall") return IMAGE_SIZE.small;
    if (sizeFilter === "medium") return IMAGE_SIZE.medium;
    if (sizeFilter === "large") return IMAGE_SIZE.large;
    return 0;
  }

  function displayableImages(project) {
    if (!project || !project.imageFiles.length) return [];
    var min = sizeFilterMinBytes(state.sizeFilter);
    var images = project.imageFiles.filter(function (file) {
      return !min || file.sizeBytes >= min;
    });
    return images.slice().sort(function (a, b) {
      if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });
  }

  function primaryDisplayImage(project) {
    var images = displayableImages(project);
    return images[0] || null;
  }

  function sizeFilterLabel(sizeFilter) {
    if (sizeFilter === "hideSmall") return "隐藏小图";
    if (sizeFilter === "medium") return "≥512KB";
    if (sizeFilter === "large") return "≥2MB";
    return "";
  }

  function matchesSizeFilter(project, sizeFilter) {
    if (!sizeFilter || sizeFilter === "all") return true;
    if (!project.imageFiles || !project.imageFiles.length) return true;
    var min = sizeFilterMinBytes(sizeFilter);
    return project.imageFiles.some(function (file) {
      return file.sizeBytes >= min;
    });
  }

  function parentFolderKey(relativePath) {
    if (!relativePath) return "";
    var index = relativePath.lastIndexOf("/");
    return index >= 0 ? relativePath.slice(0, index) : "";
  }

  function rootFolderKey(relativePath) {
    if (!relativePath) return "";
    var index = relativePath.indexOf("/");
    return index >= 0 ? relativePath.slice(0, index) : relativePath;
  }

  function scopeAnchorProject() {
    if (state.anchorProjectId) {
      var anchored = state.projects.find(function (project) {
        return project.id === state.anchorProjectId;
      });
      if (anchored) return anchored;
    }
    return state.projects[0] || null;
  }

  function matchesScopeFilter(project, scope, anchor) {
    if (scope === "all") return true;
    if (scope === "topLevel") return parentFolderKey(project.relativePath) === "";
    if (scope === "nested") return parentFolderKey(project.relativePath) !== "";
    if (!anchor) return true;
    if (scope === "sameParent") {
      return parentFolderKey(project.relativePath) === parentFolderKey(anchor.relativePath);
    }
    if (scope === "sameRoot") {
      return rootFolderKey(project.relativePath) === rootFolderKey(anchor.relativePath);
    }
    return true;
  }

  function scopeFilterLabel(scope) {
    if (scope === "sameParent") return "同父文件夹";
    if (scope === "sameRoot") return "同根目录";
    if (scope === "topLevel") return "仅顶层";
    if (scope === "nested") return "仅子文件夹";
    return "";
  }

  function extensionFilterLabel(values) {
    if (!values || !values.length || values.indexOf("all") >= 0) return "";
    return values.map(function (ext) {
      if (ext === "sameAsCurrent") return "同当前后缀";
      return ext;
    }).join("+");
  }

  function getExtFilterValues() {
    if (!els.extFilterSelect) return ["all"];
    var values = Array.from(els.extFilterSelect.selectedOptions).map(function (option) {
      return option.value;
    });
    return values.length ? values : ["all"];
  }

  function anchorPreviewExtension(anchor) {
    if (!anchor) return "";
    var images = displayableImages(anchor);
    if (!images.length) return "";
    if (state.previewProjectId === anchor.id && state.previewPath) {
      var current = images.find(function (file) {
        return file.path === state.previewPath;
      });
      if (current) return current.extension;
    }
    return images[0].extension;
  }

  function projectMatchesExtensions(project, values, anchor) {
    if (!values.length || values.indexOf("all") >= 0) return true;
    if (!project.extensions || !project.extensions.length) return false;
    return values.some(function (ext) {
      if (ext === "sameAsCurrent") {
        var previewExt = anchorPreviewExtension(anchor);
        return previewExt && project.extensions.indexOf(previewExt) >= 0;
      }
      return project.extensions.indexOf(ext) >= 0;
    });
  }

  function syncExtFilterSelection() {
    if (!els.extFilterSelect) return;
    var selected = getExtFilterValues();
    var allOption = els.extFilterSelect.querySelector('option[value="all"]');
    if (selected.indexOf("all") >= 0 && selected.length > 1 && allOption) {
      allOption.selected = false;
      selected = getExtFilterValues();
    }
    if (!selected.length && allOption) {
      allOption.selected = true;
    }
  }

  function updateExtensionFilterOptions() {
    if (!els.extFilterSelect) return;
    var current = getExtFilterValues().filter(function (value) {
      return value !== "all";
    });
    var extensions = new Set();
    state.projects.forEach(function (project) {
      (project.extensions || []).forEach(function (ext) {
        extensions.add(ext);
      });
    });
    els.extFilterSelect.innerHTML = [
      '<option value="all">全部后缀</option>',
      '<option value="sameAsCurrent">同当前后缀</option>'
    ].join("");
    Array.from(extensions).sort().forEach(function (ext) {
      var option = document.createElement("option");
      option.value = ext;
      option.textContent = ext;
      els.extFilterSelect.appendChild(option);
    });
    if (!current.length) {
      els.extFilterSelect.querySelector('option[value="all"]').selected = true;
    } else {
      Array.from(els.extFilterSelect.options).forEach(function (option) {
        option.selected = current.indexOf(option.value) >= 0;
      });
    }
    state.extFilter = getExtFilterValues();
  }

  function activeFilterLabels() {
    return [
      scopeFilterLabel(state.scopeFilter),
      extensionFilterLabel(state.extFilter),
      sizeFilterLabel(state.sizeFilter)
    ].filter(Boolean);
  }

  function applyFilters() {
    var query = els.searchInput.value.trim().toLowerCase();
    var sortKey = els.sortSelect.value;
    var scope = els.scopeFilterSelect ? els.scopeFilterSelect.value : "all";
    var extValues = getExtFilterValues();
    var sizeFilter = els.sizeFilterSelect ? els.sizeFilterSelect.value : "all";
    state.scopeFilter = scope;
    state.extFilter = extValues;
    state.sizeFilter = sizeFilter;
    var anchor = scopeAnchorProject();
    var selectedId = state.anchorProjectId || (state.filtered[state.selectedIndex] && state.filtered[state.selectedIndex].id);

    state.filtered = state.projects
      .filter(function (project) {
        if (query) {
          var matched = [project.name, project.displayName, project.path, project.relativePath, project.projectType].some(function (value) {
            return value.toLowerCase().includes(query);
          });
          if (!matched) return false;
        }
        if (!matchesScopeFilter(project, scope, anchor)) return false;
        if (!projectMatchesExtensions(project, extValues, anchor)) return false;
        return matchesSizeFilter(project, sizeFilter);
      })
      .sort(function (a, b) {
        if (sortKey === "name") return (a.displayName || a.name).localeCompare(b.displayName || b.name, "zh-CN");
        if (sortKey === "sizeBytes") return b.sizeBytes - a.sizeBytes;
        return new Date(b[sortKey] || 0) - new Date(a[sortKey] || 0);
      });

    if (selectedId) {
      var restoredIndex = state.filtered.findIndex(function (project) {
        return project.id === selectedId;
      });
      state.selectedIndex = restoredIndex >= 0 ? restoredIndex : 0;
    } else if (state.selectedIndex >= state.filtered.length) {
      state.selectedIndex = 0;
    }
    render();
  }

  function heroProject() {
    var index = state.hoverIndex === null ? state.selectedIndex : state.hoverIndex;
    return state.filtered[index] || null;
  }

  function selectIndex(index) {
    if (!state.filtered.length) return;
    state.statusMessage = "";
    state.selectedIndex = (index + state.filtered.length) % state.filtered.length;
    state.hoverIndex = null;
    state.previewPath = "";
    state.previewProjectId = "";
    if (state.filtered[state.selectedIndex]) {
      state.anchorProjectId = state.filtered[state.selectedIndex].id;
      localStorage.setItem("designtrace:selectedProjectId", state.filtered[state.selectedIndex].id);
    }
    render();
  }

  function render() {
    renderHero();
    renderTimeline();
    renderControls();
  }

  function renderHero() {
    var project = heroProject();

    if (!project) {
      els.heroArtwork.innerHTML = "";
      els.heroThumbs.innerHTML = "";
      els.heroThumbs.hidden = true;
      els.slideshowStage.classList.remove("has-thumbs", "is-preview");
      els.heroKicker.textContent = "DesignTrace";
      els.heroTitle.textContent = "选择文件夹开始";
      els.heroMeta.textContent = "本地读取，未上传。";
      renderStatusBar();
      return;
    }

    var activeIndex = state.hoverIndex === null ? state.selectedIndex : state.hoverIndex;
    var ordinal = activeIndex + 1 + " / " + state.filtered.length;
    var filterNotes = activeFilterLabels();
    var currentFile = ensurePreview(project);
    var thumbs = folderImages(project, currentFile);

    els.heroArtwork.innerHTML = artworkMarkup(project, currentFile);
    renderHeroThumbs(project, thumbs, currentFile);
    els.slideshowStage.classList.toggle("has-thumbs", thumbs.length > 1);
    els.slideshowStage.classList.toggle("is-preview", state.hoverIndex !== null && state.hoverIndex !== state.selectedIndex);
    els.heroKicker.textContent = [
      project.projectType,
      ordinal,
      filterNotes.join(" · "),
      state.projects.length !== state.filtered.length ? "共 " + state.projects.length + " 件" : ""
    ].filter(Boolean).join(" · ");
    els.heroTitle.textContent = project.displayName || project.name;
    els.heroMeta.textContent = formatDate(project.lastActiveAt) + " · " + formatBytes(project.sizeBytes) + " · " + project.fileCount + " 个文件";
    renderStatusBar();
  }

  function updateTimelineCardStates() {
    els.timeline.querySelectorAll(".timeline-card").forEach(function (card, index) {
      var isActive = index === state.selectedIndex;
      var isPreview = state.hoverIndex === index && state.hoverIndex !== state.selectedIndex;
      card.classList.toggle("active", isActive);
      card.classList.toggle("is-preview", isPreview);
      card.style.zIndex = String(isPreview ? 200 : isActive ? 160 : index + 1);
    });
  }

  function ensurePreview(project) {
    var images = displayableImages(project);
    if (!project || !images.length) {
      state.previewPath = "";
      state.previewProjectId = project ? project.id : "";
      return null;
    }
    if (state.previewProjectId !== project.id) {
      state.previewProjectId = project.id;
      state.previewPath = images[0].path;
    }
    var current = images.find(function (file) {
      return file.path === state.previewPath;
    });
    if (!current) {
      state.previewPath = images[0].path;
      current = images[0];
    }
    return current;
  }

  function folderImages(project, currentFile) {
    if (!project) return [];
    var images = displayableImages(project);
    if (!currentFile) return images;
    return images.filter(function (file) {
      return file.folderKey === currentFile.folderKey;
    });
  }

  function previewFile(project) {
    if (!project) return null;
    return ensurePreview(project) || primaryDisplayImage(project);
  }

  function renderHeroThumbs(project, thumbs, currentFile) {
    els.heroThumbs.innerHTML = "";
    if (!thumbs || thumbs.length <= 1) {
      els.heroThumbs.hidden = true;
      return;
    }
    els.heroThumbs.hidden = false;
    thumbs.forEach(function (file) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "hero-thumb" + (currentFile && file.path === currentFile.path ? " active" : "");
      button.title = file.name;
      button.innerHTML = '<img src="' + objectUrl(file.file, file.path) + '" alt="' + escapeHtml(file.name) + '">';
      button.addEventListener("click", function () {
        state.previewPath = file.path;
        state.previewProjectId = project.id;
        renderHero();
      });
      els.heroThumbs.appendChild(button);
    });
    var activeThumb = els.heroThumbs.querySelector(".hero-thumb.active");
    if (activeThumb) {
      activeThumb.scrollIntoView({ block: "nearest" });
    }
  }

  function artworkMarkup(project, currentFile) {
    if (!project) return "";
    var preview = currentFile || previewFile(project);

    if (preview && IMAGE_EXTENSIONS.has(preview.extension)) {
      return '<img class="art-image" src="' + objectUrl(preview.file, preview.path) + '" alt="' + escapeHtml(preview.name) + '">';
    }
    return emptyArtwork(project.displayName || project.name, project.path);
  }

  function emptyArtwork(title, subtitle) {
    var heading = title ? "<h2>" + escapeHtml(title) + "</h2>" : "";
    return '<div class="art-generated">' + heading + "<p>" + escapeHtml(subtitle) + "</p></div>";
  }

  function renderStatusBar() {
    if (!els.statusPath || !els.statusFile || !els.statusStats || !els.statusDates) return;

    els.statusFile.textContent = "";
    els.statusStats.textContent = "";
    els.statusDates.textContent = "";
    if (els.statusbar) els.statusbar.classList.remove("is-preview");

    var project = heroProject();
    if (!project) {
      els.statusPath.textContent = state.statusMessage
        || (state.rootName
          ? state.rootName + " · " + state.projects.length + " 件作品"
          : "选择一个文件夹，开始留下创作轨迹。");
      if (!state.statusMessage && state.rootName) {
        els.statusStats.textContent = "本地读取，未上传。";
      }
      return;
    }

    var preview = previewFile(project);
    els.statusPath.textContent = project.path;
    els.statusFile.textContent = preview
      ? preview.name + " · " + formatBytes(preview.sizeBytes)
      : "";
    els.statusStats.textContent = [
      project.projectType,
      project.fileCount + " 个文件",
      project.folderCount + " 个文件夹",
      formatBytes(project.sizeBytes)
    ].join(" · ");
    els.statusDates.textContent = [
      "最近 " + formatDate(project.lastActiveAt, true),
      "修改 " + formatDate(project.modifiedAt, true),
      "创建 " + formatDate(project.createdAt, true)
    ].join(" · ");
    if (els.statusbar) {
      els.statusbar.classList.toggle("is-preview", state.hoverIndex !== null && state.hoverIndex !== state.selectedIndex);
    }
  }

  function renderTimeline() {
    els.timeline.innerHTML = "";
    els.timeline.classList.remove("view-day", "view-week", "view-month");
    if (!state.filtered.length) {
      var emptyMessage = state.projects.length
        ? "当前筛选条件下没有作品。"
        : "选择文件夹后，项目会按时间排列在这里。";
      els.timeline.innerHTML = '<div class="empty-state">' + emptyMessage + "</div>";
      return;
    }

    els.timeline.classList.add("view-" + state.view);

    var metrics = timelineMetrics();
    var track = document.createElement("div");
    track.className = "timeline-track" + (metrics.layered ? " is-layered" : "");
    track.style.width = metrics.trackWidth + "px";
    track.style.transform = "translateX(" + state.timelineOffset + "px)";

    var axis = document.createElement("div");
    axis.className = "timeline-axis";
    track.appendChild(axis);
    renderTicks(track, metrics);

    state.filtered.forEach(function (project, index) {
      var left = cardLeft(index, metrics);
      var isActive = index === state.selectedIndex;
      var isPreview = state.hoverIndex === index && state.hoverIndex !== state.selectedIndex;
      var card = document.createElement("div");
      card.className = "timeline-card"
        + (isActive ? " active" : "")
        + (isPreview ? " is-preview" : "")
        + (metrics.layered ? " is-layered" : "");
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.style.left = left + "px";
      card.style.zIndex = String(isPreview ? 200 : isActive ? 160 : index + 1);
      if (metrics.layered) {
        card.style.setProperty("--layer-depth", String(Math.min(index, 6)));
      }
      card.style.animationDelay = Math.min(index * 32, 360) + "ms";
      card.innerHTML = timelineCardMarkup(project);
      card.addEventListener("click", function (event) {
        if (event.target.closest(".timeline-folder-action")) return;
        selectIndex(index);
        centerActiveThumb(true);
      });
      card.addEventListener("keydown", function (event) {
        if (event.key === "Enter" || event.key === " ") {
          if (event.target.closest(".timeline-folder-action")) return;
          event.preventDefault();
          selectIndex(index);
          centerActiveThumb(true);
        }
      });
      var folderAction = card.querySelector(".timeline-folder-action");
      if (folderAction) {
        folderAction.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          handleProjectFolderAction(project, folderAction);
        });
      }
      card.addEventListener("mouseenter", function () {
        state.hoverIndex = index;
        updateTimelineCardStates();
        renderHero();
      });
      card.addEventListener("mouseleave", function () {
        if (state.hoverIndex !== index) return;
        state.hoverIndex = null;
        updateTimelineCardStates();
        renderHero();
      });
      track.appendChild(card);
    });

    els.timeline.appendChild(track);
    updateTimelineCardStates();
    centerActiveThumb(false);
  }

  function timelineTimeRange() {
    var times = state.filtered.map(function (project) {
      return new Date(project.lastActiveAt || project.modifiedAt || project.createdAt).getTime();
    }).filter(function (time) {
      return Number.isFinite(time) && time > 0;
    });
    var min = Math.min.apply(null, times);
    var max = Math.max.apply(null, times);
    if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
      min = Date.now() - 86400000 * 7;
      max = Date.now() + 86400000 * 7;
    }
    return { min: min, max: max };
  }

  function timelineLayout() {
    var count = state.filtered.length;
    var fullStep = TIMELINE.cardWidth + TIMELINE.cardGap;
    var idealWidth = TIMELINE.padding * 2 + TIMELINE.cardWidth + Math.max(0, count - 1) * fullStep;
    var viewport = els.timeline.clientWidth || 1000;
    var scaledIdeal = idealWidth * state.timelineScale;
    var trackWidth = Math.max(viewport, scaledIdeal);
    var span = trackWidth - TIMELINE.padding * 2 - TIMELINE.cardWidth;
    var step = count > 1 ? span / (count - 1) : fullStep;

    step = Math.min(fullStep, Math.max(TIMELINE.minStep, step));

    var actualWidth = TIMELINE.padding * 2 + TIMELINE.cardWidth + Math.max(0, count - 1) * step;
    var layered = step < TIMELINE.cardWidth;

    return {
      trackWidth: actualWidth,
      step: step,
      layered: layered,
      padding: TIMELINE.padding,
      cardWidth: TIMELINE.cardWidth
    };
  }

  function timelineMetrics() {
    return Object.assign(timelineLayout(), timelineTimeRange());
  }

  function cardLeft(index, metrics) {
    return metrics.padding + index * metrics.step;
  }

  function cardCenter(index, metrics) {
    return cardLeft(index, metrics) + metrics.cardWidth / 2;
  }

  function timeToX(time, metrics) {
    var span = metrics.max - metrics.min || 1;
    return metrics.padding + ((time - metrics.min) / span) * Math.max(1, metrics.trackWidth - metrics.padding * 2);
  }

  function renderTicks(track, metrics) {
    var count = state.view === "day" ? 10 : state.view === "week" ? 8 : 6;
    for (var index = 0; index <= count; index += 1) {
      var time = metrics.min + ((metrics.max - metrics.min) / count) * index;
      var x = timeToX(time, metrics);
      var tick = document.createElement("div");
      tick.className = "tick" + (index % 2 === 0 ? " major" : "");
      tick.style.left = x + "px";
      track.appendChild(tick);
      if (index % 2 === 0) {
        var label = document.createElement("div");
        var date = new Date(time);
        label.className = "tick-label";
        if (index === 0) label.classList.add("tick-label-start");
        if (index === count) label.classList.add("tick-label-end");
        label.style.left = x + "px";
        if (state.view === "month") {
          label.classList.add("tick-label-month");
          label.innerHTML =
            '<span class="tick-month-num">' + (date.getMonth() + 1) + '</span><span class="tick-month-suffix">月</span>';
        } else if (state.view === "day") {
          label.classList.add("tick-label-day");
          label.innerHTML =
            '<span class="tick-month-num">' + String(date.getMonth() + 1).padStart(2, "0") + '</span><span class="tick-day-num">/' + String(date.getDate()).padStart(2, "0") + "</span>";
        } else {
          label.textContent = tickLabel(date);
        }
        track.appendChild(label);
      }
    }
  }

  function tickLabel(date) {
    if (state.view === "month") return new Intl.DateTimeFormat("zh-CN", { year: "2-digit", month: "2-digit" }).format(date);
    if (state.view === "week") return "W" + weekNumber(date);
    return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(date);
  }

  function folderActionIcon(mode) {
    if (mode === "copy") {
      return [
        '<svg viewBox="0 0 24 24" aria-hidden="true">',
        '<rect x="9" y="9" width="11" height="11" rx="1.5" />',
        '<path d="M7 15H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v1" />',
        "</svg>"
      ].join("");
    }
    return [
      '<svg viewBox="0 0 24 24" aria-hidden="true">',
      '<path d="M4 8.5V18a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.5" />',
      '<path d="M4 8.5h16V7a2 2 0 0 0-2-2h-5.2L11.4 3H6a2 2 0 0 0-2 2v3.5Z" />',
      '<path d="M12 11v4M10 13h4" />',
      "</svg>"
    ].join("");
  }

  function canRevealProjectFolder(project) {
    return !!(project && project.directoryHandle && "queryPermission" in project.directoryHandle);
  }

  async function tryRevealProjectFolder(project) {
    if (!canRevealProjectFolder(project)) return false;
    try {
      var permission = await project.directoryHandle.queryPermission({ mode: "read" });
      if (permission !== "granted") {
        permission = await project.directoryHandle.requestPermission({ mode: "read" });
      }
      return false;
    } catch (error) {
      return false;
    }
  }

  async function copyProjectPath(project) {
    if (!project || !project.path) return false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(project.path);
        return true;
      }
    } catch (error) {
      /* fall through */
    }
    try {
      var helper = document.createElement("textarea");
      helper.value = project.path;
      helper.setAttribute("readonly", "");
      helper.style.position = "fixed";
      helper.style.left = "-9999px";
      document.body.appendChild(helper);
      helper.select();
      var copied = document.execCommand("copy");
      document.body.removeChild(helper);
      return copied;
    } catch (error) {
      return false;
    }
  }

  var folderActionTimer = null;

  function showFolderActionStatus(message) {
    if (folderActionTimer) clearTimeout(folderActionTimer);
    setStatus(message);
    folderActionTimer = setTimeout(function () {
      state.statusMessage = "";
      renderStatusBar();
      folderActionTimer = null;
    }, 2200);
  }

  async function handleProjectFolderAction(project, actionButton) {
    if (!project) return;
    var opened = await tryRevealProjectFolder(project);
    if (opened) {
      if (actionButton) {
        actionButton.dataset.mode = "open";
        actionButton.innerHTML = folderActionIcon("open");
        actionButton.title = "打开文件夹";
        actionButton.setAttribute("aria-label", "打开文件夹");
      }
      showFolderActionStatus("已打开文件夹");
      return;
    }
    var copied = await copyProjectPath(project);
    if (actionButton) {
      actionButton.dataset.mode = "copy";
      actionButton.innerHTML = folderActionIcon("copy");
      actionButton.title = "复制文件夹路径";
      actionButton.setAttribute("aria-label", "复制文件夹路径");
    }
    showFolderActionStatus(copied ? "已复制文件夹路径" : "复制路径失败");
  }

  function timelineCardMarkup(project) {
    var preview = primaryDisplayImage(project);
    var thumb = preview
      ? '<img src="' + objectUrl(preview.file, preview.path) + '" alt="' + escapeHtml(project.name) + '">'
      : '<div class="thumb-placeholder">' + escapeHtml(project.projectType) + "</div>";
    var folderMode = canRevealProjectFolder(project) ? "open" : "copy";
    var folderLabel = folderMode === "open" ? "打开文件夹" : "复制文件夹路径";
    return [
      '<div class="thumb">',
      thumb,
      '<button type="button" class="timeline-folder-action" data-mode="' + folderMode + '" aria-label="' + folderLabel + '" title="' + folderLabel + '">',
      folderActionIcon(folderMode),
      "</button>",
      "</div>",
      '<div class="thumb-meta">',
      '<div class="thumb-title">' + escapeHtml(project.displayName || project.name) + "</div>",
      '<div class="thumb-date">' + stageLabel(project) + " · " + formatDate(project.lastActiveAt, true) + "</div>",
      "</div>"
    ].join("");
  }

  function stageLabel(project) {
    if (state.view === "month") {
      return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long" }).format(new Date(project.lastActiveAt || project.modifiedAt));
    }
    if (state.view === "week") return "第 " + weekNumber(new Date(project.lastActiveAt || project.modifiedAt)) + " 周";
    return "阶段";
  }

  function weekNumber(date) {
    var firstDay = new Date(date.getFullYear(), 0, 1);
    return Math.ceil(((date - firstDay) / 86400000 + firstDay.getDay() + 1) / 7);
  }

  function centerActiveThumb(animated) {
    if (!state.filtered.length) return;
    var metrics = timelineMetrics();
    var x = cardCenter(state.selectedIndex, metrics);
    state.timelineOffset = els.timeline.clientWidth / 2 - x;
    var track = els.timeline.querySelector(".timeline-track");
    if (track) {
      if (!animated) track.style.transition = "none";
      track.style.transform = "translateX(" + state.timelineOffset + "px)";
      if (!animated) requestAnimationFrame(function () {
        track.style.transition = "";
      });
    }
  }

  function renderControls() {
    els.prevButton.disabled = state.filtered.length < 2;
    els.nextButton.disabled = state.filtered.length < 2;
    els.rescanButton.disabled = !state.files && !state.rootHandle;
  }

  function setStatus(message) {
    state.statusMessage = message || "";
    renderStatusBar();
  }

  function setScanning(active, message) {
    if (!els.scanOverlay) return;
    if (message) els.scanText.textContent = message;
    els.scanOverlay.classList.toggle("active", active);
  }

  function toggleAutoplay() {
    state.autoplayEnabled = !state.autoplayEnabled;
    if (!state.autoplayEnabled) {
      stopAutoplay();
      setPlayButton(false);
      return;
    }
    ensureAutoplay();
  }

  function stopAutoplay() {
    if (!state.autoplay) return;
    clearInterval(state.autoplay);
    state.autoplay = null;
  }

  function ensureAutoplay() {
    stopAutoplay();
    if (!state.autoplayEnabled || state.filtered.length < 2) {
      setPlayButton(false);
      return;
    }
    setPlayButton(true);
    state.autoplay = setInterval(function () {
      if (state.timelineHovering || state.hoverIndex !== null) return;
      selectIndex(state.selectedIndex + 1);
      centerActiveThumb(true);
    }, 2400);
  }

  function setPlayButton(playing) {
    els.autoplayButton.classList.toggle("playing", playing);
    var label = els.autoplayButton.querySelector("span");
    if (label) label.textContent = playing ? "暂停" : "播放";
    els.autoplayButton.setAttribute("aria-label", playing ? "暂停时间轴" : "播放时间轴");
  }
  function bindEvents() {
    els.pickDirectoryButton.addEventListener("click", pickDirectory);
    els.rescanButton.addEventListener("click", rescan);
    els.themeButton.addEventListener("click", toggleTheme);
    els.searchInput.addEventListener("input", applyFilters);
    els.sortSelect.addEventListener("change", applyFilters);
    if (els.scopeFilterSelect) els.scopeFilterSelect.addEventListener("change", applyFilters);
    if (els.extFilterSelect) {
      els.extFilterSelect.addEventListener("change", function () {
        syncExtFilterSelection();
        applyFilters();
      });
    }
    if (els.sizeFilterSelect) els.sizeFilterSelect.addEventListener("change", applyFilters);
    els.prevButton.addEventListener("click", function () {
      selectIndex(state.selectedIndex - 1);
      centerActiveThumb(true);
    });
    els.nextButton.addEventListener("click", function () {
      selectIndex(state.selectedIndex + 1);
      centerActiveThumb(true);
    });
    var heroWheelLock = false;
    document.querySelector(".showcase").addEventListener("wheel", function (event) {
      if (!state.filtered.length || heroWheelLock) return;
      event.preventDefault();
      heroWheelLock = true;
      selectIndex(state.selectedIndex + (event.deltaY > 0 || event.deltaX > 0 ? 1 : -1));
      centerActiveThumb(true);
      setTimeout(function () {
        heroWheelLock = false;
      }, 260);
    });
    els.autoplayButton.addEventListener("click", toggleAutoplay);
    els.timeline.addEventListener("mouseenter", function () {
      state.timelineHovering = true;
    });
    els.timeline.addEventListener("mouseleave", function () {
      state.timelineHovering = false;
      if (state.hoverIndex === null) return;
      state.hoverIndex = null;
      updateTimelineCardStates();
      renderHero();
    });

    Array.from(document.querySelectorAll(".segment")).forEach(function (button) {
      button.addEventListener("click", function () {
        document.querySelectorAll(".segment").forEach(function (item) {
          item.classList.remove("active");
        });
        button.classList.add("active");
        state.view = button.dataset.view;
        renderTimeline();
      });
    });

    els.timeline.addEventListener("pointerdown", function (event) {
      state.dragging = true;
      state.dragStartX = event.clientX;
      state.dragStartOffset = state.timelineOffset;
      els.timeline.classList.add("dragging");
      els.timeline.setPointerCapture(event.pointerId);
    });
    els.timeline.addEventListener("pointermove", function (event) {
      if (!state.dragging) return;
      state.timelineOffset = state.dragStartOffset + event.clientX - state.dragStartX;
      moveTrack();
    });
    els.timeline.addEventListener("pointerup", function (event) {
      state.dragging = false;
      els.timeline.classList.remove("dragging");
      els.timeline.releasePointerCapture(event.pointerId);
    });
    els.timeline.addEventListener("wheel", function (event) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        var previous = state.timelineScale;
        state.timelineScale = Math.min(8, Math.max(0.7, state.timelineScale * (event.deltaY > 0 ? 0.9 : 1.12)));
        var rect = els.timeline.getBoundingClientRect();
        var pointerX = event.clientX - rect.left;
        state.timelineOffset = pointerX - ((pointerX - state.timelineOffset) / previous) * state.timelineScale;
        renderTimeline();
        return;
      }

      state.timelineOffset -= Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      moveTrack();
    });

    els.splitter.addEventListener("pointerdown", function (event) {
      state.splitterDragging = true;
      els.splitter.setPointerCapture(event.pointerId);
    });
    els.splitter.addEventListener("pointermove", function (event) {
      if (!state.splitterDragging) return;
      var nextHeight = Math.max(180, Math.min(window.innerHeight - 290, window.innerHeight - event.clientY));
      document.documentElement.style.setProperty("--timeline-height", nextHeight + "px");
      centerActiveThumb(false);
    });
    els.splitter.addEventListener("pointerup", function (event) {
      state.splitterDragging = false;
      els.splitter.releasePointerCapture(event.pointerId);
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "ArrowLeft") selectIndex(state.selectedIndex - 1);
      if (event.key === "ArrowRight") selectIndex(state.selectedIndex + 1);
    });
    window.addEventListener("resize", function () {
      centerActiveThumb(true);
    });
  }

  function moveTrack() {
    var track = els.timeline.querySelector(".timeline-track");
    if (track) track.style.transform = "translateX(" + state.timelineOffset + "px)";
  }

  async function restorePreviousDirectory() {
    if (!("showDirectoryPicker" in window)) return;
    try {
      var handle = await loadSetting("rootHandle");
      if (!handle) return;
      setStatus("正在恢复上次选择的文件夹...");
      var permission = await handle.queryPermission({ mode: "read" });
      if (permission !== "granted") permission = await handle.requestPermission({ mode: "read" });
      if (permission === "granted") await scanDirectoryHandle(handle, "已从上次选择恢复。");
      if (permission !== "granted") setStatus("浏览器需要重新授权文件夹。");
    } catch (error) {
      setStatus("可以重新选择文件夹；当前浏览器没有恢复上次目录。");
    }
  }

  applyTheme(localStorage.getItem("designtrace:theme"));
  updateFolderTooltip();
  bindEvents();
  render();
  restorePreviousDirectory();
})();



