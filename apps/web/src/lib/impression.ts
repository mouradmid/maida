// Impression de tickets sur imprimante thermique (72 mm) via l'impression
// navigateur : on rend le ticket dans une iframe cachée puis window.print().
import type { AdditionDetail, Commande, ModePaiement } from './api';

const LIBELLES_MOYEN: Record<ModePaiement, string> = {
  ESPECES: 'Espèces',
  CARTE: 'Carte',
  CHEQUE: 'Chèque',
  AUTRE: 'Autre',
};

function echapper(texte: string) {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function dateHeure(date: string | Date) {
  return new Date(date).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STYLE_TICKET = `
  @page { margin: 0; size: 72mm auto; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 72mm;
    padding: 3mm 4mm 6mm;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    line-height: 1.35;
    color: #000;
    background: #fff;
  }
  .centre { text-align: center; }
  .gras { font-weight: bold; }
  .enorme { font-size: 26px; font-weight: bold; }
  .grand { font-size: 16px; font-weight: bold; }
  .petit { font-size: 10px; }
  .sep { border-top: 1px dashed #000; margin: 5px 0; }
  .ligne { display: flex; justify-content: space-between; gap: 6px; }
  .ligne .lib { flex: 1; word-break: break-word; }
  .option { padding-left: 14px; font-size: 11px; }
  .note { margin-top: 4px; font-weight: bold; }
`;

function envelopper(corps: string, titre: string) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${echapper(titre)}</title><style>${STYLE_TICKET}</style></head><body>${corps}</body></html>`;
}

// Ticket destiné à la cuisine : lisible de loin, sans les prix.
export function htmlTicketCuisine(commande: Commande): string {
  const destination = commande.table ? `TABLE ${commande.table.numero}` : 'À EMPORTER';
  const lignes = commande.lignes
    .filter((l) => l.quantite - l.quantiteAnnulee > 0)
    .map((l) => {
      const options = l.options
        .map((o) => `<div class="option">&gt; ${echapper(o.valeur)}</div>`)
        .join('');
      return `<div class="grand">${l.quantite - l.quantiteAnnulee} x ${echapper(l.nomProduit.toUpperCase())}</div>${options}`;
    })
    .join('');

  const corps = `
    <div class="centre petit">— CUISINE —</div>
    <div class="centre enorme">${echapper(destination)}</div>
    <div class="centre petit">${dateHeure(commande.creeLe)} · ${echapper(commande.serveur.prenom)}</div>
    <div class="sep"></div>
    ${lignes}
    ${commande.noteCuisine ? `<div class="sep"></div><div class="note">NOTE : ${echapper(commande.noteCuisine)}</div>` : ''}
  `;
  return envelopper(corps, `Cuisine ${destination}`);
}

// Ticket client : l'addition complète, avec paiements et reste à payer.
export function htmlTicketClient(
  detail: AdditionDetail,
  etablissement: { nom: string; adresse: string | null; ville: string | null },
): string {
  const lignes = detail.commandes
    .flatMap((c) => c.lignes)
    .filter((l) => l.quantite - l.quantiteAnnulee > 0)
    .map((l) => {
      const quantiteFacturable = l.quantite - l.quantiteAnnulee - l.quantiteOfferte;
      const options = l.options.length
        ? `<div class="option petit">(${echapper(l.options.map((o) => o.valeur).join(', '))})</div>`
        : '';
      const facturable =
        quantiteFacturable > 0
          ? `<div class="ligne"><span class="lib">${quantiteFacturable} x ${echapper(l.nomProduit)}</span><span>${l.prixUnitaire * quantiteFacturable} DA</span></div>${options}`
          : '';
      const offert =
        l.quantiteOfferte > 0
          ? `<div class="ligne"><span class="lib">${l.quantiteOfferte} x ${echapper(l.nomProduit)} — OFFERT</span><span>0 DA</span></div>`
          : '';
      return facturable + offert;
    })
    .join('');

  const remisesAddition = detail.remises
    .filter((r) => r.type === 'REMISE')
    .map(
      (r) =>
        `<div class="ligne"><span class="lib">Remise${r.pourcentage ? ` ${r.pourcentage} %` : ''} (${echapper(r.motif)})</span><span>-${r.montant} DA</span></div>`,
    )
    .join('');

  // Récapitulatif TVA (prix TTC : la TVA est extraite, remises réparties au prorata).
  const ttcParTaux = new Map<number, number>();
  for (const l of detail.commandes.flatMap((c) => c.lignes)) {
    const quantiteFacturable = l.quantite - l.quantiteAnnulee - l.quantiteOfferte;
    if (quantiteFacturable > 0 && l.tauxTva !== null) {
      ttcParTaux.set(l.tauxTva, (ttcParTaux.get(l.tauxTva) ?? 0) + l.prixUnitaire * quantiteFacturable);
    }
  }
  const totalVentile = [...ttcParTaux.values()].reduce((s, v) => s + v, 0);
  const arrondir = (n: number) => Math.round(n * 100) / 100;
  const recapTva = [...ttcParTaux.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([taux, ttcBrut]) => {
      const ttc = Math.max(
        0,
        arrondir(ttcBrut - (totalVentile > 0 ? (detail.montantRemises * ttcBrut) / totalVentile : 0)),
      );
      const ht = arrondir(ttc / (1 + taux / 100));
      return `<div class="ligne petit"><span class="lib">TVA ${taux} % (HT ${ht})</span><span>${arrondir(ttc - ht)} DA</span></div>`;
    })
    .join('');

  const paiements = detail.paiements
    .map((p) => {
      const rendu =
        p.montantRecu !== null && p.montantRecu > p.montant
          ? ` (reçu ${p.montantRecu}, rendu ${Math.round((p.montantRecu - p.montant) * 100) / 100})`
          : '';
      return `<div class="ligne petit"><span class="lib">${LIBELLES_MOYEN[p.moyenPaiement]}${rendu}</span><span>${p.montant} DA</span></div>`;
    })
    .join('');

  const adresse = [etablissement.adresse, etablissement.ville].filter(Boolean).join(', ');

  const corps = `
    <div class="centre grand">${echapper(etablissement.nom)}</div>
    ${adresse ? `<div class="centre petit">${echapper(adresse)}</div>` : ''}
    <div class="sep"></div>
    <div class="centre petit">${dateHeure(new Date())} · ${detail.table ? `Table ${echapper(detail.table.numero)}` : 'À emporter'}</div>
    <div class="sep"></div>
    ${lignes}
    <div class="sep"></div>
    ${remisesAddition}
    <div class="ligne gras"><span>TOTAL</span><span>${detail.total} DA</span></div>
    ${recapTva}
    ${paiements ? `<div class="ligne"><span>Payé</span><span>${detail.totalPaye} DA</span></div>${paiements}` : ''}
    ${detail.solde > 0 ? `<div class="ligne gras"><span>RESTE À PAYER</span><span>${detail.solde} DA</span></div>` : ''}
    <div class="sep"></div>
    <div class="centre">Merci de votre visite !</div>
  `;
  return envelopper(corps, `Ticket ${detail.table ? `table ${detail.table.numero}` : 'à emporter'}`);
}

// Imprime un HTML de ticket via une iframe cachée (compatible imprimantes
// thermiques installées comme imprimantes système).
export function imprimerHtml(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('data-ticket', 'true');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  iframe.srcdoc = html;
  iframe.onload = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    // Laisse le temps au dialogue d'impression de prendre la main avant de nettoyer.
    setTimeout(() => iframe.remove(), 60_000);
  };
  document.body.appendChild(iframe);
}
