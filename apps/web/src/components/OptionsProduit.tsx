import { useState } from 'react';
import { api, type Produit } from '../lib/api';
import { boutonPrimaire, champ, messageErreur } from '../lib/ui';

export function OptionsProduit({ produit, onChange }: { produit: Produit; onChange: () => void }) {
  const [nouveauGroupeNom, setNouveauGroupeNom] = useState('');
  const [nouveauGroupeObligatoire, setNouveauGroupeObligatoire] = useState(false);
  const [nouvellesValeurs, setNouvellesValeurs] = useState<Record<string, string>>({});
  const [erreur, setErreur] = useState<string | null>(null);

  async function handleAjouterGroupe(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      await api.createGroupeOption(produit.id, {
        nom: nouveauGroupeNom,
        obligatoire: nouveauGroupeObligatoire,
      });
      setNouveauGroupeNom('');
      setNouveauGroupeObligatoire(false);
      onChange();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleSupprimerGroupe(groupeId: string) {
    await api.deleteGroupeOption(groupeId);
    onChange();
  }

  async function handleAjouterValeur(e: React.FormEvent, groupeId: string) {
    e.preventDefault();
    setErreur(null);
    const valeur = nouvellesValeurs[groupeId]?.trim();
    if (!valeur) return;
    try {
      await api.createOptionValeur(groupeId, valeur);
      setNouvellesValeurs((v) => ({ ...v, [groupeId]: '' }));
      onChange();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleSupprimerValeur(valeurId: string) {
    await api.deleteOptionValeur(valeurId);
    onChange();
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      {produit.groupesOptions.length === 0 && (
        <p className="text-stone-400">Aucune option pour ce produit.</p>
      )}

      {produit.groupesOptions.map((groupe) => (
        <div key={groupe.id} className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-stone-900">
              {groupe.nom}{' '}
              {groupe.obligatoire && <span className="text-xs text-brand-700">(obligatoire)</span>}
            </span>
            <button
              type="button"
              onClick={() => handleSupprimerGroupe(groupe.id)}
              className="text-xs font-medium text-red-600 hover:text-red-800"
            >
              Supprimer le groupe
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {groupe.valeurs.map((valeur) => (
              <li
                key={valeur.id}
                className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1"
              >
                <span>{valeur.valeur}</span>
                <button
                  type="button"
                  onClick={() => handleSupprimerValeur(valeur.id)}
                  className="text-stone-400 transition-colors hover:text-red-600"
                  aria-label={`Supprimer ${valeur.valeur}`}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={(e) => handleAjouterValeur(e, groupe.id)} className="flex gap-2">
            <input
              type="text"
              placeholder="Nouvelle valeur"
              value={nouvellesValeurs[groupe.id] ?? ''}
              onChange={(e) => setNouvellesValeurs((v) => ({ ...v, [groupe.id]: e.target.value }))}
              className={champ}
            />
            <button
              type="submit"
              className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
            >
              Ajouter
            </button>
          </form>
        </div>
      ))}

      <form
        onSubmit={handleAjouterGroupe}
        className="flex flex-wrap items-center gap-2 border-t border-stone-200 pt-3"
      >
        <input
          type="text"
          placeholder="Nouveau groupe (ex : Cuisson)"
          value={nouveauGroupeNom}
          onChange={(e) => setNouveauGroupeNom(e.target.value)}
          required
          className={`${champ} flex-1`}
        />
        <label className="flex items-center gap-1.5 whitespace-nowrap text-stone-600">
          <input
            type="checkbox"
            checked={nouveauGroupeObligatoire}
            onChange={(e) => setNouveauGroupeObligatoire(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Obligatoire
        </label>
        <button type="submit" className={boutonPrimaire}>
          Ajouter le groupe
        </button>
      </form>
    </div>
  );
}
