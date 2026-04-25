# Design: hifi‑mockup → kod

Det här dokumentet är **bryggan** mellan designmockupen i `design_handoff/` och React‑implementationen i `services/dashboard/`. Mockupen är det arkitektoniska målet för UI:t — men den är skriven som inlinad Babel‑HTML och ska **återskapas** i vår TypeScript‑kodbas, inte kopieras rakt av.

> *"The files in this bundle are design references created in HTML — prototypes showing intended look and behavior, not production code to copy directly."* — `design_handoff/README.md`

---

## 1. Filerna i handoffen

| Fil | Roll |
|---|---|
| `Nimloth Core.html` | Entry point. All logik är inlinad i ett `<script type="text/babel">`‑block. Läs den här för att se interaktioner och layout i sin helhet. |
| `data.js` | Mockpatienter (inkl. Fru Andersson = `PATIENTS[0]`) och `window.SOURCE_LABELS` (mappning källsystem → etikett + färg). I produktion flyttar vi detta till en config‑modul och fetchar från FHIR Facade. |
| `styles.css` | Alla stilar. Designtoken definieras här som CSS‑variabler i `:root`. Kan kopieras mer eller mindre rakt av till Tailwind‑config eller CSS Modules. |
| `source_archive/*.jsx` | **Arkiverad källa** till de inlinade React‑komponenterna (`components.jsx`, `patient.jsx`, `admin.jsx`). Läs dessa för att förstå komponentstrukturen; den inlinade HTML:en innehåller allt. |

---

## 2. Designfilosofi — "nordisk offentlig stil"

Mockupen är deliberat sober:

- **Vita bakgrunder**, **tunna 1px‑borders** istället för skuggor.
- **Minimal färg** — accent (teal), varning (amber), kritiskt (red), success (green) — allt annat är neutralt.
- **Täta rader** i tabeller, små labels (11px, uppercase, letter‑spaced).
- **Inga dekorativa animationer** — bara meningsfulla (kritiska CDS‑kort pulserar, offline‑noder i topologivyn pulserar).
- **Svenska UI‑texter genomgående** — behålls i all implementation.

Principen: klinisk data ska **läsa som ett dokument**, inte som en app. Läkaren ska kunna skumma sidan som en journal och fånga det viktiga på 5 sekunder.

---

## 3. Design tokens

Kopiera rakt av till `services/dashboard/tailwind.config.ts` (eller CSS Modules). Token‑värdena är från `design_handoff/styles.css`:

### 3.1 Färg

```
--navy:        #1a2332   /* sidebar bg, primär text på ljust */
--navy-2:      #233044   /* hover/active nav */
--ink:         #1a2332   /* body text */
--ink-2:       #4a5568   /* sekundär text */
--ink-3:       #8b95a5   /* meta / muted */
--line:        #e4e7eb   /* borders (1px) */
--line-2:      #eef0f3   /* subtle dividers */
--surface:     #fafbfc   /* sidans bg */
--surface-2:   #ffffff   /* card bg */
--teal:        #0D7377   /* primär accent, aktiv/link */
--teal-soft:   #e6f2f3   /* teal‑tintad bg */
--amber:       #B8860B   /* varning, offline */
--amber-soft:  #fdf6e3
--red:         #B8322C   /* kritiskt, nekad, nödöppning */
--red-soft:    #fbeceb
--green:       #2F7D4E   /* success, healthy */
--green-soft:  #e8f3ec
```

### 3.2 Typografi

- **Body**: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- **Mono** (IDs, timestamps, koder): `"JetBrains Mono", "SF Mono", Consolas, monospace`
- Utility `.tnum` → `font-variant-numeric: tabular-nums` (för att siffror ska linjera i tabeller)
- Storlekar: 14px body · 13px tabell · 12px meta · 11px labels (uppercase + letter‑spacing)
- Vikter: 400 body · 500 semi‑emphasis · 600 headings

