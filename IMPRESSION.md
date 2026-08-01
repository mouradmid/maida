# Imprimer les tickets

Maïda imprime les bons cuisine, les bons de réclame, les tickets clients et les
reçus hors ligne. Deux chemins existent, et l'application choisit toute seule.

## 1. Impression directe (recommandée)

L'imprimante thermique est **branchée en USB** sur l'appareil de la caisse. Maïda
lui parle directement en ESC/POS : le ticket sort tout seul, **sans fenêtre
d'impression à valider**, et le papier est coupé automatiquement.

**Mise en service, une fois pour toutes :**

1. Brancher l'imprimante et l'allumer.
2. Dans la caisse, onglet **Journée** → section **Imprimante du comptoir** →
   _Choisir l'imprimante_.
3. Sélectionner l'imprimante dans la fenêtre du navigateur.

C'est tout. L'autorisation est mémorisée, y compris après redémarrage.

**Ce qu'il faut comme matériel :**

| Élément    | Recommandation                                                 |
| ---------- | -------------------------------------------------------------- |
| Appareil   | **Tablette Android** (ou PC) sous **Chrome**                   |
| Imprimante | Thermique **80 mm**, compatible **ESC/POS**, connexion **USB** |
| Papier     | Rouleau 80 mm (zone imprimée 72 mm, 48 caractères par ligne)   |

Pourquoi ce choix : c'est le montage le moins cher, le plus répandu en
restauration, et le seul qui ne dépende d'aucun pilote installé sur la machine —
donc rien à réinstaller quand la tablette est remplacée.

**Limites connues :**

- Safari (iPhone/iPad) et Firefox ne savent pas piloter une imprimante USB.
  L'application le détecte et bascule sur le chemin 2, sans rien casser.
- Sur **Windows**, si l'imprimante est déjà installée comme imprimante système,
  le pilote Windows la garde pour lui et l'impression directe échoue. Deux
  options : ne pas l'installer dans Windows, ou utiliser le chemin 2 en mode
  silencieux (voir plus bas).
- Un établissement dont le nom est **en arabe** ne peut pas s'imprimer en mode
  texte ESC/POS : l'application le détecte et bascule automatiquement sur le
  chemin 2, plutôt que d'imprimer des « ? ».

## 2. Impression par le navigateur (repli automatique)

Sans imprimante appairée, le ticket est rendu en HTML et envoyé à l'impression
du navigateur. C'est le comportement historique : il marche partout, avec
n'importe quelle imprimante installée sur la machine, mais il ouvre la fenêtre
d'impression.

**Supprimer cette fenêtre sur un PC Windows/Linux/Mac** : lancer Chrome avec
l'option `--kiosk-printing`. Les tickets partent alors silencieusement vers
l'imprimante par défaut.

```
chrome.exe --kiosk-printing --app=https://maida-production-4f05.up.railway.app/caisse
```

Créer un raccourci avec cette ligne sur le bureau du poste de caisse, et le
serveur n'a plus qu'à double-cliquer le matin.

## Comment c'est fait, côté code

Un ticket est décrit **une seule fois**, sous forme de blocs neutres
(`apps/web/src/lib/ticket.ts`), puis rendu de deux façons :

- `apps/web/src/lib/impression.ts` → HTML, pour le navigateur ;
- `apps/web/src/lib/escpos.ts` → octets ESC/POS, pour l'imprimante.

`apps/web/src/lib/imprimante.ts` choisit le chemin et **retombe toujours sur le
navigateur** en cas de problème (imprimante éteinte, câble débranché, caractères
non imprimables). Le ticket sort, quoi qu'il arrive.

Le point sensible est la conversion des accents : une imprimante thermique ne
parle pas UTF-8, elle utilise une table d'un octet. Maïda sélectionne la table
**CP858** (français) et convertit chaque caractère. C'est vérifié par
`apps/web/src/lib/escpos.test.ts` — notamment les accents **majuscules**, parce
que le bon cuisine met les plats en capitales (« CRÈME BRÛLÉE »).
