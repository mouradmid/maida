import { useState } from 'react';
import { api, type Produit } from '../lib/api';

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
    <div className="bg-gray-50 border border-gray-200 rounded p-3 flex flex-col gap-3 text-sm">
      {erreur && <p className="text-red-600">{erreur}</p>}

      {produit.groupesOptions.length === 0 && (
        <p className="text-gray-400">Aucune mention spéciale pour ce produit.</p>
      )}

      {produit.groupesOptions.map((groupe) => (
        <div key={groupe.id} className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="font-medium">
              {groupe.nom} {groupe.obligatoire && <span className="text-xs text-gray-500">(obligatoire)</span>}
            </span>
            <button type="button" onClick={() => handleSupprimerGroupe(groupe.id)} className="underline text-xs">
              Supprimer le groupe
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {groupe.valeurs.map((valeur) => (
              <li key={valeur.id} className="flex items-center gap-1 bg-white border border-gray-300 rounded px-2 py-1">
                <span>{valeur.valeur}</span>
                <button type="button" onClick={() => handleSupprimerValeur(valeur.id)} className="text-gray-400">
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
              className="flex-1 rounded border border-gray-300 px-2 py-1"
            />
            <button type="submit" className="rounded border border-gray-300 px-2 py-1">
              Ajouter
            </button>
          </form>
        </div>
      ))}

      <form onSubmit={handleAjouterGroupe} className="flex items-center gap-2 border-t border-gray-200 pt-2">
        <input
          type="text"
          placeholder="Nouveau groupe (ex: Cuisson)"
          value={nouveauGroupeNom}
          onChange={(e) => setNouveauGroupeNom(e.target.value)}
          required
          className="flex-1 rounded border border-gray-300 px-2 py-1"
        />
        <label className="flex items-center gap-1 whitespace-nowrap">
          <input
            type="checkbox"
            checked={nouveauGroupeObligatoire}
            onChange={(e) => setNouveauGroupeObligatoire(e.target.checked)}
          />
          Obligatoire
        </label>
        <button type="submit" className="rounded bg-gray-900 text-white px-3 py-1">
          Ajouter le groupe
        </button>
      </form>
    </div>
  );
}
