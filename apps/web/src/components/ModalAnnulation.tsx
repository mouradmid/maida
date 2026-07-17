import { useState } from 'react';
import { api, type Commande } from '../lib/api';
import { boutonSecondaire, carte, champ, messageErreur } from '../lib/ui';

const MOTIFS_PREDEFINIS = [
  'Erreur de saisie',
  'Client parti',
  'Plat indisponible',
  'Client insatisfait',
  'Autre',
];

export function ModalAnnulation({
  commande,
  droitAnnuler,
  onFermer,
  onAnnulee,
}: {
  commande: Commande;
  droitAnnuler: boolean;
  onFermer: () => void;
  onAnnulee: () => void;
}) {
  const lignesAnnulables = commande.lignes.filter(
    (l) => l.quantite - l.quantitePayee - l.quantiteAnnulee > 0,
  );

  const [porteeCommande, setPorteeCommande] = useState(true);
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [motif, setMotif] = useState<string>(MOTIFS_PREDEFINIS[0]);
  const [commentaire, setCommentaire] = useState('');
  const [codeGerant, setCodeGerant] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lignesChoisies = Object.entries(selection)
    .filter(([, qte]) => qte > 0)
    .map(([ligneCommandeId, quantite]) => ({ ligneCommandeId, quantite }));

  async function handleConfirmer() {
    setErreur(null);
    if (!porteeCommande && lignesChoisies.length === 0) {
      setErreur('Sélectionnez au moins un article à annuler');
      return;
    }
    if (motif === 'Autre' && !commentaire.trim()) {
      setErreur('Précisez le motif dans le commentaire');
      return;
    }
    if (!droitAnnuler && !codeGerant) {
      setErreur('Le code gérant est requis pour valider cette annulation');
      return;
    }
    setEnCours(true);
    try {
      await api.annulerCommande(
        commande.id,
        porteeCommande
          ? {
              portee: 'COMMANDE',
              motif,
              commentaire: commentaire.trim() || undefined,
              codeGerant: codeGerant || undefined,
            }
          : {
              portee: 'LIGNES',
              lignes: lignesChoisies,
              motif,
              commentaire: commentaire.trim() || undefined,
              codeGerant: codeGerant || undefined,
            },
      );
      onAnnulee();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
      setCodeGerant('');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 p-4">
      <div className={`${carte} max-h-[90vh] w-full max-w-md overflow-y-auto`}>
        <h3 className="text-lg font-semibold text-stone-900">
          Annuler — {commande.table ? `Table ${commande.table.numero}` : 'À emporter'}
        </h3>
        {commande.statut === 'PRETE' && (
          <p className="mt-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Cette commande a déjà été préparée : l'annulation sera signalée au gérant comme une perte.
          </p>
        )}

        <div className="mt-4 flex flex-col gap-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPorteeCommande(true)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                porteeCommande
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              Toute la commande
            </button>
            <button
              type="button"
              onClick={() => setPorteeCommande(false)}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                !porteeCommande
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
              }`}
            >
              Certains articles
            </button>
          </div>

          {!porteeCommande && (
            <ul className="flex flex-col gap-2 text-sm">
              {lignesAnnulables.map((l) => {
                const annulable = l.quantite - l.quantitePayee - l.quantiteAnnulee;
                const qteChoisie = selection[l.id] ?? 0;
                return (
                  <li key={l.id} className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={qteChoisie > 0}
                        onChange={(e) =>
                          setSelection((s) => ({ ...s, [l.id]: e.target.checked ? annulable : 0 }))
                        }
                        className="h-4 w-4 accent-brand-600"
                      />
                      <span>
                        {l.nomProduit}{' '}
                        <span className="text-xs text-stone-400">(annulable : {annulable})</span>
                      </span>
                    </label>
                    {qteChoisie > 0 && annulable > 1 && (
                      <input
                        type="number"
                        min="1"
                        max={annulable}
                        value={qteChoisie}
                        onChange={(e) =>
                          setSelection((s) => ({
                            ...s,
                            [l.id]: Math.min(annulable, Math.max(1, Number(e.target.value))),
                          }))
                        }
                        className={`${champ} w-16 px-2 py-1`}
                      />
                    )}
                  </li>
                );
              })}
              {lignesAnnulables.length === 0 && (
                <li className="text-stone-400">
                  Plus rien d'annulable (articles payés ou déjà annulés).
                </li>
              )}
            </ul>
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
                      : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label
              className="mb-1 block text-xs font-medium text-stone-600"
              htmlFor="commentaireAnnulation"
            >
              Commentaire {motif === 'Autre' ? '(requis)' : '(optionnel)'}
            </label>
            <textarea
              id="commentaireAnnulation"
              value={commentaire}
              onChange={(e) => setCommentaire(e.target.value)}
              rows={2}
              className={champ}
            />
          </div>

          {!droitAnnuler && (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label className="mb-1 block text-sm font-medium text-stone-700" htmlFor="codeGerant">
                Validation gérant
              </label>
              <p className="mb-2 text-xs text-stone-500">
                Vous n'avez pas le droit d'annuler : un gérant doit saisir son code.
              </p>
              <input
                id="codeGerant"
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
              className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 active:bg-red-800 disabled:opacity-50"
            >
              {enCours ? 'Annulation...' : "Confirmer l'annulation"}
            </button>
            <button type="button" onClick={onFermer} className={boutonSecondaire}>
              Retour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
