import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { imprimerHtml } from '../lib/impression';
import { boutonSecondaire, champ } from '../lib/ui';

function echapper(texte: string): string {
  return texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Affiche A4 pour la vitrine ou le comptoir : le passant scanne et réserve
// pour plus tard, sans entrer.
function htmlAffiche(nomEtablissement: string, url: string, image: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Réserver — ${echapper(nomEtablissement)}</title>
    <style>
      @page { size: A4; margin: 20mm; }
      body { font-family: system-ui, sans-serif; text-align: center; color: #1c1917; }
      .resto { font-size: 28pt; font-weight: 800; color: #0E5A4A; margin-top: 10mm; }
      .titre { font-size: 22pt; font-weight: 700; margin: 8mm 0 4mm; }
      img { width: 110mm; height: 110mm; }
      .url { font-size: 13pt; color: #57534e; margin-top: 4mm; word-break: break-all; }
      .pied { font-size: 10pt; color: #a8a29e; margin-top: 12mm; }
    </style></head><body>
      <div class="resto">${echapper(nomEtablissement)}</div>
      <div class="titre">Réservez votre table</div>
      <img src="${image}" alt="QR code de réservation" />
      <div class="url">${echapper(url)}</div>
      <div class="pied">Scannez avec l'appareil photo de votre téléphone</div>
    </body></html>`;
}

/**
 * Le lien public de réservation du restaurant, prêt à partager : à copier
 * dans une bio Instagram, une fiche Google, un site, à envoyer sur WhatsApp,
 * ou à imprimer en affiche avec son QR code.
 */
export function LienReservation({ lien, nomEtablissement }: { lien: string; nomEtablissement: string }) {
  const url = `${window.location.origin}/reserver/${lien}`;
  const [copie, setCopie] = useState(false);
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 1 })
      .then(setQr)
      .catch(() => setQr(null));
  }, [url]);

  async function copier() {
    try {
      await navigator.clipboard.writeText(url);
      setCopie(true);
      setTimeout(() => setCopie(false), 2000);
    } catch {
      // Presse-papiers refusé (navigateur ancien, page non sécurisée) : le
      // champ reste sélectionnable à la main.
    }
  }

  const messageWhatsapp = encodeURIComponent(`Réservez votre table chez ${nomEtablissement} : ${url}`);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <h4 className="font-semibold text-stone-900">Votre lien de réservation</h4>
        <p className="mt-0.5 text-sm text-stone-500">
          À mettre partout où vos clients vous trouvent : bio Instagram ou Facebook, fiche Google, site
          internet, statut WhatsApp. Ils réservent en quelques secondes, sans vous appeler.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className={`${champ} min-w-0 flex-1 font-mono`}
        />
        <button type="button" onClick={copier} className={boutonSecondaire}>
          {copie ? '✓ Copié' : 'Copier'}
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={url} target="_blank" rel="noreferrer" className={boutonSecondaire}>
          Voir la page
        </a>
        <a
          href={`https://wa.me/?text=${messageWhatsapp}`}
          target="_blank"
          rel="noreferrer"
          className={boutonSecondaire}
        >
          Partager sur WhatsApp
        </a>
        <button
          type="button"
          disabled={!qr}
          onClick={() => qr && imprimerHtml(htmlAffiche(nomEtablissement, url, qr))}
          className={`${boutonSecondaire} disabled:opacity-50`}
        >
          Imprimer l'affiche (QR code)
        </button>
      </div>
    </div>
  );
}
