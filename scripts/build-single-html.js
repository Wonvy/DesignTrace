"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "DesignTrace.html");

const htmlPath = path.join(PUBLIC_DIR, "index.html");
const cssPath = path.join(PUBLIC_DIR, "styles.css");
const jsPath = path.join(PUBLIC_DIR, "app.js");

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function escapeScript(content) {
  return content.replace(/<\/script/gi, "<\\/script");
}

function escapeStyle(content) {
  return content.replace(/<\/style/gi, "<\\/style");
}

function buildSingleHtml() {
  const pkg = JSON.parse(read(path.join(ROOT, "package.json")));
  const version = pkg.version || "0.0.0";
  const html = read(htmlPath);
  const css = read(cssPath);
  const js = read(jsPath);

  let output = html
    .replace(
      /<span class="brand-version">[^<]*<\/span>/,
      '<span class="brand-version">v' + version + "</span>"
    )
    .replace(
      /<link rel="stylesheet" href="\.\/styles\.css"\s*\/?>/,
      "<style>\n" + escapeStyle(css) + "\n</style>"
    )
    .replace(
      /<script src="\.\/app\.js"><\/script>/,
      "<script>\n" + escapeScript(js) + "\n</script>"
    );

  const banner = [
    "<!--",
    "  DesignTrace single-file build",
    "  Generated: " + new Date().toISOString(),
    "  Usage: open via http://localhost (File System Access API requires secure context)",
    "-->",
    ""
  ].join("\n");

  output = output.replace("<html lang=\"zh-CN\">", "<html lang=\"zh-CN\">\n" + banner);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, output, "utf8");

  const sizeKb = (Buffer.byteLength(output, "utf8") / 1024).toFixed(1);
  console.log("Wrote " + OUT_FILE + " (" + sizeKb + " KB)");
}

buildSingleHtml();
