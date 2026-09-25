#!/usr/bin/env bash
# Prépare un serveur Debian 12/13 neuf à recevoir Maïda.
# À lancer UNE SEULE FOIS, en root, sur la machine fraîchement livrée :
#
#   ssh root@<ip-du-serveur>
#   curl -fsSL https://raw.githubusercontent.com/mouradmid/maida/main/serveur/installer.sh -o installer.sh
#   bash installer.sh
#
# Le script est fait pour être relancé sans dégât si quelque chose a échoué.
set -euo pipefail

UTILISATEUR=maida
DOSSIER=/srv/maida
CLES_ROOT=/root/.ssh/authorized_keys

echo "→ Mises à jour et paquets de base"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg ufw unattended-upgrades

echo "→ Mises à jour de sécurité automatiques"
# Une machine que personne ne surveille doit au moins se rapiécer toute seule.
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "→ Docker"
if ! command -v docker > /dev/null; then
	install -m 0755 -d /etc/apt/keyrings
	curl -fsSL https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
	chmod a+r /etc/apt/keyrings/docker.asc
	echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/debian $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
		> /etc/apt/sources.list.d/docker.list
	apt-get update -qq
	apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

echo "→ Compte de service « $UTILISATEUR »"
# Le déploiement se connecte avec ce compte, pas avec root.
id -u "$UTILISATEUR" > /dev/null 2>&1 || adduser --disabled-password --gecos '' "$UTILISATEUR"
usermod -aG docker "$UTILISATEUR"
mkdir -p "/home/$UTILISATEUR/.ssh"
touch "/home/$UTILISATEUR/.ssh/authorized_keys"

# La clé avec laquelle on vient de se connecter en root ouvre aussi le compte
# de service : sans ça, personne ne peut déposer les fichiers dans $DOSSIER
# avant que la clé de déploiement existe — et elle n'existe pas encore.
if [ -s "$CLES_ROOT" ]; then
	while read -r cle; do
		[ -n "$cle" ] || continue
		grep -qxF "$cle" "/home/$UTILISATEUR/.ssh/authorized_keys" \
			|| echo "$cle" >> "/home/$UTILISATEUR/.ssh/authorized_keys"
	done < "$CLES_ROOT"
	echo "  clés de root recopiées : « scp … $UTILISATEUR@<ip> » marchera"
fi

chmod 700 "/home/$UTILISATEUR/.ssh"
chmod 600 "/home/$UTILISATEUR/.ssh/authorized_keys"
chown -R "$UTILISATEUR:$UTILISATEUR" "/home/$UTILISATEUR/.ssh"

echo "→ Dossier applicatif $DOSSIER"
mkdir -p "$DOSSIER/sauvegardes"
chown -R "$UTILISATEUR:$UTILISATEUR" "$DOSSIER"

echo "→ Pare-feu : seuls SSH, HTTP et HTTPS entrent"
ufw allow OpenSSH > /dev/null
ufw allow 80/tcp > /dev/null
ufw allow 443/tcp > /dev/null
ufw --force enable > /dev/null

echo "→ Connexion SSH par mot de passe"
# La clé suffit ; un mot de passe se devine, pas une clé. Mais couper le mot
# de passe quand aucune clé n'est installée, c'est se fermer la porte de sa
# propre machine : dans ce cas on ne touche à rien et on le dit franchement.
if [ -s "$CLES_ROOT" ]; then
	sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
	systemctl reload ssh || systemctl reload sshd
	echo "  désactivée (une clé est en place)"
	MOT_DE_PASSE_ENCORE_ACTIF=non
else
	echo "  LAISSÉE ACTIVE : aucune clé dans $CLES_ROOT."
	echo "  Installe ta clé publique (ssh-copy-id root@<ip> depuis ton poste),"
	echo "  puis relance ce script : il fermera la porte."
	MOT_DE_PASSE_ENCORE_ACTIF=oui
fi

echo "→ Sauvegarde de la base chaque nuit à 3 h"
install -m 0755 -o "$UTILISATEUR" -g "$UTILISATEUR" \
	"$(dirname "$0")/sauvegarde.sh" "$DOSSIER/sauvegarde.sh" 2> /dev/null \
	|| echo "  (sauvegarde.sh sera déposé avec le reste des fichiers)"
cat > /etc/cron.d/maida-sauvegarde << 'CRON'
0 3 * * * maida /srv/maida/sauvegarde.sh >> /srv/maida/sauvegardes/journal.txt 2>&1
CRON
chmod 644 /etc/cron.d/maida-sauvegarde

echo
echo "Serveur prêt."
if [ "$MOT_DE_PASSE_ENCORE_ACTIF" = oui ]; then
	echo
	echo "⚠  La connexion par mot de passe est encore ouverte (voir plus haut)."
fi
echo
echo "Il reste à faire, dans l'ordre :"
echo "  1. copier docker-compose.yml, Caddyfile et sauvegarde.sh dans $DOSSIER"
echo "  2. écrire $DOSSIER/.env (DOMAINE, POSTGRES_PASSWORD, JWT_SECRET)"
echo "  3. faire pointer le domaine sur $(curl -fsS https://api.ipify.org || echo '<ip du serveur>')"
echo "  4. cd $DOSSIER && docker compose up -d"
echo "  5. plus tard, la clé de déploiement dans /home/$UTILISATEUR/.ssh/authorized_keys"
