// Diagnostics: locate a headless-capable browser + playwright/puppeteer.
const fs = require("fs");
const path = require("path");
const out = { env: {}, resolvable: {}, browsers: {} };

out.env.COMPX_PLAYWRIGHT = process.env.COMPX_PLAYWRIGHT || "";
out.env.COMPX_CHROME = process.env.COMPX_CHROME || "";

for (const mod of ["playwright", "playwright-core", "puppeteer", "puppeteer-core"]) {
  try { out.resolvable[mod] = require.resolve(mod); }
  catch (e) { out.resolvable[mod] = null; }
}

const candidates = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
  process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
];
for (const c of candidates) out.browsers[c] = c ? fs.existsSync(c) : false;

// Global npm modules
try {
  const g = require("child_process").execSync("npm root -g", { encoding: "utf8" }).trim();
  out.globalRoot = g;
  fs.readdirSync(g).forEach((m) => {
    if (/playwright|puppeteer/i.test(m)) out.resolvable["global:" + m] = path.join(g, m);
  });
} catch (e) { out.globalRoot = null; }

fs.writeFileSync(path.join(__dirname, "diag.json"), JSON.stringify(out, null, 2));