// Rapatrie les polices Google utilisées par Maïda dans public/fonts/,
// et écrit une feuille de style locale équivalente.
// Usage : node scripts/rapatrier-polices.mjs (depuis apps/web)
// À rejouer si la charte change de police ou de graisse — penser alors à
// aligner la liste ci-dessous ET le bloc @theme de src/index.css.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../public/fonts');

const URL_GOOGLE =
  'https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,600;12..96,800&family=Inter:wght@400;500;600&family=Spline+Sans+Mono:wght@500;600&family=Marcellus&family=Aref+Ruqaa:wght@400;700&family=Jost:wght@400;500&display=swap';

// Chrome récent : indispensable pour obtenir du woff2 (avec un UA inconnu,
// Google sert du ttf, bien plus lourd).
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Maïda affiche du français et de l'arabe (nom de l'établissement, logo).
// Le reste des sous-ensembles (cyrillique, grec, vietnamien…) est du poids mort.
const SOUS_ENSEMBLES = new Set(['latin', 'latin-ext', 'arabic']);

const css = await fetch(URL_GOOGLE, { headers: { 'User-Agent': UA } }).then((r) => r.text());

await mkdir(DOSSIER, { recursive: true });

// Google précède chaque @font-face d'un commentaire donnant le sous-ensemble.
const blocs = [...css.matchAll(/\/\*\s*([\w-\[\]]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)];
if (blocs.length === 0) throw new Error('Aucun @font-face reconnu dans la réponse de Google');

const morceaux = [];
const telecharges = new Map();

for (const [, sousEnsemble, bloc] of blocs) {
  if (!SOUS_ENSEMBLES.has(sousEnsemble)) continue;

  const url = bloc.match(/url\((https:\/\/[^)]+\.woff2)\)/)?.[1];
  if (!url) continue;

  const famille = bloc.match(/font-family:\s*'([^']+)'/)?.[1] ?? 'police';
  const graisse = (bloc.match(/font-weight:\s*([^;]+);/)?.[1] ?? '400').trim().replace(/\s+/g, '-');
  const style = bloc.match(/font-style:\s*([^;]+);/)?.[1]?.trim() ?? 'normal';

  let nom = telecharges.get(url);
  if (!nom) {
    nom = `${famille.toLowerCase().replace(/\s+/g, '-')}-${graisse}-${style}-${sousEnsemble}.woff2`;
    const octets = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
    await writeFile(path.join(DOSSIER, nom), octets);
    telecharges.set(url, nom);
    console.log(`${nom} — ${(octets.length / 1024).toFixed(1)} ko`);
  }

  morceaux.push(`/* ${famille} — ${sousEnsemble} */\n${bloc.replace(url, `/fonts/${nom}`)}`);
}

const entete = `/* ============================================================
   Polices Maïda, servies par l'application elle-même.

   Elles venaient du CDN Google : pendant une coupure réseau — le cas
   que la caisse doit précisément savoir traverser — elles ne se
   chargeaient pas et toute l'interface changeait de visage au pire
   moment. Fichiers rapatriés dans public/fonts/, sous-ensembles
   limités au latin et à l'arabe (les seules écritures affichées).

   Régénérer : voir scripts/rapatrier-polices.mjs
   ============================================================ */\n\n`;

await writeFile(path.join(DOSSIER, 'polices.css'), entete + morceaux.join('\n\n') + '\n');
console.log(`\n${telecharges.size} fichier(s), ${morceaux.length} déclaration(s) @font-face.`);
