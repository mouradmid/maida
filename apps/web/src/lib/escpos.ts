// Rendu d'un ticket en octets ESC/POS, le langage que comprennent les
// imprimantes thermiques. Envoyés directement à l'imprimante, ils s'impriment
// sans passer par la boîte de dialogue du navigateur — et permettent en prime
// de couper le papier.
//
// Le point délicat n'est pas la mise en page mais les ACCENTS : une imprimante
// thermique ne parle pas UTF-8. Elle travaille avec une « table de caractères »
// d'un octet. On sélectionne la table 19 (CP858), qui couvre le français, et on
// convertit chaque caractère nous-mêmes. Sans cette table, « Crème brûlée »
// sortirait en « CrÞme brǔlÚe ».

import type { BlocTicket, Ticket } from './ticket';

// 80 mm de papier, police A : 48 caractères par ligne. C'est la largeur des
// imprimantes de comptoir courantes (la zone imprimée fait 72 mm).
export const COLONNES = 48;

const ESC = 0x1b;
const GS = 0x1d;

// --- Table de caractères CP858 (français) ---
//
// Seuls les caractères absents de l'ASCII ont besoin d'être traduits.
const CP858: Record<string, number> = {
  Ç: 0x80,
  ü: 0x81,
  é: 0x82,
  â: 0x83,
  ä: 0x84,
  à: 0x85,
  å: 0x86,
  ç: 0x87,
  ê: 0x88,
  ë: 0x89,
  è: 0x8a,
  ï: 0x8b,
  î: 0x8c,
  ì: 0x8d,
  Ä: 0x8e,
  Å: 0x8f,
  É: 0x90,
  æ: 0x91,
  Æ: 0x92,
  ô: 0x93,
  ö: 0x94,
  ò: 0x95,
  û: 0x96,
  ù: 0x97,
  ÿ: 0x98,
  Ö: 0x99,
  Ü: 0x9a,
  ø: 0x9b,
  '£': 0x9c,
  Ø: 0x9d,
  '×': 0x9e,
  á: 0xa0,
  í: 0xa1,
  ó: 0xa2,
  ú: 0xa3,
  ñ: 0xa4,
  Ñ: 0xa5,
  º: 0xa6,
  ª: 0xa7,
  '¿': 0xa8,
  '®': 0xa9,
  '¬': 0xaa,
  '½': 0xab,
  '¼': 0xac,
  '¡': 0xad,
  '«': 0xae,
  '»': 0xaf,
  Á: 0xb5,
  Â: 0xb6,
  À: 0xb7,
  '©': 0xb8,
  ã: 0xc6,
  Ã: 0xc7,
  '¤': 0xcf,
  ð: 0xd0,
  Ð: 0xd1,
  Ê: 0xd2,
  Ë: 0xd3,
  È: 0xd4,
  '€': 0xd5,
  Í: 0xd6,
  Î: 0xd7,
  Ï: 0xd8,
  '¦': 0xdd,
  Ì: 0xde,
  Ó: 0xe0,
  ß: 0xe1,
  Ô: 0xe2,
  Ò: 0xe3,
  õ: 0xe4,
  Õ: 0xe5,
  µ: 0xe6,
  þ: 0xe7,
  Þ: 0xe8,
  Ú: 0xe9,
  Û: 0xea,
  Ù: 0xeb,
  ý: 0xec,
  Ý: 0xed,
  '¯': 0xee,
  '´': 0xef,
  '±': 0xf1,
  '¾': 0xf2,
  '¶': 0xf3,
  '§': 0xf4,
  '÷': 0xf6,
  '¸': 0xf7,
  '°': 0xf8,
  '¨': 0xf9,
  '·': 0xfa,
  '¹': 0xfb,
  '³': 0xfc,
  '²': 0xfd,
};

