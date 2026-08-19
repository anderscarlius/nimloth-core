# Templates — OPT 1.4-output

**Filerna i denna mapp är genererade.** De skrivs av `pnpm openehr:compile`
som kör archie-baserad ADL→OPT-kompilering inuti en Docker-container.

## Regler

- **Ändra inte OPT-filer direkt.** Ändringar görs i ADL-filerna under `../archetypes/`
  och templates regenereras.
- **Filerna committas till git** trots att de regenereras. Skälen: reproducerbar
  deploy utan compiler-tillgång, git-diff visar template-förändringar tydligt,
  CI kan verifiera att checkat-in OPT matchar regenererat OPT.
- **Filnamn följer mönstret:** `<koncept>-<variant>.opt`, t.ex. `body-temperature-minimal.opt`.
  Detta är en lokal namnkonvention; den interna `template_id` inuti OPT-filen
  följer openEHR-konventioner.

## Regenerering

```
pnpm openehr:compile
```

Om OPT-filerna ändras efter regenerering: granska diffen, committa.

## Verifiering mot EHRbase

```
pnpm openehr:load-templates
```

Detta POSTar alla OPT-filer i mappen till EHRbase. Failar om någon avvisas.

## Undantag: `progress-note-v1.opt`

Byggd manuellt via `tools.openehr.org/designer` (inte av `pnpm openehr:compile`, som
fortfarande är i diagnostic mode) — se `DESIGNER-IMPORT-progress-note.md` i denna mapp för
det fullständiga, reproducerbara steg-för-steg-receptet. Ska regenereras från compilern och
detta undantag tas bort när P3.0b:s AOM→XML-OPT-bridge landar.
