// L'impression directe ne peut pas être essayée sans imprimante branchée.
// Ce qui EST vérifiable — et qui casse en vrai — c'est la conversion du texte
// en octets : une imprimante thermique ne parle pas UTF-8, et un accent mal
// converti sort en caractère aberrant sur le ticket du client.

import { describe, expect, it } from 'vitest';
import { COLONNES, encoderTexte, rendreEscpos } from './escpos';
import { ticketCuisine, ticketRecuHorsLigne } from './ticket';
import type { Commande } from './api';

const octets = (texte: string) => encoderTexte(texte).octets;

// Retire les commandes ESC/POS pour ne garder que ce qui s'imprime vraiment
// sur le papier. Sans ça, on mesurerait des largeurs de ligne fausses.
function lignesImprimables(flux: Uint8Array): string[] {
  const texte: number[] = [];
  for (let i = 0; i < flux.length;) {
    const o = flux[i];
    if (o === 0x1b) {
      // ESC @ tient sur 2 octets, les autres séquences utilisées sur 3.
      i += flux[i + 1] === 0x40 ? 2 : 3;
    } else if (o === 0x1d) {
      // GS V (coupe) tient sur 4 octets, GS B (vidéo inverse) sur 3.
      i += flux[i + 1] === 0x56 ? 4 : 3;
    } else {
      texte.push(o);
      i += 1;
    }
  }
  return String.fromCharCode(...texte).split('\n');
}

describe('Conversion du texte pour l’imprimante', () => {
  it('laisse l’ASCII intact', () => {
    expect(octets('TABLE 3')).toEqual([84, 65, 66, 76, 69, 32, 51]);
  });

  it('convertit les accents français en CP858', () => {
    // Les valeurs viennent de la table CP858 : é=0x82, è=0x8A, ê=0x88,
    // à=0x85, ç=0x87, ù=0x97, û=0x96, ô=0x93, î=0x8C, ï=0x8B.
    expect(octets('éèêàçùûôîï')).toEqual([0x82, 0x8a, 0x88, 0x85, 0x87, 0x97, 0x96, 0x93, 0x8c, 0x8b]);
    expect(octets('ÉÈÊÀÇÔÎ')).toEqual([0x90, 0xd4, 0xd2, 0xb7, 0x80, 0xe2, 0xd7]);
  });

  it('convertit un vrai nom de plat sans le dénaturer', () => {
    const { octets: sortie, encodable } = encoderTexte('Crème brûlée');
    expect(encodable).toBe(true);
    // Un octet par caractère : rien n'a été perdu ni doublé.
    expect(sortie).toHaveLength('Crème brûlée'.length);
    expect(sortie[2]).toBe(0x8a); // è de « Crème »
    expect(sortie[8]).toBe(0x96); // û de « brûlée »
    expect(sortie[10]).toBe(0x82); // é de « brûlée »
  });

  it('rapproche les caractères typographiques absents de la table', () => {
    // L'apostrophe courbe et le tiret cadratin viennent des libellés de l'app.
    expect(String.fromCharCode(...octets('l’œuf'))).toBe("l'oeuf");
    expect(String.fromCharCode(...octets('Table 3 — 1 200 DA'))).toBe('Table 3 - 1 200 DA');
    expect(String.fromCharCode(...octets('Suite 1 · en cuisine'))).toContain('Suite 1');
    expect(String.fromCharCode(...octets('trop long…'))).toBe('trop long...');
  });

  it('garde les guillemets français et le symbole degré, eux présents dans la table', () => {
    expect(octets('«»°·')).toEqual([0xae, 0xaf, 0xf8, 0xfa]);
  });

  // Un établissement nommé en arabe ne peut pas s'imprimer en mode texte :
  // il faut le signaler pour retomber sur l'impression navigateur, plutôt que
  // de sortir un ticket rempli de « ? ».
  it('signale les caractères que l’imprimante ne sait pas composer', () => {
    const arabe = encoderTexte('مطعم');
    expect(arabe.encodable).toBe(false);
    expect(arabe.octets.every((o) => o === 0x3f)).toBe(true);

    expect(encoderTexte('Café Étoilé').encodable).toBe(true);
  });
});

