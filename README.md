# Nimloth Core

**Integrationsmotor för svensk sjukvård — lyfter data från befintliga källsystem till en FHIR-vy utan att ändra källorna.**

Nimloth Core är en event-driven integrationsmotor som demonstrerar hur CDC (Change Data Capture), Kafka och FHIR kan kombineras till en modern ersättning för punkt-till-punkt-integrationer mellan journalsystem. Fokus ligger på integration — inte klinisk modellering eller plattformsambitioner.

---

## Vad Nimloth Core är

- **Integrationsmotor** — lyfter data från källsystem (Melior, AsynjaVisph, Pascal, FlexLab) till en gemensam FHIR-baserad läsvy.
- **Event-driven från grunden** — Debezium CDC, Kafka som transport, transformers som översätter till domänhändelser.
- **Demobar och stabiliserad** — Fru Andersson-scenariot körs end-to-end i en komplett Docker Compose-stack.
- **PDL-korrekt** — varje läsning auditeras; headerbaserat PDL-kontrakt i PoC, Keycloak-integration som uppgraderingsväg.
- **Distribuerat läge** — edge-noder per sjukhus med lokal Kafka + FHIR-replica + offline-tolerans.

## Vad Nimloth Core inte är

- Inte en vårdplattform — ingen clinical data lifecycle, ingen openEHR, ingen komplett CDS-motor. För det finns systerprodukten [Nimloth Core](#nimloth-familjen).
- Inte ett ersättningsjournalsystem — källsystemen fortsätter leva; Flow är bara en hub.
- Inte under aktiv arkitekturell utveckling — scopet är fruset (se *Status* nedan).

---

## Snabbstart

```bash
# Single-node på laptop
./scripts/start.sh
./scripts/demo-fru-andersson.sh

# Distribuerat läge med edge-nod
./scripts/start-distributed.sh
./scripts/simulate-network-failure.sh
```

Öppna dashboard: http://localhost:3010

Fullständiga installationsanvisningar finns i [`docs/INSTALL.md`](docs/INSTALL.md).

---

## Fru Andersson — scenariot

En 74-årig kvinna med komplex medicinsk historik (artros, höftprotes, postoperativ DVT, Waran-behandling) kommer in på akuten. Data är spridd över Melior SU, AsynjaVisph på Närhälsan, och Pascal.

Nimloth Core demonstrerar: CDC från källorna → Kafka → semantisk transformation → FHIR-vy → dashboard + CDS-kort + audit. End-to-end-latens under 5 sekunder.

Detaljerad beskrivning i [`docs/SCENARIO.md`](docs/SCENARIO.md).

---

## Arkitektur i ett öga

```
┌─────────────────────────────────────────────────────────────────┐
│ Presentation     Dashboard (React) · FHIR-klienter                │
├─────────────────────────────────────────────────────────────────┤
│ Consumption      FHIR Facade R4 · CDS Hooks (3 regler) · Audit    │
├─────────────────────────────────────────────────────────────────┤
│ Canonical Store  Core Postgres (materialiserade FHIR-resurser)    │
├─────────────────────────────────────────────────────────────────┤
│ Transform        7 handkodade semantiska mappningar               │
├─────────────────────────────────────────────────────────────────┤
│ Event Bus        Kafka KRaft · domän-topics                       │
├─────────────────────────────────────────────────────────────────┤
│ Ingest           Kafka Connect · Debezium CDC                     │
├─────────────────────────────────────────────────────────────────┤
│ Sources          Melior · AsynjaVisph · FlexLab · Pascal          │
└─────────────────────────────────────────────────────────────────┘
```

Fullständig arkitektur i [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## Status: stabiliserad, skop-fryst

Nimloth Core är **inte under aktiv arkitekturell utveckling**. Scopet är medvetet begränsat till integrationsfunktionalitet. Vidareutveckling sker inom tydliga ramar:

**Vad som är välkommet:**
- Bug-fixar
- Säkerhetspatchar
- Stabilitetsförbättringar
- Dokumentationsförbättringar
- Nya källsystem-anslutningar (följ [`docs/EXTENDING.md`](docs/EXTENDING.md))
- Minor UX-förbättringar i dashboard

**Vad som avvisas (gå till Nimloth Core istället):**
- openEHR-integration eller annan kanonisk klinisk modell
- Lakehouse- eller analytiska arkitekturlager
- Modulär Inera-stack (SITHS, HSA, Sambi-federation)
- AI-assisterad mappning
- CQL- eller annan regelbaserad CDS-motor
- Ny clinical data lifecycle-funktionalitet

Se [`CONTRIBUTING.md`](CONTRIBUTING.md) för fullständiga riktlinjer.

---

## Dokumentation

| Dokument | Innehåll |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Lager-för-lager-beskrivning |
| [`docs/SCENARIO.md`](docs/SCENARIO.md) | Fru Andersson-scenariot |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Designsystem och UI-tokens |
| [`docs/EXTENDING.md`](docs/EXTENDING.md) | Anslut ett nytt källsystem |
| [`docs/INSTALL.md`](docs/INSTALL.md) | Deploy på CarliusFyra, VPS |
| [`docs/QUICKDEMO.md`](docs/QUICKDEMO.md) | 3 / 10 / 20-minuters demoguider |
| [`docs/POSITIONING.md`](docs/POSITIONING.md) | Nimloth-familjens struktur |

---

## Nimloth-familjen

Nimloth är inte en ensam produkt utan ett plattformskoncept med flera implementationer:

- **Nimloth Core** (denna repo) — integrationsmotor mellan befintliga källsystem och en FHIR-vy.
- **Nimloth Core** ([separat repo](https://github.com/anderscarlius/nimloth-core)) — full journal- och vårdplattform.

Produkterna delar arkitekturfilosofi och ursprung men utvecklas oberoende. För val mellan dem, se [`docs/POSITIONING.md`](docs/POSITIONING.md).

---

## Ursprung

Nimloth Core började som VGR Datahub-PoC:n. Vid tag `v0.1-pre-fork` döptes produkten om och en fork skapades som Nimloth Core. Sedan dess utvecklas de två produkterna oberoende.

Arkitekt och upphovsperson: Anders Carlius.

---

## Licens

Specificeras i [`LICENSE`](LICENSE).
