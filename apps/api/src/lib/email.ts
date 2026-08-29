import nodemailer, { type Transporter } from 'nodemailer';
import type { TypeEmail } from '../generated/prisma/client';
import { prisma } from './prisma';

// Envoi d'e-mails, volontairement générique : Maïda parle SMTP, que ce soit
// Brevo, Resend, Mailjet, OVH ou Infomaniak derrière. Choisir le fournisseur
// revient à remplir cinq variables d'environnement, jamais à toucher au code.
//
// Tant que rien n'est configuré, l'application marche exactement comme avant :
// les messages sont préparés, tracés dans le journal des e-mails (visible par
// l'éditeur), et ne partent nulle part. C'est l'état normal tant que le domaine
// maidapos.com n'est pas en service.

export interface MessageEmail {
  destinataire: string;
  sujet: string;
  texte: string;
  html: string;
}

export interface ContexteEmail {
  type: TypeEmail;
  etablissementId?: string | null;
  etablissement?: string | null;
}

interface ConfigSmtp {
  hote: string;
  port: number;
  securise: boolean;
  utilisateur?: string;
  motDePasse?: string;
  expediteur: string;
}

function lireConfig(): ConfigSmtp | null {
  const hote = process.env.SMTP_HOTE?.trim();
  const expediteur = process.env.EMAIL_EXPEDITEUR?.trim();
  if (!hote || !expediteur) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    hote,
    port: Number.isInteger(port) && port > 0 ? port : 587,
    // Le port 465 parle TLS d'emblée ; 587 et 25 démarrent en clair puis
    // passent en TLS (STARTTLS), ce que nodemailer fait tout seul.
    securise: port === 465,
    utilisateur: process.env.SMTP_UTILISATEUR?.trim() || undefined,
    motDePasse: process.env.SMTP_MOTDEPASSE || undefined,
    expediteur,
  };
}

let transporteur: Transporter | null = null;

function getTransporteur(config: ConfigSmtp): Transporter {
  // Mode test : nodemailer sérialise le message au lieu de l'envoyer, ce qui
  // permet de vérifier tout le chemin (gabarit compris) sans serveur SMTP.
  if (process.env.EMAIL_TRANSPORT === 'json') {
    return nodemailer.createTransport({ jsonTransport: true });
  }
  transporteur ??= nodemailer.createTransport({
    host: config.hote,
    port: config.port,
    secure: config.securise,
    auth: config.utilisateur ? { user: config.utilisateur, pass: config.motDePasse ?? '' } : undefined,
  });
  return transporteur;
}

// Remis à zéro entre deux configurations (tests).
export function reinitialiserTransporteur() {
  transporteur = null;
}

export function emailConfigure(): boolean {
  return lireConfig() !== null;
}

/**
 * Adresse publique du site, telle qu'elle doit apparaître dans les liens
 * envoyés par e-mail. Volontairement lue dans la configuration et JAMAIS
 * déduite de l'en-tête `Host` de la requête : sinon n'importe qui pourrait
 * demander une réinitialisation en falsifiant cet en-tête, et le lien reçu par
 * le vrai gérant pointerait vers le site de l'attaquant. Sans cette variable,
 * aucun lien n'est envoyé — l'éditeur transmet la demande à la main.
 */
export function urlPublique(): string | null {
  const url = process.env.URL_PUBLIQUE?.trim().replace(/\/+$/, '');
  return url || null;
}

/**
 * Envoie un message et le trace, quoi qu'il arrive. **Ne lève jamais** : un
 * serveur d'envoi en panne ne doit pas faire échouer la réservation ni la
 * demande de mot de passe qui l'a déclenché. L'échec se lit dans le journal
 * des e-mails de l'espace éditeur.
 */
export async function envoyerEmail(message: MessageEmail, contexte: ContexteEmail): Promise<void> {
  const config = lireConfig();
  let resultat: 'ENVOYE' | 'ECHEC' | 'NON_CONFIGURE' = 'NON_CONFIGURE';
  let erreur: string | null = null;

  if (config) {
    try {
      await getTransporteur(config).sendMail({
        from: process.env.EMAIL_NOM_EXPEDITEUR
          ? `${process.env.EMAIL_NOM_EXPEDITEUR} <${config.expediteur}>`
          : config.expediteur,
        to: message.destinataire,
        subject: message.sujet,
        text: message.texte,
        html: message.html,
      });
      resultat = 'ENVOYE';
    } catch (err) {
      resultat = 'ECHEC';
      erreur = err instanceof Error ? err.message : "Erreur d'envoi inconnue";
    }
  }

  try {
    await prisma.emailEnvoye.create({
      data: {
        type: contexte.type,
        resultat,
        destinataire: message.destinataire,
        sujet: message.sujet,
        erreur,
        etablissementId: contexte.etablissementId ?? null,
        etablissement: contexte.etablissement ?? null,
      },
    });
  } catch {
    // Le journal est un confort de support : s'il tombe, l'e-mail est déjà
    // parti et rien ne doit remonter à l'utilisateur.
  }
}
