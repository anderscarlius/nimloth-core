# Handoff: Nimloth Core — Regional Clinical Data Viewer

## Overview

This is a design prototype for **Nimloth Core**, a regional FHIR-based clinical data viewer for Västra Götalandsregionen (VGR). It aggregates patient data from multiple source systems (Melior, Cosmic, Asynja Visph, FlexLab, Klinisk Portal) via Kafka + CDC and exposes a unified patient overview plus operational monitoring dashboards.

The prototype covers three audiences:
- **Clinicians** — patient overview, CDS warnings, medications, labs, procedures
- **IT operations** — Kafka topics, CDC connectors, edge-node topology, data quality
- **Compliance (PDL)** — access log, justification for emergency access ("nödöppning")

## About the Design Files

The files in this bundle are **design references created in HTML** — prototypes showing intended look and behavior, not production code to copy directly. The task is to **recreate these HTML designs in the target codebase's existing environment** (React/TypeScript with a real FHIR backend, most likely) using its established patterns and libraries. If no environment exists yet, React + TypeScript + a lightweight CSS approach (CSS Modules or Tailwind) is recommended.

All Swedish UI text should be preserved. The visual direction is deliberately sober ("nordisk offentlig stil") — white backgrounds, thin 1px borders, no decorative shadows, minimal color.

## Fidelity

**High-fidelity (hifi)** — pixel-perfect mockups with final colors, typography, spacing, and interactions. The developer should recreate the UI pixel-perfectly. Data is mock; all interaction behavior is specified below.

## Screens / Views

### 1. Patient search (`view = 'search'`)
- **Purpose**: Entry point. Search by personnummer or name, or pick from recent.
- **Layout**: Centered search field (max-width ~720px), list of recent patient chips below, then result rows.
- **Result row**: Avatar initials (circle, navy bg, white text) · name · personnummer (mono font) · listed care unit · chevron on hover.
- **Interaction**: Click row → `setView('patient')` with selected patient.

### 2. Patient overview (`view = 'patient'`)
- **Purpose**: Clinical overview for a chosen patient.
- **Layout** (top to bottom):
  1. **Back link** ("← Tillbaka till sökning")
  2. **PatientBanner**: avatar (initials) · name · personnummer · age/sex · listed VC · care relation status · offline badge if offline mode on
  3. **AllergyCard**: red-tinted card listing allergies with severity (Allvarlig/Måttlig). If no known allergies, a muted "Inga kända allergier" card.
  4. **CdsStack**: vertically stacked CDS cards, sorted critical → warning → info. Critical cards have a pulsing red dot.
  5. **Tab bar**: Tidslinje · Läkemedel · Labb · Ingrepp · Diagnoser · Vitala · Vårdkontakter
  6. **Tab body** (scrolls within main content area)

### 3. Patient tabs
- **Tidslinje** — chronological events (visit/procedure/med/lab/note) with type filter chips. Icon + date + source-badge per event.
- **Läkemedel** — table of active medications. Warfarin row highlighted + INR sub-row with latest value + trend.
- **Labb** — grouped lab results (Hematologi, Kemi, Koagulation). Each row: name · latest value · unit · reference · sparkline · flag (H/L/!).
- **Ingrepp** — procedure cards. Hip replacement card shows prominent implant block: manufacturer, model, LOT, serial, implantation date.
- **Diagnoser** — ICD-10 table with status (Aktiv/Läkt), tag (primär/bidiagnos/komplikation), linked diagnoses (DVT → hip replacement).
- **Vitala** — KPI cards (BT, puls, temp, SpO₂, vikt, BMI) + SVG trend chart (120-day window, BP sys/dia/pulse).
- **Vårdkontakter** — list of encounters: slutenvård/öppenvård/akut/dagsjukvård with source badge.

### 4. Systemstatus (`view = 'system'`)
- 4 KPI cards: CDC-lag (s), FHIR p95 (ms), events/s, uptime %
- Kafka topics table: topic · messages · consumer lag · throughput · status dot
- CDC-connectors table: connector · status badge · source · tasks · latency · last event
- Last errors table (ts · source · level · msg)

### 5. Topologi (`view = 'topology'`)
- Stylized SVG map of Västra Götaland (860×560 viewBox) showing 6 edge nodes + central hub
- Animated dashed lines between hub and each node (stroke-dasharray 4,8, animation `flow 1.6s linear infinite`)
- Offline node (Frölunda) has pulsing red ring (`pulseRing 1.8s infinite`)
- Right sidebar with selected-node details (lag, uptime, CDC events, buffered, FHIR-cache stats)
- Click any node → update sidebar

### 6. Datakvalitet (`view = 'quality'`)
- 4 KPI cards (completeness, duplicates, schema errors, resolution rate)
- Bar chart by error type (11 types, horizontal bars)
- Per-source trend line charts (8-day window, small SVG sparklines)

### 7. Åtkomstlogg (`view = 'audit'`)
- Filter bar: search fields (personnummer, HSA-ID, date range) + chip filters (Alla/Success/Nekade/Nödöppningar)
- Table: ts · user + HSA-ID · role · action · resource · patient · unit · purpose · outcome badge
- Emergency rows: amber background + sub-row with justification ("⚠ Motivering: ...")
- Denied rows: red-tinted background + sub-row with reason ("↳ Anledning: ...")

