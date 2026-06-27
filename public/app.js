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
    dragPointerId: null,
    dragMoved: false,
    view: "day",
    scopeFilter: "all",
    extFilter: ["all"],
    sizeFilter: "all",
    anchorProjectId: "",
    objectUrlCache: new Map(),
    thumbUrlCache: new Map(),
    thumbUrlPending: new Map(),
    imageDimsCache: new Map(),
    imageDimsPending: new Map(),
    statusMessage: "",
    previewPath: "",
    previewProjectId: "",
    heroCurrentFile: null,
    heroImageDims: null,
    timelineRenderGeneration: 0,
    timelineTimeRangeCache: null,
    lastDragReleaseAt: 0
  };

  var timelineLayoutFrame = null;
  var visibleCardsFrame = null;
  var visibleCardsTimer = null;
  var scalingClassTimer = null;
  var heroPreviewTimer = null;
  var heroRenderGeneration = 0;
  var HERO_PREVIEW_DELAY = 90;
  var HERO_PREVIEW_MAX_WIDTH = 960;
  var HERO_MAX_WIDTH = 1920;
  var HERO_THUMB_MAX_WIDTH = 240;
  var TIMELINE_VISIBLE_BUFFER = 4;
  var TIMELINE_VIRTUALIZE_MIN = 120;
  var scanUiLastAt = 0;

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
    extFilter: document.getElementById("extFilter"),
    extFilterTrigger: document.getElementById("extFilterTrigger"),
    extFilterPanel: document.getElementById("extFilterPanel"),
    extFilterMenu: document.getElementById("extFilterMenu"),
    sizeFilterSelect: document.getElementById("sizeFilterSelect"),
    splitter: document.getElementById("splitter"),
    statusbar: document.querySelector(".statusbar"),
    statusSliderCell: document.getElementById("statusSliderCell"),
    statusSlider: document.getElementById("statusSlider"),
    statusSliderValue: document.getElementById("statusSliderValue"),
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
    minStep: 28,
    padding: 168,
    metaHeight: 52,
    minThumbHeight: 30,
    scaleMin: 0.7,
    scaleMax: 8,
    scaleSteps: 100
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
    state.thumbUrlCache.forEach(function (url) {
      URL.revokeObjectURL(url);
    });
    state.thumbUrlCache.clear();
    state.thumbUrlPending.clear();
    state.imageDimsCache.clear();
    state.imageDimsPending.clear();
  }

  var THUMB_MAX_WIDTH = 360;

  function scaledImageUrl(file, cacheKey, maxWidth, jpegQuality) {
    jpegQuality = jpegQuality || 0.82;
    var baseKey = cacheKey || file.name + ":" + file.lastModified + ":" + file.size;
    var key = baseKey + "@" + maxWidth;
    if (state.thumbUrlCache.has(key)) {
      return Promise.resolve(state.thumbUrlCache.get(key));
    }
    if (state.thumbUrlPending.has(key)) {
      return state.thumbUrlPending.get(key);
    }
    if (typeof createImageBitmap !== "function") {
      var fallback = objectUrl(file, cacheKey);
      state.thumbUrlCache.set(key, fallback);
      return Promise.resolve(fallback);
    }
    var promise = createImageBitmap(file, { resizeWidth: maxWidth, resizeQuality: "medium" })
      .then(function (bitmap) {
        var canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        return new Promise(function (resolve) {
          canvas.toBlob(function (blob) {
            if (!blob) {
              resolve(objectUrl(file, cacheKey));
              return;
            }
            var url = URL.createObjectURL(blob);
            state.thumbUrlCache.set(key, url);
            resolve(url);
          }, "image/jpeg", jpegQuality);
        });
      })
      .catch(function () {
        var url = objectUrl(file, cacheKey);
        state.thumbUrlCache.set(key, url);
        return url;
      })
      .finally(function () {
        state.thumbUrlPending.delete(key);
      });
    state.thumbUrlPending.set(key, promise);
    return promise;
  }

  function thumbUrl(file, cacheKey) {
    return scaledImageUrl(file, cacheKey, THUMB_MAX_WIDTH);
  }

  function heroImageUrl(file, cacheKey, hoverPreview) {
    return scaledImageUrl(
      file,
      cacheKey,
      hoverPreview ? HERO_PREVIEW_MAX_WIDTH : HERO_MAX_WIDTH,
      hoverPreview ? 0.78 : 0.85
    );
  }

  function ensureImageDimensions(file, cacheKey) {
    var key = cacheKey || file.name + ":" + file.lastModified + ":" + file.size;
    if (state.imageDimsCache.has(key)) {
      return Promise.resolve(state.imageDimsCache.get(key));
    }
    if (state.imageDimsPending.has(key)) {
      return state.imageDimsPending.get(key);
    }
    if (typeof createImageBitmap !== "function") {
      return Promise.resolve(null);
    }
    var promise = createImageBitmap(file)
      .then(function (bitmap) {
        var dims = { w: bitmap.width, h: bitmap.height };
        bitmap.close();
        state.imageDimsCache.set(key, dims);
        return dims;
      })
      .catch(function () {
        return null;
      })
      .finally(function () {
        state.imageDimsPending.delete(key);
      });
    state.imageDimsPending.set(key, promise);
    return promise;
  }

  function scheduleImageDimensions(file, cacheKey, onReady) {
    var run = function () {
      ensureImageDimensions(file, cacheKey).then(function (dims) {
        if (dims && typeof onReady === "function") onReady(dims);
      });
    };
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 2000 });
    } else {
      setTimeout(run, 0);
    }
  }

  function invalidateHeroImageLoad() {
    heroRenderGeneration += 1;
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
      setScanning(false);
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

    setScanProgress("正在分析 " + relativePath + "...");
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
    if (lastSelectedId) state.anchorProjectId = lastSelectedId;
    requestAnimationFrame(function () {
      updateExtensionFilterOptions();
      applyFilters();
      ensureAutoplay();
      if (state.filtered[state.selectedIndex]) {
        state.anchorProjectId = state.filtered[state.selectedIndex].id;
      }
      state.statusMessage = "";
      centerActiveThumb(false);
    });
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
    var sorted = images.slice().sort(function (a, b) {
      if (b.sizeBytes !== a.sizeBytes) return b.sizeBytes - a.sizeBytes;
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });
    return sorted;
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
    if (!els.extFilterMenu) return state.extFilter.length ? state.extFilter.slice() : ["all"];
    var values = Array.from(els.extFilterMenu.querySelectorAll('input[type="checkbox"]:checked')).map(function (input) {
      return input.value;
    });
    return values.length ? values : ["all"];
  }

  function updateExtFilterTriggerLabel() {
    if (!els.extFilterTrigger) return;
    var values = getExtFilterValues();
    var label = !values.length || values.indexOf("all") >= 0 ? "全部后缀" : extensionFilterLabel(values);
    els.extFilterTrigger.textContent = label || "全部后缀";
    els.extFilterTrigger.title = label || "全部后缀";
  }

  function setExtFilterOpen(open) {
    if (!els.extFilter || !els.extFilterTrigger) return;
    els.extFilter.classList.toggle("is-open", open);
    els.extFilterTrigger.setAttribute("aria-expanded", open ? "true" : "false");
  }

  function extFilterOptionMarkup(value, label) {
    return [
      '<label class="ext-filter-option" role="option">',
      '<input type="checkbox" value="' + escapeHtml(value) + '">',
      "<span>" + escapeHtml(label) + "</span>",
      "</label>"
    ].join("");
  }

  function syncExtFilterSelection() {
    if (!els.extFilterMenu) return;
    var selected = getExtFilterValues();
    if (!selected.length) {
      var allInput = els.extFilterMenu.querySelector('input[value="all"]');
      if (allInput) allInput.checked = true;
      selected = ["all"];
    }
    state.extFilter = selected;
    updateExtFilterTriggerLabel();
  }

  function updateExtensionFilterOptions() {
    if (!els.extFilterMenu) return;
    var current = (state.extFilter || []).filter(function (value) {
      return value !== "all";
    });
    var extensions = new Set();
    state.projects.forEach(function (project) {
      (project.extensions || []).forEach(function (ext) {
        extensions.add(ext);
      });
    });
    els.extFilterMenu.innerHTML = [
      '<div class="ext-filter-special">',
      extFilterOptionMarkup("all", "全部后缀"),
      extFilterOptionMarkup("sameAsCurrent", "同当前后缀"),
      "</div>",
      '<div class="ext-filter-grid">',
      Array.from(extensions).sort().map(function (ext) {
        return extFilterOptionMarkup(ext, ext);
      }).join(""),
      "</div>"
    ].join("");
    var values = current.length ? current : ["all"];
    Array.from(els.extFilterMenu.querySelectorAll('input[type="checkbox"]')).forEach(function (input) {
      input.checked = values.indexOf(input.value) >= 0;
    });
    state.extFilter = getExtFilterValues();
    updateExtFilterTriggerLabel();
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
    state.timelineTimeRangeCache = null;

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
    return state.filtered[state.selectedIndex] || null;
  }

  function heroDisplayProject() {
    if (state.hoverIndex !== null && state.filtered[state.hoverIndex]) {
      return state.filtered[state.hoverIndex];
    }
    return heroProject();
  }

  function isHeroHoverPreview() {
    return state.hoverIndex !== null && state.hoverIndex !== state.selectedIndex;
  }

  function scheduleHeroPreview() {
    if (heroPreviewTimer) clearTimeout(heroPreviewTimer);
    heroPreviewTimer = setTimeout(function () {
      heroPreviewTimer = null;
      renderHero();
    }, HERO_PREVIEW_DELAY);
  }

  function cancelHeroPreview() {
    if (heroPreviewTimer) {
      clearTimeout(heroPreviewTimer);
      heroPreviewTimer = null;
    }
    invalidateHeroImageLoad();
  }

  function setTimelineHover(index) {
    var nextHover = index === state.selectedIndex ? null : index;
    if (state.hoverIndex === nextHover) return;
    invalidateHeroImageLoad();
    state.hoverIndex = nextHover;
    updateTimelineCardStates();
    scheduleHeroPreview();
  }

  function clearTimelineHover() {
    if (state.hoverIndex === null) return;
    invalidateHeroImageLoad();
    state.hoverIndex = null;
    updateTimelineCardStates();
    scheduleHeroPreview();
  }

  function selectIndex(index, options) {
    options = options || {};
    if (!state.filtered.length) return;
    cancelHeroPreview();
    var nextIndex = (index + state.filtered.length) % state.filtered.length;
    var projectChanged = nextIndex !== state.selectedIndex;
    state.statusMessage = "";
    state.selectedIndex = nextIndex;
    state.hoverIndex = null;
    if (projectChanged) {
      state.previewPath = "";
      state.previewProjectId = "";
    } else if (options.allowReselect) {
      renderHero();
      updateTimelineCardStates();
      scheduleVisibleCardsSync();
      if (options.center !== false) centerActiveThumb(true);
      return;
    }
    if (state.filtered[state.selectedIndex]) {
      state.anchorProjectId = state.filtered[state.selectedIndex].id;
      localStorage.setItem("designtrace:selectedProjectId", state.filtered[state.selectedIndex].id);
    }
    renderHero();
    updateTimelineCardStates();
    renderControls();
    scheduleVisibleCardsSync();
    if (options.center !== false) centerActiveThumb(true);
  }

  function render() {
    renderHero();
    renderTimeline();
    renderControls();
  }

  function renderHero() {
    var selectedProject = heroProject();
    var displayProject = heroDisplayProject();
    var hoverPreview = isHeroHoverPreview();

    if (!selectedProject || !displayProject) {
      invalidateHeroImageLoad();
      els.heroArtwork.innerHTML = "";
      els.heroArtwork.classList.remove("is-loading");
      els.heroThumbs.innerHTML = "";
      els.heroThumbs.hidden = true;
      els.slideshowStage.classList.remove("has-thumbs", "is-preview");
      els.heroKicker.textContent = "DesignTrace";
      els.heroTitle.textContent = "选择文件夹开始";
      els.heroMeta.textContent = "本地读取，未上传。";
      renderStatusBar();
      return;
    }

    var ordinal = state.selectedIndex + 1 + " / " + state.filtered.length;
    var filterNotes = activeFilterLabels();
    var currentFile = hoverPreview ? primaryDisplayImage(displayProject) : ensurePreview(selectedProject);
    var thumbs = hoverPreview ? [] : folderImages(selectedProject, currentFile);

    state.heroCurrentFile = currentFile || null;
    if (!currentFile || !state.heroImageDims || state.heroImageDims.path !== currentFile.path) {
      state.heroImageDims = null;
    }

    loadHeroArtwork(displayProject, currentFile, hoverPreview);
    renderHeroThumbs(selectedProject, thumbs, currentFile, hoverPreview);
    els.slideshowStage.classList.toggle("has-thumbs", thumbs.length > 1);
    els.slideshowStage.classList.toggle("is-preview", hoverPreview);
    els.heroKicker.textContent = [
      displayProject.projectType,
      ordinal,
      filterNotes.join(" · "),
      hoverPreview ? "预览" : "",
      state.projects.length !== state.filtered.length ? "共 " + state.projects.length + " 件" : ""
    ].filter(Boolean).join(" · ");
    els.heroTitle.textContent = displayProject.displayName || displayProject.name;
    els.heroMeta.textContent = formatDate(displayProject.lastActiveAt)
      + " · " + formatBytes(displayProject.sizeBytes)
      + " · " + displayProject.fileCount + " 个文件";
    renderStatusBar();
  }

  function loadHeroArtwork(displayProject, currentFile, hoverPreview) {
    var preview = currentFile || previewFile(displayProject);
    var gen = ++heroRenderGeneration;

    if (!preview || !IMAGE_EXTENSIONS.has(preview.extension)) {
      els.heroArtwork.classList.remove("is-loading");
      els.heroArtwork.innerHTML = emptyArtwork(displayProject.displayName || displayProject.name, displayProject.path);
      return;
    }

    els.heroArtwork.classList.add("is-loading");
    els.heroArtwork.innerHTML = '<span class="hero-spinner" aria-hidden="true"></span>';

    heroImageUrl(preview.file, preview.path, hoverPreview).then(function (url) {
      if (gen !== heroRenderGeneration) return;
      if (!els.heroArtwork.isConnected) return;
      if (state.heroCurrentFile && state.heroCurrentFile.path !== preview.path) return;

      var img = document.createElement("img");
      img.className = "art-image";
      img.alt = preview.name;
      img.decoding = "async";
      var settle = function () {
        if (gen !== heroRenderGeneration) return;
        if (!img.isConnected) return;
        els.heroArtwork.classList.remove("is-loading");
        captureHeroImageDimensions(preview, gen);
      };
      img.addEventListener("load", settle, { once: true });
      img.addEventListener("error", settle, { once: true });
      els.heroArtwork.innerHTML = "";
      els.heroArtwork.appendChild(img);
      img.src = url;
      if (img.complete) settle();
    }).catch(function () {
      if (gen !== heroRenderGeneration) return;
      els.heroArtwork.classList.remove("is-loading");
      els.heroArtwork.innerHTML = emptyArtwork(displayProject.displayName || displayProject.name, displayProject.path);
    });

    if (!hoverPreview) {
      scheduleImageDimensions(preview.file, preview.path, function (dims) {
        if (gen !== heroRenderGeneration) return;
        if (!state.heroCurrentFile || state.heroCurrentFile.path !== preview.path) return;
        state.heroImageDims = { path: preview.path, w: dims.w, h: dims.h };
        renderStatusBar();
      });
    }
  }

  function captureHeroImageDimensions(currentFile, gen) {
    if (!currentFile) return;
    var artImg = els.heroArtwork.querySelector(".art-image");
    if (!artImg) return;
    var dimPath = currentFile.path;
    var applyDims = function () {
      if (gen !== undefined && gen !== heroRenderGeneration) return;
      if (!artImg.isConnected) return;
      if (!artImg.naturalWidth) return;
      if (state.heroImageDims && state.heroImageDims.path === dimPath && state.heroImageDims.w > artImg.naturalWidth) {
        renderStatusBar();
        return;
      }
      state.heroImageDims = { path: dimPath, w: artImg.naturalWidth, h: artImg.naturalHeight };
      if (state.heroCurrentFile && state.heroCurrentFile.path === dimPath) renderStatusBar();
    };
    if (artImg.complete && artImg.naturalWidth) {
      applyDims();
    } else {
      artImg.addEventListener("load", applyDims, { once: true });
    }
  }

  function updateTimelineCardStates() {
    els.timeline.querySelectorAll(".timeline-card").forEach(function (card) {
      var index = parseInt(card.dataset.index, 10);
      if (!Number.isFinite(index)) return;
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

  function renderHeroThumbs(project, thumbs, currentFile, hoverPreview) {
    els.heroThumbs.innerHTML = "";
    if (hoverPreview || !thumbs || thumbs.length <= 1) {
      els.heroThumbs.hidden = true;
      return;
    }
    var gen = heroRenderGeneration;
    els.heroThumbs.hidden = false;
    thumbs.forEach(function (file) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "hero-thumb" + (currentFile && file.path === currentFile.path ? " active" : "");
      button.title = file.name;
      button.innerHTML = '<span class="hero-thumb-spinner" aria-hidden="true"></span>'
        + '<img class="hero-thumb-lazy" alt="' + escapeHtml(file.name) + '">';
      button.addEventListener("click", function () {
        state.previewPath = file.path;
        state.previewProjectId = project.id;
        renderHero();
      });
      els.heroThumbs.appendChild(button);

      scaledImageUrl(file.file, file.path, HERO_THUMB_MAX_WIDTH, 0.78).then(function (url) {
        if (gen !== heroRenderGeneration) return;
        var img = button.querySelector("img.hero-thumb-lazy");
        if (!img || !img.isConnected) return;
        img.src = url;
        img.classList.remove("hero-thumb-lazy");
        button.classList.remove("is-loading");
      }).catch(function () {
        button.classList.remove("is-loading");
      });
      button.classList.add("is-loading");
    });
    var activeThumb = els.heroThumbs.querySelector(".hero-thumb.active");
    if (activeThumb) {
      activeThumb.scrollIntoView({ block: "nearest" });
    }
  }

  function stepHeroThumb(direction) {
    var project = heroProject();
    if (!project) return false;
    var currentFile = ensurePreview(project);
    var thumbs = folderImages(project, currentFile);
    if (thumbs.length <= 1) return false;
    var currentIndex = 0;
    for (var i = 0; i < thumbs.length; i++) {
      if (currentFile && thumbs[i].path === currentFile.path) {
        currentIndex = i;
        break;
      }
    }
    var nextIndex = (currentIndex + direction + thumbs.length) % thumbs.length;
    if (nextIndex === currentIndex) return false;
    state.previewPath = thumbs[nextIndex].path;
    state.previewProjectId = project.id;
    renderHero();
    return true;
  }

  function artworkMarkup(project, currentFile) {
    if (!project) return "";
    var preview = currentFile || previewFile(project);

    if (preview && IMAGE_EXTENSIONS.has(preview.extension)) {
      return '<img class="art-image art-image-lazy" alt="' + escapeHtml(preview.name) + '">';
    }
    return emptyArtwork(project.displayName || project.name, project.path);
  }

  function emptyArtwork(title, subtitle) {
    var heading = title ? "<h2>" + escapeHtml(title) + "</h2>" : "";
    return '<div class="art-generated">' + heading + "<p>" + escapeHtml(subtitle) + "</p></div>";
  }

  function timelineScaleFromSlider(value) {
    var ratio = value / TIMELINE.scaleSteps;
    return TIMELINE.scaleMin * Math.pow(TIMELINE.scaleMax / TIMELINE.scaleMin, ratio);
  }

  function sliderFromTimelineScale(scale) {
    var clamped = Math.min(TIMELINE.scaleMax, Math.max(TIMELINE.scaleMin, scale));
    var ratio = Math.log(clamped / TIMELINE.scaleMin) / Math.log(TIMELINE.scaleMax / TIMELINE.scaleMin);
    return Math.round(ratio * TIMELINE.scaleSteps);
  }

  function timelineScaleLabel(scale) {
    return Math.round(scale * 100) + "%";
  }

  function setTimelineScale(nextScale, anchorX) {
    var previous = state.timelineScale;
    state.timelineScale = Math.min(TIMELINE.scaleMax, Math.max(TIMELINE.scaleMin, nextScale));
    if (previous === state.timelineScale && anchorX == null) {
      updateStatusSlider();
      return;
    }
    var rect = els.timeline.getBoundingClientRect();
    var pointerX = anchorX != null ? anchorX : rect.width / 2;
    state.timelineOffset = pointerX - ((pointerX - state.timelineOffset) / previous) * state.timelineScale;
    scheduleTimelineLayout(false);
    updateStatusSlider();
  }

  function visibleCardRange(metrics) {
    var count = state.filtered.length;
    if (!count) return { start: 0, end: -1 };
    var viewport = els.timeline.clientWidth || 1000;
    var visibleLeft = -state.timelineOffset - metrics.padding;
    var visibleRight = visibleLeft + viewport;
    var span = metrics.step + metrics.actualCardWidth;
    var buffer = span * TIMELINE_VISIBLE_BUFFER;
    var start = Math.floor((visibleLeft - buffer) / Math.max(metrics.step, 1));
    var end = Math.ceil((visibleRight + buffer - metrics.actualCardWidth) / Math.max(metrics.step, 1));
    start = Math.max(0, Math.min(count - 1, start));
    end = Math.max(0, Math.min(count - 1, end));
    if (start > end) {
      start = end;
    }
    return { start: start, end: end };
  }

  function desiredVisibleCardIndexes(metrics) {
    if (state.filtered.length < TIMELINE_VIRTUALIZE_MIN) {
      var all = new Set();
      for (var allIndex = 0; allIndex < state.filtered.length; allIndex += 1) {
        all.add(allIndex);
      }
      return { indexes: all, range: { start: 0, end: Math.max(0, state.filtered.length - 1) } };
    }
    var range = visibleCardRange(metrics);
    var indexes = new Set();
    for (var index = range.start; index <= range.end; index += 1) {
      indexes.add(index);
    }
    if (state.filtered[state.selectedIndex]) indexes.add(state.selectedIndex);
    if (state.hoverIndex !== null && state.filtered[state.hoverIndex]) indexes.add(state.hoverIndex);
    return { indexes: indexes, range: range };
  }

  function scheduleVisibleCardsSync() {
    if (visibleCardsFrame) cancelAnimationFrame(visibleCardsFrame);
    visibleCardsFrame = requestAnimationFrame(function () {
      visibleCardsFrame = null;
      var track = els.timeline.querySelector(".timeline-track");
      if (!track || !state.filtered.length) return;
      syncVisibleTimelineCards(track, state.cachedTimelineMetrics || timelineMetrics());
    });
  }

  function scheduleVisibleCardsSyncDelayed(delay) {
    if (visibleCardsTimer) clearTimeout(visibleCardsTimer);
    visibleCardsTimer = setTimeout(function () {
      visibleCardsTimer = null;
      scheduleVisibleCardsSync();
    }, delay);
  }

  function syncVisibleTimelineCards(track, metrics, options) {
    if (!track || !state.filtered.length) return;
    metrics = metrics || timelineMetrics();
    state.cachedTimelineMetrics = metrics;
    var desired = desiredVisibleCardIndexes(metrics);
    var existing = new Map();
    var forceLayout = options && options.forceLayout;
    track.querySelectorAll(".timeline-card").forEach(function (card) {
      var idx = parseInt(card.dataset.index, 10);
      if (!Number.isFinite(idx) || !desired.indexes.has(idx)) {
        card.remove();
        return;
      }
      existing.set(idx, card);
      if (forceLayout) applyCardLayout(card, idx, metrics);
    });
    desired.indexes.forEach(function (index) {
      if (existing.has(index)) return;
      var card = createTimelineCard(state.filtered[index], index, metrics, { lazyThumb: true });
      card.dataset.index = String(index);
      track.appendChild(card);
      hydrateTimelineCardThumb(card, state.filtered[index]);
    });
    updateTimelineCardStates();
  }

  function scheduleTimelineLayout(animated) {
    if (timelineLayoutFrame) cancelAnimationFrame(timelineLayoutFrame);
    timelineLayoutFrame = requestAnimationFrame(function () {
      timelineLayoutFrame = null;
      updateTimelineLayout({ animated: animated });
    });
  }

  function applyCardLayout(card, index, metrics) {
    card.style.left = cardLeft(index, metrics) + "px";
    card.style.setProperty("--card-width", metrics.actualCardWidth + "px");
    card.style.setProperty("--card-height", metrics.cardHeight + "px");
    card.style.setProperty("--thumb-height", metrics.thumbHeight + "px");
    card.classList.toggle("is-narrow", metrics.narrow);
  }

  function bindTimelineCardEvents(card, project, index) {
    card.addEventListener("pointerdown", function (event) {
      if (event.target.closest(".timeline-folder-action")) return;
    });
    card.addEventListener("click", function (event) {
      if (event.target.closest(".timeline-folder-action")) return;
      if (state.lastDragReleaseAt && Date.now() - state.lastDragReleaseAt < 160) return;
      selectIndex(index, { allowReselect: true });
    });
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        if (event.target.closest(".timeline-folder-action")) return;
        event.preventDefault();
        selectIndex(index, { allowReselect: true });
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
      setTimelineHover(index);
    });
    card.addEventListener("mouseleave", function (event) {
      if (state.hoverIndex !== index) return;
      var nextCard = event.relatedTarget && event.relatedTarget.closest
        ? event.relatedTarget.closest(".timeline-card")
        : null;
      if (nextCard && nextCard !== card) return;
      clearTimelineHover();
    });
  }

  function createTimelineCard(project, index, metrics, options) {
    options = options || {};
    var isActive = index === state.selectedIndex;
    var isPreview = state.hoverIndex === index && state.hoverIndex !== state.selectedIndex;
    var card = document.createElement("div");
    card.className = "timeline-card"
      + (isActive ? " active" : "")
      + (isPreview ? " is-preview" : "")
      + (metrics.narrow ? " is-narrow" : "");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.index = String(index);
    card.style.zIndex = String(isPreview ? 200 : isActive ? 160 : index + 1);
    applyCardLayout(card, index, metrics);
    card.innerHTML = timelineCardMarkup(project, options);
    bindTimelineCardEvents(card, project, index);
    return card;
  }

  function updateTickPositions(track, metrics) {
    var tickCount = state.view === "day" ? 10 : state.view === "week" ? 8 : 6;
    var ticks = track.querySelectorAll(".tick");
    var labels = track.querySelectorAll(".tick-label");
    if (ticks.length !== tickCount + 1 || labels.length !== Math.floor(tickCount / 2) + 1) {
      track.querySelectorAll(".tick, .tick-label").forEach(function (node) {
        node.remove();
      });
      renderTicks(track, metrics);
      return;
    }
    var labelIndex = 0;
    for (var index = 0; index <= tickCount; index += 1) {
      var time = metrics.min + ((metrics.max - metrics.min) / tickCount) * index;
      var x = timeToX(time, metrics);
      ticks[index].style.left = x + "px";
      if (index % 2 === 0 && labels[labelIndex]) {
        labels[labelIndex].style.left = x + "px";
        labelIndex += 1;
      }
    }
  }

  function clampTimelineOffset(metrics) {
    if (!state.filtered.length) return;
    var viewport = els.timeline.clientWidth || 1000;
    var leftEdge = metrics.padding;
    var rightEdge = metrics.padding
      + Math.max(0, state.filtered.length - 1) * metrics.step
      + metrics.actualCardWidth;
    var minOffset = viewport - rightEdge;
    var maxOffset = -leftEdge;
    if (minOffset > maxOffset) {
      var center = (minOffset + maxOffset) / 2;
      minOffset = center;
      maxOffset = center;
    }
    state.timelineOffset = Math.max(minOffset, Math.min(maxOffset, state.timelineOffset));
  }

  function updateTimelineLayout(options) {
    options = options || {};
    var track = els.timeline.querySelector(".timeline-track");
    if (!track || !state.filtered.length) {
      if (state.filtered.length) renderTimeline();
      return;
    }
    els.timeline.classList.toggle("is-scaling", options.animated === false);
    var metrics = timelineMetrics();
    state.cachedTimelineMetrics = metrics;
    clampTimelineOffset(metrics);
    track.style.width = metrics.trackWidth + "px";
    updateTickPositions(track, metrics);
    if (options.animated === false) {
      track.querySelectorAll(".timeline-card").forEach(function (card) {
        var index = parseInt(card.dataset.index, 10);
        if (Number.isFinite(index)) applyCardLayout(card, index, metrics);
      });
      scheduleVisibleCardsSyncDelayed(140);
    } else {
      syncVisibleTimelineCards(track, metrics, { forceLayout: true });
    }
    applyTrackOffset(options.animated !== false);
    updateStatusSlider();
    if (scalingClassTimer) clearTimeout(scalingClassTimer);
    scalingClassTimer = setTimeout(function () {
      scalingClassTimer = null;
      if (!timelineLayoutFrame) els.timeline.classList.remove("is-scaling");
    }, 140);
  }

  function updateStatusSlider() {
    if (!els.statusSlider) return;
    var total = state.filtered.length;
    if (els.statusSliderCell) els.statusSliderCell.hidden = total === 0;
    els.statusSlider.disabled = total === 0;
    els.statusSlider.min = "0";
    els.statusSlider.max = String(TIMELINE.scaleSteps);
    var sliderValue = sliderFromTimelineScale(state.timelineScale);
    els.statusSlider.value = String(sliderValue);
    els.statusSlider.style.setProperty("--slider-progress", (sliderValue / TIMELINE.scaleSteps * 100) + "%");
    if (els.statusSliderValue) {
      els.statusSliderValue.textContent = timelineScaleLabel(state.timelineScale);
    }
  }

  function renderStatusBar() {
    if (!els.statusPath || !els.statusFile || !els.statusStats || !els.statusDates) return;
    updateStatusSlider();

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
      if (els.statusbar) els.statusbar.classList.toggle("is-status-notice", !!state.statusMessage);
      if (!state.statusMessage && state.rootName) {
        els.statusStats.textContent = "本地读取，未上传。";
      }
      return;
    }

    var preview = state.heroCurrentFile || previewFile(project);
    if (state.statusMessage) {
      els.statusPath.textContent = state.statusMessage;
      if (els.statusbar) els.statusbar.classList.add("is-status-notice");
    } else {
      els.statusPath.textContent = project.path;
      if (els.statusbar) els.statusbar.classList.remove("is-status-notice");
    }
    if (preview) {
      var fileText = preview.name + " · " + formatBytes(preview.sizeBytes);
      if (state.heroImageDims && state.heroImageDims.path === preview.path) {
        fileText += " · " + state.heroImageDims.w + "×" + state.heroImageDims.h + " px";
      }
      els.statusFile.textContent = fileText;
    } else {
      els.statusFile.textContent = "";
    }
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
      els.statusbar.classList.remove("is-preview");
    }
  }

  function renderTimeline() {
    state.timelineRenderGeneration += 1;
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
    state.cachedTimelineMetrics = metrics;
    clampTimelineOffset(metrics);
    var track = document.createElement("div");
    track.className = "timeline-track";
    track.style.width = metrics.trackWidth + "px";
    applyTrackOffset(false);

    var axis = document.createElement("div");
    axis.className = "timeline-axis";
    track.appendChild(axis);
    renderTicks(track, metrics);
    els.timeline.appendChild(track);
    syncVisibleTimelineCards(track, metrics);
    centerActiveThumb(false);
    updateStatusSlider();
  }

  function timelineTimeRange() {
    if (state.timelineTimeRangeCache) return state.timelineTimeRangeCache;
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
    state.timelineTimeRangeCache = { min: min, max: max };
    return state.timelineTimeRangeCache;
  }

  function clampOffsetValue(metrics, offsetValue) {
    if (!state.filtered.length) return offsetValue;
    var viewport = els.timeline.clientWidth || 1000;
    var leftEdge = metrics.padding;
    var rightEdge = metrics.padding
      + Math.max(0, state.filtered.length - 1) * metrics.step
      + metrics.actualCardWidth;
    var minOffset = viewport - rightEdge;
    var maxOffset = -leftEdge;
    if (minOffset > maxOffset) {
      var center = (minOffset + maxOffset) / 2;
      minOffset = center;
      maxOffset = center;
    }
    return Math.max(minOffset, Math.min(maxOffset, offsetValue));
  }

  function timelineCardDimensions(metrics) {
    var actualCardWidth = Math.min(TIMELINE.cardWidth, metrics.step);
    actualCardWidth = Math.max(TIMELINE.minStep, actualCardWidth);
    var narrow = metrics.step < TIMELINE.cardWidth;
    var thumbHeight = narrow
      ? Math.max(TIMELINE.minThumbHeight, Math.round(88 * actualCardWidth / TIMELINE.cardWidth))
      : 88;
    var metaHeight = narrow ? Math.max(36, Math.round(TIMELINE.metaHeight * actualCardWidth / TIMELINE.cardWidth)) : TIMELINE.metaHeight;
    return {
      actualCardWidth: actualCardWidth,
      thumbHeight: thumbHeight,
      cardHeight: thumbHeight + metaHeight,
      narrow: narrow
    };
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

    var dimensions = timelineCardDimensions({ step: step });
    var actualWidth = TIMELINE.padding * 2 + dimensions.actualCardWidth + Math.max(0, count - 1) * step;

    return Object.assign({
      trackWidth: actualWidth,
      step: step,
      padding: TIMELINE.padding,
      cardWidth: TIMELINE.cardWidth
    }, dimensions);
  }

  function timelineMetrics() {
    return Object.assign(timelineLayout(), timelineTimeRange());
  }

  function cardLeft(index, metrics) {
    return metrics.padding + index * metrics.step;
  }

  function cardCenter(index, metrics) {
    return cardLeft(index, metrics) + metrics.actualCardWidth / 2;
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
    showFolderActionStatus(copied ? "复制成功" : "复制路径失败");
  }

  function timelineCardMarkup(project, options) {
    options = options || {};
    var preview = primaryDisplayImage(project);
    var lazyPending = preview && options.lazyThumb;
    var thumb = preview
      ? (options.lazyThumb
        ? '<img class="timeline-thumb-lazy" alt="' + escapeHtml(project.name) + '" data-thumb-path="' + escapeHtml(preview.path) + '">'
        : '<img src="' + objectUrl(preview.file, preview.path) + '" alt="' + escapeHtml(project.name) + '">')
      : '<div class="thumb-placeholder">' + escapeHtml(project.projectType) + "</div>";
    var folderMode = canRevealProjectFolder(project) ? "open" : "copy";
    var folderLabel = folderMode === "open" ? "打开文件夹" : "复制文件夹路径";
    return [
      '<div class="thumb' + (lazyPending ? " is-loading" : "") + '">',
      lazyPending ? '<span class="thumb-spinner" aria-hidden="true"></span>' : "",
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

  function hydrateTimelineCardThumb(card, project) {
    var img = card.querySelector("img.timeline-thumb-lazy");
    if (!img || img.getAttribute("src")) return;
    var preview = primaryDisplayImage(project);
    if (!preview) return;
    var thumb = img.closest(".thumb");
    var settle = function () {
      img.classList.remove("timeline-thumb-lazy");
      if (thumb) thumb.classList.remove("is-loading");
    };
    thumbUrl(preview.file, preview.path).then(function (url) {
      if (!img.isConnected) return;
      img.addEventListener("load", settle, { once: true });
      img.addEventListener("error", settle, { once: true });
      img.src = url;
    }).catch(settle);
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
    applyTrackOffset(animated !== false);
  }

  function applyTrackOffset(animated) {
    var track = els.timeline.querySelector(".timeline-track");
    if (!track) return;
    if (state.filtered.length) {
      var metrics = state.cachedTimelineMetrics || timelineMetrics();
      clampTimelineOffset(metrics);
    }
    track.classList.toggle("is-dragging", state.dragging || animated === false);
    track.style.transform = "translateX(" + state.timelineOffset + "px)";
    if (els.timeline.classList.contains("is-scaling")) {
      scheduleVisibleCardsSyncDelayed(140);
    } else {
      scheduleVisibleCardsSync();
    }
    if (animated === false) {
      requestAnimationFrame(function () {
        if (!state.dragging) track.classList.remove("is-dragging");
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

  function setScanProgress(message) {
    if (!els.scanOverlay) return;
    var now = Date.now();
    if (!els.scanOverlay.classList.contains("active")) {
      els.scanOverlay.classList.add("active");
      scanUiLastAt = 0;
    }
    if (message && now - scanUiLastAt < 180) return;
    scanUiLastAt = now;
    if (message && els.scanText) els.scanText.textContent = message;
  }

  function setScanning(active, message) {
    if (!els.scanOverlay) return;
    if (active) {
      setScanProgress(message);
      return;
    }
    els.scanOverlay.classList.remove("active");
    scanUiLastAt = 0;
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
      selectIndex(state.selectedIndex + 1, { center: true });
    }, 2400);
  }

  function setPlayButton(playing) {
    els.autoplayButton.classList.toggle("playing", playing);
    var label = els.autoplayButton.querySelector("span");
    if (label) label.textContent = playing ? "暂停" : "播放";
    els.autoplayButton.setAttribute("aria-label", playing ? "暂停时间轴" : "播放时间轴");
  }
  function bindEvents() {
    window.addEventListener(
      "wheel",
      function (event) {
        if (event.ctrlKey || event.metaKey) event.preventDefault();
      },
      { passive: false }
    );

    els.pickDirectoryButton.addEventListener("click", pickDirectory);
    els.rescanButton.addEventListener("click", rescan);
    els.themeButton.addEventListener("click", toggleTheme);
    els.searchInput.addEventListener("input", applyFilters);
    els.sortSelect.addEventListener("change", applyFilters);
    if (els.scopeFilterSelect) els.scopeFilterSelect.addEventListener("change", applyFilters);
    if (els.extFilterTrigger) {
      els.extFilterTrigger.addEventListener("click", function (event) {
        event.stopPropagation();
        setExtFilterOpen(!els.extFilter.classList.contains("is-open"));
      });
    }
    if (els.extFilterMenu) {
      els.extFilterMenu.addEventListener("change", function (event) {
        if (event.target.type !== "checkbox") return;
        if (event.target.value === "all" && event.target.checked) {
          Array.from(els.extFilterMenu.querySelectorAll('input[type="checkbox"]')).forEach(function (input) {
            if (input.value !== "all") input.checked = false;
          });
        } else if (event.target.checked) {
          var allInput = els.extFilterMenu.querySelector('input[value="all"]');
          if (allInput) allInput.checked = false;
        }
        syncExtFilterSelection();
        applyFilters();
      });
    }
    document.addEventListener("click", function (event) {
      if (els.extFilter && !els.extFilter.contains(event.target)) setExtFilterOpen(false);
    });
    if (els.sizeFilterSelect) els.sizeFilterSelect.addEventListener("change", applyFilters);
    els.prevButton.addEventListener("click", function () {
      selectIndex(state.selectedIndex - 1);
    });
    els.nextButton.addEventListener("click", function () {
      selectIndex(state.selectedIndex + 1);
    });
    if (els.statusSlider) {
      els.statusSlider.addEventListener("input", function () {
        if (!state.filtered.length || els.statusSlider.disabled) return;
        setTimelineScale(timelineScaleFromSlider(parseInt(els.statusSlider.value, 10)));
      });
    }
    var heroWheelLock = false;
    document.querySelector(".showcase").addEventListener("wheel", function (event) {
      if (!state.filtered.length || heroWheelLock) return;
      if (event.target.closest && event.target.closest("#heroThumbs")) return;
      event.preventDefault();
      heroWheelLock = true;
      selectIndex(state.selectedIndex + (event.deltaY > 0 || event.deltaX > 0 ? 1 : -1));
      setTimeout(function () {
        heroWheelLock = false;
      }, 260);
    });
    var heroThumbWheelLock = false;
    els.heroThumbs.addEventListener(
      "wheel",
      function (event) {
        if (!state.filtered.length || heroThumbWheelLock) return;
        var direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1;
        event.preventDefault();
        event.stopPropagation();
        heroThumbWheelLock = true;
        if (!stepHeroThumb(direction)) heroThumbWheelLock = false;
        else {
          setTimeout(function () {
            heroThumbWheelLock = false;
          }, 260);
        }
      },
      { passive: false }
    );
    els.autoplayButton.addEventListener("click", toggleAutoplay);
    els.timeline.addEventListener("mouseenter", function () {
      state.timelineHovering = true;
    });
    els.timeline.addEventListener("mouseleave", function () {
      state.timelineHovering = false;
      clearTimelineHover();
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
      if (event.button !== 0) return;
      state.dragging = false;
      state.dragMoved = false;
      state.dragPointerId = event.pointerId;
      state.dragStartX = event.clientX;
      state.dragStartOffset = state.timelineOffset;
      els.timeline.setPointerCapture(event.pointerId);
    });
    els.timeline.addEventListener("pointermove", function (event) {
      if (event.pointerId !== state.dragPointerId) return;
      if (!state.dragMoved && Math.abs(event.clientX - state.dragStartX) > 5) {
        state.dragMoved = true;
        state.dragging = true;
        els.timeline.classList.add("dragging");
      }
      if (!state.dragging) return;
      state.timelineOffset = state.dragStartOffset + event.clientX - state.dragStartX;
      applyTrackOffset(false);
    });
    els.timeline.addEventListener("pointerup", function (event) {
      if (event.pointerId !== state.dragPointerId) return;
      var didMove = state.dragMoved;
      if (state.dragging) {
        els.timeline.classList.remove("dragging");
        if (els.timeline.hasPointerCapture(event.pointerId)) {
          els.timeline.releasePointerCapture(event.pointerId);
        }
      }
      state.dragging = false;
      state.dragMoved = false;
      state.dragPointerId = null;
      if (didMove) state.lastDragReleaseAt = Date.now();
      applyTrackOffset(true);
    });
    els.timeline.addEventListener("pointercancel", function (event) {
      if (event.pointerId !== state.dragPointerId) return;
      state.dragging = false;
      state.dragMoved = false;
      state.dragPointerId = null;
      els.timeline.classList.remove("dragging");
    });
    els.timeline.addEventListener("wheel", function (event) {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        var rect = els.timeline.getBoundingClientRect();
        var pointerX = event.clientX - rect.left;
        var factor = event.deltaY > 0 ? 0.9 : 1.12;
        setTimelineScale(state.timelineScale * factor, pointerX);
        return;
      }

      var beforeOffset = state.timelineOffset;
      var delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      var metrics = state.cachedTimelineMetrics || timelineMetrics();
      var nextOffset = clampOffsetValue(metrics, state.timelineOffset - delta);
      if (nextOffset === beforeOffset) return;
      state.timelineOffset = nextOffset;
      applyTrackOffset(false);
    });

    els.splitter.addEventListener("pointerdown", function (event) {
      state.splitterDragging = true;
      els.splitter.setPointerCapture(event.pointerId);
    });
    els.splitter.addEventListener("pointermove", function (event) {
      if (!state.splitterDragging) return;
      var nextHeight = Math.max(180, Math.min(window.innerHeight - 290, window.innerHeight - event.clientY));
      document.documentElement.style.setProperty("--timeline-height", nextHeight + "px");
    });
    els.splitter.addEventListener("pointerup", function (event) {
      state.splitterDragging = false;
      els.splitter.releasePointerCapture(event.pointerId);
    });

    window.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setExtFilterOpen(false);
      if (event.key === "ArrowLeft") selectIndex(state.selectedIndex - 1);
      if (event.key === "ArrowRight") selectIndex(state.selectedIndex + 1);
    });
    window.addEventListener("resize", function () {
      scheduleTimelineLayout(true);
      centerActiveThumb(true);
    });
  }

  function moveTrack() {
    applyTrackOffset(!state.dragging);
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
  updateExtensionFilterOptions();
  bindEvents();
  render();
  restorePreviousDirectory();
})();