### 3.3 Spacing

Endast 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 px. Inget "pixel‑perfekt 17px" tillåts.

### 3.4 Border radius

- `3px` — inputs, chips, flesta cards
- `6px` — buttons
- `50%` — avatars, statusdots

### 3.5 Shadows

- **Inga skuggor på cards** (flat, 1px border only)
- Modal overlay: `rgba(0,0,0,0.35)` backdrop; kortet i modalen får `0 12px 40px rgba(0,0,0,0.18)`

---

## 4. Vyer (screens)

Mockupen definierar **sju vyer**. Dashboarden implementerar sex av dem (söken, patient-overview, systemstatus, topologi, audit, CDS-alerts); Datakvalitet och Inställningar är framtida arbete.

| # | Vy | Route (mål) | Status | Kodplacering |
|---|---|---|---|---|
| 1 | **Patientsök** | `/search` | ✅ Del 10 | `services/dashboard/src/pages/PatientSearch.tsx` |
| 2 | **Patientöversikt** | `/patient/:id` | ✅ Del 10 | `services/dashboard/src/pages/PatientOverview.tsx` |
| 3 | **Systemstatus** | `/system` | ✅ Del 10 | `services/dashboard/src/pages/SystemStatus.tsx` |
| 4 | **Topologi** | `/topology` | ✅ Del 15 | `services/dashboard/src/pages/Topology.tsx` |
| 5 | **Datakvalitet** | `/quality` | ⏳ framtid | Fylls när reconciliation‑engine finns |
| 6 | **Åtkomstlogg (audit)** | `/audit` | ✅ Del 10 (grund) | `services/dashboard/src/pages/AuditLog.tsx` — utökas med nödöppnings‑radmarkering i Del 15 |
| 7 | **Inställningar** | `/settings` | ⏳ framtid | — |

**+CDS Alerts** som finns idag (`services/dashboard/src/pages/CdsAlerts.tsx`) är en förenkling som i mockupen integreras direkt in i patientöversikten (`CdsStack`‑komponenten på `/patient/:id`). I sluttillståndet slås den ihop med patient‑overviewet.

### 4.1 Patient overview — layout detalj

```
┌────────────────────────────────────────────────────┐
│  ← Tillbaka till sökning                            │
├────────────────────────────────────────────────────┤
│  PatientBanner                                     │
│   IA  Ingrid Andersson   74 K  Listad: Närh. Centr. │
│       19500315-2384           Vårdrelation: Aktiv   │
├────────────────────────────────────────────────────┤
│  AllergyCard (röd ton)                             │
│   ⚠  Penicillin V — Urtikaria (måttlig)            │
├────────────────────────────────────────────────────┤
│  CdsStack (sortering: critical → warning → info)   │
│   ● Kritiskt: Antikoagulerad — kontrollera INR …   │
│     [Beställ akut INR] [Visa INR‑trend]            │
│   ● Varning:  Tidigare DVT …                       │
│   ● Info:     Höftprotes höger, Zimmer Avenir …    │
├────────────────────────────────────────────────────┤
│ [Tidslinje] [Läkemedel] [Labb] [Ingrepp] [Diagn.]  │
│ [Vitala]    [Vårdkontakter]                        │
├────────────────────────────────────────────────────┤
│  Tab body (scrollar inom main‑content)             │
└────────────────────────────────────────────────────┘
```

### 4.2 Topologi‑vy (Del 15 — implementerad)

SVG‑karta (`viewBox 860×560`) med central hubb i mitten + edge‑noder runtom. Dashed flödeslinjer (`stroke-dasharray 4 8`, animation `flow 1.6s linear infinite`). Offline‑noder har pulserande röd ring (`pulseRing 1.8s infinite`) via animerade `<animate>`-taggar. Höger sidopanel visar noddetalj: status, hub-anslutning, FHIR-cache-patienter, cache-storlek, CDC events, buffrade events, replication-lag, uptime, senaste heartbeat-timestamp. Klick på nod → uppdatera sidopanelen.

