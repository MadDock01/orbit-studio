// Tiny helper: opens the v2 theme preview in the default browser.
const { exec } = require("child_process");
const path = "d:/app/Compx adobe after effect/Extension/Compx Engine/CompX-Orbit-Studio/design/preview-v2.html";
exec('cmd /c start "" "' + path + '"', (err) => {
  if (err) console.error("open failed:", err.message);
  else console.log("preview opened:", path);
});