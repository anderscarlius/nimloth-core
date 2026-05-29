# Atlas-capture — nimloth-atlas aktuellt sajt-state (för demo-manus-grundning)

**Syfte:** Strukturerad fångst av vad en potentiell kund ser på nimloth-atlas
*just nu*, så att demo-manusets atlas-vinkel grundas i faktisk sajt, inte minne.
**Capture-datum:** 2026-05-28 (read-only, ingen ändring av atlas).
**Repo:** `~/SynologyDrive/Hemmabasen/Kod/Claude/nimloth-atlas` (separat repo, ej nimloth-core).
**Version:** **v0.4.1** (deployad image `nimloth-atlas:0.4.1`, byggd 2026-05-18).

> ⚠️ **Viktig distinktion:** nimloth-**atlas** är en **arkitektur-prototyp / vision-yta**
> (statisk React-SPA med fixtures) — den visualiserar plattformen lager för lager
> och demonstrerar *hur* en klinisk vy skulle se ut. Den är INTE den S1-validerade
> nimloth-core `med-review`-tjänsten. Atlas L06-demon visar t.ex. **imperativa**
> rekommendationer ("seponera omgående") ur en fixtur — det är prototyp-narrativ,
> inte den deskriptiva, validerade produktionslogiken. Håll isär dem i manuset.

---

## 1. Åtkomstvägar (båda verifierade)

| Väg | URL | Utfall |
|---|---|---|
| **Publik tunnel** | `https://nimloth-atlas.carlius.net` | **Upp men Cloudflare-Access-gated** — HTTP 302 → `carlius.cloudflareaccess.com/.../login` (auth_status NONE). Oautentiserad curl når aldrig app-innehåll, bara Access-login. MFA + whitelisted e-post krävs. |
| **Intern LAN** | `http://192.168.1.189:11006` | **200 OK** (nginx/1.31.0), serverar appen direkt utan auth. Detta är den autentiska "vad-kunden-ser"-ytan för capture/screenshots. |

**Skillnad mellan svaren:** publika tunneln är Zero-Trust-skyddad (samma mönster som
övriga `*.carlius.net`-tunnlar); interna LAN-porten exponerar samma byggda app utan
gate. Innehållet är identiskt — bara åtkomstkontrollen skiljer. CSP-headers på interna:
`default-src 'self'; connect-src 'self'` (statisk app, inga externa API-anrop).

---

## 2. Landningssida

- **Title:** `Nimloth — Arkitekturatlas` · **lang:** sv · **meta description:** "Nimloth Atlas — arkitekturatlas lager för lager." · `robots: noindex,nofollow`.
- **Typografi:** Newsreader (rubriker) + IBM Plex Sans (brödtext) + JetBrains Mono (kod), `display=optional` (CLS-optimerat).
- **Build:** Vite SPA — `/assets/index-557fnVLi.js` + `index-eOXge_Wq.css`, root-div `#root`. Statiskt byggd, serveras av nginx.
- **IndexPage:** mono-label "Arkitekturatlas" + intro ("Den här atlasen presenterar Nimloths arkitektur lager för lager…") + lager-navigering (L00–L06.5).
- **Skärmbild:** `demo-assets/atlas-landing.png`

---

## 3. Routes / vyer (från `src/App.tsx`)

Router (react-router-dom) har **4 route-mönster**:

| Route | Komponent | Visar |
|---|---|---|
| `/` | `IndexPage` | Landning — lager-för-lager-översikt + TopNav |
| `/migration` | `MigrationPage` | **Migreringsvy** (legacy-journalsystem → Nimloth). *Ny i v0.4.* |
| `/:layerId` | `LayerPage` | Lager-sida (prose + Vad/Löser/Teknik-paneler + demo-CTA) |
| `/:layerId/demo` | `DemoPage` | Interaktiv demo per lager |

`:layerId` valideras mot 9 giltiga lager-id (uppercase, t.ex. `/L06`). Lager
(`src/content/layers.ts`, ordning topp→botten):

| Route | Lager | Demo (`/<id>/demo`) demoLabel |
|---|---|---|
| `/L06` | Applikationer & kliniska vyer | Ingrid Andersson — läkemedelsgenomgång |
| `/L06.5` | KPI-dashboard som klinisk vy | Exempelregionen — Verksamhets-KPI |
| `/L05` | FHIR-fasad (externt API) | FHIR Explorer |
| `/L05.5` | Integrationsekosystem | Systembrowser (16 system, 5 kategorier) |
| `/L04` | Händelsebuss & strömbearbetning | Live händelseström |
| `/L03` | openEHR-kärna (intern modell) | Arketyp-bläddrare + AQL |
| `/L02` | Lakehouse-analys | Pipeline + ParityTrend |
| `/L01` | Identitet, samtycke & spårbarhet | ABAC-evaluator (13 attribut) |
| `/L00` | Driftinfrastruktur | Container-dashboard |

