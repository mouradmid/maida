// Génération de fichiers CSV téléchargeables, ouvrables directement dans Excel
// ou LibreOffice. Choix pour la compatibilité « Excel en français » :
//  - séparateur point-virgule (Excel FR attend le « ; », pas la virgule) ;
//  - BOM UTF-8 en tête pour que les accents s'affichent correctement ;
//  - décimales à la virgule (via nombreCsv) pour être reconnues comme nombres.

export type CelluleCsv = string | number | null | undefined;

function echapper(valeur: CelluleCsv): string {
  const texte = valeur == null ? '' : String(valeur);
  // On protège les cellules contenant le séparateur, un guillemet ou un saut
  // de ligne en les entourant de guillemets (guillemets internes doublés).
  if (/[";\n\r]/.test(texte)) return `"${texte.replace(/"/g, '""')}"`;
  return texte;
}

// Nombre au format français (virgule décimale, sans séparateur de milliers)
// pour qu'Excel FR le lise comme une valeur numérique et non du texte.
export function nombreCsv(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2, useGrouping: false });
}

// Date/heure lisible pour l'humain (les colonnes restent du texte).
export function dateHeureCsv(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Suffixe de date du jour pour nommer les fichiers (ex. 2026-07-25).
export function dateFichier(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// Assemble les lignes en CSV et déclenche le téléchargement dans le navigateur.
export function telechargerCsv(nomFichier: string, lignes: CelluleCsv[][]) {
  const contenu = lignes.map((ligne) => ligne.map(echapper).join(';')).join('\r\n');
  const BOM = '﻿'; // marque d'ordre d'octet UTF-8 attendue par Excel
  const blob = new Blob([BOM + contenu], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  document.body.appendChild(lien);
  lien.click();
  lien.remove();
  URL.revokeObjectURL(url);
}
