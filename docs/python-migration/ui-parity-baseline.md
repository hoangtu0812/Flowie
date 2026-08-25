# Circle UI parity baseline — P1 audit

Generated with the read-only audit script on 2026-08-25.

```powershell
.\scripts\audit-ui-parity.ps1 `
  -BaselineRoot 'C:\Users\Hoang Tu\Desktop\BSR\1. Source Code\circle' `
  -CurrentRoot '.\apps\web'
```

## Current result

| Status | Files |
| --- | ---: |
| IDENTICAL | 110 |
| ALLOWED | 3 |
| CHANGED | 184 |
| MISSING | 18 |
| EXTRA | 50 |
| Total compared | 365 |

`ALLOWED` currently covers only approved auth/admin surface and the advertisement-free sidebar
exception. It is not a general waiver for Flowie-specific presentation changes.

## By presentation root

| Root | Identical | Allowed | Changed | Missing | Extra |
| --- | ---: | ---: | ---: | ---: | ---: |
| `app` | 32 | 3 | 28 | 3 | 4 |
| `components` | 64 | 0 | 144 | 13 | 35 |
| `hooks` | 1 | 0 | 0 | 0 | 0 |
| `lib` | 1 | 0 | 2 | 0 | 5 |
| `store` | 8 | 0 | 10 | 2 | 5 |
| `public` | 4 | 0 | 0 | 0 | 1 |

## Interpretation and execution order

1. Keep the 110 identical files untouched unless a real-data adapter requires a non-presentation
   integration point.
2. Restore `app`, layout/header/sidebar composition, then the Project presentation tree from Circle.
3. Move Flowie-only fetching, DTO mapping and mutation code out of `components/**` into
   `features/<domain>/**`; do not preserve a visual divergence merely because it currently works.
4. Restore or explicitly disable the 18 missing Circle files. Agent/Code Review surfaces are not
   re-enabled as functioning features without a backend; their navigation/state must still follow the
   approved product decision.
5. Treat the 50 extra files as adapters, auth/admin support or candidate removal. They must not alter
   Circle presentation while a dialog/panel is closed.

The project-specific adapter/selector files are high-risk because they are evidence of backend logic
inside the presentation tree. Restore Project only after its data layer exists outside that tree.

## Re-run criteria

P1 is accepted only when the audit reports no unexplained `CHANGED` or `MISSING` files in the
agreed scope. The next report must retain this baseline for comparison and document every new
allowlist rule with user approval.
