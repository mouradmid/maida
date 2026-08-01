import { useEffect, useState } from 'react';
import {
  appairerImprimante,
  etatImprimante,
  oublierImprimante,
  type EtatImprimante,
} from '../lib/imprimante';
import { boutonPrimaire, boutonSecondaire, carte } from '../lib/ui';

/**
 * Appairage de l'imprimante thermique du comptoir. Une fois branchée et
 * désignée, les tickets sortent tout seuls : plus de fenêtre d'impression à
 * valider à chaque table.
 *
 * Sans appairage, rien ne casse — les tickets passent par l'impression du
 * navigateur, comme avant.
 */
export function ReglageImprimante() {
  const [etat, setEtat] = useState<EtatImprimante | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    etatImprimante().then(setEtat);
  }, []);

  async function handleAppairer() {
    setErreur(null);
    try {
      setEtat(await appairerImprimante());
    } catch (err) {
      // L'utilisateur a fermé la fenêtre de sélection sans rien choisir :
      // ce n'est pas une erreur à afficher en rouge.
      const message = err instanceof Error ? err.message : String(err);
      if (!/no device selected|cancell?ed/i.test(message)) {
        setErreur("Impossible d'utiliser cette imprimante. Vérifiez qu'elle est branchée et allumée.");
      }
    }
  }

  function handleOublier() {
    oublierImprimante();
    setEtat({ statut: 'non-appairee' });
  }

  if (!etat) return null;

  return (
    <div className={`${carte} flex flex-col gap-3`}>
      <div>
        <h3 className="text-sm font-semibold text-stone-900">Imprimante du comptoir</h3>
        <p className="mt-1 text-xs text-stone-500">
          Une imprimante thermique branchée en USB imprime les tickets directement, sans fenêtre
          d'impression à valider.
        </p>
      </div>

      {etat.statut === 'indisponible' && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ce navigateur ne sait pas piloter une imprimante USB. Les tickets continuent de s'imprimer par
          la fenêtre d'impression. Pour l'impression directe, utilisez Chrome (sur tablette Android ou
          sur PC).
        </p>
      )}

      {etat.statut === 'non-appairee' && (
        <>
          <p className="text-xs text-stone-600">
            Aucune imprimante désignée : les tickets passent par la fenêtre d'impression.
          </p>
          <button type="button" onClick={handleAppairer} className={boutonPrimaire}>
            Choisir l'imprimante
          </button>
        </>
      )}

      {etat.statut === 'appairee' && (
        <>
          <p className="flex items-center gap-2 text-sm text-stone-800">
            <span className="inline-flex h-2 w-2 rounded-full bg-ok" aria-hidden />
            <span className="font-medium">{etat.nom}</span>
          </p>
          <p className="text-xs text-stone-500">
            Les tickets s'impriment directement et le papier est coupé automatiquement.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={handleAppairer} className={boutonSecondaire}>
              Changer
            </button>
            <button type="button" onClick={handleOublier} className={boutonSecondaire}>
              Oublier
            </button>
          </div>
        </>
      )}

      {erreur && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {erreur}
        </p>
      )}
    </div>
  );
}
