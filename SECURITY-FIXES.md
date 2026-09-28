# CompX targeted security fixes

Applied 2026-07-23 without UI or feature refactoring.

## Changes

- Hardened MOGRT ZIP parsing with central-directory bounds checks.
- Added compressed/uncompressed entry validation and extraction limits.
- Blocked absolute paths, drive paths, null bytes, and parent-directory traversal during extraction.
- Replaced shell-based Reveal in Folder commands with argument-safe `execFile` calls.
- Replaced ExtendScript configuration `eval()` calls with `JSON.parse()`.
- Preserved malformed library JSON under a recovery key instead of silently discarding it.
- Stopped persisting base64 MOGRT thumbnails in localStorage; they now remain a per-session cache.
- Added the repeatable `tests/static-validation.js` build/security validator.
- Added centralized Adobe host response parsing, contact-error handling, and timeout protection for shared tool calls.
- Routed timeline insert, property clipboard, Copy Pasta, project diagnostics, organizer, comp statistics, and color picking through the shared host bridge.
- Hardened generated HTML attributes by encoding quotes and escaped project/host names, paths, and error messages before rendering.
- Added a shared CEP-to-ExtendScript string serializer and applied it to MOGRT paths, counter text, rename values, presets, SRT data, and caption text.
- Added a restrictive panel Content Security Policy that allows packaged scripts and local/data media while blocking network connections, embedded frames, and plug-in objects.
- Aligned the minimum CSXS runtime with the declared Adobe 2022+ host range and documented the compatibility matrix.
- Removed the unsigned Windows clipboard executable and retained the auditable Node/PowerShell clipboard implementations.
- Added MOGRT archive, entry-count, central-directory, and embedded-preview size limits to prevent excessive synchronous memory use.
- Migrated asset-library metadata from localStorage to IndexedDB with transactional verification, an IndexedDB legacy backup, and localStorage fallback when the database is unavailable.
- Added incremental 120-item library rendering so large MOGRT/SFX collections do not create every card or thumbnail in one blocking pass.
- Added a deduplicated, cooperative MOGRT thumbnail queue that processes one archive per UI tick and updates only the matching rendered card.
- Bounded embedded MOGRT hover previews to an eight-item LRU cache and delayed extraction until a 120 ms intentional hover.
- Added versioned JSON library backup/restore, asynchronous missing-file detection, and folder-based relinking with duplicate-name safeguards.
- Added a deterministic dedicated MOGRT cache with source-change invalidation, cache-size display, reuse, and manual cleanup that protects active AE footage references.
- Moved SFX, SRT, MOGRT reads, nested cache writes, and archive preparation onto asynchronous/cooperative workflows to reduce CEP UI blocking.
- Added sanitized local diagnostics, copyable reports, friendly error surfaces, and applied/skipped/failed action counters.
- Audited the original error-handling paths and added diagnostics for functional
  failures. A small set of deliberate best-effort cleanup/fallback catches
  remains syntactically empty; `EMPTY-CATCH-AUDIT.md` records the current count
  instead of claiming that no empty catches exist.

## Validation completed

- All browser-side JavaScript files pass `node --check`.
- `CSXS/manifest.xml` parses successfully.
- `node tests/static-validation.js` checks syntax, UTF-8, integrity hashes,
  manifest scope, duplicate host globals, duplicate HTML IDs, loader lifecycle
  behavior, and installer quarantine policy.
- Standalone panel rendering completed with no console errors, failed resources, viewport overflow, or detected overlaps.

## Runtime testing still required

Adobe host behavior cannot be fully reproduced outside After Effects and Premiere Pro. Before release, smoke-test MOGRT import/insert, Reveal in Folder, Project Organizer, Shape Controls, and Undo in each supported host and operating system.
