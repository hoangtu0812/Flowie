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
| IDENTICAL | 312 |
| ALLOWED | 3 |
| CHANGED | 0 |
| MISSING | 0 |
| EXTRA | 50 |
| Total compared | 365 |

`ALLOWED` currently covers only approved auth/admin surface and the advertisement-free sidebar
exception. It is not a general waiver for Flowie-specific presentation changes.

## By presentation root

| Root | Identical | Allowed | Changed | Missing | Extra |
| --- | ---: | ---: | ---: | ---: | ---: |
| `app` | 63 | 3 | 0 | 0 | 4 |
| `components` | 221 | 0 | 0 | 0 | 35 |
| `hooks` | 1 | 0 | 0 | 0 | 0 |
| `lib` | 3 | 0 | 0 | 0 | 5 |
| `store` | 20 | 0 | 0 | 0 | 5 |
| `public` | 4 | 0 | 0 | 0 | 1 |

## Interpretation and execution order

1. Presentation baseline has been restored: Circle files are byte-identical in the agreed scope.
2. The 50 extra files are retained as dormant Flowie adapters/routes; no Circle preview route imports
   them. Reconnect only through `features/<domain>/**` or an equivalent non-presentation boundary.
3. Authentication is intentionally bypassed only during visual-preview work. It must be restored after
   the first real-data domain passes visual/contract acceptance.
4. Do not edit Circle presentation JSX, styles or component tree while reconnecting a backend domain.

The project-specific adapter/selector files are high-risk because they are evidence of backend logic
inside the presentation tree. Restore Project only after its data layer exists outside that tree.

## Re-run criteria

P1 is accepted: the audit reports no `CHANGED` or `MISSING` files in the agreed scope. Any future
visual difference needs an explicit allowlist entry and user approval.
