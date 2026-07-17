import { useEffect, useRef, useState } from 'react';
import { api, type TablePlan } from '../lib/api';
import { badgeNeutre, boutonDiscret, boutonPrimaire, carte, champ, messageErreur } from '../lib/ui';

const CANVAS_LARGEUR = 900;
const CANVAS_HAUTEUR = 500;

const TAILLES_PAR_FORME: Record<TablePlan['forme'], { largeur: number; hauteur: number }> = {
  RONDE: { largeur: 70, hauteur: 70 },
  CARREE: { largeur: 80, hauteur: 80 },
  RECTANGULAIRE: { largeur: 130, hauteur: 70 },
};

const LIBELLES_FORME: Record<TablePlan['forme'], string> = {
  RONDE: 'ronde',
  CARREE: 'carrée',
  RECTANGULAIRE: 'rectangulaire',
};

function radiusPour(forme: TablePlan['forme']) {
  return forme === 'RONDE' ? '50%' : '10px';
}

interface DragState {
  id: string;
  startX: number;
  startY: number;
  origX: number;
  origY: number;
}

export function PlanDeSalle() {
  const [tables, setTables] = useState<TablePlan[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [numero, setNumero] = useState('');
  const [forme, setForme] = useState<TablePlan['forme']>('CARREE');
  const [nombreCouverts, setNombreCouverts] = useState('2');

  const dragRef = useRef<DragState | null>(null);
  const [, forceRender] = useState(0);

  async function charger() {
    setChargement(true);
    try {
      setTables(await api.listTables());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function handleAjouterTable(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const couverts = Number(nombreCouverts);
    try {
      const taille = TAILLES_PAR_FORME[forme];
      await api.createTable({ numero, forme, nombreCouverts: couverts, ...taille });
      setNumero('');
      setNombreCouverts('2');
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleToggleTable(table: TablePlan) {
    await api.updateTable(table.id, { statut: table.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF' });
    await charger();
  }

  function handlePointerDown(e: React.PointerEvent, table: TablePlan) {
    e.preventDefault();
    dragRef.current = {
      id: table.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: table.positionX,
      origY: table.positionY,
    };
  }

  useEffect(() => {
    function clamp(valeur: number, max: number) {
      return Math.max(0, Math.min(max, valeur));
    }

    function handlePointerMove(e: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      const table = tables.find((t) => t.id === drag.id);
      if (!table) return;

      const nouveauX = clamp(drag.origX + (e.clientX - drag.startX), CANVAS_LARGEUR - table.largeur);
      const nouveauY = clamp(drag.origY + (e.clientY - drag.startY), CANVAS_HAUTEUR - table.hauteur);

      table.positionX = nouveauX;
      table.positionY = nouveauY;
      forceRender((n) => n + 1);
    }

    async function handlePointerUp() {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const table = tables.find((t) => t.id === drag.id);
      if (!table) return;
      if (table.positionX === drag.origX && table.positionY === drag.origY) return;
      try {
        await api.updateTable(table.id, { positionX: table.positionX, positionY: table.positionY });
      } catch (err) {
        setErreur(err instanceof Error ? err.message : 'Erreur');
      }
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [tables]);

  if (chargement) return <p className="text-center text-stone-500">Chargement du plan de salle...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      <div className={`${carte} overflow-x-auto`}>
        <p className="mb-3 text-sm text-stone-500">
          Glissez-déposez les tables pour organiser votre salle.
        </p>
        <div
          className="relative rounded-xl border border-stone-200 bg-stone-50"
          style={{
            width: CANVAS_LARGEUR,
            height: CANVAS_HAUTEUR,
            maxWidth: '100%',
            backgroundImage: 'radial-gradient(circle, #d6d3d1 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        >
          {tables.map((table) => (
            <div
              key={table.id}
              onPointerDown={(e) => handlePointerDown(e, table)}
              className={`absolute flex cursor-grab select-none flex-col items-center justify-center border-2 text-sm font-medium shadow-sm transition-shadow hover:shadow ${
                table.statut === 'INACTIF'
                  ? 'border-dashed border-stone-300 bg-stone-100 text-stone-400'
                  : 'border-brand-300 bg-white text-stone-800'
              }`}
              style={{
                left: table.positionX,
                top: table.positionY,
                width: table.largeur,
                height: table.hauteur,
                borderRadius: radiusPour(table.forme),
                touchAction: 'none',
              }}
            >
              <span className="font-semibold">{table.numero}</span>
              <span className="text-xs text-stone-400">{table.nombreCouverts} couv.</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className={carte}>
          <h3 className="mb-3 font-semibold text-stone-900">Tables ({tables.length})</h3>
          <ul className="flex flex-col divide-y divide-stone-100">
            {tables.map((table) => (
              <li key={table.id} className="flex items-center justify-between py-2.5 text-sm">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-stone-900">Table {table.numero}</span>
                  <span className={badgeNeutre}>
                    {LIBELLES_FORME[table.forme]} · {table.nombreCouverts} couverts
                  </span>
                  {table.statut === 'INACTIF' && <span className={badgeNeutre}>désactivée</span>}
                </span>
                <button type="button" onClick={() => handleToggleTable(table)} className={boutonDiscret}>
                  {table.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
                </button>
              </li>
            ))}
            {tables.length === 0 && (
              <li className="py-2 text-sm text-stone-400">Aucune table pour l'instant.</li>
            )}
          </ul>
        </div>

        <form onSubmit={handleAjouterTable} className={`${carte} flex flex-col gap-3`}>
          <h3 className="font-semibold text-stone-900">Ajouter une table</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Numéro"
              value={numero}
              onChange={(e) => setNumero(e.target.value)}
              required
              className={`${champ} w-24`}
            />
            <select
              value={forme}
              onChange={(e) => setForme(e.target.value as TablePlan['forme'])}
              className={champ}
            >
              <option value="RONDE">Ronde</option>
              <option value="CARREE">Carrée</option>
              <option value="RECTANGULAIRE">Rectangulaire</option>
            </select>
          </div>
          <input
            type="number"
            min="1"
            placeholder="Nombre de couverts"
            value={nombreCouverts}
            onChange={(e) => setNombreCouverts(e.target.value)}
            required
            className={champ}
          />
          <button type="submit" className={boutonPrimaire}>
            Ajouter la table
          </button>
        </form>
      </div>
    </div>
  );
}
