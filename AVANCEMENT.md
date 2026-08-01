# Maïda — État d'avancement

> Le point de vente pensé pour la restauration algérienne.
> Site : https://maida-production-4f05.up.railway.app · Mis à jour à chaque session de travail.

## ✅ Livré et en production

### Cœur du service (caisse)

- **Écran Tables** : un seul écran pour tout le service. Le plan de salle porte le montant en
  cours et les tables « à réclamer » ; on touche une table et le panneau de droite bascule entre
  **Commande** (menu, suites, rajouts, annulation, envoi en cuisine) et **Addition** (détail
  facturable, remise / offert, ticket client, encaissement) — sans jamais changer d'onglet
- **Encaissement** : total, partiel, par article, par pourcentage ; moyens de paiement
  configurables ; monnaie rendue ; ventes à emporter encaissées depuis la même fiche
- **Journée de caisse** : ouverture avec fond de caisse, clôture avec comptage des espèces et
  écart, verrouillage
- **Annulations tracées** : par commande ou par article, motif obligatoire, droit par serveur ou
  validation code gérant ; le serveur déclare si **la cuisine avait déjà préparé** — cette case
  décide de la perte sèche au rapport et du retour au stock
- **Remises & offerts** : % ou montant, article offert, motifs, droit REMISER, tout tracé
- **Réservations** : prise au téléphone, anti-conflit de créneau, badge sur le plan de salle,
  arrivée / annulation / no-show — **prise possible sans réseau** (le plan de salle vient du
  cache, la réservation attend dans la file et part à la reconnexion)
- **Ruptures & quantités** : marquer un article « en rupture » en un geste (grisé à la caisse,
  masqué au menu QR), ou suivre une quantité par service qui se décompte à chaque envoi et passe
  en rupture à zéro — la quantité revient au stock si on annule avant préparation ; géré depuis le
  Menu (gérant) ou la caisse (serveur avec le droit **Gérer le stock**)
- **Tickets d'impression** (thermique 80 mm) : ticket cuisine et ticket client avec TVA et
  remises ; le bon cuisine encadre chaque service (« SUITE 1 · À PRÉPARER » / « SUITE 2 ·
  À SUIVRE — ATTENDRE LA RÉCLAME ») et chaque réclame imprime un **bon de réclame** dédié
  (« RÉCLAME — TABLE N — SUITE 2 · À PRÉPARER MAINTENANT » avec les articles à lancer)
- **Impression directe, sans fenêtre à valider** : l'imprimante USB est désignée une fois
  (onglet Journée), puis les tickets sortent seuls et le papier est coupé automatiquement.
  Tout se dégrade proprement — imprimante éteinte, câble débranché, navigateur incompatible :
  on retombe sur l'impression du navigateur, le ticket sort quoi qu'il arrive.
  Guide matériel dans `IMPRESSION.md`
- **QR code à table** : menu public consultable par le client sur son téléphone (sans connexion),
  QR par table et planche imprimable dans l'espace gérant — **module optionnel par compte client**,
  comme le food cost
- **Commande par le client** depuis le QR : panier sur téléphone, options, note — la demande
  arrive à la caisse et un serveur la valide avant l'envoi en cuisine (anti-abus) ; activable
  par chaque gérant
- **Suites de service** : entrée / plat / dessert hérités des catégories (commandes caisse et
  QR client), cuisine par suites avec « en attente de réclame », réclame **par table**,
  correction d'un article par glisser-déposer ou toucher-toucher (tablette) — les **ventes à
  emporter** partent d'un bloc, sans suite ni réclame
- **Fiche table unifiée** (style Lightspeed) : tout se passe dans un seul cadre par table —
  articles déjà en cuisine groupés par suite, rajout rapide (« un 2e Hamoud »), nouveaux
  articles du menu, annulation, réclame — un seul bouton « Envoyer en cuisine », un seul
  ticket ; les commandes ajoutées héritent de la progression des suites de la table ; et le
  volet « Addition » solde la table sur place, une fois payée elle se libère sur le plan
- **« À suivre » à la saisie** : le serveur tape toute la commande d'un coup et décide
  lui-même des services — tout part dans le service en cours, le bouton « À suivre » passe
  au suivant (une entrée peut servir de plat), et un badge « Suite N » par ligne permet de
  corriger avant l'envoi ; la cuisine reçoit tout, prépare la suite 1 et attend la réclame
  pour le reste (les commandes QR des clients restent triées par catégories)

### Mode hors ligne — le différenciateur

- La caisse **continue de fonctionner sans internet** : commandes, ticket cuisine, encaissement,
  reçu client et **réservations** — **exactement au même endroit et de la même façon qu'en ligne**. Il n'y a pas de
  « mode hors ligne » à connaître : le volet « Addition » de la table affiche le même détail
  (articles, total, reste à payer) reconstruit depuis le dernier état connu, et encaisse en
  solde total, en pourcentage ou en montant libre, y compris en plusieurs fois. Seuls le
  paiement par article, la remise et le ticket détaillé — qui exigent le serveur — se
  désactivent, avec l'explication au survol
