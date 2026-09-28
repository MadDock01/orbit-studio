# CompX Empty-Catch Audit

## Current result

The previous version of this document incorrectly claimed that no syntactically
empty catches remained. The current source contains 69. These are primarily
best-effort cleanup, logging, compatibility, and storage fallbacks; functional
operations should continue to report failures through `CompXDiagnostics` or
`compxAuditFallback`.

| File | Syntactically empty catches |
|---|---:|
| `jsx/hostscript.jsx` | 47 |
| `js/compx-license.js` | 12 |
| `js/main.js` | 4 |
| `js/compx-loader.js` | 3 |
| `js/license-gate.js` | 2 |
| `js/colorplate.js` | 1 |
| **Total** | **69** |

## Classification policy

- **Expected Adobe/API compatibility fallback:** remains non-fatal and records a stable optional-fallback audit code.
- **Recoverable operation failure:** records a warning/skipped result and allows the remaining operation to continue.
- **Functional failure:** records a sanitized error, increments the failed counter, and shows a user-facing message.

## Runtime behavior

- Panel fallbacks flow through `CompXDiagnostics.fallback()`.
- Adobe host fallbacks flow through `compxAuditFallback()`.
- Every fallback occurrence is counted, but only the first panel occurrence of each stable code is retained as a diagnostic entry to avoid noisy logs.
- The Diagnostics action requests the current host fallback summary and includes it in the copied report.
- Diagnostic paths are sanitized before display or persistence.
- The UI counter now displays Applied, Skipped, Failed, and Optional fallback totals (`A · S · F · O`).

## Audit-code format

Audit codes include source area, nearest function, and a stable sequence number, for example:

```text
MAIN_LOADLIBRARY_001
HOST_AE_APPLYGROUP_004
STORAGE_MIGRATEFROMLOCALSTORAGE_001
COLORPLATE_WIRECOLORPLATE_002
```

## Validation

Run `node tests/static-validation.js` before release. Empty catches should be
reviewed during code review; do not increase the baseline without documenting
why the ignored failure is safe.

Actual After Effects and Premiere Pro smoke testing is still required because many host fallbacks exist specifically for version-dependent Adobe APIs.
