#!/bin/bash
# Sběr, který musí běžet z Macu, protože servery GitHubu zdroje blokují:
# - každé 3 hodiny nové zakázky z Vhodného uveřejnění (scripts/vhodne.mjs, RSS, 30 s mezi dotazy)
# - jednou měsíčně (od 6. dne, kdy už vyšla data za minulý měsíc) výsledky řízení z ISVZ (scripts/isvz.mjs)
# Výsledky nahraje na GitHub, odkud se appka na Vercelu sama nasadí.
# Spouští ho launchd: ~/Library/LaunchAgents/cz.xxmark83.zakazky-radar.plist (každé 3 h, jen když Mac běží).
# Vypnutí: launchctl bootout gui/$(id -u)/cz.xxmark83.zakazky-radar
set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin"

# dva běhy najednou ne (předchozí může ještě doplňovat detaily)
LOCK="/tmp/zakazky-radar-sync.lock"
mkdir "$LOCK" 2>/dev/null || { echo "$(date '+%F %T') předchozí běh ještě nedoběhl"; exit 0; }
trap 'rmdir "$LOCK"' EXIT

echo "=== $(date '+%F %T') začátek"
git pull --rebase --autostash -q || { echo "git pull selhal"; exit 1; }

# požadavek z appky „Stáhnout všechno znovu“ (data/refresh-request.json): celé Vhodné uveřejnění za 35 dní
# a ISVZ za poslední 3 měsíce; vyřízení se zapíše do data/refresh-done.json (appka podle toho ukazuje stav)
REQ_ID=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("data/refresh-request.json","utf8")).id||"")}catch{console.log("")}')
DONE_ID=$(node -e 'try{console.log(JSON.parse(require("fs").readFileSync("data/refresh-done.json","utf8")).id||"")}catch{console.log("")}')
REFRESH="ne"
[ -n "$REQ_ID" ] && [ "$REQ_ID" != "$DONE_ID" ] && REFRESH="ano"

if [ "$REFRESH" = "ano" ]; then
  echo "požadavek na celé stažení ($REQ_ID)"
  FULL=1 BUDGET_MIN=150 node scripts/vhodne.mjs
else
  BUDGET_MIN=40 node scripts/vhodne.mjs
fi
FILES="data/vhodne.json"

# ISVZ: chybí-li minulý měsíc a je aspoň 6. den v měsíci
NEED=$(node -e '
const d = JSON.parse(require("fs").readFileSync("data/isvz-vysledky.json", "utf8"));
const n = new Date(); const p = new Date(n.getFullYear(), n.getMonth() - 1, 1);
const want = `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, "0")}`;
console.log(n.getDate() >= 6 && !d.months.includes(want) ? "ano" : "ne");
' 2>/dev/null)
if [ "$REFRESH" = "ano" ]; then
  FROM=$(node -e 'const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-3);console.log(d.toISOString().slice(0,7))')
  TO=$(node -e 'const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);console.log(d.toISOString().slice(0,7))')
  echo "ISVZ: znovu $FROM až $TO"
  node scripts/isvz.mjs "$FROM" "$TO" && FILES="$FILES data/isvz-vysledky.json data/isvz-dns.json"
  node -e 'require("fs").writeFileSync("data/refresh-done.json", JSON.stringify({ id: process.argv[1], at: new Date().toISOString() }) + "\n")' "$REQ_ID"
  FILES="$FILES data/refresh-done.json"
elif [ "$NEED" = "ano" ]; then
  echo "ISVZ: stahuji minulý měsíc"
  node scripts/isvz.mjs && FILES="$FILES data/isvz-vysledky.json data/isvz-dns.json"
fi

git add $FILES
if ! git diff --cached --quiet; then
  git -c user.name=xxmark83 -c user.email=142055462+xxmark83@users.noreply.github.com \
    commit -q -m "Data z Macu $(date +%F): ${FILES//data\//}" -- $FILES
  git pull --rebase --autostash -q && git push -q && echo "nahráno na GitHub"
fi
echo "=== $(date '+%F %T') konec"
