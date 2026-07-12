import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Serveur {
  id: string;
  nom: string;
  prenom: string;
  statut: string;
  creeLe: string;
}

export function GestionServeurs() {
  const [serveurs, setServeurs] = useState<Serveur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [codePin, setCodePin] = useState('');

  async function charger() {
    setChargement(true);
    try {
      setServeurs(await api.listServeurs());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function handleAjouter(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      await api.createServeur({ nom, prenom, codePin });
      setNom('');
      setPrenom('');
      setCodePin('');
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return <p>Chargement des serveurs...</p>;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-4 text-left">
      <h2 className="text-xl font-semibold">Serveurs</h2>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <ul className="flex flex-col gap-1">
        {serveurs.map((s) => (
          <li key={s.id} className="text-sm">
            {s.prenom} {s.nom} — {s.statut}
          </li>
        ))}
        {serveurs.length === 0 && <li className="text-sm text-gray-400">Aucun serveur pour l'instant.</li>}
      </ul>

      <form onSubmit={handleAjouter} className="border border-gray-200 rounded p-4 flex flex-col gap-2">
        <h3 className="font-medium">Ajouter un serveur</h3>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Prénom"
            value={prenom}
            onChange={(e) => setPrenom(e.target.value)}
            required
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
          <input
            type="text"
            placeholder="Nom"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            required
            className="flex-1 rounded border border-gray-300 px-3 py-2"
          />
        </div>
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          placeholder="Code PIN à 4 chiffres"
          value={codePin}
          onChange={(e) => setCodePin(e.target.value)}
          required
          className="rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-gray-900 text-white px-4 py-2">
          Ajouter le serveur
        </button>
      </form>
    </div>
  );
}
