import { useEffect, useState } from 'react';
import { api, type DroitUtilisateur } from '../lib/api';
import { badgeNeutre, badgeVert, boutonPrimaire, carte, champ, messageErreur } from '../lib/ui';

interface Serveur {
  id: string;
  nom: string;
  prenom: string;
  statut: string;
  droits: DroitUtilisateur[];
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

  async function handleToggleDroitAnnuler(serveur: Serveur) {
    setErreur(null);
    const droits = serveur.droits.includes('ANNULER')
      ? serveur.droits.filter((d) => d !== 'ANNULER')
      : [...serveur.droits, 'ANNULER' as const];
    try {
      await api.updateDroitsServeur(serveur.id, droits);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

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

  if (chargement) return <p className="text-center text-stone-500">Chargement des serveurs...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className={carte}>
          <h3 className="mb-3 font-semibold text-stone-900">Serveurs ({serveurs.length})</h3>
          <ul className="flex flex-col divide-y divide-stone-100">
            {serveurs.map((s) => {
              const peutAnnuler = s.droits.includes('ANNULER');
              return (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-800">
                      {s.prenom.charAt(0)}
                      {s.nom.charAt(0)}
                    </span>
                    <span className="font-medium text-stone-900">
                      {s.prenom} {s.nom}
                    </span>
                    <span className={s.statut === 'ACTIF' ? badgeVert : badgeNeutre}>
                      {s.statut === 'ACTIF' ? 'actif' : 'désactivé'}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleDroitAnnuler(s)}
                    title="Autoriser ce serveur à annuler sans validation du gérant"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      peutAnnuler
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-stone-500 border border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {peutAnnuler ? '✓ Peut annuler' : 'Ne peut pas annuler'}
                  </button>
                </li>
              );
            })}
            {serveurs.length === 0 && (
              <li className="py-2 text-sm text-stone-400">Aucun serveur pour l'instant.</li>
            )}
          </ul>
        </div>

        <form onSubmit={handleAjouter} className={`${carte} flex flex-col gap-3`}>
          <h3 className="font-semibold text-stone-900">Ajouter un serveur</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Prénom"
              value={prenom}
              onChange={(e) => setPrenom(e.target.value)}
              required
              className={champ}
            />
            <input
              type="text"
              placeholder="Nom"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              required
              className={champ}
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
            className={champ}
          />
          <button type="submit" className={boutonPrimaire}>
            Ajouter le serveur
          </button>
        </form>
      </div>
    </div>
  );
}