Skärmbilder: `demo-assets/atlas-<id>.png` (lager-sidor) + `atlas-<id>-demo.png` (demos) + `atlas-migration.png`.

---

## 4. ATLAS_INGRID_SCENARIO (`src/fixtures/ingrid.ts`)

**Patient:** Ingrid Andersson, pnr 19500315-2384, 76 år, VC Slottsskogen. (Spegling av
nimloth-core seed FRU_ANDERSSON; overlay enligt ATLAS_SPEC sek 3.1.)

**Mediciner: 10 = 4 seed + 6 overlay** ✅ (förväntat bekräftat). I klinisk ordning:

| # | Läkemedel | ATC | Källa | Flagga |
|---|---|---|---|---|
| 1 | Waran 2,5 mg | B01AA03 | seed | — |
| 2 | **Apixaban 5 mg** | B01AF02 | overlay | `alert` (dubbel antikoagulation) |
| 3 | Metoprolol 50 mg | C07AB02 | seed | — |
| 4 | Ramipril 5 mg | C09AA05 | seed | — |
| 5 | **Furosemid 40 mg** | C03CA01 | overlay | — |
| 6 | **Spironolakton 25 mg** | C03DA01 | overlay | `warn` (hyperkalemi) |
| 7 | Metformin 500 mg | A10BA02 | seed | — |
| 8 | **Citalopram 20 mg** | N06AB04 | overlay | `warn` (Beers) |
| 9 | **Oxazepam 15 mg** | N05BA04 | overlay | `warn` (Beers/STOPP) |
| 10 | **Omeprazol 20 mg** | A02BC01 | overlay | — |

**Sobril/Oxascand-substitution:** medicinen heter generiskt **Oxazepam** (N05BA04) i
fixturen. Substitutionen ligger i **FASS-länklagret**: drugKey `oxazepam` → produkt
"Oxascand (Tablett 10 mg)" med kommentar *"Sobril 15 mg avregistrerad 2024-12-16;
närmast aktiva produkt är Oxascand 10 mg."* Så substitutionen ÄR på plats — men på
produkt-länknivå, inte som medicinnamn.

**Diagnoser (6):** Förmaksflimmer (I48.0) · Essentiell hypertoni (I10) · Diabetes mellitus typ 2 (E11) · Primär koxartros höger (M16.1) · Höftledsprotes in situ (Z96.64) · DVT v. poplitea sin. (I82.4).

**Allergier (1):** Penicillin → Urtikaria, severity **MODERATE**, verifierad. *(OBS: i nimloth-core med-review är Ingrids allergi anafylaxi/high — atlas-overlayen är mildare. Olika fixtures.)*

**Overlay-labb (färska, för demon):** eGFR 42 (L, CKD-EPI) · P-Natrium 132 (L) · P-INR 2.8. Driver njurfunktion/hyperkalemi/hyponatremi-narrativet.

**Identifierare per ordination:**
- I patient-fixturen (`ingrid.ts`): `drug_name` + `atc_code` (oförändrat).
- I FASS-registret (`fassLinks.ts`, **nytt lager**): **Npl-ID** (14-siffrigt) + **SeNSLid** (substansid, Nationell Substansförteckning) + productName + substanceName + ATC, per ordination. Exakt 10 entries.

---

## 5. FASS-länk-integration (`src/lib/fassLinks.ts` + `FassLink.tsx`)

Tillkom i **v0.4.1** (git: `ebbe111 FASS-länkintegration — utgående länkar i L05 och L06`).

- **Surfaces:** L05 (FHIR-explorer) + L06 (läkemedelsgenomgång). Delad CSS `.fass-link`.
- **Registry:** `FASS_LINK_REGISTRY` — 10 entries, case-insensitive lookup på `drug_name`.
- **URL-byggare** `buildFassUrl()` enligt **FASS v2.0-mönster** (live 2025-11-08), origin `https://www.fass.se`:
  - `product` → `/health/product/<nplId>`
  - `substance` → `/health/substance/<seNSLid>`
  - `interchangeable` → `/health/interchangeable-product/<nplId>`
  - `atc` → `/health/atc/<atc>` (låst till health-audience)
