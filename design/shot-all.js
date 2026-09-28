// Renders all showcase variants to PNG via headless Chrome.
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const base = "file:///d:/app/Compx%20adobe%20after%20effect/Extension/Compx%20Engine/CompX-Orbit-Studio/design/showcase.html";
const outDir = __dirname;
const results = [];

const variants = [
  { name: "nebula", url: base + "?v=nebula", file: "showcase-nebula.png" },
  { name: "ember", url: base + "?v=ember", file: "showcase-ember.png" },
  { name: "ocean", url: base + "?v=ocean", file: "showcase-ocean.png" },
  { name: "rose", url: base + "?v=rose", file: "showcase-rose.png" },
];

for (const v of variants) {
  const out = path.join(outDir, v.file);
  const profile = path.join(outDir, ".shot-" + v.name);
  const args = [
    "--user-data-dir=" + profile,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--hide-scrollbars",
    "--disable-extensions",
    "--mute-audio",
    "--force-device-scale-factor=2",
    "--screenshot=" + out,
    "--window-size=360,660",
    "--virtual-time-budget=2500",
    v.url,
  ];
  const r = spawnSync(chrome, args, { encoding: "utf8", timeout: 60000 });
  const ok = fs.existsSync(out);
  results.push({ name: v.name, ok: ok, size: ok ? fs.statSync(out).size : 0, exit: r.status, err: (r.stderr || "").slice(0, 300) });
}

fs.writeFileSync(path.join(outDir, "shots.json"), JSON.stringify(results, null, 2));