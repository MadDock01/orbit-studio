// Open the overview sheet in the default image viewer.
const { exec } = require("child_process");
const p = "d:/app/Compx adobe after effect/Extension/Compx Engine/CompX-Orbit-Studio/design/overview.png";
exec('cmd /c start "" "' + p + '"', (err) => {
  if (err) console.error("open failed:", err.message);
  else console.log("opened:", p);
});