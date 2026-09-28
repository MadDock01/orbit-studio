# CompX Orbit Studio v2.3.1

> **Current build scope:** this package registers and supports After Effects
> 2022+ only (`AEFT` 22+). Older release notes below mention experiments from
> a former Premiere/AE codebase; they are historical and do not describe the
> host registration or support contract of this build.

- Isolated Graph Curve from Flex's `$._flex` host namespace.
- Renamed Pasta and alignment host globals to CompX-owned names.
- Removed accidental dependency on another extension's lock/license state.
- Main tab and Library shelf selections are now remembered.
- Optional feature initialization is isolated so one failure cannot blank every tab.
- File-based features degrade gracefully when CEP Node is unavailable.
- **Moodboard Workspace** keeps separate project boards in Documents/CompX,
  imports image, GIF, video, font, link, and note references, and analyzes visual
  palette/contrast/temperature/saturation/grain locally. Its Style Kit action
  creates editable typography, palette, motion controls, lower-third, caption,
  and transition comps; Apply Style and Match Look turn the analysis into
  selected-layer styling or a reversible AE adjustment layer.
- **RAMPAGE — Real Estate Motion Toolkit** adds a draggable Speed Ramp Designer,
  playhead and composition-beat ramps, Pixel Motion/shutter controls, safe
  property camera moves, editable room labels/callouts, and property-grade
  adjustment layers. Existing user Time Remap, keyframes, and expressions are
  detected and preserved instead of being overwritten.
- **Toolkit → Create & Quick Tools → Layer Factory** creates 1–100 Null,
  Adjustment, Solid, Camera, Light, Shape, Empty Shape, Text, or Empty Text
  layers with token-based naming, selected-layer timing, label, 3D, lock,
  shy, and explicit parenting modes. Existing source parents are preserved by
  default when building a controller chain.

# CompX Asset Library (SFX + MOGRT)

## What's new in v1.5 — Premium, responsive UI pass

Step 1 of the Phase‑2 rebuild: a real visual/responsive pass across the
whole panel, not just the newer Studio components.

- **Tiered responsive layout.** CEP panels get docked at very different
  widths in practice (a floating panel vs. a narrow docked sidebar), so the
  old single 480px breakpoint was replaced with a proper 3-tier system
  (760px / 620px / 420px): multi-column tool grids step down to 2 then 1
  column, tab/button font sizes and padding shrink gracefully, and the
  library card-size slider hides itself once there's no room for it rather
  than overlapping other controls.
- **Studio components brought up to the same visual language** as the
  original Tools tab (glass-panel gradients, glow shadows, hover-lift) —
  the Studio list rows, badges, step chips, and textarea were plainer than
  the rest of the panel before this pass.
- **Global custom scrollbars** on every scrollable area (Tools, Tracker,
  Studio lists), not just the sound library grid.
- **Small signature touches**: a glowing accent bar on every section
  title, and a subtle animated sweep under the active top-level tab.

## What's new in v1.4 — Panel cleanup + real bug fixes

**Restructuring**
- Removed the Command Center (Ctrl/Cmd+K search) and the Workflow Recorder
  entirely, per feedback that they weren't needed.
- Studio tab is now just **Captions / Bridge / Assets**.
- **FFX Presets** moved out of Studio into the **Library** tab as a third
  shelf next to SFX/MOGRT (🔊 SFX · 🎨 MOGRT · 🎬 FFX Presets).

**Bug fixes** (things that were reported as silently not working):
- **Toast messages were lying.** `runTool()` always showed the generic
  static label passed in from the button instead of the host script's
  actual result message — so "Bounce added" or "Effects removed" would
  show even when nothing happened. Fixed to show the real outcome.
- **Bounce / Glow (and every effect-apply button)** looped over selected
  layers wrapped in a silent `try/catch` and then unconditionally reported
  success — so a Bounce with no keyframed Position/Scale, or a Glow that
  couldn't attach, still said "Done." Now counts real successes and gives
  an accurate error when nothing was applied.
