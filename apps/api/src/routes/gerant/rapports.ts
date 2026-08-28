import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { arrondi, getContexteGerant } from './partage';

// Rapports de ventes de l'espace gérant.
// Convention : CA commandé / palmarès produits / food cost sont BRUTS (avant
// gestes commerciaux) ; le CA encaissé est le réel.

export const rapportsRouter = Router();

// TVA collectée par taux : prix TTC, donc HT = TTC / (1 + taux/100).
// Les remises sur addition réduisent la base taxable : elles sont réparties
// au prorata du TTC de chaque taux (approximation comptable classique).
function calculerTva(ttcParTaux: Map<number | null, number>, remisesTotal: number) {
  const totalVentile = [...ttcParTaux.entries()]
    .filter(([taux]) => taux !== null)
    .reduce((s, [, ttc]) => s + ttc, 0);

  const parTaux = [...ttcParTaux.entries()]
    .filter((entree): entree is [number, number] => entree[0] !== null)
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttcBrut]) => {
      const remiseAllouee = totalVentile > 0 ? (remisesTotal * ttcBrut) / totalVentile : 0;
      const ttc = Math.max(0, arrondi(ttcBrut - remiseAllouee));
      const ht = arrondi(ttc / (1 + taux / 100));
      return { taux, ttc, ht, tva: arrondi(ttc - ht) };
    });

  return {
    parTaux,
    totalTva: arrondi(parTaux.reduce((s, t) => s + t.tva, 0)),
    // Lignes d'avant l'introduction de la TVA : TTC connu, taux inconnu.
    nonVentile: arrondi(ttcParTaux.get(null) ?? 0),
  };
}

// Résumé food/bev cost : % calculé sur la part des ventes dont le coût est
// connu, avec le taux de couverture pour juger de la fiabilité du chiffre.
function resumeCout(t: { ventes: number; ventesCoutees: number; cout: number }) {
  return {
    ventes: arrondi(t.ventes),
    cout: t.ventesCoutees > 0 ? arrondi(t.cout) : null,
    marge: t.ventesCoutees > 0 ? arrondi(t.ventesCoutees - t.cout) : null,
    pct: t.ventesCoutees > 0 ? arrondi((t.cout / t.ventesCoutees) * 100) : null,
    couverturePct: t.ventes > 0 ? arrondi((t.ventesCoutees / t.ventes) * 100) : null,
  };
}