Data hämtas från `GET /api/topology` (Vite-proxy → `replication:3007/topology`). Refetch-intervall 10 s. Källan är `TopologyTracker` i replikeringstjänsten som konsumerar `core.system.edge.heartbeat` från startup (`fromBeginning: true`) och håller senaste heartbeat per instans i en Map. Heartbeats äldre än 90 s markeras `stale: true` och renderas som offline även om senaste status var "online".

**Fast positionering:** edge-nodernas SVG-koordinater är hårdkodade per instance-id i `EDGE_POSITIONS` (su, skas, nu, saes, kungalv, alingsas). För ytterligare sjukhus — lägg till nya koordinater i mapen. Positionerna är stylized, inte en faktisk karta av VGR.

### 4.3 Åtkomstlogg — specialradmarkering

- **Nödöppning**: amber bakgrund + sub‑rad med motivering ("⚠ Motivering: …")
- **Nekad åtkomst**: röd‑tintad bakgrund + sub‑rad med orsak ("↳ Anledning: …")

Se implementationstips i [EXTENDING.md](EXTENDING.md) (Steg 6 är parallellt för UI‑utvidgning).

---

## 5. Komponentmappning

Mockupens komponenter → React‑komponenter i vår kod:

| Mockup (jsx) | React (tsx) | Status |
|---|---|---|
| `PatientBanner` | `components/PatientBanner.tsx` | Finns (del av `PatientOverview.tsx`) |
| `AllergyCard` | — | Ska extraheras från `PatientOverview.tsx` |
| `CdsStack` / `CdsCard` | `components/CdsCard.tsx` | ✅ |
| `TimelineView` | `components/TimelineView.tsx` | ✅ |
| `MedicationList` | `components/MedicationList.tsx` | ✅ |
| `LabResults` | `components/LabResults.tsx` | ✅ |
| `ProcedureHistory` (inkl. implantatblock) | `components/ProcedureHistory.tsx` | ✅ |
| `VitalSigns` (KPI + 120d trendgraf) | `components/VitalSigns.tsx` | ✅ (utan trendgraf än) |
| `SourceBadge` | `components/SourceBadge.tsx` | ✅ |
| `Layout` (sidebar nav) | `components/Layout.tsx` | ✅ |
| `Icon` (inline SVG, Feather‑stil, 1.75 stroke) | — | Används ad‑hoc; kan extraheras |
| `TopologyMap` (SVG karta + animerade linjer) | `pages/Topology.tsx` | ✅ Del 15 |
| `QualityDashboard` (KPI + stapel + trendlinjer) | — | ⏳ framtid |
| `AuditTable` (filter + rader, emergency/denied) | `pages/AuditLog.tsx` (inline) | Grund ✅, utökas i Del 15 |
| `SettingsPanel` (PDL‑context, toggles) | — | ⏳ framtid |
| `EmergencyDialog` (mandatory justification textarea) | — | ⏳ Del 15 (nödöppningsflöde) |

---

## 6. Interaktioner och beteende

### 6.1 Tweaks‑panel

Mockupen har en tweaks‑panel (längst ner till höger) som ändrar UI‑kromet globalt. Tre boolean/enum:

- **`emergencyMode`** (bool) — applicerar `.emergency-mode` på root. Topbar blir röd, amber banner visar "NÖDÖPPNING AKTIV — utökad åtkomst loggas". När den aktiveras via topbar‑knappen "Nödöppning" öppnas en modal med obligatorisk motivering.
- **`offlineMode`** (bool) — applicerar `.offline-mode`. Amber‑tintad krom, "Edge cache aktiv"‑indikator i statusbar, PatientBanner visar offline‑badge.
- **`pdlContext`** (enum: `su-akut`, `narhalsan-centrum`, `ortopedi`) — styr vilken vårdkontext användaren agerar under. Påverkar vad som är synligt och vad som kräver nödöppning.

