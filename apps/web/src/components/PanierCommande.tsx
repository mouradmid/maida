import type { LignePanier } from '../hooks/usePanier';
import type { Commande, LigneCommande } from '../lib/api';
import { boutonPrimaire, champ } from '../lib/ui';

export interface LigneRajout {
  entree: { ligne: LigneCommande; commande: Commande };
  ligneId: string;
  quantite: number;
}

/**
 * Ce qui part au prochain envoi : les rajouts sur des articles déjà en cuisine,
 * puis les nouveaux articles du panier. Le serveur décide lui-même des services
 * (« À suivre ») — une entrée peut servir de plat.
 */
export function PanierCommande({
  lignesRajouts,
  lignesPanier,
  aDesArticlesEnvoyes,
  surPlace,
  suiteSaisie,
  nbArticles,
  totalAEnvoyer,
  noteCuisine,
  envoiEnCours,
  onChangerRajout,
  onChangerQuantite,
  onChangerSuiteLigne,
  onSuiteSaisie,
  onNoteCuisine,
  onEnvoyer,
}: {
  lignesRajouts: LigneRajout[];
  lignesPanier: LignePanier[];
  aDesArticlesEnvoyes: boolean;
  surPlace: boolean;
  suiteSaisie: number;
  nbArticles: number;
  totalAEnvoyer: number;
  noteCuisine: string;
  envoiEnCours: boolean;
  onChangerRajout: (ligneId: string, delta: number) => void;
  onChangerQuantite: (cle: string, delta: number) => void;
  onChangerSuiteLigne: (cle: string) => void;
  onSuiteSaisie: (suite: number) => void;
  onNoteCuisine: (note: string) => void;
  onEnvoyer: () => void;
}) {
  const panierTrie = [...lignesPanier].sort((a, b) => a.suite - b.suite);
  const plusieursSuites = new Set(panierTrie.map((l) => l.suite)).size > 1;

  return (
    <>
      {lignesRajouts.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
          {lignesRajouts.map(({ entree, ligneId, quantite }) => (
            <li key={ligneId} className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 text-stone-800">
                {entree.ligne.nomProduit}
                {entree.ligne.options.length > 0 && (
                  <span className="text-stone-500">
                    {' '}
                    ({entree.ligne.options.map((o) => o.valeur).join(', ')})
                  </span>
                )}
                <span className="ml-1 text-xs text-stone-500">— rajout</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangerRajout(ligneId, -1)}
                  aria-label={`Retirer un ${entree.ligne.nomProduit}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                >
                  −
                </button>
                <span className="w-8 text-center font-semibold">+{quantite}</span>
                <button
                  type="button"
                  onClick={() => onChangerRajout(ligneId, 1)}
                  aria-label={`Ajouter un ${entree.ligne.nomProduit}`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                >
                  +
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {lignesPanier.length === 0 && lignesRajouts.length === 0 && (
        <p className="py-4 text-center text-sm text-stone-400">
          Touchez un produit pour l'ajouter à la commande
          {aDesArticlesEnvoyes ? ', ou « + » sur un article envoyé pour en rajouter un' : ''}.
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {panierTrie.map((ligne, index) => (
          <li key={ligne.cle} className="flex flex-col gap-1">
            {/* Séparateur de service quand le panier couvre plusieurs suites */}
            {plusieursSuites && (index === 0 || panierTrie[index - 1].suite !== ligne.suite) && (
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                Suite {ligne.suite}
              </p>
            )}
            <div className="flex items-start justify-between gap-2 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-stone-900">{ligne.produit.nom}</p>
                {ligne.options.length > 0 && (
                  <p className="text-xs text-stone-500">
                    {ligne.options.map((o) => `${o.nomGroupe} : ${o.valeur}`).join(' · ')}
                  </p>
                )}
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
                  {ligne.produit.prix * ligne.quantite} DA
                  {surPlace && (
                    <button
                      type="button"
                      onClick={() => onChangerSuiteLigne(ligne.cle)}
                      title="Changer l'article de service (entrée / plat / dessert)"
                      className="rounded-full border border-stone-300 bg-white px-2 py-px text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
                    >
                      Suite {ligne.suite}
                    </button>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onChangerQuantite(ligne.cle, -1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                  aria-label="Retirer un"
                >
                  −
                </button>
                <span className="w-6 text-center font-semibold">{ligne.quantite}</span>
                <button
                  type="button"
                  onClick={() => onChangerQuantite(ligne.cle, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                  aria-label="Ajouter un"
                >
                  +
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* Les services ne concernent qu'une table : une vente à emporter part
          d'un bloc. */}
      {surPlace && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSuiteSaisie(Math.min(suiteSaisie + 1, 3))}
            disabled={suiteSaisie >= 3}
            title="Passer au service suivant : les prochains articles partiront à suivre"
            className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:opacity-40"
          >
            À suivre →
          </button>
          {suiteSaisie > 1 && (
            <span className="flex items-center gap-1.5 text-xs text-sky-800">
              saisie en suite {suiteSaisie}
              <button
                type="button"
                onClick={() => onSuiteSaisie(1)}
                aria-label="Revenir à la suite 1"
                title="Revenir à la suite 1"
                className="flex h-4 w-4 items-center justify-center rounded-full border border-sky-300 bg-white text-[10px] font-bold leading-none text-sky-700 hover:bg-sky-100"
              >
                ✕
              </button>
            </span>
          )}
        </div>
      )}

      {nbArticles > 0 && (
        <div className="flex items-center justify-between border-t border-stone-100 pt-3">
          <span className="text-sm font-medium text-stone-600">À envoyer</span>
          <span className="text-xl font-bold text-stone-900">{totalAEnvoyer} DA</span>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="noteCuisine">
          Message pour la cuisine (optionnel)
        </label>
        <textarea
          id="noteCuisine"
          value={noteCuisine}
          onChange={(e) => onNoteCuisine(e.target.value)}
          rows={2}
          placeholder="ex : client allergique aux fruits de mer"
          className={champ}
        />
      </div>

      <button
        type="button"
        disabled={nbArticles === 0 || envoiEnCours}
        onClick={onEnvoyer}
        className={`${boutonPrimaire} py-3 text-base`}
      >
        Envoyer en cuisine
      </button>
    </>
  );
}
