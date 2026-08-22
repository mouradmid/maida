import type { Commande, LigneCommande } from '../lib/api';
import { da } from '../lib/ui';

const SUITES = [1, 2, 3];

export interface LigneEnvoyee {
  ligne: LigneCommande;
  commande: Commande;
}

/**
 * Ce que la table a déjà en cuisine, groupé par service. Un article se déplace
 * d'un service à l'autre au glisser-déposer ou au toucher-toucher (le seul qui
 * marche sur tablette), se rajoute d'un « + » et s'annule d'un « ✕ ».
 */
export function ArticlesEnvoyes({
  lignesEnvoyees,
  notesCuisine,
  totalEnvoye,
  suiteReclamee,
  peutReclamer,
  ligneEnDeplacement,
  onDeplacerVers,
  onSelectionnerLigne,
  onRajouter,
  onAnnulerCommande,
  onReclamer,
}: {
  lignesEnvoyees: LigneEnvoyee[];
  notesCuisine: string[];
  totalEnvoye: number;
  suiteReclamee: number;
  peutReclamer: boolean;
  ligneEnDeplacement: string | null;
  onDeplacerVers: (suite: number) => void;
  onSelectionnerLigne: (ligneId: string | null) => void;
  onRajouter: (ligne: LigneCommande) => void;
  onAnnulerCommande: (commande: Commande) => void;
  onReclamer: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
          Déjà envoyé — {da(totalEnvoye)}
        </span>
        {peutReclamer && (
          <button
            type="button"
            onClick={onReclamer}
            title="La table est prête pour la suite : la cuisine peut la préparer"
            className="flex min-h-11 items-center rounded-full bg-sky-600 px-4 text-sm font-semibold text-white transition-[colors,transform] hover:bg-saffron-hover active:scale-95"
          >
            Réclamer la suite {suiteReclamee + 1}
          </button>
        )}
      </div>

      {SUITES.filter(
        (suite) => lignesEnvoyees.some((e) => e.ligne.suite === suite) || ligneEnDeplacement !== null,
      ).map((suite) => (
        <div
          key={suite}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => onDeplacerVers(suite)}
          onClick={() => {
            // Équivalent tactile du glisser-déposer : on touche l'article,
            // puis la suite de destination.
            if (ligneEnDeplacement) onDeplacerVers(suite);
          }}
          className={`flex flex-col gap-1 rounded-lg border px-2 py-1.5 ${
            ligneEnDeplacement
              ? 'cursor-pointer border-dashed border-sky-400 bg-sky-50'
              : 'border-stone-200 bg-card'
          }`}
        >
          <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            Suite {suite}
            {suite <= suiteReclamee ? ' · en cuisine' : ' · en attente'}
          </span>
          {lignesEnvoyees
            .filter((e) => e.ligne.suite === suite)
            .map(({ ligne, commande }) => {
              const active = ligne.quantite - ligne.quantiteAnnulee;
              const deplacable = commande.statut === 'ENVOYEE';
              return (
                <span
                  key={ligne.id}
                  draggable={deplacable}
                  onDragStart={() => deplacable && onSelectionnerLigne(ligne.id)}
                  onDragEnd={() => onSelectionnerLigne(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!deplacable) return;
                    onSelectionnerLigne(ligneEnDeplacement === ligne.id ? null : ligne.id);
                  }}
                  title={
                    deplacable
                      ? 'Glissez (ou touchez puis touchez la suite de destination) pour changer de suite'
                      : undefined
                  }
                  // La ligne entière est la cible du toucher-toucher (choisir
                  // l'article, puis la suite de destination) : elle doit tenir
                  // la hauteur d'un doigt, comme ses deux boutons d'action.
                  className={`flex min-h-11 items-center justify-between gap-2 rounded-lg px-2 py-1 text-xs shadow-sm ring-1 ${
                    deplacable ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${
                    ligneEnDeplacement === ligne.id
                      ? 'bg-sky-600 text-white ring-sky-600'
                      : `bg-card ring-stone-200 ${active === 0 ? 'text-stone-400 line-through' : 'text-stone-700'}`
                  }`}
                >
                  <span className="min-w-0">
                    {active === 0 ? ligne.quantite : active}× {ligne.nomProduit}
                    {ligne.options.length > 0 && ` (${ligne.options.map((o) => o.valeur).join(', ')})`}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    {active > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRajouter(ligne);
                        }}
                        aria-label={`Ajouter un ${ligne.nomProduit}`}
                        title="En rajouter un (part en cuisine avec le prochain envoi)"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 text-base font-bold leading-none text-white transition-[colors,transform] hover:bg-brand-hover active:scale-90"
                      >
                        +
                      </button>
                    )}
                    {active > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAnnulerCommande(commande);
                        }}
                        aria-label="Annuler des articles de cette commande"
                        title="Annuler des articles de cette commande"
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-red-200 bg-card text-base font-bold leading-none text-red-600 transition-[colors,transform] hover:bg-red-50 active:scale-90"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                </span>
              );
            })}
        </div>
      ))}

      {notesCuisine.length > 0 && (
        <p className="text-xs italic text-brand-700">Cuisine : {notesCuisine.join(' · ')}</p>
      )}
    </div>
  );
}
