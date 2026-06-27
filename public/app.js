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
    lastDragReleaseAt: 0,
    heatmapCollapsed: false,
    heatmapHoverDay: "",
    heatmapViewYear: null,
    heatmapViewMonth: null,
    timelinePeriodSyncLock: false,
    heatmapNavSyncLock: false
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
  var TIMELINE_THUMB_MAX_IMAGES = 4;
  var HEATMAP_TOOLTIP_LIMIT = 8;
  var HEATMAP_WHEEL_COOLDOWN = 120;
  var scanUiLastAt = 0;
  var heatmapWheelLock = false;

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
    timelineYearSelect: document.getElementById("timelineYearSelect"),
    timelineMonthSelect: document.getElementById("timelineMonthSelect"),
    heatmapPanel: document.getElementById("heatmapPanel"),
    heatmapToggle: document.getElementById("heatmapToggle"),
    heatmap: document.getElementById("heatmap"),
    heatmapYearSelect: document.getElementById("heatmapYearSelect"),
    heatmapMonthSelect: document.getElementById("heatmapMonthSelect"),
    heatmapPrevMonth: document.getElementById("heatmapPrevMonth"),
    heatmapNextMonth: document.getElementById("heatmapNextMonth"),
    heatmapTooltip: document.getElementById("heatmapTooltip"),
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
  var DESIGN_SOURCE_EXTENSIONS = new Set([
    ".cdr", ".psd", ".ai", ".eps", ".pptx", ".ppt", ".indd", ".xd", ".sketch", ".afdesign"
  ]);
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
    minStep: 8,
    minimalWidth: 32,
    padding: 168,
    metaHeight: 52,
    minThumbHeight: 24,
    minThumbHeightMinimal: 8,
    scaleMin: 0.1,
    scaleMax: 3,
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

  function normalizeYear(value, digits) {
    if (digits >= 4) return value;
    return 2000 + value;
  }

  function makeCalendarDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    var date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
  }

  function resolveYearFromPath(relativePath, rootName) {
    var segments = relativePath.split("/").filter(Boolean);
    if (segments.length) segments.pop();
    var candidates = segments.slice().reverse().concat([rootName]);
    for (var index = 0; index < candidates.length; index += 1) {
      var segment = candidates[index];
      var fullYear = segment.match(/^#?(\d{4})年?$/);
      if (fullYear) return parseInt(fullYear[1], 10);
      var shortYear = segment.match(/^#?(\d{2})年?$/);
      if (shortYear) return normalizeYear(parseInt(shortYear[1], 10), 2);
      var parsed = parseFolderDate(segment, segment, rootName);
      if (parsed && parsed.source === "name-full") {
        return new Date(parsed.iso).getFullYear();
      }
    }
    return null;
  }

  function parseFolderDate(folderName, relativePath, rootName) {
    var name = String(folderName || "").trim();
    if (!name) return null;

    var cnFull = name.match(/^(\d{2}|\d{4})年(\d{1,2})月(\d{1,2})(?:日|号)?(?=\s|$|[-_.])/);
    if (cnFull) {
      var cnYear = normalizeYear(parseInt(cnFull[1], 10), cnFull[1].length);
      var cnDate = makeCalendarDate(cnYear, parseInt(cnFull[2], 10), parseInt(cnFull[3], 10));
      if (cnDate) return { iso: cnDate.toISOString(), source: "name-full" };
    }

    var numFull = name.match(/^(\d{2}|\d{4})[-.\s](\d{1,2})[-.\s](\d{1,2})(?=\s|$|[-_.])/);
    if (numFull) {
      var numYear = normalizeYear(parseInt(numFull[1], 10), numFull[1].length);
      var numDate = makeCalendarDate(numYear, parseInt(numFull[2], 10), parseInt(numFull[3], 10));
      if (numDate) return { iso: numDate.toISOString(), source: "name-full" };
    }

    var cnMonthDay = name.match(/^(\d{1,2})月(\d{1,2})(?:日|号)?(?=\s|$|[-_.])/);
    if (cnMonthDay) {
      var cnPathYear = resolveYearFromPath(relativePath, rootName);
      if (cnPathYear) {
        var cnMdDate = makeCalendarDate(cnPathYear, parseInt(cnMonthDay[1], 10), parseInt(cnMonthDay[2], 10));
        if (cnMdDate) return { iso: cnMdDate.toISOString(), source: "name-month-day" };
      }
      return null;
    }

    var numMonthDay = name.match(/^(\d{1,2})[-.\s](\d{1,2})(?=\s|$|[-_.])/);
    if (numMonthDay && parseInt(numMonthDay[1], 10) <= 12) {
      var mdYear = resolveYearFromPath(relativePath, rootName);
      if (mdYear) {
        var mdDate = makeCalendarDate(mdYear, parseInt(numMonthDay[1], 10), parseInt(numMonthDay[2], 10));
        if (mdDate) return { iso: mdDate.toISOString(), source: "name-month-day" };
      }
      return null;
    }

    return null;
  }

  function isLayerOneRelativePath(relativePath) {
    return relativePath.indexOf("/") < 0 || relativePath.split("/").filter(Boolean).length === 2;
  }

  function layerOneFolderLabel(relativePath) {
    var segments = relativePath.split("/").filter(Boolean);
    if (segments.length <= 1) return "项目根目录";
    return segments[0];
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

    var folderName = relativePath.split("/").pop() || directoryHandle.name;
    var folderDate = parseFolderDate(folderName, relativePath, rootName);

    for await (var childEntry of directoryHandle.values()) {
      if (childEntry.kind !== "directory" || IGNORE_NAMES.has(childEntry.name)) continue;
      await registerFolderProject(
        childEntry,
        rootName,
        relativePath + "/" + childEntry.name,
        depth + 1,
        buckets
      );
    }

    if (!folderDate) return;

    var path = rootName + "/" + relativePath;
    if (buckets.has(path)) return;

    setScanProgress("正在分析 " + relativePath + "...");
    var bucket = createBucket(directoryHandle.name, path, rootName, relativePath);
    bucket.directoryHandle = directoryHandle;
    bucket.folderDate = folderDate.iso;
    bucket.folderDateSource = folderDate.source;
    await addDirectoryToBucket(bucket, directoryHandle, "", 0);
    buckets.set(path, bucket);
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
      return new Date(a.lastActiveAt || 0) - new Date(b.lastActiveAt || 0);
    });
    state.selectedIndex = 0;
    state.timelineOffset = 0;
    state.heatmapViewYear = null;
    state.heatmapViewMonth = null;
    if (lastSelectedId) state.anchorProjectId = lastSelectedId;
    requestAnimationFrame(function () {
      updateExtensionFilterOptions();
      applyFilters();
      if (!lastSelectedId && state.filtered.length) {
        state.selectedIndex = state.filtered.length - 1;
      }
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
      layerOneFiles: [],
      designSourceTimes: [],
      folderDate: null,
      folderDateSource: null,
      fileCount: 0,
      sizeBytes: 0,
      latestModified: 0,
      earliestModified: Number.POSITIVE_INFINITY,
      imageCount: 0,
      codeCount: 0,
      designSourceCount: 0
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

    var depth = folders.length;
    if (isLayerOneRelativePath(relativePath)) {
      bucket.layerOneFiles.push(meta);
    }
    if (depth === 0 && DESIGN_SOURCE_EXTENSIONS.has(ext)) {
      bucket.designSourceTimes.push(file.lastModified);
      bucket.designSourceCount += 1;
    }
  }

  function toProject(bucket) {
    if (!bucket.folderDate) return null;

    var classification = classify(bucket);
    var folderDateIso = bucket.folderDate;
    var createdAt;
    var modifiedAt;
    var lastActiveAt;

    if (bucket.designSourceTimes.length) {
      var minTime = Math.min.apply(null, bucket.designSourceTimes);
      var maxTime = Math.max.apply(null, bucket.designSourceTimes);
      createdAt = toIso(minTime);
      modifiedAt = toIso(maxTime);
      lastActiveAt = modifiedAt;
    } else {
      createdAt = folderDateIso;
      modifiedAt = folderDateIso;
      lastActiveAt = folderDateIso;
    }

    bucket.recentFiles.sort(function (a, b) {
      return new Date(b.modifiedAt) - new Date(a.modifiedAt);
    });

    bucket.layerOneFiles.sort(function (a, b) {
      var folderA = layerOneFolderLabel(a.relativePath);
      var folderB = layerOneFolderLabel(b.relativePath);
      if (folderA !== folderB) return folderA.localeCompare(folderB, "zh-CN");
      return a.name.localeCompare(b.name, "zh-CN");
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

    var layerOneFiles = bucket.layerOneFiles.map(function (file) {
      return {
        name: file.name,
        path: file.path,
        relativePath: file.relativePath,
        folderKey: fileFolderKey(file.relativePath),
        folderLabel: layerOneFolderLabel(file.relativePath),
        modifiedAt: file.modifiedAt,
        sizeBytes: file.sizeBytes,
        extension: file.extension,
        file: file.file
      };
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
      createdAt: createdAt,
      modifiedAt: modifiedAt,
      lastActiveAt: lastActiveAt,
      folderDate: folderDateIso,
      folderDateSource: bucket.folderDateSource,
      fileCount: bucket.fileCount,
      folderCount: bucket.dirNames.size,
      sizeBytes: bucket.sizeBytes,
      projectType: classification.type,
      score: classification.score,
      previewFiles: bucket.previews.slice(0, 8),
      recentFiles: bucket.recentFiles.slice(0, 8),
      imageFiles: imageFiles,
      layerOneFiles: layerOneFiles,
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
    var type = "Design Project";
    var score = 20;
    if (bucket.designSourceCount > 0) {
      type = "Design Source";
      score += 24;
    }
    TYPE_RULES.forEach(function (rule) {
      if (bucket.fileNames.has(rule[0].toLowerCase())) {
        type = rule[1];
        score += rule[2];
      }
    });
    if (bucket.imageCount >= 4) {
      type = type === "Design Project" ? "Visual Assets" : type;
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

  function timelineDisplayImages(project) {
    return displayableImages(project).slice(0, TIMELINE_THUMB_MAX_IMAGES);
  }

  function timelineThumbImageMarkup(file, lazyThumb) {
    if (lazyThumb) {
      return '<img class="timeline-thumb-lazy" alt="" data-thumb-path="' + escapeHtml(file.path) + '">';
    }
    return '<img src="' + objectUrl(file.file, file.path) + '" alt="">';
  }

  function timelineThumbContent(project, options) {
    options = options || {};
    var images = timelineDisplayImages(project);
    if (!images.length) {
      return '<div class="thumb-placeholder">' + escapeHtml(project.projectType) + "</div>";
    }
    if (images.length === 1) {
      return timelineThumbImageMarkup(images[0], options.lazyThumb);
    }
    var cells = images.map(function (file) {
      return '<div class="thumb-grid-cell">' + timelineThumbImageMarkup(file, options.lazyThumb) + "</div>";
    }).join("");
    return '<div class="thumb-grid thumb-grid--' + images.length + '">' + cells + "</div>";
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
        return new Date(a[sortKey] || 0) - new Date(b[sortKey] || 0);
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
    updateTimelinePeriodFilters();
    renderHeatmap({ syncToSelection: true });
  }

  function render() {
    renderHero();
    renderTimeline();
    renderHeatmap();
    renderControls();
    updateTimelinePeriodFilters();
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
      els.slideshowStage.classList.remove("has-sidepanel", "is-preview");
      els.heroKicker.textContent = "DesignTrace";
      els.heroTitle.textContent = "选择文件夹开始";
      els.heroMeta.textContent = "本地读取，未上传。";
      renderStatusBar();
      return;
    }

    var currentFile = hoverPreview ? primaryDisplayImage(displayProject) : ensurePreview(selectedProject);
    var sideFiles = hoverPreview ? [] : projectLayerOneFiles(selectedProject);

    state.heroCurrentFile = currentFile || null;
    if (!currentFile || !state.heroImageDims || state.heroImageDims.path !== currentFile.path) {
      state.heroImageDims = null;
    }

    loadHeroArtwork(displayProject, currentFile, hoverPreview);
    renderHeroSideFiles(selectedProject, sideFiles, currentFile, hoverPreview);
    els.slideshowStage.classList.toggle("has-sidepanel", !hoverPreview && !!selectedProject);
    els.slideshowStage.classList.toggle("is-preview", hoverPreview);
    els.heroKicker.textContent = "";
    els.heroTitle.textContent = displayProject.name;
    els.heroMeta.textContent = displayProject.fileCount + " 个文件 · "
      + displayProject.folderCount + " 个文件夹 · "
      + formatBytes(displayProject.sizeBytes);
    renderStatusBar();
  }

  function loadHeroArtwork(displayProject, currentFile, hoverPreview) {
    var preview = currentFile || previewFile(displayProject);
    var gen = ++heroRenderGeneration;

    if (!preview) {
      els.heroArtwork.classList.remove("is-loading");
      els.heroArtwork.innerHTML = emptyArtwork(displayProject.displayName || displayProject.name, displayProject.path);
      return;
    }

    if (!IMAGE_EXTENSIONS.has(preview.extension)) {
      els.heroArtwork.classList.remove("is-loading");
      els.heroArtwork.innerHTML = emptyArtwork(preview.name, preview.extension || preview.path);
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

  function projectTimelineDate(project) {
    return new Date(project.lastActiveAt || project.modifiedAt || project.createdAt);
  }

  function timelineAvailableYears() {
    var years = new Set();
    state.filtered.forEach(function (project) {
      var date = projectTimelineDate(project);
      if (Number.isFinite(date.getTime())) years.add(date.getFullYear());
    });
    return Array.from(years).sort(function (a, b) {
      return a - b;
    });
  }

  function timelineAvailableMonths(year) {
    var months = new Set();
    state.filtered.forEach(function (project) {
      var date = projectTimelineDate(project);
      if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year) return;
      months.add(date.getMonth());
    });
    return Array.from(months).sort(function (a, b) {
      return a - b;
    });
  }

  function timelinePeriodAtIndex(index) {
    var project = state.filtered[index];
    if (!project) return null;
    var date = projectTimelineDate(project);
    if (!Number.isFinite(date.getTime())) return null;
    return { year: date.getFullYear(), month: date.getMonth() };
  }

  function timelineViewportCenterIndex(metrics) {
    metrics = metrics || state.cachedTimelineMetrics || timelineMetrics();
    var viewport = els.timeline.clientWidth || 0;
    if (!state.filtered.length) return 0;
    var viewportCenter = -state.timelineOffset + viewport / 2;
    var bestIndex = 0;
    var bestDistance = Infinity;
    for (var index = 0; index < state.filtered.length; index += 1) {
      var distance = Math.abs(cardCenter(index, metrics) - viewportCenter);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    }
    return bestIndex;
  }

  function currentTimelinePeriodFromViewport() {
    var period = timelinePeriodAtIndex(timelineViewportCenterIndex());
    if (period) return period;
    return timelinePeriodAtIndex(state.selectedIndex);
  }

  function syncTimelinePeriodFiltersFromViewport() {
    if (!els.timelineYearSelect || !els.timelineMonthSelect) return;
    if (!state.filtered.length || state.timelinePeriodSyncLock) return;
    var period = currentTimelinePeriodFromViewport();
    if (!period) return;
    var yearValue = parseInt(els.timelineYearSelect.value, 10);
    var monthValue = parseInt(els.timelineMonthSelect.value, 10);
    if (yearValue === period.year && monthValue === period.month) return;
    state.timelinePeriodSyncLock = true;
    populateTimelineYearSelect(period.year);
    populateTimelineMonthSelect(period.year, period.month);
    state.timelinePeriodSyncLock = false;
  }

  function findFirstIndexForPeriod(year, month) {
    for (var index = 0; index < state.filtered.length; index += 1) {
      var date = projectTimelineDate(state.filtered[index]);
      if (!Number.isFinite(date.getTime())) continue;
      if (date.getFullYear() === year && date.getMonth() === month) return index;
    }
    return -1;
  }

  function findFirstIndexForYear(year) {
    for (var index = 0; index < state.filtered.length; index += 1) {
      var date = projectTimelineDate(state.filtered[index]);
      if (Number.isFinite(date.getTime()) && date.getFullYear() === year) return index;
    }
    return -1;
  }

  function populateTimelineYearSelect(selectedYear) {
    if (!els.timelineYearSelect) return null;
    var years = timelineAvailableYears();
    els.timelineYearSelect.innerHTML = years.map(function (year) {
      return '<option value="' + year + '">' + year + "年</option>";
    }).join("");
    if (!years.length) return null;
    var nextYear = years.indexOf(selectedYear) >= 0 ? selectedYear : years[0];
    els.timelineYearSelect.value = String(nextYear);
    return nextYear;
  }

  function populateTimelineMonthSelect(year, selectedMonth) {
    if (!els.timelineMonthSelect) return null;
    var months = timelineAvailableMonths(year);
    els.timelineMonthSelect.innerHTML = months.map(function (month) {
      return '<option value="' + month + '">' + (month + 1) + "月</option>";
    }).join("");
    if (!months.length) return null;
    var nextMonth = months.indexOf(selectedMonth) >= 0 ? selectedMonth : months[0];
    els.timelineMonthSelect.value = String(nextMonth);
    return nextMonth;
  }

  function updateTimelinePeriodFilters() {
    if (!els.timelineYearSelect || !els.timelineMonthSelect) return;
    if (!state.filtered.length) {
      els.timelineYearSelect.disabled = true;
      els.timelineMonthSelect.disabled = true;
      els.timelineYearSelect.innerHTML = '<option value="">年份</option>';
      els.timelineMonthSelect.innerHTML = '<option value="">月份</option>';
      return;
    }

    els.timelineYearSelect.disabled = false;
    els.timelineMonthSelect.disabled = false;
    var period = currentTimelinePeriodFromViewport();
    if (!period) {
      var fallbackDate = projectTimelineDate(state.filtered[0]);
      period = {
        year: fallbackDate.getFullYear(),
        month: fallbackDate.getMonth()
      };
    }

    state.timelinePeriodSyncLock = true;
    var year = populateTimelineYearSelect(period.year);
    var month = year == null ? null : populateTimelineMonthSelect(year, period.month);
    state.timelinePeriodSyncLock = false;
    return { year: year, month: month };
  }

  function navigateToTimelinePeriod(year, month) {
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    var index = findFirstIndexForPeriod(year, month);
    if (index < 0) index = findFirstIndexForYear(year);
    if (index < 0) return;
    state.heatmapViewYear = year;
    state.heatmapViewMonth = month;
    selectIndex(index, { center: true });
  }

  function onTimelineYearChange() {
    if (state.timelinePeriodSyncLock || !els.timelineYearSelect || !els.timelineMonthSelect) return;
    var year = parseInt(els.timelineYearSelect.value, 10);
    if (!Number.isFinite(year)) return;
    var months = timelineAvailableMonths(year);
    if (!months.length) return;
    state.timelinePeriodSyncLock = true;
    var month = populateTimelineMonthSelect(year, months[0]);
    state.timelinePeriodSyncLock = false;
    navigateToTimelinePeriod(year, month);
  }

  function onTimelineMonthChange() {
    if (state.timelinePeriodSyncLock || !els.timelineYearSelect || !els.timelineMonthSelect) return;
    var year = parseInt(els.timelineYearSelect.value, 10);
    var month = parseInt(els.timelineMonthSelect.value, 10);
    navigateToTimelinePeriod(year, month);
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

  function projectLayerOneFiles(project) {
    if (!project || !project.layerOneFiles) return [];
    return project.layerOneFiles;
  }

  function ensurePreview(project) {
    var files = projectLayerOneFiles(project);
    if (!project || !files.length) {
      state.previewPath = "";
      state.previewProjectId = project ? project.id : "";
      return null;
    }
    if (state.previewProjectId !== project.id) {
      state.previewProjectId = project.id;
      var firstImage = files.find(function (file) {
        return IMAGE_EXTENSIONS.has(file.extension);
      });
      state.previewPath = (firstImage || files[0]).path;
    }
    var current = files.find(function (file) {
      return file.path === state.previewPath;
    });
    if (!current) {
      var fallbackImage = files.find(function (file) {
        return IMAGE_EXTENSIONS.has(file.extension);
      });
      current = fallbackImage || files[0];
      state.previewPath = current.path;
    }
    return current;
  }

  function previewFile(project) {
    if (!project) return null;
    return ensurePreview(project) || primaryDisplayImage(project);
  }

  function renderHeroSideFiles(project, files, currentFile, hoverPreview) {
    els.heroThumbs.innerHTML = "";
    if (hoverPreview) {
      els.heroThumbs.hidden = true;
      return;
    }
    els.heroThumbs.hidden = false;
    if (!files.length) {
      els.heroThumbs.innerHTML = '<div class="hero-file-empty">暂无第一层文件</div>';
      return;
    }
    var gen = heroRenderGeneration;
    els.heroThumbs.hidden = false;

    var lastGroup = null;
    files.forEach(function (file) {
      if (file.folderLabel !== lastGroup) {
        lastGroup = file.folderLabel;
        var heading = document.createElement("div");
        heading.className = "hero-file-group";
        heading.textContent = lastGroup;
        els.heroThumbs.appendChild(heading);
      }

      var button = document.createElement("button");
      button.type = "button";
      button.className = "hero-file-item"
        + (currentFile && file.path === currentFile.path ? " active" : "")
        + (IMAGE_EXTENSIONS.has(file.extension) ? " is-image" : " is-file");
      button.title = file.relativePath;
      button.dataset.path = file.path;

      if (IMAGE_EXTENSIONS.has(file.extension)) {
        button.innerHTML = [
          '<span class="hero-thumb-spinner" aria-hidden="true"></span>',
          '<img class="hero-thumb-lazy" alt="' + escapeHtml(file.name) + '">',
          '<span class="hero-file-name">' + escapeHtml(file.name) + "</span>"
        ].join("");
        button.classList.add("is-loading");
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
      } else {
        button.innerHTML = [
          '<span class="hero-file-badge">' + escapeHtml((file.extension || "file").replace(".", "").toUpperCase()) + "</span>",
          '<span class="hero-file-name">' + escapeHtml(file.name) + "</span>"
        ].join("");
      }

      button.addEventListener("click", function () {
        state.previewPath = file.path;
        state.previewProjectId = project.id;
        renderHero();
      });
      els.heroThumbs.appendChild(button);
    });

    var activeItem = els.heroThumbs.querySelector(".hero-file-item.active");
    if (activeItem) activeItem.scrollIntoView({ block: "nearest" });
  }

  function stepHeroThumb(direction) {
    var project = heroProject();
    if (!project) return false;
    var files = projectLayerOneFiles(project);
    if (files.length <= 1) return false;
    var currentFile = ensurePreview(project);
    var currentIndex = 0;
    for (var i = 0; i < files.length; i += 1) {
      if (currentFile && files[i].path === currentFile.path) {
        currentIndex = i;
        break;
      }
    }
    var nextIndex = (currentIndex + direction + files.length) % files.length;
    if (nextIndex === currentIndex) return false;
    state.previewPath = files[nextIndex].path;
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
    card.classList.toggle("is-minimal", metrics.minimal);
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
      + (metrics.minimal ? " is-minimal" : metrics.narrow ? " is-narrow" : "");
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.index = String(index);
    card.style.zIndex = String(isPreview ? 200 : isActive ? 160 : index + 1);
    applyCardLayout(card, index, metrics);
    card.innerHTML = timelineCardMarkup(project, options);
    bindTimelineCardEvents(card, project, index);
    return card;
  }

  function appendTimelineAxisTick(track, x) {
    var tick = document.createElement("div");
    tick.className = "tick";
    tick.style.left = x + "px";
    track.appendChild(tick);
  }

  function renderTicks(track, metrics) {
    track.querySelectorAll(".tick").forEach(function (node) {
      node.remove();
    });
    var count = state.filtered.length;
    if (!count) return;

    for (var index = 0; index < count; index += 1) {
      var project = state.filtered[index];
      var date = projectTimelineDate(project);
      if (!Number.isFinite(date.getTime())) continue;
      appendTimelineAxisTick(track, cardCenter(index, metrics));
    }
  }

  function updateTickPositions(track, metrics) {
    renderTicks(track, metrics);
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

  function dayKeyFromDate(date) {
    var year = date.getFullYear();
    var month = String(date.getMonth() + 1).padStart(2, "0");
    var day = String(date.getDate()).padStart(2, "0");
    return year + "-" + month + "-" + day;
  }

  function dayKeyFromIso(iso) {
    var date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    return dayKeyFromDate(date);
  }

  function daysInMonth(year, monthIndex) {
    return new Date(year, monthIndex + 1, 0).getDate();
  }

  function heatmapLevel(count) {
    if (count <= 0) return 0;
    if (count === 1) return 1;
    if (count === 2) return 2;
    if (count === 3) return 3;
    return 4;
  }

  function buildHeatmapBuckets() {
    var buckets = new Map();
    state.filtered.forEach(function (project) {
      var key = dayKeyFromIso(project.lastActiveAt || project.modifiedAt || project.createdAt);
      if (!key) return;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(project);
    });
    buckets.forEach(function (projects) {
      projects.sort(function (a, b) {
        return new Date(b.lastActiveAt || b.modifiedAt || 0) - new Date(a.lastActiveAt || a.modifiedAt || 0);
      });
    });
    return buckets;
  }

  function heatmapProjectRange() {
    var times = state.filtered.map(function (project) {
      return projectTimelineDate(project).getTime();
    }).filter(function (time) {
      return Number.isFinite(time) && time > 0;
    });
    if (!times.length) return null;
    var minDate = new Date(Math.min.apply(null, times));
    var maxDate = new Date(Math.max.apply(null, times));
    return {
      minYear: minDate.getFullYear(),
      minMonth: minDate.getMonth(),
      maxYear: maxDate.getFullYear(),
      maxMonth: maxDate.getMonth()
    };
  }

  function heatmapViewIndex(year, month) {
    return year * 12 + month;
  }

  function clampHeatmapView() {
    var range = heatmapProjectRange();
    if (!range || state.heatmapViewYear === null || state.heatmapViewMonth === null) return;
    var idx = heatmapViewIndex(state.heatmapViewYear, state.heatmapViewMonth);
    var minIdx = heatmapViewIndex(range.minYear, range.minMonth);
    var maxIdx = heatmapViewIndex(range.maxYear, range.maxMonth);
    idx = Math.max(minIdx, Math.min(maxIdx, idx));
    state.heatmapViewYear = Math.floor(idx / 12);
    state.heatmapViewMonth = idx % 12;
  }

  function syncHeatmapViewToProject(project) {
    if (!project) return false;
    var date = projectTimelineDate(project);
    if (!Number.isFinite(date.getTime())) return false;
    state.heatmapViewYear = date.getFullYear();
    state.heatmapViewMonth = date.getMonth();
    clampHeatmapView();
    return true;
  }

  function syncHeatmapViewToRangeMax() {
    var range = heatmapProjectRange();
    if (!range) return false;
    state.heatmapViewYear = range.maxYear;
    state.heatmapViewMonth = range.maxMonth;
    return true;
  }

  function ensureHeatmapViewInitialized() {
    if (state.heatmapViewYear !== null && state.heatmapViewMonth !== null) {
      clampHeatmapView();
      return;
    }
    if (!syncHeatmapViewToProject(heroProject())) syncHeatmapViewToRangeMax();
  }

  function shiftHeatmapMonth(delta) {
    var range = heatmapProjectRange();
    if (!range || !delta) return false;
    ensureHeatmapViewInitialized();
    var idx = heatmapViewIndex(state.heatmapViewYear, state.heatmapViewMonth) + delta;
    var minIdx = heatmapViewIndex(range.minYear, range.minMonth);
    var maxIdx = heatmapViewIndex(range.maxYear, range.maxMonth);
    if (idx < minIdx || idx > maxIdx) return false;
    state.heatmapViewYear = Math.floor(idx / 12);
    state.heatmapViewMonth = idx % 12;
    renderHeatmap();
    return true;
  }

  function heatmapNavYears() {
    var range = heatmapProjectRange();
    if (!range) return [];
    var years = [];
    for (var year = range.minYear; year <= range.maxYear; year += 1) years.push(year);
    return years;
  }

  function heatmapNavMonths(year) {
    var range = heatmapProjectRange();
    if (!range) return [];
    var months = [];
    for (var month = 0; month < 12; month += 1) {
      var idx = heatmapViewIndex(year, month);
      var minIdx = heatmapViewIndex(range.minYear, range.minMonth);
      var maxIdx = heatmapViewIndex(range.maxYear, range.maxMonth);
      if (idx >= minIdx && idx <= maxIdx) months.push(month);
    }
    return months;
  }

  function updateHeatmapNavControls() {
    if (!els.heatmapYearSelect || !els.heatmapMonthSelect) return;
    var range = heatmapProjectRange();
    if (!range || !state.filtered.length) {
      els.heatmapYearSelect.disabled = true;
      els.heatmapMonthSelect.disabled = true;
      if (els.heatmapPrevMonth) els.heatmapPrevMonth.disabled = true;
      if (els.heatmapNextMonth) els.heatmapNextMonth.disabled = true;
      els.heatmapYearSelect.innerHTML = "";
      els.heatmapMonthSelect.innerHTML = "";
      return;
    }

    ensureHeatmapViewInitialized();
    els.heatmapYearSelect.disabled = false;
    els.heatmapMonthSelect.disabled = false;

    state.heatmapNavSyncLock = true;
    if (els.heatmapYearSelect) {
      els.heatmapYearSelect.innerHTML = heatmapNavYears().map(function (y) {
        return '<option value="' + y + '">' + y + "年</option>";
      }).join("");
      els.heatmapYearSelect.value = String(state.heatmapViewYear);
    }
    var months = heatmapNavMonths(state.heatmapViewYear);
    if (els.heatmapMonthSelect) {
      els.heatmapMonthSelect.innerHTML = months.map(function (m) {
        return '<option value="' + m + '">' + (m + 1) + "月</option>";
      }).join("");
      if (months.indexOf(state.heatmapViewMonth) >= 0) {
        els.heatmapMonthSelect.value = String(state.heatmapViewMonth);
      } else if (months.length) {
        state.heatmapViewMonth = months[0];
        els.heatmapMonthSelect.value = String(months[0]);
      }
    }
    state.heatmapNavSyncLock = false;

    var idx = heatmapViewIndex(state.heatmapViewYear, state.heatmapViewMonth);
    var minIdx = heatmapViewIndex(range.minYear, range.minMonth);
    var maxIdx = heatmapViewIndex(range.maxYear, range.maxMonth);
    if (els.heatmapPrevMonth) els.heatmapPrevMonth.disabled = idx <= minIdx;
    if (els.heatmapNextMonth) els.heatmapNextMonth.disabled = idx >= maxIdx;
  }

  function onHeatmapYearChange() {
    if (state.heatmapNavSyncLock || !els.heatmapYearSelect) return;
    var year = parseInt(els.heatmapYearSelect.value, 10);
    if (!Number.isFinite(year)) return;
    var months = heatmapNavMonths(year);
    if (!months.length) return;
    state.heatmapViewYear = year;
    state.heatmapViewMonth = months.indexOf(state.heatmapViewMonth) >= 0 ? state.heatmapViewMonth : months[0];
    renderHeatmap();
  }

  function onHeatmapMonthChange() {
    if (state.heatmapNavSyncLock || !els.heatmapMonthSelect) return;
    var year = parseInt(els.heatmapYearSelect.value, 10);
    var month = parseInt(els.heatmapMonthSelect.value, 10);
    if (!Number.isFinite(year) || !Number.isFinite(month)) return;
    state.heatmapViewYear = year;
    state.heatmapViewMonth = month;
    renderHeatmap();
  }

  function buildHeatmapMonthGrid(year, monthIndex, buckets) {
    var totalDays = daysInMonth(year, monthIndex);
    var leading = new Date(year, monthIndex, 1).getDay();
    var cells = [];
    var pad;

    for (pad = 0; pad < leading; pad += 1) cells.push(null);
    for (var day = 1; day <= totalDays; day += 1) {
      var date = new Date(year, monthIndex, day);
      var key = dayKeyFromDate(date);
      cells.push({
        date: date,
        key: key,
        day: day,
        projects: buckets.get(key) || []
      });
    }
    while (cells.length % 7 !== 0) cells.push(null);

    return {
      year: year,
      month: monthIndex + 1,
      label: (monthIndex + 1) + "月",
      cells: cells
    };
  }

  function formatHeatmapDayLabel(date) {
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short"
    }).format(date);
  }

  function hideHeatmapTooltip() {
    state.heatmapHoverDay = "";
    if (!els.heatmapTooltip) return;
    els.heatmapTooltip.hidden = true;
    els.heatmapTooltip.innerHTML = "";
    if (els.heatmap) {
      els.heatmap.querySelectorAll(".heatmap-cell.is-hover").forEach(function (cell) {
        cell.classList.remove("is-hover");
      });
    }
  }

  function positionHeatmapTooltip(cell) {
    if (!els.heatmapTooltip || els.heatmapTooltip.hidden) return;
    var rect = cell.getBoundingClientRect();
    var tooltipRect = els.heatmapTooltip.getBoundingClientRect();
    var left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    var top = rect.top - tooltipRect.height - 10;
    if (top < 8) top = rect.bottom + 10;
    left = Math.max(8, Math.min(window.innerWidth - tooltipRect.width - 8, left));
    top = Math.max(8, Math.min(window.innerHeight - tooltipRect.height - 8, top));
    els.heatmapTooltip.style.left = left + "px";
    els.heatmapTooltip.style.top = top + "px";
  }

  function showHeatmapTooltip(cell, cellData) {
    if (!els.heatmapTooltip || !cellData) return;
    var projects = cellData.projects || [];
    state.heatmapHoverDay = cellData.key;
    if (els.heatmap) {
      els.heatmap.querySelectorAll(".heatmap-cell.is-hover").forEach(function (item) {
        item.classList.remove("is-hover");
      });
      cell.classList.add("is-hover");
    }

    var html = [
      '<div class="heatmap-tooltip-date">' + formatHeatmapDayLabel(cellData.date) + "</div>",
      '<div class="heatmap-tooltip-count">' + (projects.length ? projects.length + " 个项目" : "当天无项目") + "</div>"
    ];
    if (projects.length) {
      html.push('<ul class="heatmap-tooltip-list">');
      projects.slice(0, HEATMAP_TOOLTIP_LIMIT).forEach(function (project) {
        html.push("<li>" + escapeHtml(project.displayName || project.name) + "</li>");
      });
      html.push("</ul>");
      if (projects.length > HEATMAP_TOOLTIP_LIMIT) {
        html.push('<div class="heatmap-tooltip-more">还有 ' + (projects.length - HEATMAP_TOOLTIP_LIMIT) + " 个项目</div>");
      }
    }
    els.heatmapTooltip.innerHTML = html.join("");
    els.heatmapTooltip.hidden = false;
    requestAnimationFrame(function () {
      positionHeatmapTooltip(cell);
    });
  }

  function bindHeatmapCellEvents(cell, cellData) {
    cell.addEventListener("mouseenter", function () {
      showHeatmapTooltip(cell, cellData);
    });
    cell.addEventListener("mouseleave", function () {
      hideHeatmapTooltip();
    });
    cell.addEventListener("focus", function () {
      showHeatmapTooltip(cell, cellData);
    });
    cell.addEventListener("blur", function () {
      hideHeatmapTooltip();
    });
    cell.addEventListener("click", function () {
      if (!cellData.projects.length) return;
      var targetId = cellData.projects[0].id;
      var index = state.filtered.findIndex(function (project) {
        return project.id === targetId;
      });
      if (index >= 0) selectIndex(index, { center: true });
    });
  }

  function createHeatmapCell(cellData) {
    if (!cellData) {
      var spacer = document.createElement("span");
      spacer.className = "heatmap-cell-spacer";
      spacer.setAttribute("aria-hidden", "true");
      return spacer;
    }

    var count = cellData.projects.length;
    var button = document.createElement("button");
    button.type = "button";
    button.className = "heatmap-cell level-" + heatmapLevel(count);
    if (!count) button.classList.add("is-muted");
    if (cellData.key === dayKeyFromDate(new Date())) button.classList.add("is-today");
    button.dataset.day = cellData.key;
    button.textContent = String(cellData.day);
    button.setAttribute(
      "aria-label",
      formatHeatmapDayLabel(cellData.date) + (count ? "，" + count + " 个项目" : "，无项目")
    );
    bindHeatmapCellEvents(button, cellData);
    return button;
  }

  function renderHeatmap(options) {
    options = options || {};
    if (!els.heatmap || !els.heatmapPanel) return;
    hideHeatmapTooltip();
    els.heatmap.innerHTML = "";
    els.heatmapPanel.classList.toggle("is-collapsed", state.heatmapCollapsed);
    if (els.heatmapToggle) {
      els.heatmapToggle.setAttribute("aria-expanded", state.heatmapCollapsed ? "false" : "true");
      els.heatmapToggle.setAttribute("aria-label", state.heatmapCollapsed ? "展开热力图" : "折叠热力图");
    }

    if (state.heatmapCollapsed || !state.filtered.length) {
      if (!state.heatmapCollapsed && !state.filtered.length) {
        els.heatmap.innerHTML = '<div class="heatmap-empty">无数据</div>';
      }
      updateHeatmapNavControls();
      return;
    }

    if (options.syncToSelection) {
      syncHeatmapViewToProject(heroProject());
    } else {
      ensureHeatmapViewInitialized();
    }
    clampHeatmapView();
    updateHeatmapNavControls();

    var buckets = buildHeatmapBuckets();
    var monthBlock = buildHeatmapMonthGrid(state.heatmapViewYear, state.heatmapViewMonth, buckets);
    var weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

    var root = document.createElement("div");
    root.className = "heatmap-calendar heatmap-calendar-single";

    var monthSection = document.createElement("section");
    monthSection.className = "heatmap-month";

    var weekdays = document.createElement("div");
    weekdays.className = "heatmap-month-weekdays";
    weekdayLabels.forEach(function (label) {
      var item = document.createElement("span");
      item.textContent = label;
      weekdays.appendChild(item);
    });
    monthSection.appendChild(weekdays);

    var grid = document.createElement("div");
    grid.className = "heatmap-month-grid";
    monthBlock.cells.forEach(function (cellData) {
      grid.appendChild(createHeatmapCell(cellData));
    });
    monthSection.appendChild(grid);
    root.appendChild(monthSection);
    els.heatmap.appendChild(root);
  }

  function toggleHeatmapPanel() {
    state.heatmapCollapsed = !state.heatmapCollapsed;
    localStorage.setItem("designtrace:heatmapCollapsed", state.heatmapCollapsed ? "1" : "0");
    renderHeatmap();
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
    if (!state.filtered.length) {
      var emptyMessage = state.projects.length
        ? "当前筛选条件下没有作品。"
        : "选择文件夹后，项目会按时间排列在这里。";
      els.timeline.innerHTML = '<div class="empty-state">' + emptyMessage + "</div>";
      return;
    }

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
      return projectTimelineDate(project).getTime();
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
    var step = metrics.step;
    var actualCardWidth = Math.min(TIMELINE.cardWidth, step);
    actualCardWidth = Math.max(TIMELINE.minStep, actualCardWidth);
    var minimal = actualCardWidth <= TIMELINE.minimalWidth;
    var narrow = !minimal && step < TIMELINE.cardWidth;
    var thumbHeight;
    if (minimal) {
      thumbHeight = Math.max(TIMELINE.minThumbHeightMinimal, actualCardWidth);
    } else if (narrow) {
      thumbHeight = Math.max(TIMELINE.minThumbHeight, Math.round(88 * actualCardWidth / TIMELINE.cardWidth));
    } else {
      thumbHeight = 88;
    }
    var metaHeight = minimal ? 0 : (narrow ? Math.max(24, Math.round(TIMELINE.metaHeight * actualCardWidth / TIMELINE.cardWidth)) : TIMELINE.metaHeight);
    return {
      actualCardWidth: actualCardWidth,
      thumbHeight: thumbHeight,
      cardHeight: thumbHeight + metaHeight,
      narrow: narrow,
      minimal: minimal
    };
  }

  function timelineLayout() {
    var count = state.filtered.length;
    var fullStep = TIMELINE.cardWidth + TIMELINE.cardGap;
    var idealWidth = TIMELINE.padding * 2 + TIMELINE.cardWidth + Math.max(0, count - 1) * fullStep;
    var viewport = els.timeline.clientWidth || 1000;
    var scaledIdeal = idealWidth * state.timelineScale;
    var minTrackWidth = TIMELINE.padding * 2 + TIMELINE.minStep + Math.max(0, count - 1) * TIMELINE.minStep;
    var trackWidth = Math.max(scaledIdeal, minTrackWidth);
    if (count <= 1) trackWidth = Math.max(trackWidth, viewport);
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
    var images = timelineDisplayImages(project);
    var lazyPending = images.length && options.lazyThumb;
    var folderMode = canRevealProjectFolder(project) ? "open" : "copy";
    var folderLabel = folderMode === "open" ? "打开文件夹" : "复制文件夹路径";
    return [
      '<div class="thumb' + (lazyPending ? " is-loading" : "") + '">',
      lazyPending ? '<span class="thumb-spinner" aria-hidden="true"></span>' : "",
      timelineThumbContent(project, options),
      '<button type="button" class="timeline-folder-action" data-mode="' + folderMode + '" aria-label="' + folderLabel + '" title="' + folderLabel + '">',
      folderActionIcon(folderMode),
      "</button>",
      "</div>",
      '<div class="thumb-meta">',
      '<div class="thumb-title">' + escapeHtml(project.name) + "</div>",
      "</div>"
    ].join("");
  }

  function hydrateTimelineCardThumb(card, project) {
    var lazyImages = card.querySelectorAll("img.timeline-thumb-lazy");
    if (!lazyImages.length) return;
    var previews = timelineDisplayImages(project);
    if (!previews.length) return;
    var thumb = card.querySelector(".thumb");
    var pending = 0;
    var settle = function () {
      pending -= 1;
      if (pending <= 0 && thumb) thumb.classList.remove("is-loading");
    };
    lazyImages.forEach(function (img, index) {
      if (img.getAttribute("src")) return;
      var preview = previews[index];
      if (!preview) return;
      pending += 1;
      thumbUrl(preview.file, preview.path).then(function (url) {
        if (!img.isConnected) {
          settle();
          return;
        }
        img.addEventListener("load", function () {
          img.classList.remove("timeline-thumb-lazy");
          settle();
        }, { once: true });
        img.addEventListener("error", settle, { once: true });
        img.src = url;
      }).catch(settle);
    });
    if (pending === 0 && thumb) thumb.classList.remove("is-loading");
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
    syncTimelinePeriodFiltersFromViewport();
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

    if (els.heatmapToggle) {
      els.heatmapToggle.addEventListener("click", toggleHeatmapPanel);
    }
    if (els.heatmapYearSelect) els.heatmapYearSelect.addEventListener("change", onHeatmapYearChange);
    if (els.heatmapMonthSelect) els.heatmapMonthSelect.addEventListener("change", onHeatmapMonthChange);
    if (els.heatmapPrevMonth) {
      els.heatmapPrevMonth.addEventListener("click", function () {
        shiftHeatmapMonth(-1);
      });
    }
    if (els.heatmapNextMonth) {
      els.heatmapNextMonth.addEventListener("click", function () {
        shiftHeatmapMonth(1);
      });
    }
    var heatmapBody = els.heatmapPanel && els.heatmapPanel.querySelector(".heatmap-panel-body");
    if (heatmapBody) {
      heatmapBody.addEventListener("wheel", function (event) {
        if (state.heatmapCollapsed || !state.filtered.length || heatmapWheelLock) return;
        event.preventDefault();
        event.stopPropagation();
        heatmapWheelLock = true;
        var direction = event.deltaY > 0 || event.deltaX > 0 ? 1 : -1;
        if (!shiftHeatmapMonth(direction)) heatmapWheelLock = false;
        else {
          setTimeout(function () {
            heatmapWheelLock = false;
          }, HEATMAP_WHEEL_COOLDOWN);
        }
      }, { passive: false });
    }
    window.addEventListener("scroll", hideHeatmapTooltip, true);

    if (els.timelineYearSelect) els.timelineYearSelect.addEventListener("change", onTimelineYearChange);
    if (els.timelineMonthSelect) els.timelineMonthSelect.addEventListener("change", onTimelineMonthChange);

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
      hideHeatmapTooltip();
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
  state.heatmapCollapsed = localStorage.getItem("designtrace:heatmapCollapsed") === "1";
  updateFolderTooltip();
  updateExtensionFilterOptions();
  bindEvents();
  render();
  restorePreviousDirectory();
})();



