import type { MessageEmail } from './email';

// Gabarits des e-mails de Maïda. Chaque message existe en deux versions : le
// HTML pour les clients modernes, et un texte brut lisible tel quel — c'est
// aussi lui que voient les filtres anti-spam, un message sans version texte
// part avec un handicap.

// Les couleurs de la charte, en dur : un e-mail ne peut pas charger de CSS.
const VERT = '#0E5A4A';
const SAFRAN = '#CC811A';
const CREME = '#ECE7DA';
const ENCRE = '#2A2521';

function echapper(valeur: string): string {
  return valeur
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Enveloppe commune : en-tête vert, corps sur fond crème, pied discret.
 * Tout est en styles en ligne — les clients de messagerie ignorent les
 * feuilles de style, et beaucoup suppriment carrément la balise `<style>`.
 */
function gabarit(titre: string, corps: string, signature: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="margin:0;padding:24px 12px;background:${CREME};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${ENCRE};">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;margin:0 auto;width:100%;">
      <tr>
        <td style="background:${VERT};color:#ffffff;padding:20px 24px;border-radius:12px 12px 0 0;">
          <span style="font-size:20px;font-weight:700;letter-spacing:0.5px;">Maïda</span>
          <span style="color:${SAFRAN};font-size:20px;font-weight:700;">.</span>
        </td>
      </tr>
      <tr>
        <td style="background:#ffffff;padding:24px;border-radius:0 0 12px 12px;">
          <h1 style="margin:0 0 16px;font-size:18px;font-weight:700;color:${ENCRE};">${echapper(titre)}</h1>
          ${corps}
        </td>
      </tr>
      <tr>
        <td style="padding:16px 24px;font-size:12px;color:#7A7167;text-align:center;">${echapper(signature)}</td>
      </tr>
    </table>
  </body>
</html>`;
}

function bouton(url: string, libelle: string): string {
  return `<p style="margin:24px 0;">
    <a href="${echapper(url)}" style="display:inline-block;background:${VERT};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;">${echapper(libelle)}</a>
  </p>`;
}

function paragraphe(texte: string): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.5;">${echapper(texte)}</p>`;
}

export function emailMotDePasseOublie(options: {
  destinataire: string;
  prenom: string;
  lien: string;
  dureeHeures: number;
}): MessageEmail {
  const duree = options.dureeHeures === 1 ? 'une heure' : `${options.dureeHeures} heures`;
  const lignes = [
    `Bonjour ${options.prenom},`,
    '',
    'Vous avez demandé à changer le mot de passe de votre espace gérant Maïda.',
    `Ce lien est valable ${duree} et ne fonctionne qu'une seule fois :`,
    '',
    options.lien,
    '',
    "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
  ];

  return {
    destinataire: options.destinataire,
    sujet: 'Changer votre mot de passe Maïda',
    texte: lignes.join('\n'),
    html: gabarit(
      'Changer votre mot de passe',
      [
        paragraphe(`Bonjour ${options.prenom},`),
        paragraphe('Vous avez demandé à changer le mot de passe de votre espace gérant Maïda.'),
        bouton(options.lien, 'Choisir un nouveau mot de passe'),
        paragraphe(`Ce lien est valable ${duree} et ne fonctionne qu'une seule fois.`),
        paragraphe(
          "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
        ),
      ].join('\n'),
      'Maïda — le point de vente pensé pour la restauration algérienne',
    ),
  };
}

export function emailConfirmationReservation(options: {
  destinataire: string;
  nomClient: string;
  etablissement: string;
  date: Date;
  nombreCouverts: number;
  table: string;
}): MessageEmail {
  // Heure du restaurant, pas celle du serveur : une réservation annoncée à la
  // mauvaise heure est pire que pas de confirmation du tout.
  const quand = new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: 'Africa/Algiers',
  }).format(options.date);
  const couverts = `${options.nombreCouverts} couvert${options.nombreCouverts > 1 ? 's' : ''}`;

  const lignes = [
    `Bonjour ${options.nomClient},`,
    '',
    `Votre table est réservée au restaurant ${options.etablissement}.`,
    '',
    `Quand : ${quand}`,
    `Nombre de personnes : ${couverts}`,
    `Table : ${options.table}`,
    '',
    'En cas d’empêchement, prévenez le restaurant : la table pourra servir à quelqu’un d’autre.',
  ];

  return {
    destinataire: options.destinataire,
    sujet: `Votre réservation chez ${options.etablissement}`,
    texte: lignes.join('\n'),
    html: gabarit(
      'Votre table est réservée',
      [
        paragraphe(`Bonjour ${options.nomClient},`),
        paragraphe(`Votre table est réservée au restaurant ${options.etablissement}.`),
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0;font-size:15px;">
          <tr><td style="padding:4px 16px 4px 0;color:#7A7167;">Quand</td><td style="padding:4px 0;font-weight:600;">${echapper(quand)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#7A7167;">Personnes</td><td style="padding:4px 0;font-weight:600;">${echapper(couverts)}</td></tr>
          <tr><td style="padding:4px 16px 4px 0;color:#7A7167;">Table</td><td style="padding:4px 0;font-weight:600;">${echapper(options.table)}</td></tr>
        </table>`,
        paragraphe(
          'En cas d’empêchement, prévenez le restaurant : la table pourra servir à quelqu’un d’autre.',
        ),
      ].join('\n'),
      options.etablissement,
    ),
  };
}
