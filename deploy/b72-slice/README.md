# WP-B72 — Hel stack från noll (B7 nivå 2 minimal)

Avtalad **minimal** hel stack (Tier A spine) från noll — bygger på WP-DEMO1
unified path och dokumenterar Eldar som primärt målhost utan live-deploy från CI.

## Snabbstart (lokal)

```bash
./deploy/b72-slice/from-scratch-local.sh
```

## Filer

| Fil | Syfte |
|-----|--------|
| [SERVICE_LIST.md](./SERVICE_LIST.md) | Tjänstelista + ghcr-status |
| [RUNBOOK.md](./RUNBOOK.md) | Operatör: lokal, CI, Eldar (**kräver Anders-ja** live) |
| [INVENTORY.md](./INVENTORY.md) | Kartläggning mot B7/ghcr/from-scratch |
| [from-scratch-local.sh](./from-scratch-local.sh) | Noll → healthy |
| [smoke-b72-health.sh](./smoke-b72-health.sh) | Spine health |

## CI

`scripts/wp-b72-ci-facit.sh` (körs i `.github/workflows/ci.yml`).

## Spec

[spec/wp-b72-hel-stack-fran-noll.md](../../spec/wp-b72-hel-stack-fran-noll.md)
