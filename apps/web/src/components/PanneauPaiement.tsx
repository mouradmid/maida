import { useState } from 'react';
import { api, type AdditionDetail, type ModePaiement } from '../lib/api';
import { LIBELLES_MOYEN } from '../lib/libelles';
import { boutonPrimaire, champ, da } from '../lib/ui';

type Mode = 'TOTAL' | 'POURCENTAGE' | 'MONTANT' | 'ARTICLES';

const LIBELLES_MODE: Record<Mode, string> = {
  TOTAL: 'Solde total',
  POURCENTAGE: 'Pourcentage',
  MONTANT: 'Montant libre',
  ARTICLES: 'Par article',
};

/**
 * Encaissement d'une addition : mode de partage, moyen de paiement, monnaie
 * rendue. Le composant ne connaît que l'addition qu'on lui donne — c'est
 * l'écran appelant qui rafraîchit la table après le paiement.
 */
export function PanneauPaiement({
  detail,
  moyensActifs,
  journeeOuverte,
  onEncaisse,
  onErreur,
}: {
  detail: AdditionDetail;
  moyensActifs: ModePaiement[];
  journeeOuverte: boolean;
  onEncaisse: (message: string, additionCloturee: boolean) => void | Promise<void>;
  onErreur: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('TOTAL');
  const [pourcentage, setPourcentage] = useState('100');
  const [montantLibre, setMontantLibre] = useState('');
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [moyenPaiement, setMoyenPaiement] = useState<ModePaiement>(
    moyensActifs.includes('ESPECES') ? 'ESPECES' : (moyensActifs[0] ?? 'ESPECES'),
  );
  const [montantRecu, setMontantRecu] = useState('');
  const [enCours, setEnCours] = useState(false);

  const lignesDisponibles = detail.commandes
    .flatMap((c) => c.lignes)
    .filter((l) => l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte > 0);

  const montantArticles = lignesDisponibles.reduce(
    (s, l) => s + (selection[l.id] ?? 0) * l.prixUnitaire,
    0,
  );

  let montantPropose = 0;
  if (mode === 'TOTAL') montantPropose = detail.solde;
  else if (mode === 'POURCENTAGE') {
    montantPropose = Math.round(detail.solde * ((Number(pourcentage) || 0) / 100) * 100) / 100;
  } else if (mode === 'MONTANT') montantPropose = Number(montantLibre) || 0;
  else montantPropose = Math.round(montantArticles * 100) / 100;

  const renduEstime =
    moyenPaiement === 'ESPECES' && montantRecu && Number(montantRecu) > montantPropose
      ? Math.round((Number(montantRecu) - montantPropose) * 100) / 100
      : null;

  async function handleEncaisser() {
    if (montantPropose <= 0) {
      onErreur('Montant invalide');
      return;
    }
    setEnCours(true);
    try {
      const data =
        mode === 'ARTICLES'
          ? {
              mode: 'ARTICLES' as const,
              lignes: Object.entries(selection)
                .filter(([, qte]) => qte > 0)
                .map(([ligneCommandeId, quantite]) => ({ ligneCommandeId, quantite })),
              moyenPaiement,
              montantRecu: montantRecu ? Number(montantRecu) : undefined,
            }
          : {
              mode: 'MONTANT' as const,
              montant: montantPropose,
              moyenPaiement,
              montantRecu: montantRecu ? Number(montantRecu) : undefined,
            };

      const res = await api.creerPaiement(detail.id, data);
      setSelection({});
      setMontantLibre('');
      setMontantRecu('');
      await onEncaisse(
        `Encaissé ${da(res.montant)}${res.rendu ? ` — monnaie à rendre : ${da(res.rendu)}` : ''}${
          res.additionCloturee ? ' — addition soldée' : ` — reste ${da(res.soldeRestant)}`
        }`,
        res.additionCloturee,
      );
    } catch (err) {
      onErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnCours(false);
    }
  }

  if (detail.statut === 'PAYEE') {
    return (
      <p className="rounded-lg border border-green-200 bg-green-50 px-3 py-3 text-center text-sm font-medium text-green-800">
        Cette addition est entièrement soldée.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 border-t border-stone-100 pt-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LIBELLES_MODE) as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              mode === m
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
            }`}
          >
            {LIBELLES_MODE[m]}
          </button>
        ))}
      </div>

      {mode === 'POURCENTAGE' && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            min="1"
            max="100"
            value={pourcentage}
            onChange={(e) => setPourcentage(e.target.value)}
            className={`${champ} w-24`}
          />
          <span className="text-sm text-stone-500">% du solde</span>
        </div>
      )}

      {mode === 'MONTANT' && (
        <input
          type="number"
          min="0"
          step="0.01"
          value={montantLibre}
          onChange={(e) => setMontantLibre(e.target.value)}
          className={`${champ} w-40`}
          placeholder="Montant (DA)"
        />
      )}

      {mode === 'ARTICLES' && (
        <ul className="flex flex-col gap-2 text-sm">
          {lignesDisponibles.map((l) => {
            const restant = l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte;
            const qteChoisie = selection[l.id] ?? 0;
            return (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={qteChoisie > 0}
                    onChange={(e) =>
                      setSelection((s) => ({ ...s, [l.id]: e.target.checked ? restant : 0 }))
                    }
                    className="h-4 w-4 accent-brand-600"
                  />
                  <span>
                    {l.nomProduit} <span className="text-xs text-stone-400">(reste {restant})</span>
                  </span>
                </label>
                {qteChoisie > 0 && restant > 1 && (
                  <input
                    type="number"
                    min="1"
                    max={restant}
                    value={qteChoisie}
                    onChange={(e) =>
                      setSelection((s) => ({
                        ...s,
                        [l.id]: Math.min(restant, Math.max(1, Number(e.target.value))),
                      }))
                    }
                    className={`${champ} w-16 px-2 py-1`}
                  />
                )}
              </li>
            );
          })}
          {lignesDisponibles.length === 0 && (
            <li className="text-stone-400">Tous les articles sont payés.</li>
          )}
        </ul>
      )}

      <div className="flex items-center justify-between rounded-lg bg-brand-50 px-3 py-2">
        <span className="text-sm font-medium text-brand-900">À encaisser</span>
        <span className="text-xl font-bold text-brand-800">{da(montantPropose)}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {moyensActifs.map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMoyenPaiement(m)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              moyenPaiement === m
                ? 'bg-brand-600 text-white'
                : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
            }`}
          >
            {LIBELLES_MOYEN[m]}
          </button>
        ))}
      </div>

      {moyenPaiement === 'ESPECES' && (
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
          {renduEstime != null && (
            <p className="mt-1 text-sm font-medium text-green-700">
              Monnaie à rendre : {da(renduEstime)}
            </p>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={handleEncaisser}
        disabled={!journeeOuverte || enCours}
        title={journeeOuverte ? undefined : 'Ouvrez la journée de caisse pour encaisser'}
        className={`${boutonPrimaire} py-3 text-base`}
      >
        {enCours ? 'Encaissement…' : `Encaisser ${montantPropose > 0 ? da(montantPropose) : ''}`}
      </button>
    </div>
  );
}
