import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { type Colonne, preparerFeuille, suffixePeriode, telechargerClasseur } from '../lib/exportExcel';
import { bornes, type Periode } from '../lib/periode';
import { boutonSecondaire, carte, messageErreur } from '../lib/ui';
import { HistoriqueAnnulations, type Annulation } from './HistoriqueAnnulations';
import { HistoriqueRemises, type Remise } from './HistoriqueRemises';
import { SelecteurPeriode } from './SelecteurPeriode';

const somme = (valeurs: number[]) => Math.round(valeurs.reduce((t, v) => t + v, 0) * 100) / 100;

// Une ligne par annulation, dans l'ordre chronologique : c'est la lecture
// attendue par un comptable, alors que l'écran affiche la plus récente d'abord.
// La colonne « perte sèche » isole ce qui était déjà préparé, donc perdu.
function colonnesAnnulations(): Colonne<Annulation>[] {
  return [
    { titre: 'Date', largeur: 18, type: 'dateHeure', valeur: (a) => new Date(a.creeLe) },
    {
      titre: 'Origine',
      largeur: 14,
      valeur: (a) => (a.canal === 'SUR_PLACE' ? `Table ${a.table?.numero ?? '?'}` : 'À emporter'),
    },
    {
      titre: 'Produit',
      largeur: 28,
      valeur: (a) => a.produit ?? 'Commande entière',
    },
    {
      titre: 'Quantité',
      largeur: 10,
      type: 'nombre',
      valeur: (a) => a.quantite,
      total: (l) => somme(l.map((a) => a.quantite)),
    },
    {
      titre: 'Montant annulé',
      largeur: 16,
      type: 'montant',
      valeur: (a) => a.montant,
      total: (l) => somme(l.map((a) => a.montant)),
    },
    { titre: 'Après préparation', largeur: 16, valeur: (a) => (a.apresPreparation ? 'Oui' : 'Non') },
    {
      titre: 'Perte sèche',
      largeur: 14,
      type: 'montant',
      valeur: (a) => (a.apresPreparation ? a.montant : 0),
      total: (l) => somme(l.filter((a) => a.apresPreparation).map((a) => a.montant)),
    },
    { titre: 'Motif', largeur: 22, valeur: (a) => a.motif },
    { titre: 'Commentaire', largeur: 34, valeur: (a) => a.commentaire },
    { titre: 'Annulé par', largeur: 20, valeur: (a) => `${a.annuleePar.prenom} ${a.annuleePar.nom}` },
    {
      titre: 'Rôle',
      largeur: 10,
      valeur: (a) => (a.annuleePar.role === 'GERANT' ? 'Gérant' : 'Serveur'),
    },
    {
      titre: 'Demandé par',
      largeur: 20,
      valeur: (a) => (a.demandeePar ? `${a.demandeePar.prenom} ${a.demandeePar.nom}` : null),
    },
  ];
}

function colonnesRemises(): Colonne<Remise>[] {
  return [
    { titre: 'Date', largeur: 18, type: 'dateHeure', valeur: (r) => new Date(r.creeLe) },
    { titre: 'Type', largeur: 10, valeur: (r) => (r.type === 'OFFERT' ? 'Offert' : 'Remise') },
    {
      titre: 'Origine',
      largeur: 14,
      valeur: (r) => (r.table ? `Table ${r.table.numero}` : 'À emporter'),
    },
    { titre: 'Produit', largeur: 28, valeur: (r) => r.produit },
    {
      titre: 'Quantité',
      largeur: 10,
      type: 'nombre',
      valeur: (r) => r.quantite,
      total: (l) => somme(l.map((r) => r.quantite ?? 0)),
    },
    { titre: 'Remise (%)', largeur: 12, type: 'nombre', valeur: (r) => r.pourcentage },
    {
      titre: 'Montant',
      largeur: 16,
      type: 'montant',
      valeur: (r) => r.montant,
      total: (l) => somme(l.map((r) => r.montant)),
    },
    { titre: 'Motif', largeur: 22, valeur: (r) => r.motif },
    { titre: 'Commentaire', largeur: 34, valeur: (r) => r.commentaire },
    {
      titre: 'Accordé par',
      largeur: 20,
      valeur: (r) => `${r.accordeePar.prenom} ${r.accordeePar.nom}`,
    },
    {
      titre: 'Rôle',
      largeur: 10,
      valeur: (r) => (r.accordeePar.role === 'GERANT' ? 'Gérant' : 'Serveur'),
    },
    {
      titre: 'Demandé par',
      largeur: 20,
      valeur: (r) => (r.demandeePar ? `${r.demandeePar.prenom} ${r.demandeePar.nom}` : null),
    },
  ];
}

