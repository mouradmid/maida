---
name: verify
description: Vérifier une modification de Maïda en conditions réelles (serveurs dev + parcours navigateur headless)
---

# Vérifier Maïda de bout en bout

## Lancer l'app

```bash
cd apps/api && npm run dev     # API sur :3001 (tsx watch, DB Neon branche Dev via .env)
cd apps/web && npm run dev     # Vite sur :5173 (proxy /api → :3001)
# Santé : curl localhost:3001/health, et le proxy Vite via
#   POST localhost:5173/api/auth/terminal {"code":"hydra-268"}
```

## Piloter le parcours

Puppeteer n'est PAS dans le repo : installer `puppeteer-core` dans le scratchpad
et utiliser le Chrome local (`C:/Program Files/Google/Chrome/Application/chrome.exe`,
`headless: 'new'`). Ne pas utiliser l'extension claude-in-chrome : l'injection de
script échoue (timeouts) même sur localhost.

- Login caisse : aller sur `/caisse`. Une tablette neuve (localStorage vide)
  demande d'abord le code d'installation dans `#codeTerminal` (démo :
  `HYDRA268`, la saisie est normalisée donc `hydra-268` marche aussi), puis
  mémorise le restaurant dans `localStorage['maida.terminal']`. Ensuite,
  cliquer les chiffres du PIN (démo : 1234 = Sofiane, droits
  ANNULER/CLOTURER/REMISER). Il n'y a plus de liste d'établissements.
- Login gérant : aller sur `/gerant`, remplir `input[type=email]` /
  `input[type=password]` avec `karim@lebongrill.dz` / `demo1234` (PIN de
  validation gérant : 9999). Les onglets sont des boutons dans un `<nav>`
  latéral (`NavigationGerant`) : « Rapports », « Plan de salle », « Menu »…
- Un parcours qui CHANGE le mot de passe de la démo (mot de passe oublié) doit
  finir par un reseed, sinon `demo1234` ne marche plus pour les runs suivants.
- Plan de salle (gérant) : les tables sont des `div.absolute[style*="left"]` ;
  la position en base se lit dans `style.left` / `style.top`. Le glisser-déposer
  utilise les événements POINTER, donc `page.mouse.move/down/up` fonctionne —
  passer des coordonnées FRACTIONNAIRES (`x + 40.6`), c'est ce que produit un
  écran Windows à 125 % et ça a déjà révélé un bug de persistance.
- Plan de salle (caisse) : boutons `button.absolute` ; une table libre a la classe
  `bg-card` (et NON `bg-white` : le thème sombre a chassé les couleurs en dur),
  une occupée `bg-brand-100`. Plus sûr encore : une table libre n'affiche pas de
  montant (`!textContent.includes('DA')`). Sélectionner une table affiche son
  panneau de commande unifié à droite (« Déjà envoyé » + « à envoyer », bouton
  « Envoyer en cuisine »).
- Un parcours qui envoie des commandes OCCUPE des tables. Après quelques runs il
  n'en reste plus de libre et le scénario échoue pour une raison sans rapport :
  reseeder entre deux campagnes.
- Thème sombre : `page.emulateMediaFeatures([{name:'prefers-color-scheme',
value:'dark'}])`, un contexte de navigateur par thème. Contrôler la bascule en
  lisant les tokens (`getComputedStyle(document.documentElement)
.getPropertyValue('--bg')`), pas seulement à l'œil sur la capture.
- Cliquer un élément par texte : filtrer `document.querySelectorAll('button')`
  sur `textContent` en EXCLUANT les conteneurs (`!b.querySelector('button')`).
  Prévoir une option « exact » : `includes('Offrir')` attrape l'onglet
  « Offrir des articles » AVANT le bouton de validation « Offrir », et le
  parcours part en silence dans la mauvaise branche. Et **refuser de cliquer un
  bouton désactivé** : `.click()` sur un `disabled` ne fait rien et le script
  croit avoir réussi.
- Le volet d'addition s'appelle « Addition · 2 440 DA » (le montant est dans le
  libellé) : chercher par préfixe, pas par égalité.
- Le prédicat passé à `page.evaluate` est SÉRIALISÉ : il ne peut pas appeler un
  helper défini côté Node (`() => !modalOuvert()` échoue par
  « modalOuvert is not defined »). Tout écrire dans la fonction.
- Après une coupure, l'onglet « Addition » reste brièvement désactivé le temps
  que les cibles hors ligne soient recalculées : attendre `!bouton.disabled`
  plutôt que de cliquer tout de suite.
- Un défaut de superposition (« ce badge passe par-dessus le modal ») ne se
  prouve pas à la capture : interroger `document.elementFromPoint(x, y)` au
  centre de l'élément suspect. Et pour trouver le coupable, remonter la chaîne
  des parents des DEUX éléments en notant ce qui crée un contexte d'empilement
  (`position: sticky` en crée un, même sans z-index — c'est ce qui emprisonnait
  les modals déclarés dans le panneau de droite ; ils sont depuis montés par
  portail sur `<body>` via `components/Modal.tsx`).

## Pièges connus

- `innerText` subit `text-transform: uppercase` (libellés « Suite 1 »,
  « Ajout à envoyer en cuisine » → MAJUSCULES). Tester avec `textContent`
  ou en majuscules.
- Le drag HTML5 n'est pas simulable simplement : tester le déplacement de
  suite par le chemin tactile (clic chip → clic zone). Le drag du plan de salle,
  lui, est en événements pointer et se pilote bien avec `page.mouse`.
- `page.evaluate` ne sait pas sérialiser un `DOMRect` : renvoyer des nombres
  (`rect.x + rect.width / 2`), sinon `page.mouse.move` échoue sur
  « double value expected ».
- **Scénarios à plusieurs acteurs** (gérant + éditeur + visiteur en parallèle) :
  trois pièges qui se ressemblent tous à un blocage sans message clair.
  1. Les onglets d'un même navigateur **partagent les cookies** — la connexion
     de l'éditeur écrase la session du gérant. Un `browser.createBrowserContext()`
     par acteur.
  2. `page.waitForFunction` scrute par `requestAnimationFrame`, **gelé sur un
     onglet d'arrière-plan** : l'attente ne rend jamais la main. Scruter depuis
     Node (`page.evaluate` dans une boucle avec `sleep`).
  3. `page.click(selecteur)` attend un `scrollIntoViewIfNeeded` lui aussi bâti
     sur rAF → « Runtime.callFunctionOn timed out ». Faire `page.bringToFront()`
     avant tout clic sur une page non active.
- Le triple-clic ne sélectionne PAS le contenu d'un `input[type=password]` : la
  nouvelle saisie s'ajoute à l'ancienne. Vider avec Ctrl+A avant de retaper.
- Corriger un bug ne prouve rien tant qu'on n'a pas vérifié que le parcours
  ÉCHOUE sans le correctif : remettre l'ancien code le temps d'un run.
- Les tests vitest et le seed écrivent dans la branche Neon Dev (partagée avec
  le dev local) — jamais dans la prod. Le parcours E2E laisse des commandes de
  test dans la démo Dev : sans gravité.
- En revanche `npm test` VIDE la démo locale : la suite « Frontière entre la
  démonstration et les vrais clients » appelle `purgerDonneesDemo`, qui purge
  Le Bon Grill. Relancer `npx tsx scripts/seed-demo.ts` avant tout parcours
  navigateur, sinon l'écran caisse s'ouvre sans tables ni produits.
- Le bouton de sortie s'appelle « Se déconnecter » ; l'en-tête affiche
  « Caisse » / « Espace gérant » (pas « Espace caisse »).
