// Outils partagés du contrôle d'accès : code de rattachement des terminaux,
// jetons de réinitialisation de mot de passe, et journal des connexions.

import { randomBytes, randomInt } from 'crypto';
import type { Request } from 'express';
import type { ResultatConnexion, TypeConnexion } from '../generated/prisma/client';
import { prisma } from './prisma';

// Alphabet sans caractères confondables : ni O/0, ni I/1, ni S/5.
// Le code est lu sur un écran puis tapé sur une tablette, souvent par
// quelqu'un qui n'a pas installé le logiciel.
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789';
const LONGUEUR_CODE = 8;

export function genererCodeTerminal(): string {
  let code = '';
  for (let i = 0; i < LONGUEUR_CODE; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}

/**
 * Ramène un code saisi à sa forme canonique : on accepte les minuscules, les
 * espaces et les tirets que les gens ajoutent naturellement en recopiant.
 */
export function normaliserCodeTerminal(saisie: string): string {
  return saisie.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Affichage en deux blocs, plus facile à dicter au téléphone. */
export function formaterCodeTerminal(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

// Une heure : assez pour qu'un gérant reçoive le lien et le suive, assez court
// pour qu'un lien oublié dans un historique ne serve plus à rien.
export const DUREE_JETON_REINITIALISATION_MS = 60 * 60 * 1000;

/**
 * Jeton de réinitialisation : 32 octets de hasard, illisibles et impossibles à
 * deviner. Contrairement au code d'installation, personne ne le tape à la main
 * — il voyage dans une URL, donc on privilégie l'entropie à la lisibilité.
 */
export function genererJetonReinitialisation(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Une session ouverte avant le dernier changement de mot de passe ne vaut plus
 * rien. Le jeton d'authentification date en secondes et la coupure en
 * millisecondes : on tronque des deux côtés pour ne pas éjecter par erreur une
 * session ouverte pendant la même seconde que le changement.
 */
export function sessionRevoquee(emiseLe: Date, sessionsInvalidesAvant: Date | null): boolean {
  if (!sessionsInvalidesAvant) return false;
  return Math.floor(emiseLe.getTime() / 1000) < Math.floor(sessionsInvalidesAvant.getTime() / 1000);
}

// L'IP réelle derrière le proxy de l'hébergeur (`trust proxy` est actif en
// production), tronquée pour rester lisible en base.
export function ipDe(req: Request): string | null {
  return (req.ip ?? null)?.slice(0, 60) ?? null;
}

function navigateurDe(req: Request): string | null {
  const ua = req.get('user-agent');
  return ua ? ua.slice(0, 200) : null;
}

/**
 * Consigne une tentative de connexion. Ne consigne JAMAIS le mot de passe ni
 * le code PIN saisis — seulement qui a tenté, d'où, et ce qui s'est passé.
 *
 * N'échoue jamais bruyamment : un problème d'écriture du journal ne doit pas
 * empêcher une équipe de démarrer son service.
 */
export async function journaliserConnexion(
  req: Request,
  donnees: {
    type: TypeConnexion;
    resultat: ResultatConnexion;
    utilisateurId?: string | null;
    acteur?: string | null;
    etablissementId?: string | null;
    etablissement?: string | null;
  },
): Promise<void> {
  try {
    await prisma.connexionJournal.create({
      data: {
        type: donnees.type,
        resultat: donnees.resultat,
        utilisateurId: donnees.utilisateurId ?? null,
        acteur: donnees.acteur?.slice(0, 120) ?? null,
        etablissementId: donnees.etablissementId ?? null,
        etablissement: donnees.etablissement?.slice(0, 120) ?? null,
        ip: ipDe(req),
        navigateur: navigateurDe(req),
      },
    });
  } catch (err) {
    console.error('[journal connexions] écriture impossible', err);
  }
}
