import { useState } from 'react';
import type { ModePaiement } from '../lib/api';
import { htmlRecuHorsLigne, imprimerHtml } from '../lib/impression';
import { mettrePaiementEnAttente, type CibleHorsLigne } from '../lib/horsLigne';
import { LIBELLES_MOYEN } from '../lib/libelles';
import { boutonPrimaire, champ, da } from '../lib/ui';
import type { InfosEtablissement } from './PanneauAddition';

/**
 * Encaissement pendant une coupure réseau : solde total uniquement, sur le
 * dernier état connu. Le paiement part dans la file locale avec sa clé
 * d'idempotence et sera rejoué sans doublon au retour du réseau ; le client
 * repart avec un reçu imprimé.
 */
export function PanneauPaiementHorsLigne({
  cible,
  moyensActifs,
  etablissement,
  onEncaisse,
}: {
  cible: CibleHorsLigne;
  moyensActifs: ModePaiement[];
  etablissement: InfosEtablissement | null;
  onEncaisse: (message: string) => void;
}) {
  const [moyen, setMoyen] = useState<ModePaiement>(
    moyensActifs.includes('ESPECES') ? 'ESPECES' : (moyensActifs[0] ?? 'ESPECES'),
  );
  const [montantRecu, setMontantRecu] = useState('');

  const rendu =
    moyen === 'ESPECES' && montantRecu && Number(montantRecu) > cible.solde
      ? Math.round((Number(montantRecu) - cible.solde) * 100) / 100
      : null;

  function handleEncaisser() {
    mettrePaiementEnAttente({
      description: `${cible.libelle} — ${cible.solde} DA`,
      montant: cible.solde,
      moyenPaiement: moyen,
      montantRecu: moyen === 'ESPECES' && montantRecu ? Number(montantRecu) : undefined,
      additionId: cible.additionId,
      cleCommandeLocale: cible.additionId ? undefined : cible.cleCommandeLocale,
    });
    imprimerHtml(
      htmlRecuHorsLigne(
        etablissement ?? { nom: 'Maïda', adresse: null, ville: null },
        cible.libelle,
        cible.solde,
        moyen,
        moyen === 'ESPECES' && montantRecu ? Number(montantRecu) : null,
      ),
    );
    setMontantRecu('');
    onEncaisse(
      `${cible.libelle} encaissée hors ligne (${da(cible.solde)}) — sera synchronisée au retour du réseau.`,
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Hors ligne : encaissement du solde total uniquement, sur le dernier état connu. Le paiement par
        article, les remises et le détail de l'addition reviennent avec le réseau.
      </p>

      <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
        <span className="text-sm font-medium text-brand-900">{cible.libelle} — à encaisser</span>
        <span className="text-xl font-bold text-brand-800">{da(cible.solde)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {moyensActifs.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMoyen(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              moyen === m
                ? 'bg-brand-600 text-white'
                : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
            }`}
          >
            {LIBELLES_MOYEN[m]}
          </button>
        ))}
      </div>

      {moyen === 'ESPECES' && (
        <div>
          <input
            type="number"
            min="0"
            step="0.01"
            value={montantRecu}
            onChange={(e) => setMontantRecu(e.target.value)}
            placeholder="Montant reçu (optionnel)"
            className={champ}
          />
          {rendu != null && (
            <p className="mt-1 text-sm font-medium text-green-700">Monnaie à rendre : {da(rendu)}</p>
          )}
        </div>
      )}

      <button type="button" onClick={handleEncaisser} className={`${boutonPrimaire} py-3 text-base`}>
        Encaisser {da(cible.solde)} hors ligne
      </button>
    </div>
  );
}