function commandeDeTest(surcharge: Partial<Commande> = {}): Commande {
  return {
    id: 'c1',
    canal: 'SUR_PLACE',
    noteCuisine: null,
    additionId: 'a1',
    additionStatut: 'OUVERTE',
    table: { numero: '3' },
    statut: 'ENVOYEE',
    suiteReclamee: 1,
    creeLe: '2026-08-01T19:30:00.000Z',
    serveur: { nom: 'Bel', prenom: 'Sofiane' },
    lignes: [
      {
        id: 'l1',
        nomProduit: 'Crème brûlée',
        prixUnitaire: 450,
        tauxTva: 9,
        suite: 1,
        quantite: 2,
        quantitePayee: 0,
        quantiteAnnulee: 0,
        quantiteOfferte: 0,
        options: [{ nomGroupe: 'Cuisson', valeur: 'à point' }],
      },
    ],
    total: 900,
    ...surcharge,
  } as Commande;
}

describe('Rendu d’un ticket en ESC/POS', () => {
  it('ouvre par une réinitialisation et sélectionne la table française', () => {
    const { octets } = rendreEscpos(ticketCuisine(commandeDeTest()));
    // ESC @ (réinitialisation) puis ESC t 19 (CP858).
    expect([...octets.slice(0, 5)]).toEqual([0x1b, 0x40, 0x1b, 0x74, 19]);
  });

  it('termine par une coupe du papier', () => {
    const { octets } = rendreEscpos(ticketCuisine(commandeDeTest()));
    expect([...octets.slice(-4)]).toEqual([0x1d, 0x56, 66, 0x00]);
  });

  // Le bon cuisine met les plats en MAJUSCULES : ce sont donc les accents
  // majuscules qui doivent exister dans la table, un piège facile à manquer.
  it('imprime le nom du plat avec ses accents majuscules, pas des « ? »', () => {
    const { octets, encodable } = rendreEscpos(ticketCuisine(commandeDeTest()));
    expect(encodable).toBe(true);
    const brut = [...octets];
    expect(brut).toContain(0xd4); // È de « CRÈME »
    expect(brut).toContain(0xea); // Û de « BRÛLÉE »
    expect(brut).toContain(0x90); // É de « BRÛLÉE »
    expect(brut).not.toContain(0x3f);
  });

  it('encadre les services quand la commande en couvre plusieurs', () => {
    const commande = commandeDeTest({
      lignes: [
        { ...commandeDeTest().lignes[0], id: 'l1', suite: 1 },
        { ...commandeDeTest().lignes[0], id: 'l2', nomProduit: 'Tajine', suite: 2 },
      ],
    });
    const { octets } = rendreEscpos(ticketCuisine(commande));
    const brut = [...octets];
    // GS B 1 = vidéo inverse : l'encadré du bloc « SUITE N ».
    const debutsCadre = brut.filter(
      (_, i) => brut[i] === 0x1d && brut[i + 1] === 0x42 && brut[i + 2] === 1,
    );
    expect(debutsCadre).toHaveLength(2);
  });

  it('aligne le montant à droite sur la largeur du papier', () => {
    const ticket = ticketRecuHorsLigne(
      { nom: 'Le Bon Grill', adresse: null, ville: null },
      'Table 3',
      1200,
      'ESPECES',
      2000,
    );
    const { octets } = rendreEscpos(ticket);
    const lignePaye = lignesImprimables(octets).find((l) => l.includes('1200 DA'));
    expect(lignePaye).toBeDefined();
    expect(lignePaye!.endsWith('1200 DA')).toBe(true);
    expect(lignePaye!).toHaveLength(COLONNES);
  });

  it('replie un nom de plat plus long que le papier au lieu de le tronquer', () => {
    const nomTresLong = 'Assiette de grillades mixtes pour deux personnes avec frites maison';
    const commande = commandeDeTest({
      lignes: [{ ...commandeDeTest().lignes[0], nomProduit: nomTresLong, options: [] }],
    });
    const { octets } = rendreEscpos(ticketCuisine(commande));
    const lignes = lignesImprimables(octets);
    // Aucun mot perdu : on retrouve le début ET la fin du nom.
    expect(lignes.join('\n')).toContain('ASSIETTE');
    expect(lignes.join('\n')).toContain('MAISON');
    for (const ligne of lignes) {
      expect(ligne.length).toBeLessThanOrEqual(COLONNES);
    }
  });
});
