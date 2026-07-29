// Détection de coupure réelle.
//
// Le réseau d'un restaurant tombe rarement franchement : le wifi reste
// « connecté », accepte la connexion, et ne répond plus. `navigator.onLine` n'y
// voit que du feu — il ne décrit que l'état de l'interface, pas celui du
// serveur. La caisse attendait alors indéfiniment une réponse qui n'arrivait
// jamais, sans jamais basculer sur sa file locale.
//
// On observe donc les requêtes elles-mêmes : une requête sans réponse ouvre le
// circuit (toute l'application se met en mode hors ligne immédiatement), et une
// sonde légère décide quand le refermer.

// Une requête de caisse dépasse rarement la seconde ; au-delà de ce délai, on
// considère que le réseau ne répondra pas et on bascule en local. Un faux
// positif est sans gravité : la commande part dans la file avec sa clé
// d'idempotence et sera rejouée sans doublon.
export const DELAI_REQUETE_MS = 8_000;
// Rafraîchissements de fond (plan de salle, commandes, demandes clients) : leur
// échec ne coûte rien et c'est ce qui détecte la coupure avant que le serveur
// ne touche l'écran. On les abandonne donc plus vite.
export const DELAI_REQUETE_COURT_MS = 4_000;
// Écrans du gérant (rapports, exports) : pas de repli local, et des calculs
// légitimement plus longs sur de grandes périodes.
export const DELAI_REQUETE_LONG_MS = 30_000;

const DELAI_SONDE_MS = 3_000;
const PERIODE_SONDE_MS = 5_000;

let coupe = false;
const abonnes = new Set<() => void>();
let sonde: ReturnType<typeof setInterval> | null = null;

function notifier() {
  for (const abonne of abonnes) abonne();
}

/** Vrai si le réseau est inutilisable : interface coupée ou serveur muet. */
export function reseauCoupe(): boolean {
  return coupe || !navigator.onLine;
}

export function sAbonnerReseau(abonne: () => void): () => void {
  abonnes.add(abonne);
  return () => abonnes.delete(abonne);
}

/** Une requête n'a pas obtenu de réponse : on ouvre le circuit. */
export function signalerCoupure() {
  if (coupe) return;
  coupe = true;
  notifier();
  demarrerSonde();
}

/** Le serveur a répondu (même une erreur métier) : le réseau est là. */
export function signalerReponse() {
  if (!coupe) return;
  coupe = false;
  arreterSonde();
  notifier();
}

// Pendant la coupure, on cesse d'interroger l'API : une seule sonde, courte et
// sans base de données, décide du retour. Inutile d'encombrer un réseau déjà
// saturé avec les requêtes de l'écran.
function demarrerSonde() {
  if (sonde) return;
  sonde = setInterval(async () => {
    // AbortController plutôt que AbortSignal.timeout : les tablettes d'entrée
    // de gamme embarquent des WebView anciennes.
    const controleur = new AbortController();
    const minuteur = setTimeout(() => controleur.abort(), DELAI_SONDE_MS);
    try {
      await fetch('/api/health', { cache: 'no-store', signal: controleur.signal });
      signalerReponse();
    } catch {
      // toujours coupé : on retentera au prochain tour
    } finally {
      clearTimeout(minuteur);
    }
  }, PERIODE_SONDE_MS);
}

function arreterSonde() {
  if (!sonde) return;
  clearInterval(sonde);
  sonde = null;
}

// Une coupure franche est une information fiable : on l'utilise aussi.
if (typeof window !== 'undefined') {
  window.addEventListener('offline', signalerCoupure);
}