rapportsRouter.get('/rapports', async (req, res) => {
  const { debut, fin } = req.query;

  if (typeof debut !== 'string' || typeof fin !== 'string') {
    res.status(400).json({ error: 'Période requise (debut et fin)' });
    return;
  }
  const dateDebut = new Date(debut);
  const dateFin = new Date(fin);
  if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime()) || dateDebut > dateFin) {
    res.status(400).json({ error: 'Période invalide' });
    return;
  }

  const { compteClientId, etablissementId } = await getContexteGerant(req.user!.id);
  const periode = { gte: dateDebut, lte: dateFin };

  // Le food cost n'est renvoyé que si le module est accordé au compte client.
  const compte = await prisma.compteClient.findUnique({
    where: { id: compteClientId },
    select: { modules: true },
  });
  const moduleFoodCost = compte?.modules.includes('FOOD_COST') ?? false;

  const [paiements, commandes, annulations, remises] = await Promise.all([
    prisma.paiement.findMany({
      where: { addition: { etablissementId }, creeLe: periode },
      select: { montant: true, moyenPaiement: true },
    }),
    prisma.commande.findMany({
      where: { etablissementId, creeLe: periode },
      select: {
        statut: true,
        serveur: { select: { id: true, nom: true, prenom: true } },
        lignes: {
          select: {
            nomProduit: true,
            prixUnitaire: true,
            coutRevientUnitaire: true,
            tauxTva: true,
            quantite: true,
            quantiteAnnulee: true,
            quantiteOfferte: true,
            produit: { select: { categorie: { select: { nom: true, type: true } } } },
          },
        },
      },
    }),
    prisma.annulation.findMany({
      where: { etablissementId, creeLe: periode },
      select: { montant: true, quantite: true, apresPreparation: true },
    }),
    prisma.remise.findMany({
      where: { etablissementId, creeLe: periode },
      select: { type: true, montant: true, quantite: true },
    }),
  ]);

  // Encaissements par moyen de paiement
  const parMoyenMap = new Map<string, { montant: number; nombre: number }>();
  for (const p of paiements) {
    const entree = parMoyenMap.get(p.moyenPaiement) ?? { montant: 0, nombre: 0 };
    entree.montant += Number(p.montant);
    entree.nombre += 1;
    parMoyenMap.set(p.moyenPaiement, entree);
  }
  const parMoyen = [...parMoyenMap.entries()]
    .map(([moyenPaiement, v]) => ({ moyenPaiement, montant: arrondi(v.montant), nombre: v.nombre }))
    .sort((a, b) => b.montant - a.montant);
  const caEncaisse = arrondi(parMoyen.reduce((s, m) => s + m.montant, 0));

  // Ventes par produit / catégorie / serveur (quantités annulées exclues).
  // Le coût n'est connu que sur les lignes dont le produit avait un coût de
  // revient au moment de la commande : on suit séparément la part « couverte ».
  const parProduitMap = new Map<
    string,
    { categorie: string; quantite: number; montant: number; cout: number; montantCoute: number }
  >();
  const parCategorieMap = new Map<string, { quantite: number; montant: number }>();
  const parServeurMap = new Map<
    string,
    { nom: string; prenom: string; nbCommandes: number; montant: number }
  >();
  const parType = {
    NOURRITURE: { ventes: 0, ventesCoutees: 0, cout: 0 },
    BOISSON: { ventes: 0, ventesCoutees: 0, cout: 0 },
  };
  // TTC réellement facturable par taux de TVA (hors annulé et offert).
  // null = lignes d'avant l'introduction de la TVA, non ventilables.
  const ttcParTaux = new Map<number | null, number>();
  let caCommande = 0;
  let nbCommandes = 0;

  for (const commande of commandes) {
    if (commande.statut === 'ANNULEE') continue;
    nbCommandes += 1;
    let montantCommande = 0;

    for (const ligne of commande.lignes) {
      const quantite = ligne.quantite - ligne.quantiteAnnulee;
      if (quantite <= 0) continue;
      const montant = Number(ligne.prixUnitaire) * quantite;
      const cout =
        ligne.coutRevientUnitaire !== null ? Number(ligne.coutRevientUnitaire) * quantite : null;
      const categorie = ligne.produit.categorie.nom;
      montantCommande += montant;

      const prod = parProduitMap.get(ligne.nomProduit) ?? {
        categorie,
        quantite: 0,
        montant: 0,
        cout: 0,
        montantCoute: 0,
      };
      prod.quantite += quantite;
      prod.montant += montant;
      if (cout !== null) {
        prod.cout += cout;
        prod.montantCoute += montant;
      }
      parProduitMap.set(ligne.nomProduit, prod);

      const cat = parCategorieMap.get(categorie) ?? { quantite: 0, montant: 0 };
      cat.quantite += quantite;
      cat.montant += montant;
      parCategorieMap.set(categorie, cat);

      const type = parType[ligne.produit.categorie.type];
      type.ventes += montant;
      if (cout !== null) {
        type.ventesCoutees += montant;
        type.cout += cout;
      }

      const quantiteFacturable = quantite - ligne.quantiteOfferte;
      if (quantiteFacturable > 0) {
        const ttc = Number(ligne.prixUnitaire) * quantiteFacturable;
        ttcParTaux.set(ligne.tauxTva, (ttcParTaux.get(ligne.tauxTva) ?? 0) + ttc);
      }
    }

    caCommande += montantCommande;
    const serveur = parServeurMap.get(commande.serveur.id) ?? {
      nom: commande.serveur.nom,
      prenom: commande.serveur.prenom,
      nbCommandes: 0,
      montant: 0,
    };
    serveur.nbCommandes += 1;
    serveur.montant += montantCommande;
    parServeurMap.set(commande.serveur.id, serveur);
  }

  // Pertes : annulations de la période (perte sèche = après préparation)
  const pertes = { montant: 0, quantite: 0, apresPreparation: { montant: 0, quantite: 0 } };
  for (const a of annulations) {
    pertes.montant += Number(a.montant);
    pertes.quantite += a.quantite;
    if (a.apresPreparation) {
      pertes.apresPreparation.montant += Number(a.montant);
      pertes.apresPreparation.quantite += a.quantite;
    }
  }

  res.json({
    periode: { debut: dateDebut, fin: dateFin },
    caEncaisse,
    nbPaiements: paiements.length,
    parMoyen,
    caCommande: arrondi(caCommande),
    nbCommandes,
    ticketMoyen: nbCommandes > 0 ? arrondi(caCommande / nbCommandes) : 0,
    parProduit: [...parProduitMap.entries()]
      .map(([nom, v]) => ({
        nom,
        categorie: v.categorie,
        quantite: v.quantite,
        montant: arrondi(v.montant),
        // Marge et food cost % calculés sur la part des ventes dont le coût est connu.
        cout: moduleFoodCost && v.montantCoute > 0 ? arrondi(v.cout) : null,
        marge: moduleFoodCost && v.montantCoute > 0 ? arrondi(v.montantCoute - v.cout) : null,
        foodCostPct:
          moduleFoodCost && v.montantCoute > 0 ? arrondi((v.cout / v.montantCoute) * 100) : null,
      }))
      .sort((a, b) => b.montant - a.montant),
    parCategorie: [...parCategorieMap.entries()]
      .map(([nom, v]) => ({ nom, quantite: v.quantite, montant: arrondi(v.montant) }))
      .sort((a, b) => b.montant - a.montant),
    parServeur: [...parServeurMap.values()]
      .map((s) => ({ ...s, montant: arrondi(s.montant) }))
      .sort((a, b) => b.montant - a.montant),
    pertes: {
      montant: arrondi(pertes.montant),
      quantite: pertes.quantite,
      apresPreparation: {
        montant: arrondi(pertes.apresPreparation.montant),
        quantite: pertes.apresPreparation.quantite,
      },
    },
    foodCost: moduleFoodCost
      ? {
          nourriture: resumeCout(parType.NOURRITURE),
          boissons: resumeCout(parType.BOISSON),
        }
      : null,
    remises: {
      montant: arrondi(remises.reduce((s, r) => s + Number(r.montant), 0)),
      nombre: remises.length,
      offerts: {
        montant: arrondi(
          remises.filter((r) => r.type === 'OFFERT').reduce((s, r) => s + Number(r.montant), 0),
        ),
        quantite: remises.filter((r) => r.type === 'OFFERT').reduce((s, r) => s + (r.quantite ?? 0), 0),
      },
    },
    tva: calculerTva(
      ttcParTaux,
      remises.filter((r) => r.type === 'REMISE').reduce((s, r) => s + Number(r.montant), 0),
    ),
  });
});
