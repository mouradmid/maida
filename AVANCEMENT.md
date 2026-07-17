# Maïda — État d'avancement

> Le point de vente pensé pour la restauration algérienne.
> Site : https://maida-production-4f05.up.railway.app · Mis à jour à chaque session de travail.

## ✅ Livré et en production

### Cœur du service (caisse)

- **Prise de commande** : plan de salle interactif, sur place / à emporter, options par produit
  (cuisson, sauce…), note cuisine
- **Écran cuisine** : commandes en préparation, ancienneté colorée, marquage « prête »,
  actualisation automatique
- **Encaissement** : total, partiel, par article, par pourcentage ; moyens de paiement
  configurables ; monnaie rendue
- **Journée de caisse** : ouverture avec fond de caisse, clôture avec comptage des espèces et
  écart, verrouillage
- **Annulations tracées** : par commande ou par article, motif obligatoire, droit par serveur ou
  validation code gérant, perte sèche identifiée
- **Remises & offerts** : % ou montant, article offert, motifs, droit REMISER, tout tracé
- **Réservations** : prise au téléphone, anti-conflit de créneau, badge sur le plan de salle,
  arrivée / annulation / no-show
- **Tickets d'impression** (thermique 80 mm) : ticket cuisine et ticket client avec TVA et remises

### Mode hors ligne — le différenciateur

- La caisse **continue de fonctionner sans internet** : commandes, ticket cuisine, encaissement,
  reçu client
- Synchronisation automatique au retour du réseau, **sans jamais un doublon** (clés d'idempotence
  vérifiées côté serveur)
- Application installable sur tablette (PWA)

### Espace gérant

- **Rapports** : CA, ticket moyen, palmarès produits, CA par catégorie / serveur / moyen de
  paiement, pertes, remises
- **Food cost & beverage cost** : coût de revient par produit, marges, taux de couverture —
  module activable par compte (option commerciale) et masquable par le gérant
- **TVA** : taux par article (19/9/0 % + libre), prix TTC, récap par taux sur le ticket,
  TVA collectée prête pour la déclaration
- **Réservations** : statistiques no-show, clients à surveiller
- Menu, plan de salle, équipe et droits, moyens de paiement, historique des annulations et
  remises, journées de caisse

### Espace super-admin (éditeur)

- Comptes clients : création complète, suspension **réellement appliquée** (accès coupés
  immédiatement), modules par compte, réinitialisation de mot de passe gérant
- Activité par client (commandes 7 jours, dernière activité)
- **Journal des erreurs serveur**

### Infrastructure & qualité

- Hébergement Railway avec déploiement automatique à chaque push
- **Bases de données séparées** : production (clients) / développement (tests) — étanchéité vérifiée
- **CI GitHub Actions** : compilation, linter et 51 tests d'intégration à chaque push
- ESLint + Prettier, TypeScript strict, isolation multi-tenant testée
- Anti-brute-force sur les connexions, valeurs fiscales figées à la vente

## 🔜 Prochaines étapes envisagées

- [ ] **Multi-canal** : QR code à table (menu consultable par le client, puis commande)
- [ ] **Premier restaurant pilote** (le produit est prêt)
- [ ] Réservation en ligne par le client + email de confirmation
- [ ] Hors-ligne : paiement par article et remises
- [ ] Impression thermique directe (ESC/POS) sans boîte de dialogue
- [ ] Multi-établissement pour un même compte client

## 🔗 Liens utiles

| Quoi                    | Où                                                    |
| ----------------------- | ----------------------------------------------------- |
| Site public             | https://maida-production-4f05.up.railway.app          |
| Historique du travail   | https://github.com/mouradmid/maida/commits/main       |
| CI (tests automatiques) | https://github.com/mouradmid/maida/actions            |
| Déploiements            | Railway → service maida → Deployments                 |
| Bases de données        | https://console.neon.tech (branches production / dev) |
