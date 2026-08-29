import { useState } from 'react';
import type { LigneCiblee } from '../lib/horsLigne';
import { boutonSecondaire, carte, champ, da, messageErreur } from '../lib/ui';
import { Modal } from './Modal';

const MOTIFS_PREDEFINIS = ['Client fidèle', 'Geste commercial', 'Attente trop longue', 'Autre'];
const POURCENTAGES_RAPIDES = [5, 10, 20, 50];

/** Un article encore offrable, avec la quantité qui reste à offrir. */
export interface ArticleOffrable {
  id: string;
  nomProduit: string;
  prixUnitaire: number;
  disponible: number;
}

/** Le geste tel que le serveur vient de le saisir, avant tout envoi. */
export type GesteSaisi = {
  montant: number;
  motif: string;
  commentaire?: string;
  codeGerant?: string;
} & (
  | { type: 'REMISE'; mode: 'POURCENTAGE' | 'MONTANT'; valeur: number }
  | { type: 'OFFERT'; lignes: LigneCiblee[] }
);

/**
 * Saisie d'un geste commercial. Le composant ne connaît ni le réseau ni l'API :
 * il remonte le geste au panneau, qui l'envoie au serveur ou le met dans la
 * file locale selon l'état de la connexion.
 */
export function ModalGesteCommercial({
  titre,
  solde,
  offrables,
  droitRemiser,
  horsLigne,
  onConfirmer,
  onFermer,
}: {
  titre: string;
  solde: number;
  offrables: ArticleOffrable[];
  droitRemiser: boolean;
  horsLigne: boolean;
  onConfirmer: (geste: GesteSaisi) => Promise<void>;
  onFermer: () => void;
}) {
  const [volet, setVolet] = useState<'REMISE' | 'OFFERT'>('REMISE');

  // Remise
  const [modeRemise, setModeRemise] = useState<'POURCENTAGE' | 'MONTANT'>('POURCENTAGE');
  const [pourcentage, setPourcentage] = useState('10');
  const [montantLibre, setMontantLibre] = useState('');

  // Offert
  const [selection, setSelection] = useState<Record<string, number>>({});

  const [motif, setMotif] = useState<string>(MOTIFS_PREDEFINIS[0]);
  const [commentaire, setCommentaire] = useState('');
  const [codeGerant, setCodeGerant] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lignesChoisies: LigneCiblee[] = Object.entries(selection)
    .filter(([, qte]) => qte > 0)
    .map(([ligneCommandeId, quantite]) => ({ ligneCommandeId, quantite }));

  const montantRemiseEstime =
    modeRemise === 'POURCENTAGE'
      ? Math.round(((solde * (Number(pourcentage) || 0)) / 100) * 100) / 100
      : Number(montantLibre) || 0;

  const montantOffertEstime =
    Math.round(
      lignesChoisies.reduce((s, choix) => {
        const article = offrables.find((l) => l.id === choix.ligneCommandeId);
        return s + (article ? article.prixUnitaire * choix.quantite : 0);
      }, 0) * 100,
    ) / 100;

  async function handleConfirmer() {
    setErreur(null);
    if (motif === 'Autre' && !commentaire.trim()) {
      setErreur('Précisez le motif dans le commentaire');
      return;
    }
    if (!droitRemiser && !codeGerant) {
      setErreur('Le code gérant est requis pour valider ce geste');
      return;
    }
    if (volet === 'OFFERT' && lignesChoisies.length === 0) {
      setErreur('Sélectionnez au moins un article à offrir');
      return;
    }
    if (volet === 'REMISE' && montantRemiseEstime <= 0) {
      setErreur('Saisissez une remise valide');
      return;
    }
    if (volet === 'REMISE' && montantRemiseEstime > solde + 0.01) {
      setErreur(`La remise dépasse le reste à payer (${da(solde)})`);
      return;
    }
    const commun = {
      motif,
      commentaire: commentaire.trim() || undefined,
      codeGerant: codeGerant || undefined,
    };
    setEnCours(true);
    try {
      await onConfirmer(
        volet === 'REMISE'
          ? {
              ...commun,
              type: 'REMISE',
              mode: modeRemise,
              valeur: modeRemise === 'POURCENTAGE' ? Number(pourcentage) : Number(montantLibre),
              montant: montantRemiseEstime,
            }
          : { ...commun, type: 'OFFERT', lignes: lignesChoisies, montant: montantOffertEstime },
      );
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
      setCodeGerant('');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <Modal>
      <div className={`${carte} max-h-[90vh] w-full max-w-md overflow-y-auto`}>
        <h3 className="text-lg font-semibold text-stone-900">Geste commercial — {titre}</h3>
        {horsLigne && (
          <p className="mt-1 text-xs text-warn">Hors ligne : le geste part dès le retour du réseau.</p>
        )}

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setVolet('REMISE')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                volet === 'REMISE'
                  ? 'bg-brand-600 text-white'
                  : 'bg-card text-stone-600 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              Remise
            </button>
            <button
              type="button"
              onClick={() => setVolet('OFFERT')}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                volet === 'OFFERT'
                  ? 'bg-brand-600 text-white'
                  : 'bg-card text-stone-600 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              Offrir des articles
            </button>
          </div>

          {volet === 'REMISE' && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-2">
                {POURCENTAGES_RAPIDES.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setModeRemise('POURCENTAGE');
                      setPourcentage(String(p));
                    }}
                    className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                      modeRemise === 'POURCENTAGE' && pourcentage === String(p)
                        ? 'bg-brand-600 text-white'
                        : 'bg-card text-stone-600 border border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    −{p} %
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setModeRemise('MONTANT')}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                    modeRemise === 'MONTANT'
                      ? 'bg-brand-600 text-white'
                      : 'bg-card text-stone-600 border border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  Montant libre
                </button>
              </div>
              {modeRemise === 'POURCENTAGE' ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={pourcentage}
                    onChange={(e) => setPourcentage(e.target.value)}
                    className={`${champ} w-24`}
                  />
                  <span className="text-sm text-stone-500">% du solde ({da(solde)})</span>
                </div>
              ) : (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={montantLibre}
                  onChange={(e) => setMontantLibre(e.target.value)}
                  placeholder="Montant de la remise (DA)"
                  className={`${champ} w-48`}
                />
              )}
              <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-2.5">
                <span className="text-sm font-medium text-brand-900">Remise</span>
                <span className="text-lg font-bold text-brand-800">−{da(montantRemiseEstime)}</span>
              </div>
            </div>
          )}

          {volet === 'OFFERT' && (
            <div className="flex flex-col gap-3">
              <ul className="flex flex-col gap-2 text-sm">
                {offrables.map((l) => {
                  const qteChoisie = selection[l.id] ?? 0;
                  return (
                    <li key={l.id} className="flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={qteChoisie > 0}
                          onChange={(e) =>
                            setSelection((s) => ({ ...s, [l.id]: e.target.checked ? 1 : 0 }))
                          }
                          className="h-4 w-4 accent-brand-600"
                        />
                        <span>
                          {l.nomProduit}{' '}
                          <span className="text-xs text-stone-400">({da(l.prixUnitaire)})</span>
                        </span>
                      </label>
                      {qteChoisie > 0 && l.disponible > 1 && (
                        <input
                          type="number"
                          min="1"
                          max={l.disponible}
                          value={qteChoisie}
                          onChange={(e) =>
                            setSelection((s) => ({
                              ...s,
                              [l.id]: Math.min(l.disponible, Math.max(1, Number(e.target.value))),
                            }))
                          }
                          className={`${champ} w-16 px-2 py-1`}
                        />
                      )}
                    </li>
                  );
                })}
                {offrables.length === 0 && (
                  <li className="text-stone-400">Plus rien à offrir sur cette addition.</li>
                )}
              </ul>
              {montantOffertEstime > 0 && (
                <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-2.5">
                  <span className="text-sm font-medium text-brand-900">Offert</span>
                  <span className="text-lg font-bold text-brand-800">−{da(montantOffertEstime)}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <p className="mb-2 text-sm font-medium text-stone-700">Motif</p>
            <div className="flex flex-wrap gap-2">
              {MOTIFS_PREDEFINIS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotif(m)}
                  className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                    motif === m
                      ? 'bg-brand-600 text-white'
                      : 'bg-card text-stone-600 border border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="commentaireGeste">
              Commentaire {motif === 'Autre' ? '(requis)' : '(optionnel)'}
            </label>
            <textarea
              id="commentaireGeste"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className={champ}
            />
          </div>

          {!droitRemiser && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="codeGerantGeste">
                Validation gérant
              </label>
              <p className="mb-2 text-xs text-stone-500">
                Vous n'avez pas le droit d'accorder un geste commercial : un gérant doit saisir son code.
              </p>
              <input
                id="codeGerantGeste"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={codeGerant}
                onChange={(e) => setCodeGerant(e.target.value)}
                className={`${champ} text-center text-xl tracking-[0.5em]`}
              />
            </div>
          )}

          {erreur && <p className={messageErreur}>{erreur}</p>}

          <div className="flex gap-2">
            <button
              type="button"
              disabled={enCours}
              onClick={handleConfirmer}
              className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-hover active:bg-brand-active disabled:opacity-50"
            >
              {enCours ? 'Application...' : volet === 'REMISE' ? 'Appliquer la remise' : 'Offrir'}
            </button>
            <button type="button" onClick={onFermer} className={boutonSecondaire}>
              Retour
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
