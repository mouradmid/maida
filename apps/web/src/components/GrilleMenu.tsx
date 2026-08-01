import type { CategorieMenu, ProduitMenu } from '../lib/api';
import { badgeNeutre } from '../lib/ui';

// Un produit est commandable s'il n'est pas en rupture et, s'il est suivi en
// quantité, qu'il en reste. Reflète exactement la règle du serveur.
export function estCommandable(produit: ProduitMenu): boolean {
  return produit.disponible && (!produit.suiviQuantite || (produit.quantiteRestante ?? 0) > 0);
}

/**
 * Le menu du service : catégories en onglets et produits en grille tactile.
 * En « mode stock », toucher un produit ouvre son ajustement au lieu de
 * l'ajouter à la commande — les articles en rupture redeviennent touchables.
 */
export function GrilleMenu({
  categories,
  categorieActiveId,
  onChoisirCategorie,
  droitGererStock,
  modeStock,
  onBasculerModeStock,
  onChoisirProduit,
  onAjusterStock,
}: {
  categories: CategorieMenu[];
  categorieActiveId: string | null;
  onChoisirCategorie: (id: string) => void;
  droitGererStock: boolean;
  modeStock: boolean;
  onBasculerModeStock: () => void;
  onChoisirProduit: (produit: ProduitMenu) => void;
  onAjusterStock: (produit: ProduitMenu) => void;
}) {
  const categorieActive = categories.find((c) => c.id === categorieActiveId) ?? categories[0];

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {categories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => onChoisirCategorie(cat.id)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              categorieActive?.id === cat.id
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
            }`}
          >
            {cat.nom}
          </button>
        ))}
      </div>

      {droitGererStock && (
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={onBasculerModeStock}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              modeStock
                ? 'bg-saffron text-white'
                : 'border border-stone-300 bg-white text-stone-600 hover:bg-stone-50'
            }`}
            title="Activer pour toucher un produit et gérer sa rupture ou sa quantité"
          >
            {modeStock ? '✓ Mode stock actif — touchez un produit' : '📦 Gérer le stock'}
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {categorieActive?.produits.map((produit) => {
          const commandable = estCommandable(produit);
          const bloque = !modeStock && !commandable;
          return (
            <button
              key={produit.id}
              type="button"
              disabled={bloque}
              onClick={() =>
                modeStock ? onAjusterStock(produit) : commandable && onChoisirProduit(produit)
              }
              className={`flex flex-col gap-1 rounded-xl border p-4 text-left shadow-sm transition-all ${
                modeStock
                  ? 'border-saffron/50 bg-saffron-bg hover:-translate-y-0.5 hover:shadow'
                  : bloque
                    ? 'cursor-not-allowed border-stone-200 bg-stone-100 opacity-60'
                    : 'border-stone-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:shadow'
              }`}
            >
              <span className="text-sm font-semibold leading-snug text-stone-900">{produit.nom}</span>
              <span className="text-base font-bold text-brand-700">{produit.prix} DA</span>
              <span className="flex flex-wrap gap-1">
                {!produit.disponible && (
                  <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                    En rupture
                  </span>
                )}
                {produit.disponible && produit.suiviQuantite && (
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      (produit.quantiteRestante ?? 0) > 0
                        ? 'bg-brand-50 text-brand-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {(produit.quantiteRestante ?? 0) > 0
                      ? `reste ${produit.quantiteRestante}`
                      : 'épuisé'}
                  </span>
                )}
                {produit.tempsPreparationMinutes != null && (
                  <span className={badgeNeutre}>{produit.tempsPreparationMinutes} min</span>
                )}
                {produit.groupesOptions.length > 0 && <span className={badgeNeutre}>options</span>}
              </span>
            </button>
          );
        })}
        {(categorieActive?.produits.length ?? 0) === 0 && (
          <p className="col-span-full text-sm text-stone-400">Aucun produit dans cette catégorie.</p>
        )}
      </div>
    </>
  );
}