/**
 * Onglet « Annulations & remises » du gérant : une période commune aux deux
 * historiques, et un export Excel qui les réunit en un classeur de deux feuilles
 * — ce sont les deux postes qu'un comptable rapproche du chiffre d'affaires.
 */
export function AnnulationsRemises() {
  const [periode, setPeriode] = useState<Periode>('jours30');
  const [persoDebut, setPersoDebut] = useState('');
  const [persoFin, setPersoFin] = useState('');
  const [annulations, setAnnulations] = useState<Annulation[]>([]);
  const [remises, setRemises] = useState<Remise[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [exportEnCours, setExportEnCours] = useState(false);

  // Mémorisé pour servir au chargement comme à l'export sans relancer une
  // requête à chaque rendu.
  const plage = useMemo(() => bornes(periode, persoDebut, persoFin), [periode, persoDebut, persoFin]);

  useEffect(() => {
    if (!plage) return; // dates libres incomplètes : on garde l'affichage en cours
    let annule = false;
    setChargement(true);
    setErreur(null);
    Promise.all([api.listRemises(plage[0], plage[1]), api.listAnnulations(plage[0], plage[1])])
      .then(([r, a]) => {
        if (annule) return;
        setRemises(r);
        setAnnulations(a);
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

  const rienAExporter = annulations.length === 0 && remises.length === 0;

  async function handleExport() {
    if (!plage || rienAExporter) return;
    setExportEnCours(true);
    setErreur(null);
    try {
      const dateFr = (d: Date) => d.toLocaleDateString('fr-FR');
      const periodeFr = `Période du ${dateFr(plage[0])} au ${dateFr(plage[1])}`;
      await telechargerClasseur(`maida-annulations-remises-${suffixePeriode(plage[0], plage[1])}.xlsx`, [
        preparerFeuille({
          nomFeuille: 'Annulations',
          titre: 'Maïda — Annulations',
          sousTitre: `${periodeFr} — ${annulations.length} annulation(s)`,
          colonnes: colonnesAnnulations(),
          lignes: [...annulations].reverse(),
        }),
        preparerFeuille({
          nomFeuille: 'Remises et offerts',
          titre: 'Maïda — Remises et offerts',
          sousTitre: `${periodeFr} — ${remises.length} geste(s) commercial(aux)`,
          colonnes: colonnesRemises(),
          lignes: [...remises].reverse(),
        }),
      ]);
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
          disabled={rienAExporter || exportEnCours}
          title="Télécharger les annulations et les remises de la période au format Excel (.xlsx), une feuille par nature"
          className={`ml-auto ${boutonSecondaire} disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {exportEnCours ? 'Préparation…' : '⬇ Exporter (Excel)'}
        </button>
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}

      {chargement && <p className="text-center text-stone-500">Chargement...</p>}

      {!chargement && rienAExporter && (
        <div className={`${carte} py-10 text-center text-stone-400`}>
          Aucune annulation ni remise sur cette période.
        </div>
      )}

      {!chargement && !rienAExporter && (
        <div className={`flex flex-col gap-4 ${exportEnCours ? 'opacity-60' : ''}`}>
          <HistoriqueRemises remises={remises} />
          <HistoriqueAnnulations annulations={annulations} />
        </div>
      )}
    </div>
  );
}