- **Coupure détectée en quelques secondes, même quand le wifi « marche »** : un réseau qui accepte
  la connexion sans jamais répondre ne trompe plus la caisse (`navigator.onLine` n'y voit rien).
  Chaque requête a un délai maximal, la première sans réponse fait basculer tout l'écran en local,
  et les actions suivantes sont immédiates — plus d'attente devant un serveur muet
- Synchronisation automatique au retour du réseau (détecté par une sonde en quelques secondes),
  **sans jamais un doublon** : la clé d'idempotence est générée avant l'envoi, donc une requête
  partie mais dont la réponse s'est perdue ne crée pas une seconde commande
- **Avertissement permanent en bas d'écran** rappelant à l'équipe qu'elle est hors ligne
  (en plus du bandeau d'en-tête), avec le nombre d'opérations en attente
- Application installable sur tablette (PWA)

### Espace gérant

- **Rapports** : CA, ticket moyen, palmarès produits, CA par catégorie / serveur / moyen de
  paiement, pertes, remises
- **Food cost & beverage cost** : coût de revient par produit, marges, taux de couverture —
  module activable par compte (option commerciale) et masquable par le gérant
- **TVA** : taux par article (19/9/0 % + libre), prix TTC, récap par taux sur le ticket,
  TVA collectée prête pour la déclaration
- **Réservations** : statistiques no-show, clients à surveiller
- **Export Excel des clôtures de caisse** (vrai fichier `.xlsx`) : une ligne par journée sur la
  période choisie — ouverture/clôture, qui a ouvert et clôturé, fond de caisse, encaissé par
  moyen de paiement, espèces attendues/comptées, écart, commentaire — avec ligne de totaux,
  montants en vrais nombres et en-tête figé : le fichier part tel quel chez le comptable
- **Export Excel des annulations et remises** (vrai fichier `.xlsx`, deux feuilles) : une ligne
  par annulation (produit, quantité, montant, perte sèche après préparation, motif, qui a annulé
  et qui a demandé) et une ligne par geste commercial (remise ou offert, pourcentage, montant,
  motif, qui l'a accordé), avec totaux — les deux postes que le comptable rapproche du CA
- **Exports CSV (ouvrables dans Excel)** : chiffre d'affaires + indicateurs de la période,
  répertoire clients (contacts récoltés aux réservations) et historique des réservations
- Menu, plan de salle, équipe et droits, moyens de paiement, historique des annulations et
  remises, journées de caisse **filtrables par période**

### Espace super-admin (éditeur)

- Comptes clients : création complète, suspension **réellement appliquée** (accès coupés
  immédiatement), modules par compte, réinitialisation de mot de passe gérant
- Activité par client (commandes 7 jours, dernière activité)
- **Journal des erreurs serveur**

### Identité visuelle

- **Charte graphique** : vert « thé à la menthe » + safran sur fond crème, motif zellige en
  filigrane de fond, polices Inter / Bricolage Grotesque / Spline Sans Mono ; tous les écrans
  pilotés par des design tokens (aucune couleur en dur), motif d'intensité réglable

### Infrastructure & qualité

- Hébergement Railway avec déploiement automatique à chaque push
- **Bases de données séparées** : production (clients) / développement (tests) — étanchéité vérifiée
- **CI GitHub Actions** : compilation, linter, **108 tests d'intégration** (API) et **12 tests
  unitaires** (front) à chaque push
- ESLint + Prettier, TypeScript strict, isolation multi-tenant testée
- Anti-brute-force sur les connexions, valeurs fiscales figées à la vente
- **Accents verrouillés de bout en bout** : un établissement nommé « Le Café Étoilé » traverse
  intact la saisie, la base, le menu QR et les tickets — vérifié par des tests dédiés

## 🔜 Prochaines étapes envisagées

- [ ] **Premier restaurant pilote** (le produit est prêt)
- [ ] Réservation en ligne par le client + email de confirmation
- [ ] Hors-ligne : paiement par article et remises
- [ ] Essayer l'impression directe sur une vraie imprimante (le code est là et testé, mais
      aucun ticket n'est encore sorti d'une machine physique)
- [ ] Rafraîchir la démo en ligne (elle date, et son adresse contient encore un « Fr?res »
      hérité de la création du projet)
- [ ] Multi-établissement pour un même compte client

## 🔗 Liens utiles

| Quoi                    | Où                                                    |
| ----------------------- | ----------------------------------------------------- |
| Site public             | https://maida-production-4f05.up.railway.app          |
| Historique du travail   | https://github.com/mouradmid/maida/commits/main       |
| CI (tests automatiques) | https://github.com/mouradmid/maida/actions            |
| Déploiements            | Railway → service maida → Deployments                 |
| Bases de données        | https://console.neon.tech (branches production / dev) |