- **Exempel (Apixaban):** `https://www.fass.se/health/product/20201002000065`
- **Exempel (Waran):** nplId `19640101000028`, seNSLid `ide4pobzu959avert1`, ATC B01AA03.
- Identifierarna dokumenterade med källrad till fass.se (hämtade 2026-05-18) i `docs/fass-integration/02-identifier-mapping.md`.
- **Robusthet:** miss i registret → plain text + `console.warn` (ingen krasch).
- Skärmbilder: `demo-assets/atlas-L05-demo.png`, `atlas-L06-demo.png`.

---

## 6. Interaktionsvarning (`relatedSubstances`, `src/fixtures/reasoning-sequence.tsx`)

L06-demon (läkemedelsgenomgång) renderar **4 FINDINGS**, var och en med
`relatedSubstances` (drugKey-refs som resolverar till FASS-länkar):

| Severity | Titel | relatedSubstances | Body (fixtur — imperativ prototyp-text) |
|---|---|---|---|
| **red** | Dubbel antikoagulation | `[waran, apixaban]` | "Waran och Apixaban samtidigt — seponera omgående en av dem…" |
| **red** | Beers: Oxazepam | `[oxazepam]` | "Bensodiazepin hos äldre. Försök seponera…" |
| **amber** | Beers: Citalopram-dos | `[citalopram]` | "Sänk till 10 mg eller överväg byte (QT, SIADH)…" |
| **amber** | Hyperkalemi-risk + njurfunktion | `[ramipril, spironolakton]` | "Ramipril + Spironolakton vid eGFR 42 → kontrollera P-Kalium…" |

**Datastruktur:** `Finding { severity: "red"|"amber"; title; body; relatedSubstances: string[] }`.
`relatedSubstances` är drugKey-strängar som `lookupFassEntry()` slår upp → FASS-produkt/substans-länk
renderas inline i varje fynd. Koherenstest säkrar att varje relatedSubstance resolverar i registret.

**Primär interaktionsvarning för demon:** "Dubbel antikoagulation" (red) — Waran +
Apixaban, den mest slående beaten. Skärmbild: `demo-assets/atlas-L06-demo.png`.

> Notera (manus-relevant): atlas-fynden är **imperativa** ("seponera omgående") —
> prototyp-UI. Kontrast mot nimloth-core med-review som är strikt deskriptiv +
> S1-validerad. Om demon visar BÅDA, var tydlig med att atlas = vision-yta.

---

## 7. Arkitektur-visualisering

Hela atlasen ÄR arkitektur-visualiseringen — **lager för lager** (L00 drift → L06
applikationer), varje lager med prose + "Vad/Löser/Teknik"-paneler. Två särskilda ytor:
- **IndexPage (`/`):** stacken som översikt, "vårdens operativsystem"-tesen.
- **L05.5 Integrationsekosystem:** karta över **16 svenska vårdsystem** i 5 kategorier (NPÖ, 1177, e-Hälsomyndigheten, Inera, SIL, Pascal, SNOMED/Snowstorm, register…). **Ärlig märkning:** 3 realiserade idag (SNOMED CT via Snowstorm, ICD-10-SE, ATC), 13 arkitektonisk vision — räkningen visas uppfront i filter-headern.
- **L00:** CarliusFyra-hårdvara (Synology DS923+, 25+ containrar, Cloudflare Tunnel) + produktions-rackspec.

---

## 8. Diff mot minnesbilden (§8-kvittens)

| Minnesbild | Status | Not |
|---|---|---|
| 10 mediciner (4 seed + 6 overlay) | ✅ **STÄMMER** | Exakt: Waran/Metoprolol/Ramipril/Metformin (seed) + Apixaban/Furosemid/Spironolakton/Citalopram/Oxazepam/Omeprazol (overlay) |
| drug_name + atc_code, inga Npl-ID/SeNSLid | 🔄 **ÄNDRATS** | Patient-fixturen har fortfarande drug_name+atc. MEN nytt FASS-registry-lager lägger till **Npl-ID + SeNSLid** per ordination (10 entries) |
| FASS utgående-länkar via statisk lookup på L05/L06 | ✅ **STÄMMER** | `FASS_LINK_REGISTRY` statisk, `FassLink`-komponent, L05+L06 (v0.4.1) |
| Interaktionsvarningar med relatedSubstances | ✅ **STÄMMER** | 4 findings med relatedSubstances drugKey-refs → FASS-länkar |
| Sobril ersatt med Oxascand | ✅ **STÄMMER (nyans)** | Medicin = generiskt "Oxazepam"; FASS-produktlänk = "Oxascand 10 mg" (Sobril avreg. 2024-12-16) |
| Visualiserar svensk journalsystem-arkitektur | ✅ **STÄMMER** | 9 lager L00–L06.5 + ekosystem-karta (16 system) på L05.5 |
| Cloudflare Tunnel-deploy från cf4 | ✅ **STÄMMER** | `nimloth-atlas:0.4.1` på cf4:11006, cloudflared Up 2 mån, tunnel→`nimloth-atlas:80`, Access-gated |
| 36 koherens-tester | ✅ **STÄMMER** | `vitest run`: **36 passed** (fassLinks.test.ts) |