- **FX Lock** used to search each effect for a "point" property and
  expression-lock it to layer position — which does nothing on effects
  with no such property (Glow, Blur, Curves, most of them). After Effects
  has no per-effect lock API, so this now does the reliable native
  equivalent: toggles `layer.locked`, which protects the whole layer
  (effects included) from edits until unlocked.
- **Unprecomp** had a real stacking-order bug (sublayers came back in
  reverse order) and didn't preserve the precomp layer's own Position/
  Scale/Rotation/Opacity at all. Fixed the copy order and now carries the
  transform over (including keyframes) via a parent null.
- **True Dup** was just calling AE's normal duplicate — a "true duplicate"
  of a precomp layer still shared the same source comp as the original.
  Now also duplicates the source comp and re-points the copy at it, so
  editing one doesn't touch the other.
- **Copy/Paste** silently required selecting a property *row* in the
  Timeline panel first, which isn't obvious and looked broken with just a
  layer selected. Now falls back to copying the whole Transform group
  (Position/Scale/Rotation/Opacity/Anchor Point) automatically, and
  supports copying/pasting several properties at once.

**Small additions**
- **Tracker → History**: past days are now archived (not just today) —
  a rolling 7-day total and a per-day list, so you can see how much time
  you spent last week, not just right now.
- **Library card size slider**: drag to resize the SFX/MOGRT grid cards
  bigger or smaller; the size is remembered.

## What's new in v1.3 — ⚡ Studio tab

A new top-level **⚡ STUDIO** tab (next to Tools/Tracker/Library) holds five
bigger, host-API-heavy tools that were previously just roadmap notes:

- **🎬 FFX Preset Library** (After Effects only) — add individual `.ffx`
  animation preset files or import a whole folder (grouped by parent folder
  name as a category), search them, and **Apply to Selected Layers** with
  one click via the documented `Layer.applyPreset()` call. Presets are
  referenced by path, same philosophy as the SFX/MOGRT library — nothing is
  copied. Saving new presets is still done the normal AE way (Effects &
  Presets panel → Export Animation Preset); this tab organizes and applies
  them, it doesn't replace that export step.
- **⏺ Workflow Recorder** — press **Start Recording**, then click any
  sequence of buttons in the **Tools** tab (align, precompose, rename,
  resize comp, whatever) — each click is captured as a named step without
  interrupting the action itself. **Save** it under a name, and **▶ Play**
  replays the same clicks in order with a configurable delay between steps.
  Saved workflows live in local storage and survive a panel restart. Steps
  are matched back to their button by id (or by `data-tool`/`data-arg` for
  the icon-grid tools) each time you play, so a workflow always uses
  whatever's currently in any linked input fields (e.g. a rename base name)
  rather than a frozen value from when it was recorded.
- **💬 Word-by-Word Captions** (After Effects only) — paste in caption text
  (or import an `.srt`, which is re-split word-by-word using each cue's own
  timing) and create one text layer per word, all anchored to the same
  on-screen spot, each trimmed to its own in/out window so only one word
  shows at a time — with a quick pop/fade in and a soft fade-out so cuts
  don't feel like hard pops. Choose position (top/center/bottom), font
  size, color, and a Pop/Fade/Plain animation style. Without an `.srt`,
  timing is even, driven by a start time + words-per-second.
- **🔗 Premiere ↔ After Effects Bridge** — since a CEP panel only ever runs
  inside one host app at a time, PPro and AE can't talk to each other in
  memory; this writes a small shared JSON file to disk instead
  (`~/.compx-command-center-bridge.json`). **Send Selection to Bridge**
  gathers the current selection's underlying source file paths (selected
  layers/footage in AE, or `Sequence.getSelection()` on the Premiere
  Timeline) and appends them to that file; the **Bridge Inbox** — visible
  from either app's panel — lists everything sent from both sides, flags
  entries whose file no longer exists on disk, and lets you **Import**
  a given entry straight into the current project or remove it. Best-effort
  by nature (Premiere's selection scripting API is younger than AE's), with
  a clear message rather than a silent no-op when there's nothing to read.
