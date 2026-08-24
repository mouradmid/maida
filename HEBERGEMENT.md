# Héberger Maïda sur son propre serveur

Maïda tourne sur une seule machine, dans trois conteneurs Docker :

| Conteneur | Rôle                                                                     |
| --------- | ------------------------------------------------------------------------ |
| `caddy`   | Seul exposé sur Internet. Certificat HTTPS obtenu et renouvelé tout seul |
| `app`     | L'API Express, qui sert aussi le site construit                          |
| `base`    | PostgreSQL. Ses données vivent dans un volume Docker                     |

Ensuite, **chaque `git push` sur `main` met le serveur à jour** — à condition que
la CI soit verte, sinon rien ne part.

## Ce qu'il faut avoir

- Un serveur Debian 12 ou 13, 2 vCPU / 4 Go suffisent largement
  (Hetzner CX22 ≈ 4,50 €/mois, OVH ou Scaleway conviennent aussi).
- Un nom de domaine : **maidapos.com**.
- Une paire de clés SSH pour le déploiement automatique (créée plus bas).

## Installation, une fois pour toutes

### 1. Préparer le serveur

```bash
ssh root@<ip-du-serveur>
curl -fsSL https://raw.githubusercontent.com/mouradmid/maida/main/serveur/installer.sh -o installer.sh
bash installer.sh
```

Le script installe Docker, crée le compte de service `maida`, ferme le pare-feu
sauf SSH/HTTP/HTTPS, coupe la connexion SSH par mot de passe, active les mises à
jour de sécurité automatiques et programme la sauvegarde de 3 h du matin.

### 2. Faire pointer le domaine

Chez le registrar, deux enregistrements **A** vers l'IP du serveur :

| Type | Nom   | Valeur            |
| ---- | ----- | ----------------- |
| A    | `@`   | `<ip-du-serveur>` |
| A    | `www` | `<ip-du-serveur>` |

Attendre que `ping maidapos.com` réponde la bonne IP avant l'étape 4 : Caddy
demande son certificat au premier démarrage, et Let's Encrypt vérifie le domaine
à ce moment-là.

### 3. Déposer les fichiers et les secrets

Depuis le poste de travail :

```bash
scp docker-compose.yml Caddyfile serveur/sauvegarde.sh maida@<ip>:/srv/maida/
```

Puis, sur le serveur, écrire `/srv/maida/.env` (ce fichier ne doit jamais partir
sur GitHub) :

```ini
DOMAINE=maidapos.com
POSTGRES_PASSWORD=<mot de passe long et aléatoire>
JWT_SECRET=<autre chaîne longue et aléatoire>
```

Les deux valeurs se génèrent avec :

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 4. Premier démarrage

Le dépôt est privé, donc l'image de l'application l'est aussi : il faut ouvrir
la porte une première fois. Créer sur GitHub un jeton personnel avec la seule
permission `read:packages` (_Settings_ → _Developer settings_ → _Personal access
tokens_), puis, sur le serveur, en tant qu'utilisateur `maida` :

```bash
echo '<le jeton>' | docker login ghcr.io -u mouradmid --password-stdin
cd /srv/maida && docker compose up -d
docker compose logs -f app     # Ctrl+C pour quitter
```

Les déploiements suivants s'authentifient tout seuls, avec un jeton temporaire
propre à chaque exécution : ce jeton personnel ne sert qu'au tout premier
démarrage et peut être révoqué ensuite.

L'application applique ses migrations toute seule au démarrage. Le site répond
sur https://maidapos.com dès que Caddy a son certificat (quelques secondes).

### 5. Créer les comptes de départ

Les scripts de peuplement restent sur le poste de travail — l'image de
production ne les embarque pas. On ouvre un **tunnel SSH** vers la base, le
temps de les lancer.

Dans un premier terminal, laisser le tunnel ouvert :

```bash
ssh -N -L 5433:127.0.0.1:5432 maida@<ip-du-serveur>
```

Dans un second, depuis `apps/api` :

