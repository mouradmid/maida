// Sélection de période partagée par les écrans du gérant (Rapports, Journées).
// Les bornes sont calculées en heure locale : une « journée » commerciale va de
// 00:00 à 23:59:59 chez le restaurateur, pas en UTC.

export const PERIODES = [
  { id: 'aujourdhui', libelle: "Aujourd'hui" },
  { id: 'hier', libelle: 'Hier' },
  { id: 'jours7', libelle: '7 jours' },
  { id: 'jours30', libelle: '30 jours' },
  { id: 'perso', libelle: 'Dates libres' },
] as const;

export type Periode = (typeof PERIODES)[number]['id'];

export function debutDeJour(d: Date) {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function finDeJour(d: Date) {
  const r = new Date(d);
  r.setHours(23, 59, 59, 999);
  return r;
}

// Renvoie les bornes [début, fin] de la période, ou null si les dates libres
// sont incomplètes ou incohérentes (l'appelant garde alors l'affichage en cours).
export function bornes(periode: Periode, persoDebut: string, persoFin: string): [Date, Date] | null {
  const maintenant = new Date();
  if (periode === 'aujourdhui') return [debutDeJour(maintenant), finDeJour(maintenant)];
  if (periode === 'hier') {
    const hier = new Date(maintenant);
    hier.setDate(hier.getDate() - 1);
    return [debutDeJour(hier), finDeJour(hier)];
  }
  if (periode === 'jours7' || periode === 'jours30') {
    const debut = new Date(maintenant);
    debut.setDate(debut.getDate() - (periode === 'jours7' ? 6 : 29));
    return [debutDeJour(debut), finDeJour(maintenant)];
  }
  if (!persoDebut || !persoFin) return null;
  const debut = new Date(persoDebut);
  const fin = new Date(persoFin);
  if (Number.isNaN(debut.getTime()) || Number.isNaN(fin.getTime()) || debut > fin) return null;
  return [debutDeJour(debut), finDeJour(fin)];
}
