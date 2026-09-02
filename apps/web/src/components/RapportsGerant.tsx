import { useEffect, useState } from 'react';
import {
  api,
  type ParametresGerant,
  type PorteeRapport,
  type RapportVentes,
  type ResumeCout,
} from '../lib/api';
import { bascule, boutonSecondaire, carte, da, messageErreur } from '../lib/ui';
import { type CelluleCsv, dateFichier, nombreCsv, telechargerCsv } from '../lib/export';
import { LIBELLES_MOYEN } from '../lib/libelles';
import { bornes, type Periode } from '../lib/periode';
import { SelecteurPeriode } from './SelecteurPeriode';
import { Tuile } from './Tuile';

function dateCourte(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// Construit le CSV du rapport : synthèse des indicateurs puis détails vendus.
// `voirCouts` conditionne l'export des coûts/marges comme à l'écran.
function exporterRapport(rapport: RapportVentes, voirCouts: boolean) {
  const surEnseigne = rapport.portee === 'enseigne';
  const lignes: CelluleCsv[][] = [];
  lignes.push(["Maïda — Chiffre d'affaires et indicateurs"]);
  lignes.push(['Période', `${dateCourte(rapport.periode.debut)} au ${dateCourte(rapport.periode.fin)}`]);
  lignes.push([
    'Portée',
    surEnseigne ? "Toute l'enseigne (tous les restaurants)" : 'Restaurant affiché',
  ]);
  lignes.push([]);

  lignes.push(['INDICATEURS']);
  lignes.push(['Indicateur', 'Valeur']);
  lignes.push(['CA encaissé (DA)', nombreCsv(rapport.caEncaisse)]);
  lignes.push(['Nombre de paiements', rapport.nbPaiements]);
  lignes.push(['CA commandé (DA)', nombreCsv(rapport.caCommande)]);
  lignes.push(['Nombre de commandes', rapport.nbCommandes]);
  lignes.push(['Ticket moyen (DA)', nombreCsv(rapport.ticketMoyen)]);
  lignes.push(['Pertes / annulations (DA)', nombreCsv(rapport.pertes.montant)]);
  lignes.push([
    'dont perte sèche après préparation (DA)',
    nombreCsv(rapport.pertes.apresPreparation.montant),
  ]);
  lignes.push(['Remises & offerts (DA)', nombreCsv(rapport.remises.montant)]);
  lignes.push(['TVA collectée (DA)', nombreCsv(rapport.tva.totalTva)]);
  if (voirCouts && rapport.foodCost) {
    const { nourriture, boissons } = rapport.foodCost;
    if (nourriture.pct !== null) {
      lignes.push(['Food cost nourriture (%)', nombreCsv(nourriture.pct)]);
      lignes.push(['Marge brute nourriture (DA)', nombreCsv(nourriture.marge ?? 0)]);
    }
    if (boissons.pct !== null) {
      lignes.push(['Beverage cost boissons (%)', nombreCsv(boissons.pct)]);
      lignes.push(['Marge brute boissons (DA)', nombreCsv(boissons.marge ?? 0)]);
    }
  }

  if (rapport.parEtablissement) {
    lignes.push([]);
    lignes.push(['DÉTAIL PAR RESTAURANT']);
    lignes.push([
      'Restaurant',
      'Commandes',
      'CA commandé (DA)',
      'Ticket moyen (DA)',
      'Paiements',
      'CA encaissé (DA)',
      'Pertes (DA)',
      'Remises & offerts (DA)',
    ]);
    for (const e of rapport.parEtablissement) {
      lignes.push([
        e.nom,
        e.nbCommandes,
        nombreCsv(e.caCommande),
        nombreCsv(e.ticketMoyen),
        e.nbPaiements,
        nombreCsv(e.caEncaisse),
        nombreCsv(e.pertes),
        nombreCsv(e.remises),
      ]);
    }
  }

  lignes.push([]);
  lignes.push(['VENTES PAR PRODUIT']);
  const enTeteProduit: CelluleCsv[] = ['Produit', 'Catégorie', 'Quantité', 'Montant (DA)'];
  if (voirCouts) enTeteProduit.push('Coût (DA)', 'Marge (DA)', 'Food cost (%)');
  lignes.push(enTeteProduit);
  for (const p of rapport.parProduit) {
    const ligne: CelluleCsv[] = [p.nom, p.categorie, p.quantite, nombreCsv(p.montant)];
    if (voirCouts) {
      ligne.push(
        p.cout !== null ? nombreCsv(p.cout) : '',
        p.marge !== null ? nombreCsv(p.marge) : '',
        p.foodCostPct !== null ? nombreCsv(p.foodCostPct) : '',
      );
    }
    lignes.push(ligne);
  }

  lignes.push([]);
  lignes.push(['VENTES PAR CATÉGORIE']);
  lignes.push(['Catégorie', 'Articles', 'Montant (DA)']);
  for (const c of rapport.parCategorie) lignes.push([c.nom, c.quantite, nombreCsv(c.montant)]);

  lignes.push([]);
  lignes.push(['ENCAISSEMENTS PAR MOYEN DE PAIEMENT']);
  lignes.push(['Moyen', 'Nombre', 'Montant (DA)']);
  for (const m of rapport.parMoyen) {
    lignes.push([LIBELLES_MOYEN[m.moyenPaiement], m.nombre, nombreCsv(m.montant)]);
  }

  lignes.push([]);
  lignes.push(['TVA PAR TAUX']);
  lignes.push(['Taux (%)', 'HT (DA)', 'TTC (DA)', 'TVA (DA)']);
  for (const t of rapport.tva.parTaux) {
    lignes.push([t.taux, nombreCsv(t.ht), nombreCsv(t.ttc), nombreCsv(t.tva)]);
  }

  lignes.push([]);
  lignes.push(['ACTIVITÉ PAR SERVEUR']);
  const enTeteServeur: CelluleCsv[] = ['Serveur', 'Commandes', 'Montant (DA)'];
  if (surEnseigne) enTeteServeur.splice(1, 0, 'Restaurant');
  lignes.push(enTeteServeur);
  for (const s of rapport.parServeur) {
    const ligne: CelluleCsv[] = [`${s.prenom} ${s.nom}`, s.nbCommandes, nombreCsv(s.montant)];
    if (surEnseigne) ligne.splice(1, 0, s.etablissement);
    lignes.push(ligne);
  }

  telechargerCsv(`maida-ca${surEnseigne ? '-enseigne' : ''}-${dateFichier()}.csv`, lignes);
}

// Food cost ou beverage cost de la période : % + coût/marge, avec le taux de
// couverture pour prévenir quand des coûts de revient manquent au menu.
function CarteCout({ titre, resume }: { titre: string; resume: ResumeCout }) {
  return (
    <div className={`${carte} flex flex-col gap-1`}>
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{titre}</p>
      {resume.pct !== null ? (
        <>
          <p className="text-2xl font-bold text-stone-900">{resume.pct} %</p>
          <p className="text-xs text-stone-500">
            coût {da(resume.cout ?? 0)} · marge brute {da(resume.marge ?? 0)}
          </p>
          {resume.couverturePct !== null && resume.couverturePct < 100 && (
            <p className="text-xs text-amber-700">
              Calculé sur {resume.couverturePct} % des ventes — complétez les coûts de revient dans le
              Menu pour un chiffre exact.
            </p>
          )}
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-stone-300">—</p>
          <p className="text-xs text-stone-500">
            {resume.ventes > 0
              ? 'Renseignez les coûts de revient de vos produits (Menu → Coût) pour suivre ce chiffre.'
              : 'Aucune vente sur cette période.'}
          </p>
        </>
      )}
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
          {sousLibelle && (
            <span className="ml-1.5 text-xs font-normal text-stone-400">{sousLibelle}</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-stone-500">
          {quantite} — <span className="text-sm font-semibold text-stone-900">{da(montant)}</span>
        </span>
      </div>
      <div className="h-2 w-full">
        <div
          className="h-2 rounded-full bg-brand-600"
          style={{ width: `${largeur}%` }}
          title={`${libelle} : ${da(montant)}`}
        />
      </div>
    </li>
  );
}

/**
 * Rapports de ventes de la période.
 *
 * `nbRestaurants` est le nombre de restaurants de l'enseigne : au-delà d'un,
 * le gérant peut basculer le rapport entier sur l'ensemble. Pour l'immense
 * majorité des clients — un seul restaurant — l'écran reste identique.
 */
export function RapportsGerant({ nbRestaurants = 1 }: { nbRestaurants?: number }) {
  const [periode, setPeriode] = useState<Periode>('aujourdhui');
  const [portee, setPortee] = useState<PorteeRapport>('etablissement');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [rapport, setRapport] = useState<RapportVentes | null>(null);
  const [parametres, setParametres] = useState<ParametresGerant | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    api
      .getParametres()
      .then(setParametres)
      .catch(() => setParametres(null));
  }, []);

  async function handleToggleSuiviCouts() {
    if (!parametres) return;
    try {
      setParametres(await api.updateParametres({ suiviCoutsActive: !parametres.suiviCoutsActive }));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  useEffect(() => {
    const plage = bornes(periode, persoDebut, persoFin);
    if (!plage) return; // dates libres incomplètes : on garde le rapport affiché
    let annule = false;
    setChargement(true);
    setErreur(null);
    api
      .getRapports(plage[0], plage[1], portee)
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
  }, [periode, persoDebut, persoFin, portee]);

  const voirCouts = (parametres?.moduleFoodCost ?? false) && (parametres?.suiviCoutsActive ?? true);
  const maxProduit = rapport?.parProduit[0]?.montant ?? 0;
  const maxCategorie = rapport?.parCategorie[0]?.montant ?? 0;
  const maxServeur = rapport?.parServeur[0]?.montant ?? 0;
  const maxEtablissement = rapport?.parEtablissement?.[0]?.caEncaisse ?? 0;

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
        {nbRestaurants > 1 && (
          <div className="flex gap-2" role="group" aria-label="Portée du rapport">
            <button
              type="button"
              onClick={() => setPortee('etablissement')}
              aria-pressed={portee === 'etablissement'}
              title="Ne compter que le restaurant affiché"
              className={bascule(portee === 'etablissement')}
            >
              Ce restaurant
            </button>
            <button
              type="button"
              onClick={() => setPortee('enseigne')}
              aria-pressed={portee === 'enseigne'}
              title={`Additionner la période sur les ${nbRestaurants} restaurants de l'enseigne`}
              className={bascule(portee === 'enseigne')}
            >
              Toute l'enseigne
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => rapport && exporterRapport(rapport, voirCouts)}
          disabled={!rapport}
          title="Télécharger le chiffre d'affaires et les indicateurs de la période au format CSV (Excel)"
          className={`ml-auto ${boutonSecondaire} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          ⬇ Exporter (CSV)
        </button>
        {parametres?.moduleFoodCost && (
          <button
            type="button"
            onClick={handleToggleSuiviCouts}
            title="Affiche ou masque les coûts de revient, marges et food cost dans tout l'espace gérant"
            aria-pressed={parametres.suiviCoutsActive}
            className={bascule(parametres.suiviCoutsActive)}
          >
            {parametres.suiviCoutsActive ? '✓ Coûts & marges affichés' : 'Coûts & marges masqués'}
          </button>
        )}
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}
      {chargement && !rapport && <p className="text-center text-stone-500">Chargement du rapport...</p>}

      {rapport && (
        <div className={`flex flex-col gap-4 ${chargement ? 'opacity-60' : ''}`}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tuile
              libelle="CA encaissé"
              valeur={da(rapport.caEncaisse)}
              detail={`${rapport.nbPaiements} paiement${rapport.nbPaiements > 1 ? 's' : ''}`}
            />
            <Tuile
              libelle="Commandes"
              valeur={String(rapport.nbCommandes)}
              detail={`${da(rapport.caCommande)} commandés`}
            />
            <Tuile libelle="Ticket moyen" valeur={da(rapport.ticketMoyen)} detail="par commande" />
            <Tuile
              libelle="Pertes (annulations)"
              valeur={da(rapport.pertes.montant)}
              detail={
                rapport.pertes.apresPreparation.quantite > 0
                  ? `dont ${da(rapport.pertes.apresPreparation.montant)} de perte sèche après préparation`
                  : `${rapport.pertes.quantite} article${rapport.pertes.quantite > 1 ? 's' : ''} annulé${rapport.pertes.quantite > 1 ? 's' : ''}`
              }
              accent={rapport.pertes.montant > 0}
            />
            <Tuile
              libelle="Remises & offerts"
              valeur={da(rapport.remises.montant)}
              detail={
                rapport.remises.offerts.quantite > 0
                  ? `${rapport.remises.nombre} geste${rapport.remises.nombre > 1 ? 's' : ''}, dont ${rapport.remises.offerts.quantite} article${rapport.remises.offerts.quantite > 1 ? 's' : ''} offert${rapport.remises.offerts.quantite > 1 ? 's' : ''}`
                  : `${rapport.remises.nombre} geste${rapport.remises.nombre > 1 ? 's' : ''} commercial${rapport.remises.nombre > 1 ? 'aux' : ''}`
              }
            />
          </div>

          {voirCouts && rapport.foodCost && (
            <div className="grid gap-3 sm:grid-cols-2">
              <CarteCout titre="Food cost — nourriture" resume={rapport.foodCost.nourriture} />
              <CarteCout titre="Beverage cost — boissons" resume={rapport.foodCost.boissons} />
            </div>
          )}

          {rapport.parEtablissement && (
            <div className={carte}>
              <h3 className="mb-2 font-semibold text-stone-900">CA par restaurant</h3>
              <ul className="flex flex-col divide-y divide-stone-100">
                {rapport.parEtablissement.map((e) => (
                  <LigneBarre
                    key={e.id}
                    libelle={e.nom}
                    quantite={`${e.nbCommandes} commande${e.nbCommandes > 1 ? 's' : ''} · ticket moyen ${da(e.ticketMoyen)}`}
                    montant={e.caEncaisse}
                    max={maxEtablissement}
                  />
                ))}
              </ul>
              <p className="mt-2 text-xs text-stone-400">
                Montants encaissés sur la période. Les palmarès et les totaux ci-dessous additionnent les{' '}
                {rapport.parEtablissement.length} restaurants.
              </p>
            </div>
          )}

          <div className="grid items-start gap-4 lg:grid-cols-2">
            <div className={carte}>
              <h3 className="mb-2 font-semibold text-stone-900">Palmarès des produits</h3>
              <ul className="flex flex-col divide-y divide-stone-100">
                {rapport.parProduit.slice(0, 12).map((p) => (
                  <LigneBarre
                    key={p.nom}
                    libelle={p.nom}
                    sousLibelle={p.categorie}
                    quantite={`${p.quantite} vendu${p.quantite > 1 ? 's' : ''}${
                      voirCouts && p.marge !== null
                        ? ` · marge ${da(p.marge)} (FC ${p.foodCostPct} %)`
                        : ''
                    }`}
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
                <h3 className="mb-2 font-semibold text-stone-900">
                  Encaissements par moyen de paiement
                </h3>
                <ul className="flex flex-col divide-y divide-stone-100 text-sm">
                  {rapport.parMoyen.map((m) => (
                    <li key={m.moyenPaiement} className="flex items-center justify-between py-2">
                      <span className="text-stone-600">
                        {LIBELLES_MOYEN[m.moyenPaiement]}{' '}
                        <span className="text-xs text-stone-400">
                          ({m.nombre} paiement{m.nombre > 1 ? 's' : ''})
                        </span>
                      </span>
                      <span className="font-semibold text-stone-900">{da(m.montant)}</span>
                    </li>
                  ))}
                  {rapport.parMoyen.length === 0 && (
                    <li className="py-2 text-stone-400">Aucun encaissement sur cette période.</li>
                  )}
                </ul>
              </div>

              <div className={carte}>
                <h3 className="mb-2 font-semibold text-stone-900">TVA collectée</h3>
                <ul className="flex flex-col divide-y divide-stone-100 text-sm">
                  {rapport.tva.parTaux.map((t) => (
                    <li key={t.taux} className="flex items-center justify-between py-2">
                      <span className="text-stone-600">
                        TVA {t.taux} %{' '}
                        <span className="text-xs text-stone-400">
                          (HT {da(t.ht)} · TTC {da(t.ttc)})
                        </span>
                      </span>
                      <span className="font-semibold text-stone-900">{da(t.tva)}</span>
                    </li>
                  ))}
                  {rapport.tva.parTaux.length === 0 && (
                    <li className="py-2 text-stone-400">Aucune vente sur cette période.</li>
                  )}
                  {rapport.tva.parTaux.length > 1 && (
                    <li className="flex items-center justify-between py-2">
                      <span className="font-medium text-brand-900">Total TVA</span>
                      <span className="font-bold text-brand-800">{da(rapport.tva.totalTva)}</span>
                    </li>
                  )}
                </ul>
                {rapport.tva.nonVentile > 0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    {da(rapport.tva.nonVentile)} de ventes antérieures à la TVA ne sont pas ventilés.
                  </p>
                )}
              </div>

              <div className={carte}>
                <h3 className="mb-2 font-semibold text-stone-900">Activité par serveur</h3>
                <ul className="flex flex-col divide-y divide-stone-100">
                  {rapport.parServeur.map((s) => (
                    <LigneBarre
                      key={s.id}
                      libelle={`${s.prenom} ${s.nom}`}
                      sousLibelle={rapport.portee === 'enseigne' ? s.etablissement : undefined}
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
