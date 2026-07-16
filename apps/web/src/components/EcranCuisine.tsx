import { useEffect, useState } from 'react';
import { api, type Commande } from '../lib/api';
import { htmlTicketCuisine, imprimerHtml } from '../lib/impression';
import { badgeBrand, messageErreur } from '../lib/ui';

const RAFRAICHISSEMENT_MS = 10_000;

// Seuils d'ancienneté d'une commande en attente (minutes).
const SEUIL_ATTENTION_MIN = 10;
const SEUIL_RETARD_MIN = 20;

function minutesDepuis(date: string, maintenant: number) {
  return Math.floor((maintenant - new Date(date).getTime()) / 60_000);
}

function libelleAnciennete(minutes: number) {
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  return `il y a ${heures} h${minutes % 60 > 0 ? ` ${minutes % 60}` : ''}`;
}

function classesAnciennete(minutes: number) {
  if (minutes >= SEUIL_RETARD_MIN) return 'bg-red-100 text-red-800 border-red-200';
  if (minutes >= SEUIL_ATTENTION_MIN) return 'bg-amber-100 text-amber-800 border-amber-200';
  return 'bg-green-100 text-green-800 border-green-200';
}

export function EcranCuisine() {
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [maintenant, setMaintenant] = useState(Date.now());
  const [enCoursIds, setEnCoursIds] = useState<Set<string>>(new Set());

  async function charger() {
    try {
      setCommandes(await api.listCommandesCuisine());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
    const rafraichissement = setInterval(() => {
      charger();
      setMaintenant(Date.now());
    }, RAFRAICHISSEMENT_MS);
    const horloge = setInterval(() => setMaintenant(Date.now()), 30_000);
    return () => {
      clearInterval(rafraichissement);
      clearInterval(horloge);
    };
  }, []);

  async function handlePrete(commande: Commande) {
    setEnCoursIds((ids) => new Set(ids).add(commande.id));
    try {
      await api.marquerCommandePrete(commande.id);
      setCommandes((liste) => liste.filter((c) => c.id !== commande.id));
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
      await charger();
    } finally {
      setEnCoursIds((ids) => {
        const suivant = new Set(ids);
        suivant.delete(commande.id);
        return suivant;
      });
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement des commandes...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-stone-500">
          {commandes.length === 0
            ? 'Aucune commande en préparation.'
            : `${commandes.length} commande${commandes.length > 1 ? 's' : ''} en préparation — les plus anciennes d'abord.`}
        </p>
        <span className="text-xs text-stone-400">Actualisation automatique toutes les 10 s</span>
      </div>

      {erreur && <p className={messageErreur}>{erreur}</p>}

      {commandes.length === 0 && !erreur && (
        <div className="rounded-xl border border-stone-200 bg-white py-16 text-center shadow-sm">
          <p className="text-4xl">✅</p>
          <p className="mt-2 font-medium text-stone-600">Tout est parti !</p>
          <p className="text-sm text-stone-400">Les nouvelles commandes apparaîtront ici.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {commandes.map((commande) => {
          const minutes = minutesDepuis(commande.creeLe, maintenant);
          const enCours = enCoursIds.has(commande.id);
          return (
            <div
              key={commande.id}
              className="flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-3">
                <span className="text-lg font-bold text-stone-900">
                  {commande.canal === 'SUR_PLACE'
                    ? `Table ${commande.table?.numero ?? '?'}`
                    : 'À emporter'}
                </span>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${classesAnciennete(minutes)}`}
                >
                  {libelleAnciennete(minutes)}
                </span>
              </div>

              <ul className="flex flex-1 flex-col gap-2 px-4 py-3">
                {commande.lignes.map((ligne) => {
                  const quantiteActive = ligne.quantite - ligne.quantiteAnnulee;
                  return (
                    <li key={ligne.id} className="text-sm">
                      <span
                        className={`font-semibold ${
                          quantiteActive === 0 ? 'text-stone-400 line-through' : 'text-stone-900'
                        }`}
                      >
                        {quantiteActive === 0 ? ligne.quantite : quantiteActive}× {ligne.nomProduit}
                      </span>
                      {ligne.options.length > 0 && (
                        <span className="ml-1.5 inline-flex flex-wrap gap-1 align-middle">
                          {ligne.options.map((o, i) => (
                            <span key={i} className={badgeBrand}>
                              {o.valeur}
                            </span>
                          ))}
                        </span>
                      )}
                      {ligne.quantiteAnnulee > 0 && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          {quantiteActive === 0 ? 'annulé' : `${ligne.quantiteAnnulee} annulé${ligne.quantiteAnnulee > 1 ? 's' : ''}`}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {commande.noteCuisine && (
                <p className="mx-4 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                  ⚠ {commande.noteCuisine}
                </p>
              )}

              <div className="flex items-center justify-between gap-2 border-t border-stone-100 px-4 py-3">
                <span className="text-xs text-stone-400">
                  {commande.serveur.prenom} {commande.serveur.nom}
                </span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => imprimerHtml(htmlTicketCuisine(commande))}
                    title="Réimprimer le ticket cuisine"
                    className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-600 transition-colors hover:bg-stone-50"
                  >
                    🖨
                  </button>
                  <button
                    type="button"
                    disabled={enCours}
                    onClick={() => handlePrete(commande)}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 active:bg-green-800 disabled:opacity-50"
                  >
                    {enCours ? '...' : 'Prête ✓'}
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
