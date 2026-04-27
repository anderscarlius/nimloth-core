# Prompt-signering

Prompts är kod. När en LLM-baserad tjänst styr produktionsbeslut — som mapping-assistant gör genom att föreslå transformer-kod — måste prompternas integritet vara verifierbar. En prompt-fil som kan ändras tyst utan revision är en attack-vektor.

I Sprint 2 inför vi en lättviktig signed-manifest-modell. Sprint 5 uppgraderar till kryptografisk signering om VGR:s säkerhetskrav kräver det.

## Hotmodell

Vad försvarar vi mot:

1. **Otillåtna ändringar i prompts** — en angripare med write-access till repot ändrar `propose-mapping.md` så att modellen genererar mappers med insmugna data-läckage.
2. **Smyg-tillagda prompts** — angriparen lägger till `evil-prompt.md` i prompts-mappen och anropar den via en bakdörr.
3. **Bytt prompt under runtime** — image-byggaren manipulerar dist/prompts/ efter att build-fasen körts.
4. **Spårbarhet vid incident** — vid post-mortem måste vi kunna säga *exakt vilken* prompt-version som genererade ett specifikt förslag.

## Modell

Tre lager:

### 1. Manifest med SHA256 (Sprint 2 — implementerat)

`services/mapping-assistant/prompts/manifest.json`:

```json
{
  "version": "1.0.0",
  "approver": "anders.carlius@northfactor.com",
  "approvedAt": "2026-04-27T00:00:00Z",
  "templates": [
    {
      "name": "propose-mapping",
      "file": "propose-mapping.md",
      "sha256": "7d9a20fc...",
      "task": "mapping.propose",
      "sensitivity": "schema-only"
    }
  ]
}
```

Vid varje service-startup:

1. Läs manifestet, beräkna SHA256.
2. För varje deklarerad template: läs filen, jämför SHA256 mot manifest.
3. Skanna prompts-mappen för `*.md`-filer som **inte** finns i manifestet (rogue templates).
4. Logga resultatet i `template_verifications`-tabellen (SQLite).
5. Om `REQUIRE_VALID_PROMPTS=true` (default) och något misslyckas: **vägra starta**.

Detta täcker hot 1, 2 och delvis 3. En angripare med build-access kan fortfarande publicera ett nytt manifest med matchande hashar för manipulerade filer.

### 2. Promptproveniens i audit-event (Sprint 2 — implementerat)

Varje `/propose`-anrop persisterar i `suggestions`-tabellen:

- `template_name` — vilken prompt-template användes
- `template_sha` — SHA256 från manifestet
- `prompt_hash` — SHA256(systemPrompt + '\n---\n' + filledUserPrompt) från router

Detta innebär att även om manifestet senare ändras, kan vi för ett specifikt förslag säga: "den här mappparen genererades av template X version Y med variabler som hashades till Z". Spårbarheten är immutable.

### 3. Kryptografisk signering (Sprint 5 — planerat)

Två varianter beroende på VGR:s säkerhetskrav:

**Lätt variant — detached GPG-signatur:**

```
prompts/
  manifest.json
  manifest.json.sig    # GPG detached signature
  propose-mapping.md
  ...
```

Tjänsten verifierar `manifest.json.sig` mot en publik nyckel som är inbakad i image:n eller mountad som secret. `REQUIRE_SIGNED_PROMPTS=true` tvingar verifiering.

**Tung variant — Sigstore/cosign:**

Manifestet signeras med Sigstore OIDC-baserade signaturer. Verifierar att approver är en av en känd grupp (t.ex. `*@northfactor.com` med MFA). Mer overhead men eliminerar nyckeldistribution.

## Att uppdatera en prompt

Workflow för utvecklare som vill ändra en prompt:

1. Editera `propose-mapping.md`.
2. Beräkna ny SHA256: `shasum -a 256 propose-mapping.md`.
3. Uppdatera `manifest.json` med ny SHA + `approvedAt`-timestamp.
4. Skicka PR. Granskning är obligatorisk eftersom manifestet ändras.
5. CI verifierar att alla manifest-SHA matchar filerna (separat check från service-startup).

Att glömma steg 2-3 betyder att tjänsten vägrar starta efter merge — felet upptäcks omedelbart i staging.

## Operativa flöden

**Vid template_verification_failed:**

- Service vägrar starta (default). Containern restartar i loop tills antingen manifestet eller filerna fixas.
- Status-endpointen visar vilka filer som hade fel SHA.
- I Sprint 4+ planeras alert-publish till `core.system.alerts` så incident upptäcks i dashboard innan service-restart-loopen är uppenbar.

**Vid godkänt förslag:**

`POST /suggestions/:id/approve` skriver audit-event till `core.audit.mapping` med:
- `template_name`, `template_sha` — vilken prompt-template
- `prompt_hash` — exakt prompt-instans (efter variable substitution)
- `approver_hsa_id`, `approver_role` — vem godkände

Hela kedjan är granskbar: från template-version → exakt prompt → genererad kod → godkännare → produktionsmerge.

## Beslut: ingen signering i Sprint 2

Vi medvetet håller signering enklare än Sigstore i Sprint 2. Skälet är att signed manifest + audit-proveniens täcker majoriteten av hotmodellen, och att kryptografisk signering kräver en publik-nyckel-distributionsstrategi som hänger på Sprint 3-arbetet med HSA/SITHS-integration. Lägga in det nu hade varit för tidigt.