**I produktion:**

- `emergencyMode` triggas via UI‑knapp → POST `AuditEvent` med `purposeOfUse = BTG` (break‑the‑glass) **innan** datan låses upp. Motiveringstexten sparas i audit‑posten.
- `offlineMode` sätts av edge‑runtime (automatiskt via offline‑detector), inte manuellt. Bara banner:n exponeras i UI.
- `pdlContext` väljs via user profile / OIDC‑claim, inte via tweaks‑panel. Tweaks‑panelen är en **demo‑fixtur**.

### 6.2 Navigation

- Sidebar nav‑items: klick → `setView(id)`. Aktiv: navy bakgrund + teal 3px vänsterborder.
- Patient‑overview‑tabs: klick → `setTab(id)`. Aktiv: teal underline.
- Back links: klick → `setView('search')`.

Implementeras med `react-router-dom` + `NavLink` (har inbyggt aktivt‑state). Tailwind‑klasser för aktiv‑state sätts via `className={({ isActive }) => …}`.

### 6.3 Animationer

Alla definierade i `styles.css`. Portera till Tailwind via `theme.extend.keyframes`:

- `cds-pulse` 2s ease‑in‑out infinite (opacity 1 → 0.4) — kritiska CDS‑kort.
- `pulseRing` 1.8s infinite (scale + opacity) — offline‑nod i topologi.
- `flow` 1.6s linear infinite (stroke‑dashoffset) — flödeslinjer i topologi.

**Inga andra transitions** — state‑ändringar ska vara omedelbara. Hoverstate har 120 ms färgövergång (standard Tailwind `transition-colors`); allt annat är `instant`.

---

## 7. Statemodell

Mockupens `App`‑komponent håller top‑level state:

- `view` (string, default `'search'`) — aktiv route. I vår kod: `react-router-dom`‑location.
- `patient` (object | null) — vald patient. I vår kod: URL‑param + `useQuery(['patient', id])`.
- `recent` (string[]) — senast besökta patient‑IDs, persisteras till `localStorage`. I vår kod: samma mönster, via `useLocalStorage`‑hook.
- `tweaks` (object) — tweaks‑panel‑värden. I vår kod: endast i demo‑miljö.
- `tweaksVisible` (bool) — togglar panel. Demo‑bara.
- `emergencyDialogOpen` (bool) — nödöppningsmodal. I vår kod: dedicated `<EmergencyDialog>` + React Context.

**Datafetch:** `@tanstack/react-query` för alla FHIR‑anrop. Cache‑nyckel: `['patient', id]`, `['observations', patientId]` etc. `staleTime: 30_000`, `refetchOnWindowFocus: false` (klinisk data ändras inte medan man stirrar på skärmen).

Varje admin/patient sub‑page hanterar egen filter/selection‑state lokalt (`useState`).

---

## 8. Från mockup till produktion

Mockupen använder `window.PATIENTS` + `window.SOURCE_LABELS`. Produktionen ersätter varje `data.js`‑referens med ett FHIR‑anrop:

| Mockup | Produktion |
|---|---|
| `PATIENTS[0].allergies` | `GET /fhir/r4/AllergyIntolerance?patient=Patient/{id}` |
| `PATIENTS[0].medications` | `GET /fhir/r4/MedicationStatement?patient=Patient/{id}` |
| `PATIENTS[0].procedures` | `GET /fhir/r4/Procedure?patient=Patient/{id}` |
| `PATIENTS[0].timeline` | `GET /fhir/r4/Patient/{id}/$everything` + sortera på `occurredAt` |
| `PATIENTS[0].cdsAlerts` | `POST /cds-services/core-anticoagulation` + `core-implant-alert` + `core-dvt-risk`, merge cards |
| `SOURCE_LABELS` | Config‑modul `services/dashboard/src/lib/source-labels.ts` |
| `emergencyDialogSubmit()` | `POST /fhir/r4/AuditEvent` med `purposeOfUse = BTG` → svaret låser upp data |

