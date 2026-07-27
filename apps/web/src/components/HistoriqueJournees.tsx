import { useEffect, useMemo, useState } from 'react';
import { api, type JourneeGerant, type ModePaiement } from '../lib/api';
import { type Colonne, suffixePeriode, telechargerXlsx } from '../lib/exportExcel';
import { LIBELLES_MOYEN, MOYENS_PAIEMENT } from '../lib/libelles';
import { bornes, type Periode } from '../lib/periode';
import { badgeBrand, badgeNeutre, boutonSecondaire, carte, messageErreur } from '../lib/ui';
import { SelecteurPeriode } from './SelecteurPeriode';

function jourEtHeure(date: string) {
  return new Date(date).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Montant encaissé d'une journée pour un moyen de paiement donné (0 si aucun).
function montantMoyen(journee: JourneeGerant, moyen: ModePaiement): number {
  return journee.totaux.parMoyen.find((m) => m.moyenPaiement === moyen)?.montant ?? 0;
}

const somme = (lignes: JourneeGerant[], valeur: (j: JourneeGerant) => number | null) =>
  Math.round(lignes.reduce((total, j) => total + (valeur(j) ?? 0), 0) * 100) / 100;

// Une ligne par clôture, dans l'ordre chronologique : c'est la lecture attendue
// par un comptable, alors que l'écran affiche la plus récente en premier.
function colonnesClotures(): Colonne<JourneeGerant>[] {
  return [
    { titre: 'Ouverture', largeur: 18, type: 'dateHeure', valeur: (j) => new Date(j.ouverteLe) },
    {
      titre: 'Clôture',
      largeur: 18,
      type: 'dateHeure',
      valeur: (j) => (j.clotureeLe ? new Date(j.clotureeLe) : null),
    },
    { titre: 'Statut', largeur: 11, valeur: (j) => (j.statut === 'OUVERTE' ? 'En cours' : 'Clôturée') },
    { titre: 'Ouverte par', largeur: 20, valeur: (j) => `${j.ouvertePar.prenom} ${j.ouvertePar.nom}` },
    {
      titre: 'Clôturée par',
      largeur: 20,
      valeur: (j) => (j.clotureePar ? `${j.clotureePar.prenom} ${j.clotureePar.nom}` : null),
    },
    {
      titre: 'Clôture demandée par',
      largeur: 20,
      valeur: (j) =>
        j.clotureDemandeePar ? `${j.clotureDemandeePar.prenom} ${j.clotureDemandeePar.nom}` : null,
    },
    {
      titre: 'Fond de caisse',
      largeur: 15,
      type: 'montant',
      valeur: (j) => j.fondDeCaisse,
      total: (l) => somme(l, (j) => j.fondDeCaisse),
    },
    ...MOYENS_PAIEMENT.map((moyen) => ({
      titre: LIBELLES_MOYEN[moyen],
      largeur: 14,
      type: 'montant' as const,
      valeur: (j: JourneeGerant) => montantMoyen(j, moyen),
      total: (l: JourneeGerant[]) => somme(l, (j) => montantMoyen(j, moyen)),
    })),
    {
      titre: 'Total encaissé',
      largeur: 16,
      type: 'montant',
      valeur: (j) => j.totaux.total,
      total: (l) => somme(l, (j) => j.totaux.total),
    },
    {
      titre: 'Espèces attendues',
      largeur: 17,
      type: 'montant',
      valeur: (j) => j.especesAttendues,
      total: (l) => somme(l, (j) => j.especesAttendues),
    },
    {
      titre: 'Espèces comptées',
      largeur: 17,
      type: 'montant',
      valeur: (j) => j.especesComptees,
      total: (l) => somme(l, (j) => j.especesComptees),
    },
    {
      titre: 'Écart',
      largeur: 13,
      type: 'montant',
      valeur: (j) => j.ecart,
      total: (l) => somme(l, (j) => j.ecart),
    },
    { titre: 'Commentaire', largeur: 40, valeur: (j) => j.commentaire },
  ];
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
  const [periode, setPeriode] = useState<Periode>('jours30');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [journees, setJournees] = useState<JourneeGerant[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Mémorisé pour servir à la fois au chargement et à l'export sans relancer
  // une requête à chaque rendu.
  const plage = useMemo(() => bornes(periode, persoDebut, persoFin), [periode, persoDebut, persoFin]);

  useEffect(() => {
    if (!plage) return; // dates libres incomplètes : on garde la liste affichée
    let annule = false;
    setChargement(true);
    setErreur(null);
    api
      .listJournees(plage[0], plage[1])
      .then((j) => {
        if (!annule) setJournees(j);
      })
      .catch((err) => {
        if (!annule) setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [plage]);

  async function handleExport() {
    if (!plage || journees.length === 0) return;
    setExportEnCours(true);
    setErreur(null);
    try {
      const dateFr = (d: Date) => d.toLocaleDateString('fr-FR');
      await telechargerXlsx({
        nomFichier: `maida-clotures-caisse-${suffixePeriode(plage[0], plage[1])}.xlsx`,
        nomFeuille: 'Clôtures de caisse',
        titre: 'Maïda — Clôtures de caisse',
        sousTitre: `Période du ${dateFr(plage[0])} au ${dateFr(plage[1])} — ${journees.length} journée(s)`,
        colonnes: colonnesClotures(),
        lignes: [...journees].reverse(),
      });
    } catch (err) {
      setErreur(err instanceof Error ? err.message : "Échec de l'export");
    } finally {
      setExportEnCours(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SelecteurPeriode
          periode={periode}
          onPeriode={setPeriode}
          persoDebut={persoDebut}
          onPersoDebut={setPersoDebut}
          persoFin={persoFin}
          onPersoFin={setPersoFin}
        />
        <button
          type="button"
          onClick={handleExport}
          disabled={journees.length === 0 || exportEnCours}
          title="Télécharger les clôtures de caisse de la période au format Excel (.xlsx)"
          className={`ml-auto ${boutonSecondaire} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {exportEnCours ? 'Préparation…' : '⬇ Exporter (Excel)'}
        </button>
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}

      {chargement && <p className="text-center text-stone-500">Chargement des journées...</p>}

      {!chargement && journees.length === 0 && (
        <div className={`${carte} py-10 text-center text-stone-400`}>
          Aucune journée de caisse sur cette période. La caisse ouvre sa première journée depuis l'onglet
          « Journée ».
        </div>
      )}

      {!chargement &&
        journees.map((j) => (
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
