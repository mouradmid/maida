import { useState } from 'react';
import { api, type Commande } from '../lib/api';
import { badgeVert, boutonPrimaire, boutonSecondaire, carte, da, messageErreur } from '../lib/ui';

const SUITES = [1, 2, 3];

// Écran de gestion des commandes en cours d'une table (ou d'un emporter) :
// suites de service (déplacement d'articles, réclame) et ajout rapide de
// quantités (« un 2e Hamoud ») envoyé en cuisine comme complément.
export function GestionCommandes({
  titre,
  commandes,
  onFermer,
  onAjouterArticles,
  onAnnuler,
  onReclamer,
  onComplementEnvoye,
  onMaj,
}: {
  titre: string;
  commandes: Commande[];
  onFermer: () => void;
  onAjouterArticles: (() => void) | null;
  onAnnuler: (commande: Commande) => void;
  onReclamer: (commande: Commande) => Promise<void>;
  onComplementEnvoye: (commande: Commande) => Promise<void>;
  onMaj: () => Promise<void>;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [ligneEnDeplacement, setLigneEnDeplacement] = useState<string | null>(null);
  // Quantités à ajouter, par ligne existante (cumulées puis envoyées en une fois).
  const [ajouts, setAjouts] = useState<Record<string, number>>({});
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  function changerAjout(ligneId: string, delta: number) {
    setAjouts((a) => {
      const quantite = Math.min((a[ligneId] ?? 0) + delta, 50);
      if (quantite <= 0) {
        const { [ligneId]: _retire, ...reste } = a;
        return reste;
      }
      return { ...a, [ligneId]: quantite };
    });
  }

  async function handleDeposerDansSuite(commande: Commande, suite: number) {
    const ligneId = ligneEnDeplacement;
    setLigneEnDeplacement(null);
    if (!ligneId) return;
    const ligne = commande.lignes.find((l) => l.id === ligneId);
    if (!ligne || ligne.suite === suite) return;
    setErreur(null);
    try {
      await api.updateSuiteLigne(ligneId, suite);
      await onMaj();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleReclamer(commande: Commande) {
    setErreur(null);
    try {
      await onReclamer(commande);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleEnvoyerAjouts(commande: Commande) {
    const liste = commande.lignes
      .filter((l) => ajouts[l.id])
      .map((l) => ({ ligneId: l.id, quantite: ajouts[l.id] }));
    if (liste.length === 0) return;
    setEnvoiEnCours(true);
    setErreur(null);
    try {
      const complement = await api.complementCommande(commande.id, liste);
      setAjouts((a) => {
        const reste = { ...a };
        for (const l of liste) delete reste[l.ligneId];
        return reste;
      });
      await onComplementEnvoye(complement);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function boutonPlus(ligneId: string, nomProduit: string) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          changerAjout(ligneId, 1);
        }}
        aria-label={`Ajouter un ${nomProduit}`}
        title="Ajouter un de plus (envoyé en cuisine comme complément)"
        className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[11px] font-bold leading-none text-white hover:bg-brand-700"
      >
        +
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-30 flex items-start justify-center overflow-y-auto bg-stone-900/40 p-4">
      <div className={`${carte} my-auto flex w-full max-w-2xl flex-col gap-4`}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-stone-900">Commande — {titre}</h3>
          <button
            type="button"
            onClick={onFermer}
            aria-label="Fermer"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            ✕
          </button>
        </div>

        {erreur && <p className={messageErreur}>{erreur}</p>}

        {commandes.length === 0 && (
          <p className="py-4 text-center text-sm text-stone-400">
            Aucune commande en cours. Les commandes encaissées n'apparaissent plus ici.
          </p>
        )}

        <ul className="flex flex-col divide-y divide-stone-100">
          {commandes.map((c) => {
            const annulable =
              c.statut !== 'ANNULEE' &&
              c.lignes.some((l) => l.quantite - l.quantitePayee - l.quantiteAnnulee > 0);
            const suiteMax = Math.max(1, ...c.lignes.map((l) => l.suite));
            const ajoutsCommande = c.lignes.filter((l) => ajouts[l.id]);
            const totalAjouts = ajoutsCommande.reduce((s, l) => s + l.prixUnitaire * ajouts[l.id], 0);
            return (
              <li key={c.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="font-medium text-stone-900">
                    {new Date(c.creeLe).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                    <span className="ml-2 font-normal text-stone-500">
                      {c.serveur.prenom} {c.serveur.nom}
                    </span>
                    {c.statut === 'PRETE' && <span className={`${badgeVert} ml-2`}>prête</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="font-semibold text-stone-900">{da(c.total)}</span>
                    {c.statut === 'ENVOYEE' && c.suiteReclamee < suiteMax && (
                      <button
                        type="button"
                        onClick={() => handleReclamer(c)}
                        title="La table est prête pour la suite : la cuisine peut la préparer"
                        className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
                      >
                        Réclamer la suite {c.suiteReclamee + 1}
                      </button>
                    )}
                    {annulable && (
                      <button
                        type="button"
                        onClick={() => onAnnuler(c)}
                        className="text-xs font-medium text-red-600 transition-colors hover:text-red-800"
                      >
                        Annuler
                      </button>
                    )}
                  </span>
                </div>

                {c.statut === 'ENVOYEE' ? (
                  // Lignes groupées par suite : glisser un article vers une autre
                  // suite pour corriger, « + » pour en ajouter un de plus.
                  <div className="flex flex-wrap gap-2">
                    {SUITES.filter(
                      (suite) =>
                        c.lignes.some((l) => l.suite === suite) ||
                        new Set(c.lignes.map((l) => l.suite)).size > 1 ||
                        ligneEnDeplacement !== null,
                    ).map((suite) => (
                      <div
                        key={suite}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDeposerDansSuite(c, suite)}
                        onClick={() => {
                          // Équivalent tactile du glisser-déposer : on touche
                          // l'article, puis la suite de destination.
                          if (ligneEnDeplacement) handleDeposerDansSuite(c, suite);
                        }}
                        className={`flex min-w-28 flex-1 flex-col gap-1 rounded-lg border px-2 py-1.5 ${
                          ligneEnDeplacement
                            ? 'cursor-pointer border-dashed border-sky-400 bg-sky-50'
                            : suite <= c.suiteReclamee
                              ? 'border-stone-200 bg-stone-50'
                              : 'border-stone-200 bg-white'
                        }`}
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                          Suite {suite}
                          {suite <= c.suiteReclamee ? ' · en cuisine' : ' · en attente'}
                        </span>
                        {c.lignes
                          .filter((l) => l.suite === suite)
                          .map((l) => {
                            const active = l.quantite - l.quantiteAnnulee;
                            return (
                              <span
                                key={l.id}
                                draggable
                                onDragStart={() => setLigneEnDeplacement(l.id)}
                                onDragEnd={() => setLigneEnDeplacement(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLigneEnDeplacement(ligneEnDeplacement === l.id ? null : l.id);
                                }}
                                title="Glissez (ou touchez puis touchez la suite de destination) pour corriger"
                                className={`flex cursor-grab items-center rounded px-1.5 py-0.5 text-xs shadow-sm ring-1 active:cursor-grabbing ${
                                  ligneEnDeplacement === l.id
                                    ? 'bg-sky-600 text-white ring-sky-600'
                                    : `bg-white ring-stone-200 ${active === 0 ? 'text-stone-400 line-through' : 'text-stone-700'}`
                                }`}
                              >
                                <span className="min-w-0">
                                  {active === 0 ? l.quantite : active}× {l.nomProduit}
                                  {l.options.length > 0 &&
                                    ` (${l.options.map((o) => o.valeur).join(', ')})`}
                                </span>
                                {boutonPlus(l.id, l.nomProduit)}
                              </span>
                            );
                          })}
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {c.lignes.map((l) => {
                      const active = l.quantite - l.quantiteAnnulee;
                      if (active === 0) return null;
                      return (
                        <li key={l.id} className="flex items-center text-xs text-stone-600">
                          <span>
                            {active}× {l.nomProduit}
                            {l.options.length > 0 && ` (${l.options.map((o) => o.valeur).join(', ')})`}
                          </span>
                          {boutonPlus(l.id, l.nomProduit)}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {c.noteCuisine && (
                  <p className="text-xs italic text-brand-700">Cuisine : {c.noteCuisine}</p>
                )}

                {ajoutsCommande.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-brand-700">
                      Ajout à envoyer en cuisine
                    </span>
                    {ajoutsCommande.map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 text-sm">
                        <span className="min-w-0 text-stone-800">
                          {l.nomProduit}
                          {l.options.length > 0 && (
                            <span className="text-stone-500">
                              {' '}
                              ({l.options.map((o) => o.valeur).join(', ')})
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => changerAjout(l.id, -1)}
                            aria-label={`Retirer un ${l.nomProduit}`}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                          >
                            −
                          </button>
                          <span className="w-8 text-center font-semibold text-stone-900">
                            +{ajouts[l.id]}
                          </span>
                          <button
                            type="button"
                            onClick={() => changerAjout(l.id, 1)}
                            aria-label={`Ajouter un ${l.nomProduit}`}
                            className="flex h-6 w-6 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                          >
                            +
                          </button>
                        </span>
                      </div>
                    ))}
                    <button
                      type="button"
                      disabled={envoiEnCours}
                      onClick={() => handleEnvoyerAjouts(c)}
                      className={boutonPrimaire}
                    >
                      Envoyer l'ajout en cuisine — {da(totalAjouts)}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex gap-2 border-t border-stone-100 pt-3">
          {onAjouterArticles && (
            <button type="button" onClick={onAjouterArticles} className={`${boutonPrimaire} flex-1`}>
              Ajouter d'autres articles
            </button>
          )}
          <button type="button" onClick={onFermer} className={`${boutonSecondaire} flex-1`}>
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
