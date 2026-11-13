import { Prisma } from '../generated/prisma/client';
import { prisma } from './prisma';

// Adresse publique de réservation d'un restaurant : « /reserver/le-bon-grill ».
// Elle vit sur Instagram, Google Maps, un site, une affiche en vitrine — donc
// elle doit se lire, se dicter, et ne jamais changer une fois publiée.

/** « Café d'El Djazaïr » → « cafe-d-el-djazair ». */
export function slugifier(nom: string): string {
  const slug = nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/, '');
  // Un nom entièrement en arabe ne laisse aucune lettre latine : on garde un
  // lien valable plutôt qu'un lien vide.
  return slug || 'restaurant';
}

/**
 * Le lien du restaurant, créé à la première demande s'il n'existe pas encore.
 * Deux enseignes peuvent porter le même nom : la seconde reçoit « -2 », etc.
 */
export async function assurerLienPublic(etablissementId: string): Promise<string> {
  const etablissement = await prisma.etablissement.findUniqueOrThrow({
    where: { id: etablissementId },
    select: { nom: true, lienPublic: true },
  });
  if (etablissement.lienPublic) return etablissement.lienPublic;

  const base = slugifier(etablissement.nom);
  for (let n = 1; n <= 50; n++) {
    const candidat = n === 1 ? base : `${base}-${n}`;
    try {
      // Conditionnel : si une autre requête vient de l'attribuer, on la garde.
      await prisma.etablissement.updateMany({
        where: { id: etablissementId, lienPublic: null },
        data: { lienPublic: candidat },
      });
      const apres = await prisma.etablissement.findUniqueOrThrow({
        where: { id: etablissementId },
        select: { lienPublic: true },
      });
      return apres.lienPublic!;
    } catch (error) {
      // Déjà pris par un autre restaurant : on essaie le suivant.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }
  throw new Error(`Aucun lien public libre pour « ${etablissement.nom} »`);
}
