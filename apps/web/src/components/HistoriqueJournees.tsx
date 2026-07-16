import { useEffect, useState } from 'react';
import { api, type JourneeGerant, type ModePaiement } from '../lib/api';
import { badgeBrand, badgeNeutre, carte, messageErreur } from '../lib/ui';

const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

function jourEtHeure(date: string) {
  return new Date(date).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BadgeEcart({ ecart }: { ecart: number }) {
  if (ecart === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
        Caisse juste
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        ecart < 0 ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {ecart > 0 ? '+' : ''}
      {ecart} DA
    </span>
  );
}

export function HistoriqueJournees() {
  const [journees, setJournees] = useState<JourneeGerant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setJournees(await api.listJournees());
      } catch (err) {
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setChargement(false);
      }
    })();
  }, []);

  if (chargement) return <p className="text-center text-stone-500">Chargement des journées...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      {journees.length === 0 && (
        <div className={`${carte} py-10 text-center text-stone-400`}>
          Aucune journée de caisse pour l'instant. La caisse ouvre sa première journée depuis
          l'onglet « Journée ».
        </div>
      )}

      {journees.map((j) => (
        <div key={j.id} className={`${carte} flex flex-col gap-3`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-stone-900">
                {jourEtHeure(j.ouverteLe)}
                {j.clotureeLe ? ` → ${jourEtHeure(j.clotureeLe)}` : ''}
              </p>
              <p className="text-sm text-stone-500">
                Ouverte par {j.ouvertePar.prenom} {j.ouvertePar.nom}
                {j.clotureePar && (
                  <>
                    {' '}
                    — clôturée par {j.clotureePar.prenom} {j.clotureePar.nom}
                    {j.clotureDemandeePar &&
                      ` (à la demande de ${j.clotureDemandeePar.prenom} ${j.clotureDemandeePar.nom})`}
                  </>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {j.statut === 'OUVERTE' ? (
                <span className={badgeBrand}>En cours</span>
              ) : (
                <span className={badgeNeutre}>Clôturée</span>
              )}
              {j.ecart !== null && <BadgeEcart ecart={j.ecart} />}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-stone-600">
            <span>
              Fond de caisse : <span className="font-medium text-stone-900">{j.fondDeCaisse} DA</span>
            </span>
            {j.totaux.parMoyen.map((m) => (
              <span key={m.moyenPaiement}>
                {LIBELLES_MOYEN[m.moyenPaiement]} :{' '}
                <span className="font-medium text-stone-900">{m.montant} DA</span>
              </span>
            ))}
            <span>
              Total : <span className="font-bold text-brand-800">{j.totaux.total} DA</span>
            </span>
          </div>

          {j.especesComptees !== null && (
            <p className="text-sm text-stone-500">
              Espèces : {j.especesComptees} DA comptées / {j.especesAttendues} DA attendues
              {j.commentaire && <> — « {j.commentaire} »</>}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
