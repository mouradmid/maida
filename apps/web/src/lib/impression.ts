// Rendu d'un ticket en HTML, pour l'impression via le navigateur : on pose le
// ticket dans une iframe cachée puis on appelle window.print().
//
// C'est le chemin de repli, utilisé quand aucune imprimante n'est appairée en
// direct (voir lib/imprimante.ts) — il passe par la boîte de dialogue du
// navigateur, mais il sait tout afficher, y compris l'arabe.

import type { BlocTicket, Ticket } from './ticket';

function echapper(texte: string) {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
  .suite {
    border: 2px solid #000;
    margin: 5px 0 3px;
    padding: 2px 4px;
    text-align: center;
    font-size: 13px;
    font-weight: bold;
  }
`;

function rendreBloc(bloc: BlocTicket): string {
  switch (bloc.t) {
    case 'titre':
      return `<div class="centre ${bloc.taille}">${echapper(bloc.texte)}</div>`;
    case 'centre':
      return `<div class="centre${bloc.petit ? ' petit' : ''}">${echapper(bloc.texte)}</div>`;
    case 'article':
      return `<div class="grand">${echapper(bloc.texte)}</div>`;
    case 'option':
      return `<div class="option">${echapper(bloc.texte)}</div>`;
    case 'cadre':
      return `<div class="suite">${echapper(bloc.texte)}</div>`;
    case 'colonnes':
      return `<div class="ligne${bloc.gras ? ' gras' : ''}${bloc.petit ? ' petit' : ''}"><span class="lib">${echapper(
        bloc.libelle,
      )}</span><span>${echapper(bloc.valeur)}</span></div>`;
    case 'note':
      return `<div class="note">${echapper(bloc.texte)}</div>`;
    case 'separateur':
      return '<div class="sep"></div>';
  }
}

export function rendreHtml(ticket: Ticket): string {
  const corps = ticket.blocs.map(rendreBloc).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>${echapper(ticket.titre)}</title><style>${STYLE_TICKET}</style></head><body>${corps}</body></html>`;
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
