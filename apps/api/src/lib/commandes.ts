import type { Prisma } from '../generated/prisma/client';
import { prisma } from './prisma';

// Logique partagée de résolution des lignes d'une commande : utilisée par la
// prise de commande à la caisse ET par la commande client depuis le QR à table
// (validation immédiate côté client, puis re-résolution à l'acceptation).

export interface LigneEntree {
  produitId: string;
  quantite: number;
  options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
}

export interface LigneResolue {
  produitId: string;
  nomProduit: string;
  prixUnitaire: Prisma.Decimal;
  coutRevientUnitaire: Prisma.Decimal | null;
  tauxTva: number;
  quantite: number;
  options: Array<{ optionValeurId: string; nomGroupe: string; valeur: string }>;
}

// Vérifie la forme brute des lignes reçues. Renvoie un message d'erreur, ou
// null si tout est valide.
export function erreurLignesEntree(lignes: unknown): string | null {
  if (!Array.isArray(lignes) || lignes.length === 0) {
    return 'La commande doit contenir au moins un produit';
  }
  if (lignes.length > 30) {
    return 'La commande contient trop de lignes';
  }
  for (const ligne of lignes) {
    if (
      typeof ligne?.produitId !== 'string' ||
      !Number.isInteger(ligne?.quantite) ||
      ligne.quantite <= 0 ||
      ligne.quantite > 50
    ) {
      return 'Chaque ligne doit avoir un produitId et une quantité entière positive';
    }
    if (
      ligne.options !== undefined &&
      (!Array.isArray(ligne.options) ||
        ligne.options.some(
          (o: unknown) =>
            typeof (o as { groupeOptionId?: unknown })?.groupeOptionId !== 'string' ||
            typeof (o as { optionValeurId?: unknown })?.optionValeurId !== 'string',
        ))
    ) {
      return 'Options de ligne invalides';
    }
  }
  return null;
}

// Résout les lignes contre le menu actuel : produits actifs de l'établissement,
// options valides, groupes obligatoires renseignés. Les prix, coûts et taux de
// TVA sont figés ici.
export async function resoudreLignesCommande(
  etablissementId: string,
  lignes: LigneEntree[],
): Promise<{ ok: true; lignes: LigneResolue[] } | { ok: false; erreur: string }> {
  const produitIds = [...new Set(lignes.map((l) => l.produitId))];
  const produits = await prisma.produit.findMany({
    where: { id: { in: produitIds }, etablissementId, statut: 'ACTIF' },
    include: { groupesOptions: { include: { valeurs: true } } },
  });
  const produitsParId = new Map(produits.map((p) => [p.id, p]));

  for (const id of produitIds) {
    if (!produitsParId.has(id)) {
      return { ok: false, erreur: `Produit invalide ou indisponible: ${id}` };
    }
  }

  const resolues: LigneResolue[] = [];
  for (const ligne of lignes) {
    const produit = produitsParId.get(ligne.produitId)!;
    const groupesChoisis = new Set<string>();
    const optionsResolues: LigneResolue['options'] = [];

    for (const choix of ligne.options ?? []) {
      const groupe = produit.groupesOptions.find((g) => g.id === choix.groupeOptionId);
      if (!groupe) {
        return { ok: false, erreur: `Groupe d'option invalide pour ${produit.nom}` };
      }
      if (groupesChoisis.has(groupe.id)) {
        return { ok: false, erreur: `Une seule valeur autorisée par groupe (${groupe.nom})` };
      }
      const valeur = groupe.valeurs.find((v) => v.id === choix.optionValeurId);
      if (!valeur) {
        return { ok: false, erreur: `Valeur d'option invalide pour ${groupe.nom}` };
      }
      groupesChoisis.add(groupe.id);
      optionsResolues.push({ optionValeurId: valeur.id, nomGroupe: groupe.nom, valeur: valeur.valeur });
    }

    const obligatoiresManquants = produit.groupesOptions.filter(
      (g) => g.obligatoire && !groupesChoisis.has(g.id),
    );
    if (obligatoiresManquants.length > 0) {
      return {
        ok: false,
        erreur: `Sélection requise pour ${produit.nom}: ${obligatoiresManquants.map((g) => g.nom).join(', ')}`,
      };
    }

    resolues.push({
      produitId: produit.id,
      nomProduit: produit.nom,
      prixUnitaire: produit.prix,
      coutRevientUnitaire: produit.coutRevient,
      tauxTva: produit.tauxTva,
      quantite: ligne.quantite,
      options: optionsResolues,
    });
  }

  return { ok: true, lignes: resolues };
}
