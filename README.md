# Zakázky radar

Stáhne české veřejné zakázky z bezplatných zdrojů a AI (Claude) ohodnotí 0–100,
jak sedí na moji nabídku (Kotva CRM, vzdělávací portál…).

## Záložky
- **Otevřené zakázky** – výzvy, do kterých lze podat nabídku; označím Zajímavé / Podám / Ne.
- **Připravované** – předběžná oznámení (PIN) a předběžné tržní konzultace: šance mluvit se zadavatelem dřív.
- **Průzkum trhu** – kdo a za kolik vyhrál podobné zakázky (medián ceny, rozpětí, nejčastější vítězové).
- **Hlídání e-mailem** – každé ráno nové vhodné zakázky (skóre 75+) e-mailem, bez duplicit.

## Zdroje dat (zdarma)
| Zdroj | Co pokrývá | Klíč |
|---|---|---|
| TED (EU) – api.ted.europa.eu | nadlimitní zakázky (cca od 3–5 mil. Kč) + výsledky | není potřeba |
| Hlídač státu – hlidacstatu.cz/api | i podlimitní zakázky z profilů zadavatelů | token zdarma po registraci |

## Nastavení na Vercelu (Settings → Environment Variables)
| Proměnná | K čemu | Povinné |
|---|---|---|
| `ANTHROPIC_API_KEY` | AI hodnocení | ano |
| `APP_PASSWORD` | heslo do aplikace | doporučeno |
| `HLIDAC_TOKEN` | podlimitní zakázky | ne |
| `CRON_SECRET` | ranní spouštění (libovolný dlouhý řetězec) | pro e-maily |
| `RESEND_API_KEY`, `ALERT_EMAIL` | odesílání e-mailu (resend.com, zdarma) | pro e-maily |
| Upstash Redis | Vercel → Storage → Upstash → Connect (nastaví `KV_REST_API_*` sám) | pro databázi |

Cron běží denně v 5:00 UTC (`vercel.json`). Bez databáze hlídá výchozí profily Kotva CRM a Vzdělávací portál.

## Lokálně
```bash
cp .env.example .env.local
npm install
npm run dev
```