- **🔍 Project Asset Manager / Search** — recursively lists every item in
  the *host's own* project panel (AE's folder tree of comps/footage, or
  Premiere's bin tree of clips/sequences) — separate from this panel's own
  SFX/MOGRT library — searchable by name or folder path, filterable by
  type, with a **MISSING** badge for anything whose file no longer exists
  on disk (checked live with Node's `fs`, not cached). Each row with a file
  path can be revealed in Finder/Explorer or have its path copied.

## What's new in v1.2 — Command Center + Timeline/Layer tools

- **🔍 Command Center** — press **Ctrl/Cmd+Space** or **Ctrl/Cmd+K**, or tap
  the **⌘K** button in the top-right of the tab row, to open a global fuzzy
  search over every tool button in the panel (Align, Precomp, Stagger,
  Rename, Library actions, tab switches, etc). Type a few letters
  ("precomp", "align bottom", "stagger"), arrow up/down, Enter to run,
  Esc to close. The list is rebuilt from the live DOM each time it opens,
  so it always matches what's actually on screen — nothing to keep in sync
  by hand.
- **⏱ Timeline section** (Tools tab): **Stagger** (offset each selected
  layer from the one above by N frames — for cascade/staggered reveals,
  distinct from the existing Sequence Layers which butts clips end-to-end),
  **Split at Playhead** (cuts each selected layer at the current time),
  **Ripple Delete** (removes the selection and closes the gap left behind),
  and **Align In/Out** (snap in/out points to the playhead, or match all
  selected layers to the earliest/latest edge).
- **🏷 Layer Management section** (Tools tab): **Solo** / **Shy** toggles,
  and four rename tools — **Sequential** (`Base_01`, `Base_02`, ...),
  **Add Prefix**, **Add Suffix**, and **Find & Replace** within layer names.
- These are After Effects-only (same as the rest of the Tools tab) — they
  need `getSelectedLayers`/comp APIs that Premiere's project model doesn't
  expose the same way.

An After Effects CEP panel for animation tools plus a local sound-effect and
Motion Graphics Template (`.mogrt`) library.

## What's new in v1.1 — MOGRT support

- **🔊 SFX / 🎨 MOGRT shelf switcher** at the top of the panel — same
  Import → Library → Search → Preview → Drag & Drop workflow as SFX, applied
  to `.mogrt` Motion Graphics Templates. All / Recent / Favorites /
  Collections tabs, search, tags, categories, color labels, batch mode, and
  drag-to-timeline work the same way on both shelves; each shelf's items,
  collections, and search are kept separate from the other.
- **Add MOGRTs / Import Folder** (same buttons as SFX, relabeled per shelf)
  add local `.mogrt` files by reference, same as sound files.
- **Best-effort thumbnail preview** — a `.mogrt` is a plain zip archive.
  There's no officially documented "the preview lives at this exact path"
  guarantee across every template, so the panel reads the zip's own file
  listing (a small hand-rolled parser — no npm dependency, since CEP panels
  can't easily vendor native zip libraries) and shows the most
  poster/thumbnail/preview-like image it can find inside. If nothing
  image-like turns up, you'll see a plain 🎨 placeholder instead — the
  template still imports and inserts normally either way.
- **Insert to Timeline for MOGRT** — inserts on a **video** track (rather
  than audio), using the same "find a free track at the playhead, else try
  to add one" logic as the SFX insert. In Premiere, `.mogrt` files import
  into the project bin the same way any other asset does. In After Effects,
  MOGRT insert isn't supported (there's no equivalent "drop a packaged
  .mogrt onto a comp" action) — the panel tells you this plainly rather than
  guessing at an unsupported API; open the template's source `.aep` in AE
  directly instead.
- Click a MOGRT row (or drag it) to select/preview it — MOGRTs don't play
  back as audio, so pitch and the waveform view are hidden on that shelf and
  replaced with the static thumbnail preview.

## What's included (v1 — SFX)

- Add individual files (`.mp3 .wav .aiff .m4a .ogg`) or import a whole folder
  (scanned recursively) — files are referenced by path, never copied.
- Auto-grouping into categories (Impacts, Whoosh, Horror, Explosions, UI,
  Ambience, Uncategorized) guessed from the filename, plus auto-tagging.
- Search across name / tag / category.
- Click to play, double-click to preview, Space/Enter/↑/↓ shortcuts.
- Waveform preview, per-sound favorite, rename, delete.
- Volume, pitch (±12 semitones) and speed (0.5x–2x) controls, live while playing.
- **Insert to Timeline** button: imports the file into the After Effects
  project and, when a composition is active, places it at the playhead.
- Library metadata is stored in the panel's local storage (no external DB).

## Install (development / unsigned)

1. Enable debug mode so CEP will load an unsigned extension:
   - **macOS**: `defaults write com.adobe.CSXS.9 PlayerDebugMode 1` (also try
     `.10`/`.11` to match your app version)
   - **Windows**: add a `PlayerDebugMode` string value = `1` under
     `HKEY_CURRENT_USER\Software\Adobe\CSXS.9` (and `.10`/`.11`)
2. Copy this whole `CompX-Orbit-Studio` folder into your CEP extensions
   folder:
   - **macOS**: `~/Library/Application Support/Adobe/CEP/extensions/`
   - **Windows**: `%APPDATA%\Adobe\CEP\extensions\`
3. Restart After Effects.
4. Open it from **Window → Extensions → CompX Orbit Studio**.

## Host compatibility

- After Effects 2022 or newer (`AEFT` 22+)
- CEP/CSXS 11 or newer
- Windows and macOS; Linux is supported only for standalone panel development, not Adobe host execution

The extension manifest uses CSXS 11 as the minimum runtime. Newer Adobe
releases can load extensions targeting an older compatible CEP runtime.

## What's new in v2

- **Drag straight onto the timeline** — rows are now draggable using the
  `DownloadURL` technique (the same one several commercial CEP audio panels
  use to hand a file to a host's native drop target). Grab a row and drop it
  on the Premiere/AE timeline. **Best-effort, not guaranteed**: this relies
  on the host app treating the drop like a native Finder/Explorer drag, which
  isn't an officially documented CEP feature, so behavior can vary by host
  version and OS. The **Insert to Timeline** button from v1 is still there
  as the reliable fallback.
- **Tabs**: All / Recent / Favorites / Collections.
- **Recently Played** — the last 20 sounds you've played, most recent first.
- **Collections** — free-form groups (e.g. "Project X", "Horror Trailer").
  Click the 🗂 icon on a row (or use batch select) to add a sound to one or
  more collections, comma-separated; new names are created on the fly.
- **Color labels** — click the dot on the left of a row to cycle through six
  label colors (Premiere-style), or apply to a whole batch selection at once.
- **Manual tag editing** — the tag field under "Selected" now lets you
  retype a sound's tags directly, on top of the auto-guessed ones from v1.
- **Batch mode** — the "☑ Select" button turns on checkboxes so you can
  bulk-apply a color, add to a collection, or delete several sounds at once.
  Folder import already batch-imports every supported file it finds.

## What's new (UI simplification + smarter insert)

- **Click to play, click again to stop** — the separate Play/Pause button and
  Volume slider are gone; clicking any row plays it, clicking the same
  (playing) row again stops it. Double-click now behaves the same as a
  single click.
- **Speed slider removed** — only Pitch remains, since speed and play/volume
  weren't wanted in the panel anymore.
- **No more overlapping the timeline** — "Insert to Timeline" now checks
  every audio track at the playhead and drops the clip on the first one
  that's actually empty there (e.g. skips A1 if it's full of dialogue and
  uses A2 instead), rather than always targeting the first audio track. If
  every track is occupied at that point, it tries to add a new audio track
  automatically; if that fails (Premiere's auto-add-track call is
  undocumented and varies by version), it imports the file into the project
  panel and tells you to add a track manually instead of silently
  overlapping audio.

## Known limitations / roadmap

- MOGRT thumbnail extraction is best-effort (see above) — it finds the most
  plausible preview image inside the zip by name/heuristic, not a
  guaranteed official preview asset, since there isn't a single documented
  path for one across all `.mogrt` versions.
- Packaged MOGRT insertion is limited by the After Effects scripting API;
  open the template's source `.aep` when direct import is unavailable.
- Metadata lives in the panel's local storage rather than SQLite — fine for
  a few thousand items; a real DB is worth it once libraries get huge.
- AI auto-tagging, AI similarity search, cloud sync, and a marketplace are
  the v3 items from the original plan and aren't built here.
- Not built: context-aware panel switching (auto-showing Text/Shape/Batch
  tools based on what's selected) and selective (checkbox) paste on the
  Property Clipboard, batch effect/opacity/position apply across many
  layers at once beyond the existing 3-slot clipboard.
- The Studio tab's Premiere↔AE Bridge is disk-file-based (see above), not a
  live socket — there's a brief manual step (click Send, then click Import
  on the other side) rather than instant push, since two separate CEP panel
  processes can't share memory directly.

## Publishing an update

1. Set the same semantic version (for example `2.4.0`) in
   `CSXS/manifest.xml`, `index.html`, `js/compx-license.js`,
   `js/license-gate.js`, `js/main.js`, and this README heading.
2. If `js/main.js` changed, regenerate its loader hash with
   `node tools/regen-integrity.js` and update `js/compx-loader.js`.
3. Build an allowlisted release tree (never package the workspace root):

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build-release.ps1 -ExpectedVersion 2.4.0
   ```

   This runs static validation, stages only production files under `dist/`,
   excludes preview databases/logs/tests/tools/backups, verifies required
   runtime and Liquid Glass binaries, and writes a SHA-256 file manifest.
4. To create the signed ZXP in the same validated build, also pass
   `-ZxpSignCmd`, `-Certificate`, and `-CertificatePassword` (prefer an
   environment variable for the password). A run without those values creates
   clean staging only and deliberately does not claim to produce a releasable
   ZXP.
5. Upload the signed package to the private Supabase Storage bucket using this exact
   convention:

   `extensions/orbit-studio/<version>/<package-name>.zxp`

   Example:

   `extensions/orbit-studio/2.4.0/CompX-Orbit-Studio-v2.4.0.zxp`

The licensing backend discovers the highest semantic-version folder
automatically. Licensed panels check on startup and every six hours. Clicking
**Get update** requests a fresh short-lived signed URL; **Later** delays the
same version for 24 hours.

## File map

Before packaging a release, run:

```powershell
node tests/static-validation.js
```

After intentionally changing a tracked runtime file, run
`node tools/regen-integrity.js`, update the table in `js/compx-loader.js`, and
run validation again.

```
CompX-build/
├── CSXS/manifest.xml     # After Effects extension registration, Node enabled
├── index.html            # panel UI
├── css/                   # design tokens + component styling
├── js/CSInterface.js      # Adobe's official CEP↔host bridge
├── js/diagnostics.js      # sanitized local logs and diagnostic reports
├── js/storage.js          # IndexedDB library + localStorage migration
├── js/main.js             # library, audio engine, MOGRT reader, UI logic
├── js/advanced_features.js # clipboard and advanced panel integrations
├── js/graph20.js          # graph-curve editor UI
├── js/colorplate.js       # color plate UI
├── jsx/hostscript.jsx      # After Effects host operations
├── bin/                   # Export preset and binary-policy notes
├── icons/                 # panel icons
├── tests/                 # static build/security validation
└── README.md
```
