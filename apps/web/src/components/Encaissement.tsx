import { useEffect, useState } from 'react';
import { api, type AdditionDetail, type AdditionResume, type ModePaiement } from '../lib/api';
import {
  badgeVert,
  boutonDiscret,
  boutonPrimaire,
  carte,
  champ,
  messageErreur,
  messageSucces,
} from '../lib/ui';

type Mode = 'TOTAL' | 'POURCENTAGE' | 'MONTANT' | 'ARTICLES';

const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

const LIBELLES_MODE: Record<Mode, string> = {
  TOTAL: 'Solde total',
  POURCENTAGE: 'Pourcentage',
  MONTANT: 'Montant libre',
  ARTICLES: 'Par article',
};

export function Encaissement() {
  const [additions, setAdditions] = useState<AdditionResume[]>([]);
  const [moyensActifs, setMoyensActifs] = useState<ModePaiement[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [additionId, setAdditionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdditionDetail | null>(null);

  const [mode, setMode] = useState<Mode>('TOTAL');
  const [pourcentage, setPourcentage] = useState('100');
  const [montantLibre, setMontantLibre] = useState('');
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [moyenPaiement, setMoyenPaiement] = useState<ModePaiement>('ESPECES');
  const [montantRecu, setMontantRecu] = useState('');
  const [resultat, setResultat] = useState<string | null>(null);

  async function chargerListe() {
    setChargement(true);
    try {
      const [additionsOuvertes, moyens] = await Promise.all([
        api.listAdditionsOuvertes(),
        api.caisseMoyensPaiement(),
      ]);
      setAdditions(additionsOuvertes);
      setMoyensActifs(moyens.actifs);
      if (moyens.actifs.length > 0 && !moyens.actifs.includes(moyenPaiement)) {
        setMoyenPaiement(moyens.actifs[0]);
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  async function chargerDetail(id: string) {
    setErreur(null);
    try {
      setDetail(await api.getAddition(id));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    }
  }

  useEffect(() => {
    chargerListe();
  }, []);

  useEffect(() => {
    if (additionId) chargerDetail(additionId);
  }, [additionId]);

  function ouvrirAddition(id: string) {
    setAdditionId(id);
    setMode('TOTAL');
    setPourcentage('100');
    setMontantLibre('');
    setSelection({});
    setMontantRecu('');
    setResultat(null);
    setErreur(null);
  }

  function retourListe() {
    setAdditionId(null);
    setDetail(null);
    chargerListe();
  }

  const lignesToutes = detail?.commandes.flatMap((c) => c.lignes) ?? [];
  const lignesDisponibles = lignesToutes.filter((l) => l.quantite - l.quantitePayee > 0);

  const montantArticles = lignesDisponibles.reduce((s, l) => {
    const qte = selection[l.id] ?? 0;
    return s + qte * l.prixUnitaire;
  }, 0);

  let montantPropose = 0;
  if (detail) {
    if (mode === 'TOTAL') montantPropose = detail.solde;
    else if (mode === 'POURCENTAGE') {
      const pct = Number(pourcentage) || 0;
      montantPropose = Math.round(detail.solde * (pct / 100) * 100) / 100;
    } else if (mode === 'MONTANT') montantPropose = Number(montantLibre) || 0;
    else montantPropose = Math.round(montantArticles * 100) / 100;
  }

  const renduEstime =
    moyenPaiement === 'ESPECES' && montantRecu && Number(montantRecu) > montantPropose
      ? Math.round((Number(montantRecu) - montantPropose) * 100) / 100
      : null;

  async function handleEncaisser() {
    if (!detail) return;
    setErreur(null);
    setResultat(null);

    if (montantPropose <= 0) {
      setErreur('Montant invalide');
      return;
    }

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
      setResultat(
        `Encaissé ${res.montant} DA${res.rendu ? ` — monnaie à rendre : ${res.rendu} DA` : ''}${
          res.additionCloturee ? ' — addition soldée' : ` — solde restant : ${res.soldeRestant} DA`
        }`,
      );
      setSelection({});
      setMontantLibre('');
      setMontantRecu('');
      await chargerDetail(detail.id);
      if (res.additionCloturee) {
        await chargerListe();
      }
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement de l'encaissement...</p>;

  if (!additionId) {
    return (
      <div className="flex w-full flex-col gap-4">
        {erreur && <p className={messageErreur}>{erreur}</p>}
        {additions.length === 0 && (
          <div className={`${carte} py-10 text-center text-stone-400`}>
            Aucune addition ouverte pour l'instant.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {additions.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => ouvrirAddition(a.id)}
              className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white p-5 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow"
            >
              <span className="text-lg font-semibold text-stone-900">
                {a.table ? `Table ${a.table.numero}` : 'À emporter'}
              </span>
              <span className="text-sm text-stone-500">Total {a.total} DA</span>
              <span className="text-base font-bold text-brand-700">Reste {a.solde} DA</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (!detail) return <p className="text-center text-stone-500">Chargement...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-stone-900">
          {detail.table ? `Table ${detail.table.numero}` : 'À emporter'}
        </h2>
        <button type="button" onClick={retourListe} className={boutonDiscret}>
          ← Retour aux additions
        </button>
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}
      {resultat && <p className={messageSucces}>{resultat}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        {/* Détail de l'addition */}
        <div className={`${carte} flex flex-col gap-4`}>
          <div className="flex items-end justify-between">
            <div className="text-sm text-stone-500">
              <p>Total : {detail.total} DA</p>
              <p>Déjà payé : {detail.totalPaye} DA</p>
            </div>
            <p className="text-2xl font-bold text-stone-900">{detail.solde} DA</p>
          </div>

          <ul className="flex flex-col divide-y divide-stone-100 border-t border-stone-100 pt-2 text-sm">
            {lignesToutes.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-stone-900">
                    {l.quantite}× {l.nomProduit}
                  </span>
                  {l.options.length > 0 && (
                    <span className="ml-1 text-xs text-stone-500">
                      ({l.options.map((o) => o.valeur).join(', ')})
                    </span>
                  )}
                  {l.quantitePayee > 0 && (
                    <span className={`${badgeVert} ml-2`}>{l.quantitePayee} payé{l.quantitePayee > 1 ? 's' : ''}</span>
                  )}
                </span>
                <span className="font-medium text-stone-900">{l.prixUnitaire * l.quantite} DA</span>
              </li>
            ))}
          </ul>

          {detail.paiements.length > 0 && (
            <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
              <p className="font-medium text-stone-600">Paiements enregistrés</p>
              <ul className="mt-1">
                {detail.paiements.map((p) => (
                  <li key={p.id}>
                    {p.montant} DA — {LIBELLES_MOYEN[p.moyenPaiement]}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Zone de paiement */}
        {detail.statut === 'PAYEE' ? (
          <div className={`${carte} text-center`}>
            <p className="font-medium text-green-700">Cette addition est entièrement soldée.</p>
          </div>
        ) : (
          <div className={`${carte} flex flex-col gap-4`}>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(LIBELLES_MODE) as Mode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
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
                  className={`${champ} w-28`}
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
                  const restant = l.quantite - l.quantitePayee;
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

            <div className="flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
              <span className="text-sm font-medium text-brand-900">À encaisser</span>
              <span className="text-xl font-bold text-brand-800">{montantPropose} DA</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {moyensActifs.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMoyenPaiement(m)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
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
                    Monnaie à rendre : {renduEstime} DA
                  </p>
                )}
              </div>
            )}

            <button type="button" onClick={handleEncaisser} className={`${boutonPrimaire} py-3 text-base`}>
              Encaisser {montantPropose > 0 ? `${montantPropose} DA` : ''}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
