---
name: verify
description: Vérifier une modification de Maïda en conditions réelles (serveurs dev + parcours navigateur headless)
---

# Vérifier Maïda de bout en bout

## Lancer l'app

```bash
cd apps/api && npm run dev     # API sur :3001 (tsx watch, DB Neon branche Dev via .env)
cd apps/web && npm run dev     # Vite sur :5173 (proxy /api → :3001)
# Santé : curl localhost:3001/health et localhost:5173/api/auth/etablissements
```

## Piloter le parcours

Puppeteer n'est PAS dans le repo : installer `puppeteer-core` dans le scratchpad
et utiliser le Chrome local (`C:/Program Files/Google/Chrome/Application/chrome.exe`,
`headless: 'new'`). Ne pas utiliser l'extension claude-in-chrome : l'injection de
script échoue (timeouts) même sur localhost.

- Login caisse : aller sur `/caisse`, cliquer les chiffres du PIN (démo : 1234 =
  Sofiane, droits ANNULER/CLOTURER/REMISER). Sélectionner l'établissement par le
  texte « Bon Grill », jamais par position.
- Plan de salle : boutons `button.absolute` ; une table libre a la classe
  `bg-white`, une occupée `bg-brand-100`. Toucher une table occupée avec panier
  vide ouvre l'écran de gestion de commande.
- Cliquer un élément par texte : filtrer `document.querySelectorAll('button')`
  sur `textContent` en EXCLUANT les conteneurs (`!b.querySelector('button')`).

## Pièges connus

- `innerText` subit `text-transform: uppercase` (libellés « Suite 1 »,
  « Ajout à envoyer en cuisine » → MAJUSCULES). Tester avec `textContent`
  ou en majuscules.
- Le drag HTML5 n'est pas simulable simplement : tester le déplacement de
  suite par le chemin tactile (clic chip → clic zone).
- Les tests vitest et le seed écrivent dans la branche Neon Dev (partagée avec
  le dev local) — jamais dans la prod. Le parcours E2E laisse des commandes de
  test dans la démo Dev : sans gravité.
