"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_NAME = "DesignTrace.html";
const OUT_FILE = path.join(OUT_DIR, OUT_NAME);
const INDEX_HTML = path.join(PUBLIC_DIR, "index.html");

const EXTERNAL_SCRIPT_RE = /<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi;
const EXTERNAL_STYLESHEET_RE = /<link\b[^>]*\brel=["']stylesheet["'][^>]*\/?>/gi;

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeScript(content) {
  return content.replace(/<\/script/gi, "<\\/script");
}

function escapeStyle(content) {
  return content.replace(/<\/style/gi, "<\\/style");
}

function resolvePublicAsset(href) {
  var normalized = href.replace(/^\.\//, "");
  var absolute = path.resolve(PUBLIC_DIR, normalized);
  if (!absolute.startsWith(PUBLIC_DIR + path.sep) && absolute !== PUBLIC_DIR) {
    throw new Error("Asset path escapes public directory: " + href);
  }
  if (!fs.existsSync(absolute)) {
    throw new Error("Missing asset referenced by index.html: " + href);
  }
  return absolute;
}

function inlineStylesheetTag(tag) {
  var hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
  if (!hrefMatch) {
    throw new Error("Stylesheet link without href: " + tag);
  }
  var css = read(resolvePublicAsset(hrefMatch[1]));
  return "<style>\n" + escapeStyle(css) + "\n</style>";
}

function inlineScriptTag(_tag, src) {
  var js = read(resolvePublicAsset(src));
  return "<script>\n" + escapeScript(js) + "\n</script>";
}

function injectVersion(html) {
  var pkg = JSON.parse(read(path.join(ROOT, "package.json")));
  var version = pkg.version || "0.0.0";
  return html.replace(
    /<span class="brand-version">[^<]*<\/span>/,
    '<span class="brand-version">v' + version + "</span>"
  );
}

function validateStandalone(html) {
  if (/<script\b[^>]*\bsrc=/i.test(html)) {
    throw new Error("Standalone validation failed: external <script src=...> remains in output.");
  }
  if (/<link\b[^>]*\brel=["']stylesheet["']/i.test(html)) {
    throw new Error("Standalone validation failed: external <link rel=\"stylesheet\"> remains in output.");
  }
}

function buildStandaloneHtml() {
  var html = read(INDEX_HTML);
  html = injectVersion(html);

  html = html.replace(EXTERNAL_STYLESHEET_RE, function (tag) {
    return inlineStylesheetTag(tag);
  });

  html = html.replace(EXTERNAL_SCRIPT_RE, function (tag, src) {
    return inlineScriptTag(tag, src);
  });

  validateStandalone(html);

  var banner = [
    "<!--",
    "  DesignTrace standalone build",
    "  Generated: " + new Date().toISOString(),
    "  Requires https:// (File System Access API)",
    "-->",
    ""
  ].join("\n");

  html = html.replace("<html lang=\"zh-CN\">", "<html lang=\"zh-CN\">\n" + banner);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, html, "utf8");

  var sizeKb = (Buffer.byteLength(html, "utf8") / 1024).toFixed(1);
  console.log("Wrote " + OUT_FILE + " (" + sizeKb + " KB)");
  console.log("Standalone validation passed.");
  return OUT_FILE;
}

if (require.main === module) {
  buildStandaloneHtml();
}

module.exports = { buildStandaloneHtml, OUT_NAME, OUT_FILE };
