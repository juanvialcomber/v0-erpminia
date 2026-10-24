# N3uralia Local QA — MOTIL

Ruta común:

`local -> self-hosted -> preview -> browser QA -> exact-SHA release`

## Entrypoints

- `make qa-fast` — L1.
- `make qa-pr` — L1 + L2.
- `make qa-full` — L1 + L2 + L3 disponible.

L1 usa migraciones, secret scan, lint, typecheck y tests existentes. L2 agrega build. L3 reutiliza Playwright existente con retries deterministas.

GitHub Actions no debe ejecutar trabajo pesado en hosted runners por defecto. El workflow N3uralia es manual y delega a un runner Linux confiable con label `n3uralia`.

Un build verde no equivale a PASS. Cambios de usuario requieren QA sobre el preview exacto antes del release.