### 8. Inställningar (`view = 'settings'`)
- PDL-context selector (SU Akuten / Närhälsan / Ortopedi)
- Display toggles (show source badges, compact density, etc.)
- Edge config (offline tolerance, replay policy)

## Interactions & Behavior

### Tweaks panel (bottom-right, toggled via toolbar)
Three boolean/enum tweaks that change UI chrome globally:

- **emergencyMode** (bool) — applies `.emergency-mode` class to root. Topbar turns red, amber banner appears ("NÖDÖPPNING AKTIV — utökad åtkomst loggas"). Also opens a modal with mandatory justification textarea when triggered via topbar "Nödöppning" button.
- **offlineMode** (bool) — applies `.offline-mode` class. Amber-tinted chrome, "Edge cache aktiv" indicator in statusbar. PatientBanner shows offline badge.
- **pdlContext** (enum: `su-akut`, `narhalsan-centrum`, `ortopedi`) — selects which care context the current user is acting under. Affects what is visible and what actions require emergency access.

Tweaks protocol (postMessage to parent): listen for `__activate_edit_mode` / `__deactivate_edit_mode`, post `__edit_mode_available` on load, post `__edit_mode_set_keys` with `{edits: {...}}` on change. Defaults are wrapped in `/*EDITMODE-BEGIN*/{...}/*EDITMODE-END*/` JSON block for host persistence.

### Navigation
- Sidebar nav-items: click → `setView(id)`. Active item: navy background + teal 3px left border.
- Patient overview tabs: click → `setTab(id)`. Active tab: teal underline.
- Back links: click → `setView('search')`.

### Animations / transitions
- Critical CDS dot: `cds-pulse` 2s ease-in-out infinite (opacity 1 → 0.4)
- Offline-node ring: `pulseRing` 1.8s infinite (scale + opacity)
- Topology flow lines: `flow` 1.6s linear infinite (stroke-dashoffset)
- All other state changes: instant (no decorative transitions).

## State Management

Single App component holds top-level state:
- `view` (string, default `'search'`) — active route
- `patient` (object | null) — selected patient
- `recent` (string[]) — recently viewed patient IDs, persisted to localStorage
- `tweaks` (object) — tweaks panel values
- `tweaksVisible` (bool)
- `emergencyDialogOpen` (bool)

Each admin/patient sub-page manages its own filter/selection state locally (useState).

No data fetching — all data is static in `data.js` (mock). In production, each page fetches from a FHIR endpoint.

## Design Tokens

### Colors
```
--navy:        #1a2332   /* sidebar bg, primary text-on-light */
--navy-2:      #233044   /* hover/active nav */
--ink:         #1a2332   /* body text */
--ink-2:       #4a5568   /* secondary text */
--ink-3:       #8b95a5   /* meta/muted */
--line:        #e4e7eb   /* borders (1px) */
--line-2:      #eef0f3   /* subtle dividers */
--surface:     #fafbfc   /* page bg */
--surface-2:   #ffffff   /* card bg */
--teal:        #0D7377   /* primary accent, active/link */
--teal-soft:   #e6f2f3   /* teal-tinted bg */
--amber:       #B8860B   /* warnings, offline */
--amber-soft:  #fdf6e3
--red:         #B8322C   /* critical, denied, emergency */
--red-soft:    #fbeceb
--green:       #2F7D4E   /* success, healthy */
--green-soft:  #e8f3ec
```

### Typography
- Body: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
- Mono (for IDs, timestamps, codes): `"JetBrains Mono", "SF Mono", Consolas, monospace`
- `.tnum` utility: `font-variant-numeric: tabular-nums`
- Base size: 14px body, 13px table, 12px meta, 11px labels (uppercase + letter-spacing)
- Weights: 400 body, 500 semi-emphasis, 600 headings

### Spacing
- 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 (px)

### Border radius
- 3px (small — inputs, chips, most cards)
- 6px (buttons)
- 50% (avatars, status dots)

### Shadows
- None on cards (flat, 1px border only)
- Modal overlay: `rgba(0,0,0,0.35)` backdrop, card has `0 12px 40px rgba(0,0,0,0.18)`

## Assets

No external image assets. All icons are inline SVG with 1.75 stroke width (Feather-style, hand-drawn in `components.jsx` `Icon` component). The VGR map is a stylized SVG `<path>` in `admin.jsx` → `TopologyPage`.

## Files

- `Nimloth Core.html` — main entry point with all logic inlined in one `<script type="text/babel">` block
- `data.js` — mock data for patients and source labels (admin data was moved inline into HTML)
- `styles.css` — all styling
- `components.jsx`, `patient.jsx`, `admin.jsx` — **archived source** of the inlined React components; read these for component structure. The HTML file already has everything inlined.

## Tech Notes for Implementation

- Real system should use React Query + a FHIR TypeScript client (e.g. `@medplum/fhirtypes` or generated from CapabilityStatement).
- `window.SOURCE_LABELS` maps source-system IDs to display names + colors — move to a config module.
- CDS stack should be driven by a CDS-Hooks service, not hardcoded.
- Emergency-access flow must POST an AuditEvent resource with `purposeOfUse = BTG` (break-the-glass) before unlocking the data.
- Accessibility: all interactive elements need proper ARIA roles + keyboard nav (Tab, Enter, Esc for modal). Not fully implemented in the prototype.
