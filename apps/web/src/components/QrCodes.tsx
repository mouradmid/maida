import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../lib/api';
import { imprimerHtml } from '../lib/impression';
import { boutonPrimaire, boutonSecondaire, carte, messageErreur } from '../lib/ui';

interface QrTable {
  numero: string;
  url: string;
  image: string;
}

// Planche A4 imprimable : un carton QR par table, à découper et plastifier.
function htmlPlanche(nomEtablissement: string, qrs: QrTable[]): string {
  const cartes = qrs
    .map(
      (qr) => `
        <div class="carton">
          <div class="resto">${nomEtablissement.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</div>
          <img src="${qr.image}" alt="QR table ${qr.numero}" />
          <div class="table">Table ${qr.numero}</div>
          <div class="invite">Scannez pour découvrir le menu</div>
        </div>`,
    )
    .join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>QR codes — ${nomEtablissement}</title>
    <style>
      @page { size: A4; margin: 10mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: system-ui, sans-serif; display: flex; flex-wrap: wrap; gap: 6mm; }
      .carton {
        width: 60mm; padding: 5mm; text-align: center;
        border: 1px dashed #a8a29e; border-radius: 4mm;
        break-inside: avoid;
      }
      .resto { font-weight: 700; font-size: 11pt; color: #a1421a; }
      img { width: 42mm; height: 42mm; margin: 3mm 0 2mm; }
      .table { font-weight: 700; font-size: 14pt; }
      .invite { font-size: 8pt; color: #78716c; margin-top: 1mm; }
    </style></head><body>${cartes}</body></html>`;
}

export function QrCodes({ etablissementId }: { etablissementId: string }) {
  const [nomEtablissement, setNomEtablissement] = useState('');
  const [qrs, setQrs] = useState<QrTable[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [tables, menu] = await Promise.all([api.listTables(), api.menuPublic(etablissementId)]);
        setNomEtablissement(menu.etablissement.nom);
        const actives = tables.filter((t) => t.statut === 'ACTIF');
        const generes = await Promise.all(
          actives.map(async (t) => {
            const url = `${window.location.origin}/menu/${etablissementId}?table=${encodeURIComponent(t.numero)}`;
            return {
              numero: t.numero,
              url,
              image: await QRCode.toDataURL(url, { width: 240, margin: 1 }),
            };
          }),
        );
        generes.sort((a, b) => a.numero.localeCompare(b.numero, 'fr', { numeric: true }));
        setQrs(generes);
      } catch (err) {
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
      } finally {
        setChargement(false);
      }
    })();
  }, [etablissementId]);

  async function handleCopier(url: string, numero: string) {
    await navigator.clipboard.writeText(url);
    setCopie(numero);
    setTimeout(() => setCopie(null), 2000);
  }

  if (chargement) return <p className="text-center text-stone-500">Génération des QR codes...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          Chaque table a son QR code : le client le scanne et consulte le menu sur son téléphone.
          Imprimez la planche, découpez, plastifiez, posez sur les tables.
        </p>
        {qrs.length > 0 && (
          <button
            type="button"
            onClick={() => imprimerHtml(htmlPlanche(nomEtablissement, qrs))}
            className={boutonPrimaire}
          >
            🖨 Imprimer la planche
          </button>
        )}
      </div>

      {qrs.length === 0 && !erreur && (
        <div className={`${carte} py-10 text-center text-stone-400`}>
          Aucune table active — créez vos tables dans le plan de salle.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {qrs.map((qr) => (
          <div key={qr.numero} className={`${carte} flex flex-col items-center gap-2 text-center`}>
            <img src={qr.image} alt={`QR table ${qr.numero}`} className="h-32 w-32" />
            <span className="font-semibold text-stone-900">Table {qr.numero}</span>
            <span className="flex gap-2">
              <a
                href={qr.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-600 hover:bg-stone-50"
              >
                Ouvrir
              </a>
              <button
                type="button"
                onClick={() => handleCopier(qr.url, qr.numero)}
                className={`${boutonSecondaire} px-2.5 py-1 text-xs`}
              >
                {copie === qr.numero ? 'Copié ✓' : 'Copier le lien'}
              </button>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
