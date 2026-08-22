import { useState } from 'react';
import { api, type ProduitMenu } from '../lib/api';
import { boutonPrimaire, boutonSecondaire, champ, messageErreur } from '../lib/ui';
import { Modal } from './Modal';

// Gestion du stock d'un produit depuis la caisse (droit GERER_STOCK) :
// marquer une rupture, activer le suivi de quantité, ajuster la quantité.
export function ModalStock({
  produit,
  onFerme,
  onEnregistre,
}: {
  produit: ProduitMenu;
  onFerme: () => void;
  onEnregistre: () => void;
}) {
  const [disponible, setDisponible] = useState(produit.disponible);
  const [suivi, setSuivi] = useState(produit.suiviQuantite);
  const [quantite, setQuantite] = useState(
    produit.quantiteRestante != null ? String(produit.quantiteRestante) : '',
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function enregistrer() {
    setErreur(null);
    setEnCours(true);
    try {
      await api.majStockCaisse(produit.id, {
        disponible,
        suiviQuantite: suivi,
        quantiteRestante: suivi ? (quantite === '' ? 0 : Number(quantite)) : null,
      });
      onEnregistre();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
      setEnCours(false);
    }
  }

  return (
    <Modal onFondClique={onFerme}>
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-xl bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-lg font-bold text-stone-900">Stock — {produit.nom}</h3>
          <p className="text-sm text-stone-500">Marquez une rupture ou suivez la quantité du service.</p>
        </div>

        {erreur && <p className={messageErreur}>{erreur}</p>}

        <label className="flex items-center justify-between gap-3 rounded-lg border border-stone-200 px-3 py-2.5">
          <span className="text-sm font-medium text-stone-800">
            {disponible ? 'En vente' : 'En rupture'}
          </span>
          <button
            type="button"
            onClick={() => setDisponible((v) => !v)}
            className={`rounded-full px-3 py-1 text-sm font-semibold ${
              disponible ? 'bg-ok-bg text-ok' : 'bg-red-100 text-red-800'
            }`}
          >
            {disponible ? 'Mettre en rupture' : 'Remettre en vente'}
          </button>
        </label>

        <div className="flex flex-col gap-2 rounded-lg border border-stone-200 px-3 py-2.5">
          <label className="flex items-center gap-2 text-sm font-medium text-stone-800">
            <input
              type="checkbox"
              checked={suivi}
              onChange={(e) => setSuivi(e.target.checked)}
              className="h-4 w-4"
            />
            Suivre la quantité (décompte auto)
          </label>
          {suivi && (
            <label className="flex items-center gap-2 text-sm text-stone-600">
              Quantité restante
              <input
                type="number"
                min="0"
                step="1"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                placeholder="0"
                className={`${champ} w-24 px-2 py-1`}
              />
            </label>
          )}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={enregistrer}
            disabled={enCours}
            className={`${boutonPrimaire} flex-1 disabled:opacity-50`}
          >
            Enregistrer
          </button>
          <button type="button" onClick={onFerme} className={boutonSecondaire}>
            Annuler
          </button>
        </div>
      </div>
    </Modal>
  );
}
