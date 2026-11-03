# Zakázky radar

Stáhne otevřené české veřejné zakázky z bezplatných zdrojů a AI (Claude) ohodnotí 0–100,
jak sedí na moji nabídku (Kotva CRM, vzdělávací portál…). Výsledky si označím: Zajímavé / Podám / Ne.

## Zdroje dat (zdarma)
| Zdroj | Co pokrývá | Klíč |
|---|---|---|
| TED (EU) – api.ted.europa.eu | nadlimitní zakázky (cca od 3–5 mil. Kč) | není potřeba |
| Hlídač státu – hlidacstatu.cz/api | i podlimitní zakázky z profilů zadavatelů | token zdarma po registraci |

## Spuštění lokálně
```bash
cp .env.example .env.local   # doplnit ANTHROPIC_API_KEY, volitelně HLIDAC_TOKEN, APP_PASSWORD
npm install
npm run dev                  # http://localhost:3000
```

## Vercel
Importovat repo, nastavit proměnné z `.env.example` (APP_PASSWORD doporučeno), Deploy.
