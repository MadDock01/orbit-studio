// Headless Chrome screenshot helper.
// Usage: node shot.js <url> <out.png> <width> <height> [scale]
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const url = process.argv[2];
const out = process.argv[3];
const w = process.argv[4] || "380";
const h = process.argv[5] || "660";
const scale = process.argv[6] || "2";

const userData = path.join(__dirname, ".shot-profile");
const args = [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--hide-scrollbars",
  "--disable-extensions",
  "--mute-audio",
  "--force-device-scale-factor=" + scale,
  "--screenshot=" + out,
  "--window-size=" + w + "," + h,
  "--virtual-time-budget=2500",
  url,
];
// reuse a fixed user-data-dir for speed
args.unshift('--user-data-dir=' + userData);

const r = spawnSync(chrome, args, { encoding: "utf8", timeout: 60000 });
const log = "URL: " + url + "\nOUT: " + out + "\nEXIT: " + r.status + "\n" + (r.stdout || "") + "\n" + (r.stderr || "");
fs.writeFileSync(out + ".log.txt", log);
console.log("done " + out + (fs.existsSync(out) ? " (" + fs.statSync(out).size + " bytes)" : " MISSING") + " exit=" + r.status);