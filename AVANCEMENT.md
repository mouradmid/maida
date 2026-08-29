# Maïda — État d'avancement

> Le point de vente pensé pour la restauration algérienne.
> Site : https://maidapos.com · Mis à jour à chaque session de travail.

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
  cache, la réservation attend dans la file et part à la reconnexion) ; **confirmation
  automatique par e-mail** au client qui a laissé son adresse
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
  solde total, en pourcentage, en montant libre **ou article par article**, y compris en
  plusieurs fois
- **Remises et articles offerts pendant la coupure** : le geste s'applique tout de suite à
  l'écran — le reste à payer baisse, l'article part en « offert » — et il rejoint le serveur au
  retour du réseau, à l'heure où il a vraiment été accordé. Un article offert ou déjà réglé hors
  ligne ne peut pas l'être une seconde fois. Seule limite assumée : sans réseau, le code d'un
  gérant ne peut pas être vérifié (les codes ne quittent jamais le serveur), donc le geste est
  réservé aux serveurs qui en ont eux-mêmes le droit ; les autres voient l'explication au survol
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
- **Plusieurs restaurants sous la même enseigne** : un seul identifiant, un sélecteur en haut
  de l'écran, et tout l'espace suit — menu, salle, équipe, rapports, code d'installation. Chaque
  restaurant garde ses propres données ; deux appareils peuvent rester ouverts sur deux
  restaurants différents. Invisible pour les clients qui n'en ont qu'un

### Espace super-admin (éditeur)

- Comptes clients : création complète, suspension **réellement appliquée** (accès coupés
  immédiatement), modules par compte, réinitialisation de mot de passe gérant
- Activité par client (commandes 7 jours, dernière activité) et code d'installation de chaque
  établissement, à dicter au client qui monte sa première caisse
- **Ajout d'un restaurant à une enseigne existante** : le nouveau reçoit son propre code
  d'installation et les gérants du compte y accèdent aussitôt, sans nouvel identifiant
- **Journal des erreurs serveur**
- **Journal des connexions** : qui s'est connecté, où, depuis quelle adresse, et surtout les
  tentatives refusées — filtrables d'un clic pour repérer un acharnement sur un code PIN
- **Mots de passe oubliés** : quand un gérant déclare l'oubli, sa demande arrive ici avec un lien
  à usage unique (valable une heure). Dès qu'un serveur d'envoi est branché, le lien part **tout
  seul par e-mail** ; sinon il reste à transmettre par téléphone ou WhatsApp, comme avant
- **Journal des e-mails** : qui a reçu quoi, et surtout ce qui n'est pas parti — la première
  chose à regarder quand un client dit « je n'ai rien reçu »

### Identité visuelle

- **Charte graphique** : vert « thé à la menthe » + safran sur fond crème, motif zellige en
  filigrane de fond, polices Inter / Bricolage Grotesque / Spline Sans Mono ; tous les écrans
  pilotés par des design tokens (aucune couleur en dur), motif d'intensité réglable
- **Thème sombre** : l'application suit le réglage de l'appareil et bascule en salle tamisée,
  sans qu'aucun écran ne perde en lisibilité (service du soir, tablette en main)
- **Polices installées dans l'application** : elles ne viennent plus d'un serveur extérieur —
  pendant une coupure réseau, la caisse garde exactement le même visage
- **Pensé pour le doigt** : toutes les commandes du service (quantités, pastilles, validations)
  font au moins 44 px, et les messages — erreur ou confirmation — s'affichent **en bas de
  l'écran**, là où le pouce et le regard se trouvent déjà, au lieu du haut de page qu'on ne
  voit plus dès qu'on a fait défiler

### Infrastructure & qualité

- **Hébergement sur un serveur dédié** (Docker : application + PostgreSQL + Caddy pour le HTTPS),
  déploiement automatique à chaque push **et seulement si la CI est verte**, retour à la version
  précédente en une commande, sauvegarde de la base chaque nuit — mode d'emploi dans
  `HEBERGEMENT.md`
- **Bases de données séparées** : production (clients) / développement (tests) — étanchéité vérifiée
- **CI GitHub Actions** : compilation, linter, **150 tests d'intégration** (API) et **12 tests
  unitaires** (front) à chaque push
- ESLint + Prettier, TypeScript strict, isolation multi-tenant testée
- Anti-brute-force sur les connexions, valeurs fiscales figées à la vente
- **Sécurité des accès** : la tablette se rattache à son restaurant par un **code d'installation**
  tapé une seule fois (le gérant le régénère si un appareil est perdu) — la liste des
  établissements n'est plus publique ; le freinage des codes PIN compte désormais **par
  restaurant** et non par adresse, pour qu'un serveur maladroit ne bloque plus toute la salle ;
  et un employé désactivé perd la main **immédiatement**, sans attendre l'expiration de sa session
- **Mot de passe oublié** : le gérant se dépanne depuis son écran de connexion — lien à usage
  unique valable une heure, formulaire qui ne révèle jamais si une adresse est connue, et
  changement qui ferme toutes les sessions ouvertes avec l'ancien mot de passe
- **Accents verrouillés de bout en bout** : un établissement nommé « Le Café Étoilé » traverse
  intact la saisie, la base, le menu QR et les tickets — vérifié par des tests dédiés

## 🔜 Prochaines étapes envisagées

- [ ] **Installer le serveur et remettre le site en ligne** sur maidapos.com — tout est
      préparé côté code, il reste à louer la machine et à faire pointer le domaine
      (marche à suivre dans `HEBERGEMENT.md`)
- [ ] **Premier restaurant pilote** (le produit est prêt)
- [ ] **Brancher l'envoi d'e-mails** : le code est prêt et vérifié, il ne manque que le domaine
      et un fournisseur SMTP (7 lignes de configuration, marche à suivre dans `HEBERGEMENT.md`)
- [ ] Réservation en ligne par le client depuis le menu QR
- [ ] Essayer l'impression directe sur une vraie imprimante (le code est là et testé, mais
      aucun ticket n'est encore sorti d'une machine physique)
- [ ] Rapports consolidés d'une enseigne à plusieurs restaurants (aujourd'hui, un restaurant à
      la fois)

## 🔗 Liens utiles

| Quoi                     | Où                                               |
| ------------------------ | ------------------------------------------------ |
| Site public              | https://maidapos.com _(en cours d'installation)_ |
| Historique du travail    | https://github.com/mouradmid/maida/commits/main  |
| CI (tests automatiques)  | https://github.com/mouradmid/maida/actions       |
| Déploiements             | GitHub → Actions → « Déploiement »               |
| Mode d'emploi du serveur | `HEBERGEMENT.md`                                 |
| Base de développement    | https://console.neon.tech (branche Dev)          |
