import { useState } from 'react';
import { api, type ModePaiement } from '../lib/api';
import { mettrePaiementEnAttente, nouvelleCle, type CibleHorsLigne } from '../lib/horsLigne';
import { htmlRecuHorsLigne, imprimerHtml } from '../lib/impression';
import { LIBELLES_MOYEN } from '../lib/libelles';
import { boutonPrimaire, champ, da } from '../lib/ui';
import type { InfosEtablissement, VueAddition } from './PanneauAddition';

type Mode = 'TOTAL' | 'POURCENTAGE' | 'MONTANT' | 'ARTICLES';

const LIBELLES_MODE: Record<Mode, string> = {
  TOTAL: 'Solde total',
  POURCENTAGE: 'Pourcentage',
  MONTANT: 'Montant libre',
  ARTICLES: 'Par article',
};

/**
 * Encaissement d'une addition : mode de partage, moyen de paiement, monnaie
 * rendue. Sans réseau, le même écran encaisse dans la file locale — seul le
 * paiement par article, qui a besoin du serveur pour verrouiller les articles,
 * devient indisponible. Le paiement en file porte sa clé d'idempotence et sera
 * rejoué sans doublon.
 */
export function PanneauPaiement({
  vue,
  additionId,
  cible,
  moyensActifs,
  journeeOuverte,
  horsLigne,
  etablissement,
  onEncaisse,
  onErreur,
}: {
  vue: VueAddition;
  additionId: string | null;
  cible: CibleHorsLigne | null;
  moyensActifs: ModePaiement[];
  journeeOuverte: boolean;
  horsLigne: boolean;
  etablissement: InfosEtablissement | null;
  onEncaisse: (message: string, additionSoldee: boolean) => void | Promise<void>;
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

  const lignesDisponibles = vue.lignes.filter(
    (l) => l.quantite - l.quantitePayee - l.quantiteAnnulee - l.quantiteOfferte > 0,
  );

  const montantArticles = lignesDisponibles.reduce(
    (s, l) => s + (selection[l.id] ?? 0) * l.prixUnitaire,
    0,
  );

  // Le paiement par article n'est pas rejouable hors ligne : on retombe sur le
  // solde total plutôt que de laisser un mode inopérant sélectionné.
  const modeEffectif: Mode = horsLigne && mode === 'ARTICLES' ? 'TOTAL' : mode;

  let montantPropose = 0;
  if (modeEffectif === 'TOTAL') montantPropose = vue.solde;
  else if (modeEffectif === 'POURCENTAGE') {
    montantPropose = Math.round(vue.solde * ((Number(pourcentage) || 0) / 100) * 100) / 100;
  } else if (modeEffectif === 'MONTANT') montantPropose = Number(montantLibre) || 0;
  else montantPropose = Math.round(montantArticles * 100) / 100;

  const renduEstime =
    moyenPaiement === 'ESPECES' && montantRecu && Number(montantRecu) > montantPropose
      ? Math.round((Number(montantRecu) - montantPropose) * 100) / 100
      : null;

  function encaisserHorsLigne() {
    if (!cible) {
      onErreur("Cette addition n'est pas encaissable hors ligne");
      return;
    }
    const recu = moyenPaiement === 'ESPECES' && montantRecu ? Number(montantRecu) : undefined;
    mettrePaiementEnAttente({
      description: `${cible.libelle} — ${montantPropose} DA`,
      montant: montantPropose,
      moyenPaiement,
      montantRecu: recu,
      additionId: cible.additionId,
      cleCommandeLocale: cible.additionId ? undefined : cible.cleCommandeLocale,
    });
    imprimerHtml(
      htmlRecuHorsLigne(
        etablissement ?? { nom: 'Maïda', adresse: null, ville: null },
        cible.libelle,
        montantPropose,
        moyenPaiement,
        recu ?? null,
      ),
    );
    const reste = Math.max(0, Math.round((vue.solde - montantPropose) * 100) / 100);
    setMontantLibre('');
    setMontantRecu('');
    onEncaisse(
      `Encaissé ${da(montantPropose)} hors ligne${
        reste <= 0.01 ? ' — addition soldée' : ` — reste ${da(reste)}`
      }, à synchroniser au retour du réseau.`,
      reste <= 0.01,
    );
  }

  async function handleEncaisser() {
    if (montantPropose <= 0) {
      onErreur('Montant invalide');
      return;
    }
    if (horsLigne) {
      encaisserHorsLigne();
      return;
    }
    if (!additionId) {
      onErreur("Cette addition n'existe pas encore côté serveur");
      return;
    }
    setEnCours(true);
    try {
      // Clé d'idempotence : un encaissement dont la réponse se perd (réseau
      // muet, délai dépassé) ne peut pas être compté deux fois si le serveur
      // l'avait déjà enregistré.
      const cleIdempotence = nouvelleCle('hlp');
      const data =
        modeEffectif === 'ARTICLES'
          ? {
              mode: 'ARTICLES' as const,
              lignes: Object.entries(selection)
                .filter(([, qte]) => qte > 0)
                .map(([ligneCommandeId, quantite]) => ({ ligneCommandeId, quantite })),
              moyenPaiement,
              montantRecu: montantRecu ? Number(montantRecu) : undefined,
              cleIdempotence,
            }
          : {
              mode: 'MONTANT' as const,
              montant: montantPropose,
              moyenPaiement,
              montantRecu: montantRecu ? Number(montantRecu) : undefined,
              cleIdempotence,
            };

      const res = await api.creerPaiement(additionId, data);
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

  return (
    <div className="flex flex-col gap-3 border-t border-stone-100 pt-3">
      <div className="flex flex-wrap gap-2">
        {(Object.keys(LIBELLES_MODE) as Mode[]).map((m) => {
          const indisponible = horsLigne && m === 'ARTICLES';
          return (
            <button
              key={m}
              type="button"
              disabled={indisponible}
              onClick={() => setMode(m)}
              title={indisponible ? 'Le paiement par article revient avec le réseau' : undefined}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                modeEffectif === m
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              {LIBELLES_MODE[m]}
            </button>
          );
        })}
      </div>

      {modeEffectif === 'POURCENTAGE' && (
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

      {modeEffectif === 'MONTANT' && (
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

      {modeEffectif === 'ARTICLES' && (
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
        disabled={(!journeeOuverte && !horsLigne) || enCours}
        title={!journeeOuverte && !horsLigne ? 'Ouvrez la journée de caisse pour encaisser' : undefined}
        className={`${boutonPrimaire} py-3 text-base`}
      >
        {enCours ? 'Encaissement…' : `Encaisser ${montantPropose > 0 ? da(montantPropose) : ''}`}
      </button>
    </div>
  );
}
