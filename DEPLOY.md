# Déployer Maïda sur Railway

L'application se déploie en un seul service : l'API Express sert aussi le site
construit (`apps/web/dist`). La base de données reste sur Neon.

## Ce que Railway exécute

- **Install/Build** : `npm ci` puis `npm run build` à la racine
  (construit le front, génère le client Prisma, compile l'API).
- **Start** : `npm start` → applique les migrations (`prisma migrate deploy`)
  puis lance `node dist/index.js`.

## Variables d'environnement à définir sur Railway

| Variable       | Valeur                                                                                                                                         |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL` | la chaîne de connexion Neon (la même que dans `apps/api/.env`)                                                                                 |
| `JWT_SECRET`   | une longue chaîne aléatoire, différente de celle de dev (générer : `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`) |
| `NODE_ENV`     | `production`                                                                                                                                   |

## Étapes (une seule fois)

1. **Pousser le code sur GitHub** : créer un dépôt **privé** sur
   [github.com/new](https://github.com/new), puis :
   ```bash
   git remote add origin https://github.com/<ton-user>/maida.git
   git push -u origin main
   ```
2. **Railway** : [railway.app](https://railway.app) → se connecter avec GitHub →
   _New Project_ → _Deploy from GitHub repo_ → choisir `maida`.
3. Dans le service → **Variables** : ajouter les trois variables ci-dessus.
4. **Settings → Networking → Generate Domain** : Railway donne une URL publique
   en HTTPS (ex. `maida-production.up.railway.app`).
5. Optionnel : **Settings → Health check path** : `/health`.

Ensuite, chaque `git push` sur `main` redéploie automatiquement.

## Rappels

- Les identifiants de démo sont affichés sur la page d'accueil : c'est voulu
  tant que le site sert de démo. À retirer avant d'accueillir un vrai client.
- Pour remettre la démo au propre : `npx tsx scripts/seed-demo.ts` depuis
  `apps/api` (attention : purge les données transactionnelles de tous les comptes).
- Les connexions échouées sont limitées à 10 par quart d'heure et par IP
  (anti brute-force des PIN).
