import { useState } from 'react';
import type { ProduitMenu } from '../lib/api';
import type { ChoixOption } from '../hooks/usePanier';
import { boutonPrimaire, boutonSecondaire, carte, messageErreur } from '../lib/ui';

/**
 * Choix des options d'un produit (cuisson, taille…) avant de l'ajouter à la
 * commande. Les groupes marqués obligatoires doivent être renseignés — c'est
 * la même règle que le serveur applique à la résolution des lignes.
 */
export function ModalOptionsProduit({
  produit,
  onAnnuler,
  onConfirmer,
}: {
  produit: ProduitMenu;
  onAnnuler: () => void;
  onConfirmer: (options: ChoixOption[]) => void;
}) {
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  function handleConfirmer() {
    const manquants = produit.groupesOptions.filter((g) => g.obligatoire && !choix[g.id]);
    if (manquants.length > 0) {
      setErreur(`Choisissez : ${manquants.map((g) => g.nom).join(', ')}`);
      return;
    }
    setErreur(null);
    onConfirmer(
      produit.groupesOptions
        .filter((g) => choix[g.id])
        .map((g) => {
          const valeur = g.valeurs.find((v) => v.id === choix[g.id])!;
          return {
            groupeOptionId: g.id,
            optionValeurId: valeur.id,
            nomGroupe: g.nom,
            valeur: valeur.valeur,
          };
        }),
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 p-4">
      <div className={`${carte} w-full max-w-md`}>
        <h3 className="text-lg font-semibold text-stone-900">{produit.nom}</h3>
        <p className="mt-0.5 text-sm font-semibold text-brand-700">{produit.prix} DA</p>

        <div className="mt-4 flex flex-col gap-4">
          {produit.groupesOptions.map((groupe) => (
            <div key={groupe.id}>
              <p className="mb-2 text-sm font-medium text-stone-700">
                {groupe.nom}
                {groupe.obligatoire && <span className="text-brand-600"> *</span>}
              </p>
              <div className="flex flex-wrap gap-2">
                {groupe.valeurs.map((valeur) => (
                  <button
                    key={valeur.id}
                    type="button"
                    onClick={() => setChoix((c) => ({ ...c, [groupe.id]: valeur.id }))}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      choix[groupe.id] === valeur.id
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {valeur.valeur}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {erreur && <p className={`${messageErreur} mt-4`}>{erreur}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={handleConfirmer} className={`${boutonPrimaire} flex-1`}>
            Ajouter à la commande
          </button>
          <button type="button" onClick={onAnnuler} className={boutonSecondaire}>
            Annuler
          </button>
        </div>
      </div>
    </div>
  );
}