**Accessibility** — mockupen är inte fullt tillgänglig. Produktion måste ha:

- Proper ARIA‑roles på alla interaktiva element.
- Keyboard nav: Tab‑order, Enter för aktivering, Esc för modal.
- Skärmläsarstöd: `aria-label` på ikoner, `aria-live` på CDS‑stack när nya kort läggs till.
- Focus‑ring: teal 2px, synligt (inte `outline: none`).

---

## 9. Typografi för klinisk säkerhet

Ett separat avsnitt eftersom detta är **patientsäkerhetskritiskt**:

- **Alla numeriska värden** i tabeller ska ha `.tnum` (tabular‑nums) — annars linjerar inte `INR 2.8` med `INR 12.4` och läkaren kan missa en decimalplats.
- **Enheter** (`mg`, `mmol/L`, `bpm`) ska alltid stå kvar — aldrig trimmas för "snyggare" layout.
- **Personnummer** skrivs alltid `YYYYMMDD-XXXX` (13 tecken med bindestreck), monospace.
- **Datum** i tabellformat: `YYYY-MM-DD` (ISO), aldrig lokaliserat `2025‑mars‑15`.
- **Decimaltecken**: komma i svenska UI (`INR 2,8`), punkt i logg / URL / API (`"value":2.8`).

Dessa regler är inbakade i `components/` — bryt dem inte för design‑konsekvens.

---

## 10. Källsystemsbadges

`SOURCE_LABELS` i `data.js` mappar källsystem till etikett + färg. Ska flyttas till `services/dashboard/src/lib/source-labels.ts`:

```typescript
export const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  'melior-su':   { label: 'Melior SU',   color: 'teal' },
  'melior-nu':   { label: 'Melior NU',   color: 'teal' },
  'asynja':      { label: 'Närhälsan',   color: 'navy' },
  'flexlab':     { label: 'FlexLab',     color: 'amber' },
  'klinisk-portal': { label: 'Klin. Portal', color: 'ink-2' },
  'edge-su':     { label: 'Edge SU (lokal)', color: 'green' },
};
```

`<SourceBadge source="melior-su" />` renderar en liten chip (3px radius, 11px label, färg per system).

I distribuerat läge (Del 15) lägger patientöversikten till en extra indikator: **"Serverad från: Edge SU (lokal)"** när `FHIR_MODE=replica` — se mockupens offline‑state.

---

## 11. Att inte bryta

Mockupen definierar designen; det här listar vad du inte får bryta mot utan ett medvetet beslut:

- **Inga gradients, inga skuggor på cards.** Flat, 1px border.
- **Inga dekorativa ikoner.** Varje ikon ska ha funktion — annars bort.
- **Inga ljudeffekter eller modala popups vid vanliga interaktioner.** Bara nödöppning + allvarliga fel får modal.
- **Inga toasts som försvinner.** Fel ska stanna kvar tills dismissade.
- **Ingen mörkt tema i v1.** Alla färg‑token är kalibrerade för ljus bakgrund.
- **Ingen egen komponent där `html5 <table>`/`<form>` gör jobbet.** Klinisk data tabelleras — inte virtuella rullande kort.

---

## 12. Referenser

- `design_handoff/README.md` — den definitiva handoff‑texten från designern.
- `design_handoff/Nimloth Core.html` — öppna i webbläsaren för live‑referens.
- `design_handoff/styles.css` — alla CSS‑variabler och komponentstilar.
- `design_handoff/source_archive/` — arkiverade React‑källor (strukturreferens).
- [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) — bakomliggande arkitektur som matar UI:t med data.
- [`docs/SCENARIO.md`](SCENARIO.md) — Fru Andersson i UI‑kontext.
