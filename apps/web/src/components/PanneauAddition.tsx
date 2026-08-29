import { useState } from 'react';
import { api, type AdditionDetail, type LigneCommande, type ModePaiement } from '../lib/api';
import { mettreGesteEnAttente, type CibleHorsLigne } from '../lib/horsLigne';
import { imprimerTicket } from '../lib/imprimante';
import { ticketClient } from '../lib/ticket';
import { LIBELLES_MOYEN } from '../lib/libelles';
import { badgeVert, da } from '../lib/ui';
import { ModalGesteCommercial, type ArticleOffrable, type GesteSaisi } from './ModalGesteCommercial';

export interface InfosEtablissement {
  nom: string;
  adresse: string | null;
  ville: string | null;
}

/**
 * Ce que le volet Addition sait afficher, que les chiffres viennent du serveur
 * ou — pendant une coupure — du dernier état connu de la table.
 */
export interface VueAddition {
  libelle: string;
  total: number;
  totalPaye: number;
  solde: number;
  montantRemises: number;
  lignes: LigneCommande[];
  paiements: Array<{ id: string; montant: number; moyenPaiement: ModePaiement }>;
}

export function vueDepuisDetail(detail: AdditionDetail, libelle: string): VueAddition {
  return {
    libelle,
    total: detail.total,
    totalPaye: detail.totalPaye,
    solde: detail.solde,
    montantRemises: detail.montantRemises,
    lignes: detail.commandes.flatMap((c) => c.lignes),
    paiements: detail.paiements,
  };
}

/**
 * Face « addition » d'une table : ce qui est facturable, ce qui a déjà été
 * payé, et les gestes qui s'y rattachent. Hors ligne, l'affichage est le même,
 * et remises comme offerts restent possibles — ils attendent dans la file
 * locale. Seuls le ticket détaillé et la validation par code gérant, qui
 * exigent le serveur, se désactivent.
 */
