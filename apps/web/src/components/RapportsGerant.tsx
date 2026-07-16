import { useEffect, useState } from 'react';
import { api, type ModePaiement, type RapportVentes } from '../lib/api';
import { carte, champ, messageErreur } from '../lib/ui';

const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

const PERIODES = [
  { id: 'aujourdhui', libelle: "Aujourd'hui" },
  { id: 'hier', libelle: 'Hier' },
  { id: 'jours7', libelle: '7 jours' },
  { id: 'jours30', libelle: '30 jours' },
  { id: 'perso', libelle: 'Dates libres' },
] as const;

type Periode = (typeof PERIODES)[number]['id'];

function debutDeJour(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function finDeJour(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

function bornes(periode: Periode, persoDebut: string, persoFin: string): [Date, Date] | null {
  const maintenant = new Date();
  if (periode === 'aujourdhui') return [debutDeJour(maintenant), finDeJour(maintenant)];
  if (periode === 'hier') {
    const hier = new Date(maintenant);
    hier.setDate(hier.getDate() - 1);
    return [debutDeJour(hier), finDeJour(hier)];
  }
  if (periode === 'jours7' || periode === 'jours30') {
    const debut = new Date(maintenant);
    debut.setDate(debut.getDate() - (periode === 'jours7' ? 6 : 29));
    return [debutDeJour(debut), finDeJour(maintenant)];
  }
  if (!persoDebut || !persoFin) return null;
  const debut = new Date(persoDebut);
  const fin = new Date(persoFin);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || debut > fin) return null;
  return [debutDeJour(debut), finDeJour(fin)];
}

function Tuile({ libelle, valeur, detail, accent }: { libelle: string; valeur: string; detail?: string; accent?: 'perte' }) {
  return (
    <div className={`${carte} flex flex-col gap-1`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{libelle}</p>
      <p className={`text-2xl font-bold ${accent === 'perte' ? 'text-red-700' : 'text-stone-900'}`}>{valeur}</p>
      {detail && <p className="text-xs text-stone-500">{detail}</p>}
    </div>
  );
}

// Ligne de palmarès : libellé, quantité, montant et barre proportionnelle au max.
function LigneBarre({
  libelle,
  sousLibelle,
  quantite,
  montant,
  max,
}: {
  libelle: string;
  sousLibelle?: string;
  quantite: string;
  montant: number;
  max: number;
}) {
  const largeur = max > 0 ? Math.max(2, Math.round((montant / max) * 100)) : 0;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium text-stone-900">
          {libelle}
          {sousLibelle && <span className="ml-1.5 text-xs font-normal text-stone-400">{sousLibelle}</span>}
        </span>
        <span className="shrink-0 text-xs text-stone-500">
          {quantite} — <span className="text-sm font-semibold text-stone-900">{montant} DA</span>
        </span>
      </div>
      <div className="h-2 w-full">
        <div
          className="h-2 rounded-full bg-brand-600"
          style={{ width: `${largeur}%` }}
          title={`${libelle} : ${montant} DA`}
        />
      </div>
    </li>
  );
}

export function RapportsGerant() {
  const [periode, setPeriode] = useState<Periode>('aujourdhui');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [rapport, setRapport] = useState<RapportVentes | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    const plage = bornes(periode, persoDebut, persoFin);
    if (!plage) return; // dates libres incomplètes : on garde le rapport affiché
    let annule = false;
    setChargement(true);
    setErreur(null);
    api
      .getRapports(plage[0], plage[1])
      .then((r) => {
        if (!annule) setRapport(r);
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
  }, [periode, persoDebut, persoFin]);

  const maxProduit = rapport?.parProduit[0]?.montant ?? 0;
  const maxCategorie = rapport?.parCategorie[0]?.montant ?? 0;
  const maxServeur = rapport?.parServeur[0]?.montant ?? 0;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PERIODES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setPeriode(p.id)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              periode === p.id
                ? 'bg-stone-900 text-white'
                : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
            }`}
          >
            {p.libelle}
          </button>
        ))}
        {periode === 'perso' && (
          <span className="flex items-center gap-2">
            <input
              type="date"
              value={persoDebut}
              onChange={(e) => setPersoDebut(e.target.value)}
              className={`${champ} w-auto`}
            />
            <span className="text-sm text-stone-400">→</span>
            <input
              type="date"
              value={persoFin}
              onChange={(e) => setPersoFin(e.target.value)}
              className={`${champ} w-auto`}
            />
          </span>
        )}
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}
      {chargement && !rapport && <p className="text-center text-stone-500">Chargement du rapport...</p>}

      {rapport && (
        <div className={`flex flex-col gap-4 ${chargement ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tuile
              libelle="CA encaissé"
              valeur={`${rapport.caEncaisse} DA`}
              detail={`${rapport.nbPaiements} paiement${rapport.nbPaiements > 1 ? 's' : ''}`}
            />
            <Tuile
              libelle="Commandes"
              valeur={String(rapport.nbCommandes)}
              detail={`${rapport.caCommande} DA commandés`}
            />
            <Tuile libelle="Ticket moyen" valeur={`${rapport.ticketMoyen} DA`} detail="par commande" />
            <Tuile
              libelle="Pertes (annulations)"
              valeur={`${rapport.pertes.montant} DA`}
              detail={
                rapport.pertes.apresPreparation.quantite > 0
                  ? `dont ${rapport.pertes.apresPreparation.montant} DA de perte sèche après préparation`
                  : `${rapport.pertes.quantite} article${rapport.pertes.quantite > 1 ? 's' : ''} annulé${rapport.pertes.quantite > 1 ? 's' : ''}`
              }
              accent={rapport.pertes.montant > 0 ? 'perte' : undefined}
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className={carte}>
              <h3 className="mb-2 font-semibold text-stone-900">Palmarès des produits</h3>
              <ul className="flex flex-col divide-y divide-stone-100">
                {rapport.parProduit.slice(0, 12).map((p) => (
                  <LigneBarre
                    key={p.nom}
                    libelle={p.nom}
                    sousLibelle={p.categorie}
                    quantite={`${p.quantite} vendu${p.quantite > 1 ? 's' : ''}`}
                    montant={p.montant}
                    max={maxProduit}
                  />
                ))}
                {rapport.parProduit.length === 0 && (
                  <li className="py-2 text-sm text-stone-400">Aucune vente sur cette période.</li>
                )}
              </ul>
              {rapport.parProduit.length > 12 && (
                <p className="mt-2 text-xs text-stone-400">
                  {rapport.parProduit.length - 12} autres produits vendus sur la période.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div className={carte}>
                <h3 className="mb-2 font-semibold text-stone-900">CA par catégorie</h3>
                <ul className="flex flex-col divide-y divide-stone-100">
                  {rapport.parCategorie.map((c) => (
                    <LigneBarre
                      key={c.nom}
                      libelle={c.nom}
                      quantite={`${c.quantite} article${c.quantite > 1 ? 's' : ''}`}
                      montant={c.montant}
                      max={maxCategorie}
                    />
                  ))}
                  {rapport.parCategorie.length === 0 && (
                    <li className="py-2 text-sm text-stone-400">Aucune vente sur cette période.</li>
                  )}
                </ul>
              </div>

              <div className={carte}>
                <h3 className="mb-2 font-semibold text-stone-900">Encaissements par moyen de paiement</h3>
                <ul className="flex flex-col divide-y divide-stone-100 text-sm">
                  {rapport.parMoyen.map((m) => (
                    <li key={m.moyenPaiement} className="flex items-center justify-between py-2">
                      <span className="text-stone-600">
                        {LIBELLES_MOYEN[m.moyenPaiement]}{' '}
                        <span className="text-xs text-stone-400">
                          ({m.nombre} paiement{m.nombre > 1 ? 's' : ''})
                        </span>
                      </span>
                      <span className="font-semibold text-stone-900">{m.montant} DA</span>
                    </li>
                  ))}
                  {rapport.parMoyen.length === 0 && (
                    <li className="py-2 text-stone-400">Aucun encaissement sur cette période.</li>
                  )}
                </ul>
              </div>

              <div className={carte}>
                <h3 className="mb-2 font-semibold text-stone-900">Activité par serveur</h3>
                <ul className="flex flex-col divide-y divide-stone-100">
                  {rapport.parServeur.map((s) => (
                    <LigneBarre
                      key={`${s.prenom}-${s.nom}`}
                      libelle={`${s.prenom} ${s.nom}`}
                      quantite={`${s.nbCommandes} commande${s.nbCommandes > 1 ? 's' : ''}`}
                      montant={s.montant}
                      max={maxServeur}
                    />
                  ))}
                  {rapport.parServeur.length === 0 && (
                    <li className="py-2 text-sm text-stone-400">Aucune commande sur cette période.</li>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