// Caractères typographiques absents de CP858 : on les rapproche plutôt que de
// les perdre. L'apostrophe courbe et le tiret cadratin viennent des libellés de
// l'application (« Crème brûlée à l’œuf », « Table 3 — 1 200 DA »).
//
// ATTENTION : les deux dernières clés sont des espaces Unicode distincts
// (insécable U+00A0, fine insécable U+202F) que rien ne différencie à l'œil.
// Avant d'ajouter une entrée, vérifier qu'elle n'existe pas déjà — un doublon
// ici ne se voit pas en relisant, seul le compilateur le signale.
const APPROXIMATIONS: Record<string, string> = {
  '’': "'",
  '‘': "'",
  '‚': ',',
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '−': '-',
  '…': '...',
  œ: 'oe',
  Œ: 'OE',
  ' ': ' ', // espace insécable
  ' ': ' ', // espace fine insécable (séparateur de milliers français)
};

/**
 * Convertit du texte en octets CP858.
 *
 * Les caractères hors table (l'arabe, par exemple) deviennent « ? » : une
 * imprimante thermique ne sait pas les composer en mode texte. `encodable`
 * signale ce cas pour que l'appelant puisse retomber sur l'impression HTML,
 * qui, elle, sait tout afficher.
 */
export function encoderTexte(texte: string): { octets: number[]; encodable: boolean } {
  const octets: number[] = [];
  let encodable = true;

  for (const caractere of texte) {
    const approximation = APPROXIMATIONS[caractere];
    const aTraiter = approximation ?? caractere;

    for (const c of aTraiter) {
      const codePoint = c.codePointAt(0)!;
      if (codePoint < 0x80) {
        octets.push(codePoint);
        continue;
      }
      const octet = CP858[c];
      if (octet !== undefined) {
        octets.push(octet);
        continue;
      }
      octets.push(0x3f); // « ? »
      encodable = false;
    }
  }

  return { octets, encodable };
}

// Coupe un texte trop long pour la largeur du papier, en respectant les mots.
// Un nom de plat long ne doit pas être tronqué : il doit passer à la ligne.
function replier(texte: string, largeur: number): string[] {
  const lignes: string[] = [];
  for (const paragraphe of texte.split('\n')) {
    let courante = '';
    for (const mot of paragraphe.split(' ')) {
      if (courante === '') {
        courante = mot;
      } else if (courante.length + 1 + mot.length <= largeur) {
        courante += ' ' + mot;
      } else {
        lignes.push(courante);
        courante = mot;
      }
      // Un mot seul plus long que la ligne : on le coupe brutalement.
      while (courante.length > largeur) {
        lignes.push(courante.slice(0, largeur));
        courante = courante.slice(largeur);
      }
    }
    lignes.push(courante);
  }
  return lignes;
}

// Libellé à gauche, montant à droite, points de conduite implicites par les
// espaces. Le libellé se replie si besoin, le montant reste sur la 1re ligne.
function colonnes(libelle: string, valeur: string, largeur: number): string[] {
  if (valeur === '') return replier(libelle, largeur);
  const largeurLibelle = Math.max(1, largeur - valeur.length - 1);
  const lignesLibelle = replier(libelle, largeurLibelle);
  return lignesLibelle.map((ligne, i) =>
    i === 0 ? ligne.padEnd(largeur - valeur.length, ' ') + valeur : ligne,
  );
}

class Flux {
  private octets: number[] = [];
  encodable = true;

  brut(...valeurs: number[]) {
    this.octets.push(...valeurs);
    return this;
  }

  // Mode d'impression : ESC ! n (bit 3 = gras, 4 = double hauteur, 5 = double largeur)
  mode({ gras = false, doubleHauteur = false, doubleLargeur = false } = {}) {
    let n = 0;
    if (gras) n |= 0x08;
    if (doubleHauteur) n |= 0x10;
    if (doubleLargeur) n |= 0x20;
    return this.brut(ESC, 0x21, n);
  }

  // ESC a n : 0 = gauche, 1 = centre
  alignement(position: 'gauche' | 'centre') {
    return this.brut(ESC, 0x61, position === 'centre' ? 1 : 0);
  }

