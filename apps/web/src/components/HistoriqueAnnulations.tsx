import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { badgeNeutre, carte, messageErreur } from '../lib/ui';

type Annulation = Awaited<ReturnType<typeof api.listAnnulations>>[number];

function formaterDate(iso: string) {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoriqueAnnulations() {
  const [annulations, setAnnulations] = useState<Annulation[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .listAnnulations()
      .then(setAnnulations)
      .catch((err) => setErreur(err instanceof Error ? err.message : 'Erreur de chargement'))
      .finally(() => setChargement(false));
  }, []);

  if (chargement) return <p className="text-center text-stone-500">Chargement des annulations...</p>;

  const montantTotal = annulations.reduce((s, a) => s + a.montant, 0);
  const montantApresPrepa = annulations
    .filter((a) => a.apresPreparation)
    .reduce((s, a) => s + a.montant, 0);

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className={carte}>
          <p className="text-sm text-stone-500">Total annulé</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{montantTotal} DA</p>
          <p className="text-xs text-stone-400">
            {annulations.length} annulation{annulations.length > 1 ? 's' : ''}
          </p>
        </div>
        <div className={carte}>
          <p className="text-sm text-stone-500">Dont après préparation (perte sèche)</p>
          <p className="mt-1 text-2xl font-bold text-red-700">{montantApresPrepa} DA</p>
        </div>
      </div>

      <div className={carte}>
        <h3 className="mb-3 font-semibold text-stone-900">Historique</h3>
        {annulations.length === 0 && <p className="text-sm text-stone-400">Aucune annulation enregistrée.</p>}
        <ul className="flex flex-col divide-y divide-stone-100">
          {annulations.map((a) => (
            <li key={a.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-stone-900">
                    {a.canal === 'SUR_PLACE' ? `Table ${a.table?.numero ?? '?'}` : 'À emporter'}
                  </span>
                  <span className="text-stone-600">
                    {a.produit
                      ? `${a.quantite}× ${a.produit}`
                      : `commande entière (${a.quantite} article${a.quantite > 1 ? 's' : ''})`}
                  </span>
                  {a.apresPreparation && (
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                      après préparation
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold text-red-700">−{a.montant} DA</span>
              </div>
              <p className="text-xs text-stone-500">
                {formaterDate(a.creeLe)} · Motif : {a.motif}
                {a.commentaire && <span className="italic"> — « {a.commentaire} »</span>}
              </p>
              <p className="text-xs text-stone-400">
                Annulé par {a.annuleePar.prenom} {a.annuleePar.nom}
                {a.demandeePar && (
                  <span>
                    {' '}
                    — demandé par {a.demandeePar.prenom} {a.demandeePar.nom}
                  </span>
                )}
                {a.annuleePar.role === 'GERANT' && <span className={`${badgeNeutre} ml-2`}>validé gérant</span>}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
