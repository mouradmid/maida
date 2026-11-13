import { useState } from 'react';
import type { PlageHoraire } from '../lib/api';
import { JOURS_SEMAINE } from '../lib/libelles';
import { boutonDiscret, boutonPrimaire, champ } from '../lib/ui';

const SERVICE_PAR_DEFAUT = { debut: '19:00', fin: '22:30' };

/**
 * Services ouverts à la réservation en ligne, jour par jour : « vendredi, de
 * 12:00 à 14:30 et de 19:00 à 22:30 ». L'heure de fin est la dernière heure
 * d'arrivée proposée au client, pas l'heure de fermeture.
 */
export function HorairesReservation({
  horaires,
  enCours,
  onEnregistrer,
}: {
  horaires: PlageHoraire[];
  enCours: boolean;
  onEnregistrer: (horaires: PlageHoraire[]) => void;
}) {
  const [plages, setPlages] = useState<PlageHoraire[]>(horaires);
  const modifie = JSON.stringify(plages) !== JSON.stringify(horaires);

  function changer(index: number, champModifie: 'debut' | 'fin', valeur: string) {
    setPlages(plages.map((p, i) => (i === index ? { ...p, [champModifie]: valeur } : p)));
  }

  function ajouter(jour: number) {
    const duJour = plages.filter((p) => p.jour === jour);
    // Un premier service le soir ; un second, à midi.
    const nouveau = duJour.length === 0 ? SERVICE_PAR_DEFAUT : { debut: '12:00', fin: '14:30' };
    setPlages([...plages, { jour, ...nouveau }]);
  }

  // « Comme le lundi » : la plupart des restaurants ont les mêmes services
  // toute la semaine, saisis une fois.
  function copierPartout(jourModele: number) {
    const modele = plages.filter((p) => p.jour === jourModele);
    setPlages(JOURS_SEMAINE.flatMap(({ numero }) => modele.map((p) => ({ ...p, jour: numero }))));
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <h4 className="font-semibold text-stone-900">Horaires des réservations</h4>
        <p className="mt-0.5 text-sm text-stone-500">
          Le client ne voit que des créneaux dans ces services, toutes les 30 minutes. L'heure de fin est
          la dernière arrivée possible. Un jour sans service est fermé à la réservation.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-stone-100">
        {JOURS_SEMAINE.map(({ numero, long }) => {
          const services = plages.map((p, index) => ({ ...p, index })).filter((p) => p.jour === numero);
          return (
            <li key={numero} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5 text-sm">
              <span className="w-24 font-medium text-stone-800">{long}</span>
              {services.length === 0 && <span className="text-stone-400">Fermé</span>}
              {services.map((s) => (
                <span key={s.index} className="flex items-center gap-1.5">
                  <input
                    type="time"
                    step={1800}
                    value={s.debut}
                    onChange={(e) => changer(s.index, 'debut', e.target.value)}
                    aria-label={`${long} : début du service`}
                    className={`${champ} w-28`}
                  />
                  <span className="text-stone-400">à</span>
                  <input
                    type="time"
                    step={1800}
                    value={s.fin}
                    onChange={(e) => changer(s.index, 'fin', e.target.value)}
                    aria-label={`${long} : dernière arrivée`}
                    className={`${champ} w-28`}
                  />
                  <button
                    type="button"
                    onClick={() => setPlages(plages.filter((_, i) => i !== s.index))}
                    aria-label={`Retirer ce service du ${long.toLowerCase()}`}
                    className="px-1 text-stone-400 hover:text-red-700"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <span className="ml-auto flex gap-3">
                {services.length < 3 && (
                  <button type="button" onClick={() => ajouter(numero)} className={boutonDiscret}>
                    + Service
                  </button>
                )}
                {services.length > 0 && (
                  <button
                    type="button"
                    onClick={() => copierPartout(numero)}
                    className="text-sm text-stone-500 hover:text-stone-800"
                  >
                    Appliquer à toute la semaine
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {modifie && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={enCours}
            onClick={() => onEnregistrer(plages)}
            className={boutonPrimaire}
          >
            Enregistrer les horaires
          </button>
          <button
            type="button"
            onClick={() => setPlages(horaires)}
            className="text-sm text-stone-500 hover:text-stone-800"
          >
            Annuler les changements
          </button>
        </div>
      )}
    </div>
  );
}