**TILLKOMMIT sedan minnesbilden:**
- **`/migration`-vy (MigrationPage)** — helt ny route (v0.4), migrering legacy→Nimloth. Saknades i minnesbilden.
- **v0.4-funktioner:** AI-discovery-badges, tekniska detaljer, roll-toggle, Sektion 3 klickbar tidslinje, best-of-breed-gradient (git: v0.4 fas 4–6).
- **9 lager inkl. sub-lager L05.5 + L06.5** (minnesbilden enumererade inte lager).
- **FASS v2.0 URL-mönster** (live 2025-11-08), identifierare hämtade 2026-05-18.

**FÖRSVUNNIT:** inget observerat borttaget. (L06-demoLabel ändrad Marianne→Ingrid, men det skedde före minnesbilden.)

---

## 9. Tunnel + deploy-state

- **cf4-container:** `nimloth-atlas` — image `nimloth-atlas:0.4.1`, skapad **2026-05-18T19:32Z**, **Up 10 dygn (healthy)**, RestartCount 0, port `11006:80`, nät `carlius-net`.
- **Cloudflared:** Up 2 månader. Tunnel-routing är **fjärrhanterad** (Cloudflare-dashboard, ingen lokal config.yml hittad) → pekar på `http://nimloth-atlas:80` via `carlius-net`. Live + Zero-Trust-gated (302→Access-login verifierat).
- **Deployed == local:** deployad app (Last-Modified 18 maj 19:31) motsvarar lokal HEAD:s app-kod. Enda nyare commit (`fdd88ed`, 18 maj 21:46) är en RUNBOOK-doc-bump — påverkar ej byggd app. Lokal repo ren, == `origin/main`.
- **Senaste commits:** `fdd88ed` RUNBOOK 0.2.2 · `bc9c438` Bump 0.4.1 FASS · `ebbe111` FASS-länkintegration L05/L06 · `6f8f402` v0.4 fas 6 slutpolering · `76b551b` v0.4 fas 5 AI-discovery-badges.

---

## 10. Skärmbilder (demo-assets/)

Fångade mot **den faktiska deployade sajten** (cf4:11006), fönster 1440 bred,
full-page. **20 atlas-bilder:**

- **Översikt:** `atlas-landing.png` (`/`), `atlas-migration.png` (`/migration`)
- **Lager-sidor (9):** `atlas-L06.png`, `atlas-L06_5.png`, `atlas-L05.png`, `atlas-L05_5.png`, `atlas-L04.png`, `atlas-L03.png`, `atlas-L02.png`, `atlas-L01.png`, `atlas-L00.png`
- **Demos (9):** `atlas-L06-demo.png` (läkemedelsgenomgång — FASS + interaktionsfynd), `atlas-L06_5-demo.png` (KPI), `atlas-L05-demo.png` (FHIR Explorer — live FHIR-JSON + FASS-länkar), `atlas-L05_5-demo.png` (systembrowser), `atlas-L04-demo.png` (händelseström), `atlas-L03-demo.png` (arketyp + AQL), `atlas-L02-demo.png` (lakehouse/ParityTrend), `atlas-L01-demo.png` (ABAC), `atlas-L00-demo.png` (container-dashboard)

Plus med-review-bilderna (nimloth-core, ej atlas): `medreview-ingrid-full.png`,
`medreview-marianne-full.png`, `medreview-audit-closeup.png`, `medreview-rejection-banner.png`.

---

## Öppna punkter / capture-noter

- Atlas L06-demon kan ha animerad reasoning-sequence; skärmbilden fångar default-state.
- Allergi-svårighetsgrad skiljer atlas (Urtikaria/MODERATE) vs nimloth-core med-review (anafylaxi/high) — olika fixtures, värt att harmonisera om demon visar båda.
- Publika tunneln kräver Cloudflare Access-inloggning för live-visning; för publik video använd inloggad session eller intern LAN/SSH-forward (jfr `Demo_Runbook.md` §2).

*Capture grundad i faktisk sajt + repo-källa 2026-05-28. Read-only.*
