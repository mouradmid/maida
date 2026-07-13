import { useEffect, useState } from 'react';
import { api, type AdditionDetail, type AdditionResume } from '../lib/api';

type Mode = 'TOTAL' | 'POURCENTAGE' | 'MONTANT' | 'ARTICLES';

export function Encaissement() {
  const [additions, setAdditions] = useState<AdditionResume[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [additionId, setAdditionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdditionDetail | null>(null);

  const [mode, setMode] = useState<Mode>('TOTAL');
  const [pourcentage, setPourcentage] = useState('100');
  const [montantLibre, setMontantLibre] = useState('');
  const [selection, setSelection] = useState<Record<string, number>>({});
  const [moyenPaiement, setMoyenPaiement] = useState<'ESPECES' | 'CARTE' | 'AUTRE'>('ESPECES');
  const [montantRecu, setMontantRecu] = useState('');
  const [resultat, setResultat] = useState<string | null>(null);

  async function chargerListe() {
    setChargement(true);
    try {
      setAdditions(await api.listAdditionsOuvertes());
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
        `Encaissé ${res.montant} DZD${res.rendu ? ` — monnaie à rendre : ${res.rendu} DZD` : ''}${
          res.additionCloturee ? ' — addition soldée' : ` — solde restant : ${res.soldeRestant} DZD`
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

  if (chargement) return <p>Chargement de l'encaissement...</p>;

  if (!additionId) {
    return (
      <div className="w-full max-w-3xl flex flex-col gap-4 text-left">
        <h2 className="text-xl font-semibold">Encaissement</h2>
        {erreur && <p className="text-sm text-red-600">{erreur}</p>}
        {additions.length === 0 && <p className="text-gray-500">Aucune addition ouverte pour l'instant.</p>}
        <ul className="flex flex-col gap-2">
          {additions.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => ouvrirAddition(a.id)}
                className="w-full flex items-center justify-between rounded border border-gray-200 px-4 py-3 hover:bg-gray-50"
              >
                <span>{a.table ? `Table ${a.table.numero}` : 'À emporter'}</span>
                <span className="text-sm text-gray-500">
                  Total {a.total} DZD — Solde {a.solde} DZD
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!detail) return <p>Chargement...</p>;

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 text-left">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">
          Encaissement — {detail.table ? `Table ${detail.table.numero}` : 'À emporter'}
        </h2>
        <button type="button" onClick={retourListe} className="underline text-sm">
          Retour à la liste
        </button>
      </div>

      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {resultat && <p className="text-sm text-green-700">{resultat}</p>}

      <div className="text-sm">
        <p>Total : {detail.total} DZD — Déjà payé : {detail.totalPaye} DZD</p>
        <p className="font-semibold">Solde restant : {detail.solde} DZD</p>
      </div>

      <ul className="flex flex-col gap-1 text-sm border border-gray-200 rounded p-3">
        {lignesToutes.map((l) => (
          <li key={l.id} className="flex items-center justify-between">
            <span>
              {l.nomProduit} × {l.quantite}
              {l.options.length > 0 && (
                <span className="text-xs text-gray-500">
                  {' '}
                  ({l.options.map((o) => `${o.nomGroupe}: ${o.valeur}`).join(', ')})
                </span>
              )}
              {l.quantitePayee > 0 && (
                <span className="text-xs text-green-700"> — {l.quantitePayee} payé(s)</span>
              )}
            </span>
            <span>{l.prixUnitaire * l.quantite} DZD</span>
          </li>
        ))}
      </ul>

      {detail.paiements.length > 0 && (
        <div className="text-xs text-gray-500">
          <p className="font-medium">Paiements déjà enregistrés :</p>
          <ul>
            {detail.paiements.map((p) => (
              <li key={p.id}>
                {p.montant} DZD ({p.moyenPaiement.toLowerCase()})
              </li>
            ))}
          </ul>
        </div>
      )}

      {detail.statut === 'PAYEE' ? (
        <p className="text-green-700 font-medium">Cette addition est entièrement soldée.</p>
      ) : (
        <div className="flex flex-col gap-3 border border-gray-200 rounded p-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'TOTAL'} onChange={() => setMode('TOTAL')} />
              Solde total
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'POURCENTAGE'} onChange={() => setMode('POURCENTAGE')} />
              Pourcentage
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'MONTANT'} onChange={() => setMode('MONTANT')} />
              Montant libre
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" checked={mode === 'ARTICLES'} onChange={() => setMode('ARTICLES')} />
              Par article
            </label>
          </div>

          {mode === 'POURCENTAGE' && (
            <input
              type="number"
              min="1"
              max="100"
              value={pourcentage}
              onChange={(e) => setPourcentage(e.target.value)}
              className="w-32 rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="% du solde"
            />
          )}

          {mode === 'MONTANT' && (
            <input
              type="number"
              min="0"
              step="0.01"
              value={montantLibre}
              onChange={(e) => setMontantLibre(e.target.value)}
              className="w-40 rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="Montant (DZD)"
            />
          )}

          {mode === 'ARTICLES' && (
            <ul className="flex flex-col gap-2 text-sm">
              {lignesDisponibles.map((l) => {
                const restant = l.quantite - l.quantitePayee;
                const qteChoisie = selection[l.id] ?? 0;
                return (
                  <li key={l.id} className="flex items-center gap-3">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={qteChoisie > 0}
                        onChange={(e) =>
                          setSelection((s) => ({ ...s, [l.id]: e.target.checked ? restant : 0 }))
                        }
                      />
                      {l.nomProduit} (reste {restant})
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
                        className="w-16 rounded border border-gray-300 px-2 py-1"
                      />
                    )}
                  </li>
                );
              })}
              {lignesDisponibles.length === 0 && <li className="text-gray-400">Tous les articles sont payés.</li>}
            </ul>
          )}

          <p className="text-sm font-medium">Montant à encaisser : {montantPropose} DZD</p>

          <div className="flex flex-wrap items-center gap-3 text-sm">
            <select
              value={moyenPaiement}
              onChange={(e) => setMoyenPaiement(e.target.value as typeof moyenPaiement)}
              className="rounded border border-gray-300 px-3 py-2"
            >
              <option value="ESPECES">Espèces</option>
              <option value="CARTE">Carte</option>
              <option value="AUTRE">Autre</option>
            </select>
            {moyenPaiement === 'ESPECES' && (
              <input
                type="number"
                min="0"
                step="0.01"
                value={montantRecu}
                onChange={(e) => setMontantRecu(e.target.value)}
                placeholder="Montant reçu (optionnel)"
                className="w-48 rounded border border-gray-300 px-3 py-2"
              />
            )}
          </div>

          <button
            type="button"
            onClick={handleEncaisser}
            className="rounded bg-gray-900 text-white py-2 font-medium"
          >
            Encaisser
          </button>
        </div>
      )}
    </div>
  );
}
