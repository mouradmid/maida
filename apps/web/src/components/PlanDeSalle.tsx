import { useEffect, useRef, useState } from 'react';
import { api, type TablePlan } from '../lib/api';

const CANVAS_LARGEUR = 900;
const CANVAS_HAUTEUR = 500;

const TAILLES_PAR_FORME: Record<TablePlan['forme'], { largeur: number; hauteur: number }> = {
  RONDE: { largeur: 70, hauteur: 70 },
  CARREE: { largeur: 80, hauteur: 80 },
  RECTANGULAIRE: { largeur: 130, hauteur: 70 },
};

function radiusPour(forme: TablePlan['forme']) {
  return forme === 'RONDE' ? '50%' : '8px';
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

  if (chargement) return <p>Chargement du plan de salle...</p>;

  return (
    <div className="w-full max-w-3xl flex flex-col gap-4 text-left">
      <h2 className="text-xl font-semibold">Plan de salle</h2>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <div
        className="relative bg-gray-50 border border-gray-300 rounded overflow-hidden"
        style={{ width: CANVAS_LARGEUR, height: CANVAS_HAUTEUR, maxWidth: '100%' }}
      >
        {tables.map((table) => (
          <div
            key={table.id}
            onPointerDown={(e) => handlePointerDown(e, table)}
            className={`absolute flex flex-col items-center justify-center border-2 cursor-grab select-none text-sm font-medium ${
              table.statut === 'INACTIF' ? 'border-gray-300 bg-gray-200 text-gray-400' : 'border-gray-700 bg-white'
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
            <span>{table.numero}</span>
            <span className="text-xs text-gray-500">{table.nombreCouverts} couverts</span>
          </div>
        ))}
      </div>

      <ul className="flex flex-col gap-1">
        {tables.map((table) => (
          <li key={table.id} className="flex items-center justify-between text-sm">
            <span>
              Table {table.numero} — {table.forme.toLowerCase()} — {table.nombreCouverts} couverts
              {table.statut === 'INACTIF' && ' (désactivée)'}
            </span>
            <button type="button" onClick={() => handleToggleTable(table)} className="underline">
              {table.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
            </button>
          </li>
        ))}
      </ul>

      <form onSubmit={handleAjouterTable} className="border border-gray-200 rounded p-4 flex flex-col gap-2">
        <h3 className="font-medium">Ajouter une table</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Numéro"
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            required
            className="w-24 rounded border border-gray-300 px-3 py-2"
          />
          <select
            value={forme}
            onChange={(e) => setForme(e.target.value as TablePlan['forme'])}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="RONDE">Ronde</option>
            <option value="CARREE">Carrée</option>
            <option value="RECTANGULAIRE">Rectangulaire</option>
          </select>
          <input
            type="number"
            min="1"
            placeholder="Couverts"
            value={nombreCouverts}
            onChange={(e) => setNombreCouverts(e.target.value)}
            required
            className="w-28 rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded bg-gray-900 text-white px-4 py-2">
          Ajouter la table
        </button>
      </form>
    </div>
  );
}
