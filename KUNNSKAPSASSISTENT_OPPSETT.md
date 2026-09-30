# Kunnskapsassistent — oppsett

Denne funksjonen legger til en KI-drevet spør-og-svar-assistent i to versjoner:

- **Internt**: `/assistent` (bak innlogging, i sidemenyen) — full tilgang til alt innhold.
- **Kundevendt**: `/kunde-chat` (offentlig, ingen innlogging) — kun innhold merket `customer`.

Begge bruker samme API-rute (`/api/assistent/chat`), som selv avgjør tilgangsnivå ut fra om
brukeren er innlogget eller ikke — klienten kan ikke overstyre dette.

## 1. Kjør databasemigrasjonen

Kjør `supabase/migrations/20260819_kunnskapsbase_rag.sql` mot Supabase-prosjektet ditt
(SQL Editor i Supabase Dashboard, eller `supabase db push` om du bruker Supabase CLI lokalt).

Dette oppretter:
- `kunnskapsbase_chunks` — tekstbiter + embeddings, med pgvector-indeks
- `match_kunnskapsbase(...)` — søkefunksjon (kosinus-likhet, filtrert på tilgangsnivå)
- `kunnskapsbase_sporsmalslogg` — logg over spørsmål stilt til assistenten

## 2. Skaff API-nøkler

| Nøkkel | Hvor | Til hva |
|---|---|---|
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) | Selve svargenereringen (Claude) |
| `VOYAGE_API_KEY` | [dashboard.voyageai.com](https://dashboard.voyageai.com) | Embeddings for søk (Anthropics anbefalte embedding-partner — Claude har ikke egen embeddings-API) |

Jeg har allerede lagt inn tomme plasser for disse i `.env.local` (lokalt) og `.env.example`.
Fyll inn verdiene, og legg de samme to variablene til i Vercel (Project Settings → Environment
Variables) for at det skal fungere i produksjon.

## 3. Installer nye avhengigheter

```
npm install
```

Dette henter `pdf-parse`, `mammoth`, `xlsx`, `cheerio` (dokumentlesing) og `tsx`, `dotenv`
(for å kjøre ingest-scriptet), som er lagt til i `package.json`.

## 4. Fyll kunnskapsbasen

Jeg har lagt 21 reelle Tideron-dokumenter klare i mappen `kunnskapsbase-dokumenter/` (samme
utvalg som i den første demoen), allerede katalogisert i `scripts/kunnskapsbase-katalog.json`
med riktig `audience` (internal/customer) og kategori.

Kjør:

```
npm run ingest:kunnskapsbase
```

(tilsvarer `npx tsx scripts/ingest-kunnskapsbase.ts kunnskapsbase-dokumenter`)

Dette leser hvert dokument, deler det i tekstbiter, henter embeddings fra Voyage, og lagrer i
Supabase. Ta ca. 1–2 minutter for 21 dokumenter. Kjør på nytt når du legger til/endrer
dokumenter — scriptet erstatter biter per kildedokument, så det er trygt å kjøre flere ganger.

### Legge til flere dokumenter senere

1. Legg filen i `kunnskapsbase-dokumenter/` (støtter .pdf, .docx, .xlsx, .md, .txt, .html).
2. Legg til en oppføring i `scripts/kunnskapsbase-katalog.json`:
   ```json
   "Filnavn.pdf": { "audience": "internal", "category": "okonomi" }
   ```
   Bruk `"audience": "customer"` KUN for innhold du er komfortabel med at en ekstern kunde kan
   få sitert ord for ord. Se advarselen i det tidligere anbefalingsnotatet — vurder hvert
   dokument bevisst, ikke bare basert på filnavn.
3. Kjør `npm run ingest:kunnskapsbase` på nytt.

## 5. Test

- Logg inn i appen og gå til **Kunnskapsassistent** i sidemenyen → skal ha full tilgang.
- Åpne `/kunde-chat` i en privat/inkognito-fane (ikke innlogget) → skal kun se kundetrygt innhold.
- Prøv de samme eksemplene som i den første HTML-demoen for å sammenligne kvalitet.

Før nøklene er lagt inn vil begge sidene laste fint, men vise en tydelig feilmelding om at
assistenten ikke er konfigurert ennå — appen krasjer ikke.

## 6. Ting å vurdere før `/kunde-chat` deles offentlig

- **Gå gjennom `kunnskapsbase-katalog.json` dokument for dokument.** Merkingen er gjort raskt
  av meg (Claude) — ikke kvalitetssikret av deg. Se spesielt på høringssvaret og eventuelle
  prisdetaljer.
- **Spørsmålsloggen** (`kunnskapsbase_sporsmalslogg`) lagrer alt som blir spurt om, inkludert fra
  anonyme besøkende. Vurder om dette skal vises noe sted i appen (f.eks. en enkel liste under
  Innstillinger), og hvor lenge dere vil beholde den.
- **Rate limiting** er ikke lagt inn ennå — en offentlig side som kaller en betalt API bør ha en
  enkel begrensning (f.eks. maks N spørsmål per IP per time) før den lenkes fra tideron.com.
- **Odoo-data er ikke inkludert ennå.** Dette er neste naturlige utvidelse — samme mønster som
  `api/odoo/leads/route.ts` kan brukes til å hente kunde-/lokasjonsdata inn i kunnskapsbasen.
