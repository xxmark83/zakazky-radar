#!/bin/bash
# Vercel "Ignored Build Step": exit 0 = build se přeskočí, exit 1 = build proběhne.
# - náhledy (jiné větve než main) se nestaví
# - změna kódu se staví vždy
# - když se změnila jen data/ (sběr z Macu každé 3 h, GitHub Actions), staví se nejvýš zhruba
#   jednou za 5 hodin; přeskočená data přijdou s dalším buildem, který nasadí celý aktuální stav
# Když nejde zjistit předchozí nasazení, build proběhne (raději navíc než stará data).
if [ "$VERCEL_ENV" != "production" ]; then echo "náhled: přeskočeno"; exit 0; fi
PREV="$VERCEL_GIT_PREVIOUS_SHA"
[ -z "$PREV" ] && exit 1
CHANGED=$(git diff --name-only "$PREV" HEAD 2>/dev/null) || exit 1
[ -z "$CHANGED" ] && exit 1
if echo "$CHANGED" | grep -qvE '^data/|\.md$'; then echo "změna kódu: build"; exit 1; fi
LAST=$(git log -1 --format=%ct "$PREV" 2>/dev/null) || exit 1
AGE=$(( $(date +%s) - LAST ))
if [ "$AGE" -lt 18000 ]; then echo "jen data, poslední nasazení před $((AGE / 60)) min: přeskočeno"; exit 0; fi
echo "jen data, poslední nasazení před $((AGE / 60)) min: build"; exit 1