export function PanneauAddition({
  vue,
  detail,
  cible,
  quantitesEngagees,
  etablissement,
  droitRemiser,
  horsLigne,
  onGesteApplique,
}: {
  vue: VueAddition;
  detail: AdditionDetail | null;
  // Hors ligne : l'addition reconstruite localement, cible du geste en file.
  cible: CibleHorsLigne | null;
  // Hors ligne : quantités déjà offertes ou payées dans la file locale.
  quantitesEngagees: Record<string, number>;
  etablissement: InfosEtablissement | null;
  droitRemiser: boolean;
  horsLigne: boolean;
  onGesteApplique: () => void | Promise<void>;
}) {
  const [modalGeste, setModalGeste] = useState(false);

  const offrables: ArticleOffrable[] = vue.lignes
    .map((l) => ({
      id: l.id,
      nomProduit: l.nomProduit,
      prixUnitaire: l.prixUnitaire,
      disponible:
        l.quantite -
        l.quantitePayee -
        l.quantiteAnnulee -
        l.quantiteOfferte -
        (quantitesEngagees[l.id] ?? 0),
    }))
    .filter((l) => l.disponible > 0);

  // Sans réseau, un code gérant ne peut pas être vérifié (les codes ne quittent
  // jamais le serveur) : seul un serveur qui a lui-même le droit peut faire un
  // geste pendant la coupure.
  const gesteImpossible = horsLigne
    ? !droitRemiser
      ? 'Sans réseau, un code gérant ne peut pas être vérifié : ce geste attendra le retour de la connexion'
      : !cible
        ? "Cette addition n'est pas modifiable hors ligne"
        : null
    : !detail || detail.statut !== 'OUVERTE'
      ? 'Addition indisponible'
      : null;

  async function envoyerGeste(geste: GesteSaisi) {
    if (horsLigne) {
      if (!cible) throw new Error("Cette addition n'est pas modifiable hors ligne");
      mettreGesteEnAttente({
        description: `${vue.libelle} — ${geste.type === 'REMISE' ? 'remise' : 'offert'} ${da(geste.montant)}`,
        type: geste.type,
        montant: geste.montant,
        motif: geste.motif,
        commentaire: geste.commentaire,
        mode: geste.type === 'REMISE' ? geste.mode : undefined,
        valeur: geste.type === 'REMISE' ? geste.valeur : undefined,
        lignes: geste.type === 'OFFERT' ? geste.lignes : undefined,
        additionId: cible.additionId,
        cleCommandeLocale: cible.additionId ? undefined : cible.cleCommandeLocale,
      });
    } else {
      if (!detail) throw new Error('Addition indisponible');
      if (geste.type === 'REMISE') {
        await api.creerRemise(detail.id, {
          mode: geste.mode,
          valeur: geste.valeur,
          motif: geste.motif,
          commentaire: geste.commentaire,
          codeGerant: geste.codeGerant,
        });
      } else {
        await api.offrirArticles(detail.id, {
          lignes: geste.lignes,
          motif: geste.motif,
          commentaire: geste.commentaire,
          codeGerant: geste.codeGerant,
        });
      }
    }
    setModalGeste(false);
    await onGesteApplique();
  }

  return (
    <div className="flex flex-col gap-3">
      {modalGeste && (
        <ModalGesteCommercial
          titre={vue.libelle}
          solde={vue.solde}
          offrables={offrables}
          // Hors ligne, le modal ne propose jamais le code gérant : seul un
          // serveur qui a le droit arrive jusqu'ici.
          droitRemiser={droitRemiser || horsLigne}
          horsLigne={horsLigne}
          onFermer={() => setModalGeste(false)}
          onConfirmer={envoyerGeste}
        />
      )}

      <div className="flex items-end justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2">
        <span className="text-xs text-stone-500">
          <span className="block">Total {da(vue.total)}</span>
          {vue.montantRemises > 0 && (
            <span className="block text-brand-700">dont remise −{da(vue.montantRemises)}</span>
          )}
          <span className="block">Déjà payé {da(vue.totalPaye)}</span>
        </span>
        <span className="text-right">
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Reste à payer
          </span>
          <span className="text-2xl font-bold text-stone-900">{da(vue.solde)}</span>
        </span>
      </div>

      <ul className="flex flex-col divide-y divide-stone-100 text-sm">
        {vue.lignes.map((l) => {
          // Ce qui a été offert ou payé hors ligne n'est pas encore connu du
          // serveur : on le retire ici pour que la ligne dise la vérité.
          const engagee = quantitesEngagees[l.id] ?? 0;
          const facturable = Math.max(0, l.quantite - l.quantiteAnnulee - l.quantiteOfferte - engagee);
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
                {engagee > 0 && (
                  <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                    {engagee} à synchroniser
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
        {vue.lignes.length === 0 && (
          <li className="py-3 text-center text-stone-400">Aucun article sur cette addition.</li>
        )}
      </ul>

      {vue.paiements.length > 0 && (
        <div className="rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          <p className="font-medium text-stone-600">Paiements enregistrés</p>
          <ul className="mt-1">
            {vue.paiements.map((p) => (
              <li key={p.id}>
                {da(p.montant)} — {LIBELLES_MOYEN[p.moyenPaiement]}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={gesteImpossible !== null}
          onClick={() => setModalGeste(true)}
          title={gesteImpossible ?? undefined}
          className="rounded-lg border border-brand-300 bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800 transition-colors hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-40"
        >
          % Remise / Offert
        </button>
        <button
          type="button"
          disabled={horsLigne || !detail}
          onClick={() =>
            detail &&
            imprimerTicket(
              ticketClient(detail, etablissement ?? { nom: 'Maïda', adresse: null, ville: null }),
            )
          }
          title={horsLigne ? 'Le reçu hors ligne est imprimé au moment du paiement' : undefined}
          className="rounded-lg border border-stone-300 bg-card px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          🖨 Ticket client
        </button>
      </div>
    </div>
  );
}
