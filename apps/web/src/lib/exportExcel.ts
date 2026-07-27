// Génération de vrais classeurs Excel (.xlsx) téléchargeables.
//
// Pourquoi un .xlsx plutôt qu'un CSV ici : les clôtures de caisse partent chez
// le comptable. Un classeur garde les montants comme de vrais nombres (pas du
// texte à reformater), affiche les dates au format français et met en évidence
// l'en-tête et la ligne de totaux.
//
// La librairie (write-excel-file) est chargée en import dynamique : elle ne
// pèse sur le bundle que le jour où l'utilisateur clique sur « Exporter », ce
// qui laisse la caisse légère au démarrage. On vise `/browser` : le paquet
// n'expose pas de racine, seulement ses variantes navigateur et Node.

import type { CellObject, SheetData } from 'write-excel-file/browser';

// Formats Excel. Les séparateurs sont volontairement ceux du format xlsx
// (« , » et « . ») : Excel les traduit ensuite selon la langue du poste, donc
// un poste français affiche bien « 12 500,00 DA ».
export const FORMAT_DA = '#,##0.00" DA"';
export const FORMAT_DATE_HEURE = 'dd/mm/yyyy hh:mm';

export type TypeCellule = 'texte' | 'nombre' | 'montant' | 'dateHeure';

export interface Colonne<T> {
  titre: string;
  // Largeur en caractères ; Excel n'ajuste pas les colonnes à l'ouverture.
  largeur: number;
  type?: TypeCellule;
  valeur: (ligne: T) => string | number | Date | null;
  // Valeur de la ligne de totaux (omise = cellule vide).
  total?: (lignes: T[]) => string | number | null;
}

// write-excel-file convertit les dates en numéro de série Excel sur la base de
// l'heure UTC, sans notion de fuseau. Sans correction, une journée ouverte à
// 18:17 à Alger s'afficherait 17:17 dans le classeur. On décale donc la date de
// l'écart local pour que l'heure murale du restaurateur soit préservée.
function heureLocale(d: Date): Date {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000);
}

// write-excel-file attend un constructeur JS comme type de cellule. Une valeur
// absente part sans type ni valeur, sinon la librairie rejette la cellule.
function cellule(valeur: string | number | Date | null, type: TypeCellule): CellObject {
  if (valeur === null || valeur === '') return {};
  if (type === 'dateHeure') {
    return {
      value: heureLocale(valeur as Date),
      type: Date,
      format: FORMAT_DATE_HEURE,
      align: 'left',
    };
  }
  if (type === 'montant') {
    return { value: valeur as number, type: Number, format: FORMAT_DA };
  }
  if (type === 'nombre') return { value: valeur as number, type: Number };
  return { value: String(valeur), type: String };
}

// Feuille mise en forme, prête à être écrite. Le type efface le `T` de ses
// colonnes : un classeur peut ainsi rassembler des feuilles de natures
// différentes (annulations et remises, par exemple).
export interface FeuillePrete {
  nom: string;
  contenu: SheetData;
  largeurs: number[];
  lignesFigees: number;
}

/**
 * Met en forme une feuille : titre, sous-titre, en-tête, données, puis une
 * ligne de totaux pour les colonnes qui en définissent un.
 */
export function preparerFeuille<T>({
  nomFeuille,
  titre,
  sousTitre,
  colonnes,
  lignes,
}: {
  nomFeuille: string;
  titre: string;
  sousTitre?: string;
  colonnes: Colonne<T>[];
  lignes: T[];
}): FeuillePrete {
  const vides = (n: number) => Array.from({ length: n }, () => ({}) as CellObject);

  const contenu: SheetData = [
    [{ value: titre, type: String, fontWeight: 'bold', fontSize: 14 }, ...vides(colonnes.length - 1)],
  ];
  if (sousTitre) {
    contenu.push([{ value: sousTitre, type: String }, ...vides(colonnes.length - 1)]);
  }
  contenu.push(vides(colonnes.length));

  contenu.push(
    colonnes.map((c) => ({
      value: c.titre,
      type: String,
      fontWeight: 'bold',
      backgroundColor: '#1C1917',
      textColor: '#FFFFFF',
      align: c.type && c.type !== 'texte' ? 'right' : 'left',
      wrap: true,
    })),
  );

  for (const ligne of lignes) {
    contenu.push(colonnes.map((c) => cellule(c.valeur(ligne), c.type ?? 'texte')));
  }

  if (colonnes.some((c) => c.total) && lignes.length > 0) {
    contenu.push(
      colonnes.map((c, i) => {
        const cadre: CellObject = {
          fontWeight: 'bold',
          topBorderStyle: 'thin',
          topBorderColor: '#1C1917',
        };
        if (c.total) return { ...cadre, ...cellule(c.total(lignes), c.type ?? 'texte') };
        // Faute de total propre, la première colonne porte le mot « TOTAL ».
        if (i === 0) return { ...cadre, value: 'TOTAL', type: String };
        return cadre;
      }),
    );
  }

  return {
    nom: nomFeuille,
    contenu,
    largeurs: colonnes.map((c) => c.largeur),
    // Fige le bandeau de titre et l'en-tête : les colonnes restent lisibles
    // quand le comptable fait défiler un mois entier.
    lignesFigees: sousTitre ? 4 : 3,
  };
}

/** Écrit et télécharge un classeur d'une ou plusieurs feuilles. */
export async function telechargerClasseur(nomFichier: string, feuilles: FeuillePrete[]) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');

  await writeXlsxFile(
    feuilles.map((f) => ({
      data: f.contenu,
      sheet: f.nom,
      columns: f.largeurs.map((width) => ({ width })),
      stickyRowsCount: f.lignesFigees,
    })),
  ).toFile(nomFichier);
}

/** Raccourci pour un classeur d'une seule feuille. */
export async function telechargerXlsx<T>({
  nomFichier,
  ...feuille
}: {
  nomFichier: string;
  nomFeuille: string;
  titre: string;
  sousTitre?: string;
  colonnes: Colonne<T>[];
  lignes: T[];
}) {
  await telechargerClasseur(nomFichier, [preparerFeuille(feuille)]);
}

// Suffixe de fichier lisible pour une période (ex. « 2026-07-01_2026-07-31 »).
export function suffixePeriode(debut: Date, fin: Date): string {
  const jour = (d: Date) => {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  const a = jour(debut);
  const b = jour(fin);
  return a === b ? a : `${a}_${b}`;
}