```bash
# Attention : cette variable vise la PRODUCTION le temps de la commande.
export DATABASE_URL='postgresql://maida:<POSTGRES_PASSWORD>@localhost:5433/maida'

# Le compte éditeur (super-admin)
SEED_SUPER_ADMIN_EMAIL=mouradmid@hotmail.fr \
SEED_SUPER_ADMIN_PASSWORD='<mot de passe>' \
  npx tsx prisma/seed.ts

# La démonstration publique (Le Bon Grill), facultative
npx tsx scripts/seed-demo.ts
```

> Le script de démo ne purge que les comptes marqués **démo** et refuse de
> tourner s'il découvre un compte client réel : les données d'un vrai
> restaurant ne peuvent pas être emportées par un rafraîchissement de la
> vitrine.

### 6. Brancher le déploiement automatique

Créer la paire de clés **sur le poste de travail** :

```bash
ssh-keygen -t ed25519 -f cle-deploiement -C "deploiement maida" -N ""
```

- Coller le contenu de `cle-deploiement.pub` dans
  `/home/maida/.ssh/authorized_keys` sur le serveur.
- Dans GitHub → _Settings_ → _Secrets and variables_ → _Actions_, créer :

| Secret            | Valeur                                   |
| ----------------- | ---------------------------------------- |
| `SSH_HOTE`        | l'IP du serveur                          |
| `SSH_UTILISATEUR` | `maida`                                  |
| `SSH_CLE`         | le contenu de `cle-deploiement` (privée) |
| `DOMAINE`         | `maidapos.com`                           |

- Supprimer `cle-deploiement` du poste une fois collée.

À partir de là, `git push` → la CI vérifie → l'image se construit → le serveur
se met à jour → le workflow vérifie que le site répond. **Si le site ne répond
pas, le déploiement échoue bruyamment** : plus de « déployé » silencieux.

## Vivre avec

### Voir ce qui se passe

```bash
cd /srv/maida
docker compose ps                  # état des trois conteneurs
docker compose logs -f app         # journal de l'application
docker compose logs --tail 50 caddy
```

### Sauvegardes

Une sauvegarde compressée par nuit dans `/srv/maida/sauvegardes`, conservées
30 jours, journal dans `sauvegardes/journal.txt`.

**Restaurer** (la procédure à avoir essayée AVANT d'en avoir besoin) :

```bash
cd /srv/maida
gunzip -c sauvegardes/maida-2026-08-22_03h00.sql.gz | \
  docker compose exec -T base psql -U maida -d maida
docker compose restart app
```

Les sauvegardes vivent sur la même machine que la base : elles protègent d'une
fausse manœuvre, pas de la perte du serveur. Les recopier ailleurs (un
`scp` hebdomadaire sur le poste de travail suffit) dès qu'un vrai restaurant
travaille avec Maïda.

### Rafraîchir la démonstration publique

Elle vieillit toute seule (les réservations passent, la journée de caisse
date). Même tunnel qu'à l'installation, puis depuis `apps/api` :

```bash
DATABASE_URL='postgresql://maida:<mot de passe>@localhost:5433/maida' \
  npx tsx scripts/seed-demo.ts
```

Faire une sauvegarde d'abord (`/srv/maida/sauvegarde.sh`), et ne jamais diriger
la sortie du script dans `head` : il se fait tuer en plein milieu et laisse la
base à moitié construite.

### Mettre à jour le système

```bash
ssh root@<ip> 'apt update && apt upgrade -y && reboot'
```

(Le compte `maida`, celui du déploiement automatique, n'a volontairement pas
les droits d'administration : une clé volée ne donnerait pas la machine.)

Les correctifs de sécurité s'installent déjà seuls ; ce passage à la main est
pour les mises à jour de version, deux ou trois fois par an.

### Revenir à la version d'avant

Chaque image est étiquetée avec son commit :

```bash
cd /srv/maida
IMAGE=ghcr.io/mouradmid/maida:<sha-du-commit-precedent> docker compose up -d app
```

## Ce que ce montage ne fait pas

- **Pas de redondance** : si la machine tombe, le site tombe. Les caisses
  continuent de prendre les commandes hors ligne et se synchronisent au retour,
  c'est le filet.
- **Pas d'envoi d'e-mails** : le lien de réinitialisation de mot de passe
  atterrit toujours dans l'espace éditeur, à transmettre à la main.
