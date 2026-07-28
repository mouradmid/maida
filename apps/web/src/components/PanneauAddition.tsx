import { useState } from 'react';
import type { AdditionDetail } from '../lib/api';
import { htmlTicketClient, imprimerHtml } from '../lib/impression';
import { LIBELLES_MOYEN } from '../lib/libelles';
import { badgeVert, da } from '../lib/ui';
import { ModalGesteCommercial } from './ModalGesteCommercial';

export interface InfosEtablissement {
  nom: string;
  adresse: string | null;
  ville: string | null;
}

/**
 * Face « addition » d'une table : ce qui est facturable, ce qui a déjà été
 * payé, et les deux gestes qui s'y rattachent (remise / offert, ticket client).
 * L'encaissement lui-même est dans PanneauPaiement.
 */
export function PanneauAddition({
  detail,
  etablissement,
  droitRemiser,
  onGesteApplique,
}: {
  detail: AdditionDetail;
  etablissement: InfosEtablissement | null;
  droitRemiser: boolean;
  onGesteApplique: () => void | Promise<void>;
}) {
  const [modalGeste, setModalGeste] = useState(false);

  const lignes = detail.commandes.flatMap((c) => c.lignes);

  return (
    <div className="flex flex-col gap-3">
      {modalGeste && (
        <ModalGesteCommercial
          detail={detail}
          droitRemiser={droitRemiser}
          onFermer={() => setModalGeste(false)}
          onApplique={async () => {
            setModalGeste(false);
            await onGesteApplique();
          }}
        />
      )}

      <div className="flex items-end justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
        <span className="text-xs text-stone-500">
          <span className="block">Total {da(detail.total)}</span>
          {detail.montantRemises > 0 && (
            <span className="block text-brand-700">dont remise −{da(detail.montantRemises)}</span>
          )}
          <span className="block">Déjà payé {da(detail.totalPaye)}</span>
        </span>
        <span className="text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Reste à payer
          </span>
          <span className="text-2xl font-bold text-stone-900">{da(detail.solde)}</span>
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-stone-100 text-sm">
        {lignes.map((l) => {
          const facturable = l.quantite - l.quantiteAnnulee - l.quantiteOfferte;
          const rienAFacturer = facturable === 0;
          return (
            <li key={l.id} className="flex items-center justify-between gap-2 py-2">
              <span className="min-w-0">
                <span
                  className={`font-medium ${rienAFacturer ? 'text-stone-400 line-through' : 'text-stone-900'}`}
                >
                  {rienAFacturer ? l.quantite : facturable}× {l.nomProduit}
                </span>
                {l.options.length > 0 && (
                  <span className="ml-1 text-xs text-stone-500">
                    ({l.options.map((o) => o.valeur).join(', ')})
                  </span>
                )}
                {l.quantitePayee > 0 && (
                  <span className={`${badgeVert} ml-2`}>
                    {l.quantitePayee} payé{l.quantitePayee > 1 ? 's' : ''}
                  </span>
                )}
                {l.quantiteOfferte > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-medium text-sky-800">
                    {l.quantiteOfferte} offert{l.quantiteOfferte > 1 ? 's' : ''}
                  </span>
                )}
                {l.quantiteAnnulee > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800">
                    {l.quantiteAnnulee} annulé{l.quantiteAnnulee > 1 ? 's' : ''}
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 font-medium ${rienAFacturer ? 'text-stone-400 line-through' : 'text-stone-900'}`}
              >
                {da(l.prixUnitaire * (rienAFacturer ? l.quantite : facturable))}
              </span>
            </li>
          );
        })}
        {lignes.length === 0 && (
          <li className="py-3 text-center text-stone-400">Aucun article sur cette addition.</li>
        )}
      </ul>

      {detail.paiements.length > 0 && (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          <p className="font-medium text-stone-600">Paiements enregistrés</p>
          <ul className="mt-1">
            {detail.paiements.map((p) => (
              <li key={p.id}>
                {da(p.montant)} — {LIBELLES_MOYEN[p.moyenPaiement]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {detail.statut === 'OUVERTE' && (
          <button
            type="button"
            onClick={() => setModalGeste(true)}
            className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100"
          >
            % Remise / Offert
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            imprimerHtml(
              htmlTicketClient(detail, etablissement ?? { nom: 'Maïda', adresse: null, ville: null }),
            )
          }
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50"
        >
          🖨 Ticket client
        </button>
      </div>
    </div>
  );
}