  // ESC M n : 0 = police A (48 col.), 1 = police B (plus petite)
  police(petite: boolean) {
    return this.brut(ESC, 0x4d, petite ? 1 : 0);
  }

  // GS B n : impression en vidéo inverse (blanc sur noir) — sert d'encadré.
  videoInverse(actif: boolean) {
    return this.brut(GS, 0x42, actif ? 1 : 0);
  }

  texte(valeur: string) {
    const { octets, encodable } = encoderTexte(valeur);
    if (!encodable) this.encodable = false;
    return this.brut(...octets);
  }

  ligne(valeur = '') {
    return this.texte(valeur).brut(0x0a);
  }

  resultat() {
    return new Uint8Array(this.octets);
  }
}

/**
 * Rend un ticket en commandes ESC/POS prêtes à être envoyées à l'imprimante.
 *
 * `encodable` vaut false si le ticket contenait des caractères que la table
 * CP858 ne sait pas représenter (arabe, cyrillique…) : ils sont sortis en
 * « ? », et l'appelant a intérêt à imprimer en HTML à la place.
 */
export function rendreEscpos(ticket: Ticket): { octets: Uint8Array; encodable: boolean } {
  const flux = new Flux();

  // ESC @ : réinitialisation. ESC t 19 : table de caractères CP858 (français).
  flux.brut(ESC, 0x40).brut(ESC, 0x74, 19);

  for (const bloc of ticket.blocs) {
    rendreBloc(flux, bloc);
  }

  // Avance du papier puis coupe partielle : le ticket se détache seul.
  flux.brut(0x0a, 0x0a, 0x0a, 0x0a).brut(GS, 0x56, 66, 0x00);

  return { octets: flux.resultat(), encodable: flux.encodable };
}

function rendreBloc(flux: Flux, bloc: BlocTicket) {
  switch (bloc.t) {
    case 'titre': {
      const enorme = bloc.taille === 'enorme';
      flux.alignement('centre').mode({
        gras: true,
        doubleHauteur: true,
        doubleLargeur: enorme,
      });
      // En double largeur, la ligne ne tient plus que la moitié des colonnes.
      for (const ligne of replier(bloc.texte, enorme ? COLONNES / 2 : COLONNES)) {
        flux.ligne(ligne);
      }
      flux.mode().alignement('gauche');
      break;
    }

    case 'centre': {
      flux.alignement('centre').police(Boolean(bloc.petit));
      for (const ligne of replier(bloc.texte, COLONNES)) flux.ligne(ligne);
      flux.police(false).alignement('gauche');
      break;
    }

    case 'article': {
      flux.mode({ gras: true, doubleHauteur: true });
      for (const ligne of replier(bloc.texte, COLONNES)) flux.ligne(ligne);
      flux.mode();
      break;
    }

    case 'option': {
      flux.police(true);
      for (const ligne of replier(bloc.texte, COLONNES - 4)) flux.ligne('   ' + ligne);
      flux.police(false);
      break;
    }

    case 'cadre': {
      // Vidéo inverse sur toute la largeur : l'équivalent thermique de
      // l'encadré noir du rendu HTML, impossible à manquer en cuisine.
      flux.alignement('centre').mode({ gras: true }).videoInverse(true);
      for (const ligne of replier(bloc.texte, COLONNES - 2)) {
        flux.ligne(` ${ligne} `);
      }
      flux.videoInverse(false).mode().alignement('gauche');
      break;
    }

    case 'colonnes': {
      flux.police(Boolean(bloc.petit)).mode({ gras: Boolean(bloc.gras) });
      const largeur = bloc.petit ? Math.floor(COLONNES * 1.33) : COLONNES;
      for (const ligne of colonnes(bloc.libelle, bloc.valeur, largeur)) flux.ligne(ligne);
      flux.mode().police(false);
      break;
    }

    case 'note': {
      flux.mode({ gras: true });
      for (const ligne of replier(bloc.texte, COLONNES)) flux.ligne(ligne);
      flux.mode();
      break;
    }

    case 'separateur':
      flux.ligne('-'.repeat(COLONNES));
      break;
  }
}
