import { useEffect, useState } from 'react';
import { api, type DroitUtilisateur } from '../lib/api';
import {
  badgeNeutre,
  badgeVert,
  boutonDiscret,
  boutonPrimaire,
  carte,
  champ,
  messageErreur,
} from '../lib/ui';

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
  // Serveur dont on est en train de changer le code, et le code saisi.
  const [codeEnEdition, setCodeEnEdition] = useState<{ id: string; code: string } | null>(null);

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

  async function handleToggleDroit(serveur: Serveur, droit: DroitUtilisateur) {
    setErreur(null);
    const droits = serveur.droits.includes(droit)
      ? serveur.droits.filter((d) => d !== droit)
      : [...serveur.droits, droit];
    try {
      await api.updateDroitsServeur(serveur.id, droits);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  // Un serveur qui part est désactivé, jamais supprimé : ses commandes et ses
  // encaissements gardent son nom. Il perd l'accès à la caisse sur-le-champ.
  async function handleStatut(serveur: Serveur) {
    const desactiver = serveur.statut === 'ACTIF';
    if (
      desactiver &&
      !window.confirm(
        `Désactiver ${serveur.prenom} ${serveur.nom} ?

Son code ne lui ouvrira plus la caisse, ` + 'et sa session en cours est coupée immédiatement.',
      )
    ) {
      return;
    }
    setErreur(null);
    try {
      await api.updateServeur(serveur.id, { statut: desactiver ? 'DESACTIVE' : 'ACTIF' });
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleNouveauCode(e: React.FormEvent) {
    e.preventDefault();
    if (!codeEnEdition) return;
    setErreur(null);
    try {
      await api.updateServeur(codeEnEdition.id, { codePin: codeEnEdition.code });
      setCodeEnEdition(null);
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  const DROITS_UI: Array<{ droit: DroitUtilisateur; actif: string; inactif: string; titre: string }> = [
    {
      droit: 'ANNULER',
      actif: '✓ Peut annuler',
      inactif: 'Ne peut pas annuler',
      titre: 'Autoriser ce serveur à annuler sans validation du gérant',
    },
    {
      droit: 'CLOTURER',
      actif: '✓ Peut clôturer',
      inactif: 'Ne peut pas clôturer',
      titre: 'Autoriser ce serveur à clôturer la journée de caisse sans validation du gérant',
    },
    {
      droit: 'REMISER',
      actif: '✓ Peut remiser',
      inactif: 'Ne peut pas remiser',
      titre: 'Autoriser ce serveur à accorder remises et offerts sans validation du gérant',
    },
    {
      droit: 'GERER_STOCK',
      actif: '✓ Peut gérer le stock',
      inactif: 'Ne peut pas gérer le stock',
      titre: 'Autoriser ce serveur à marquer les ruptures et ajuster les quantités depuis la caisse',
    },
  ];

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
            {serveurs.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm"
              >
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
                <span className="flex flex-wrap items-center gap-3">
                  {codeEnEdition?.id === s.id ? (
                    <form onSubmit={handleNouveauCode} className="flex items-center gap-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        autoFocus
                        placeholder="Nouveau code"
                        value={codeEnEdition.code}
                        onChange={(e) =>
                          setCodeEnEdition({ id: s.id, code: e.target.value.replace(/[^0-9]/g, '') })
                        }
                        className={`${champ} w-32`}
                      />
                      <button
                        type="submit"
                        disabled={codeEnEdition.code.length !== 4}
                        className={boutonDiscret}
                      >
                        Enregistrer
                      </button>
                      <button
                        type="button"
                        onClick={() => setCodeEnEdition(null)}
                        className="text-sm text-ink-faint hover:text-ink-soft"
                      >
                        Annuler
                      </button>
                    </form>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setCodeEnEdition({ id: s.id, code: '' })}
                      className={boutonDiscret}
                    >
                      Nouveau code
                    </button>
                  )}
                  <button type="button" onClick={() => handleStatut(s)} className={boutonDiscret}>
                    {s.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
                  </button>
                </span>
                <span className="flex flex-wrap gap-2">
                  {DROITS_UI.map(({ droit, actif, inactif, titre }) => {
                    const possede = s.droits.includes(droit);
                    return (
                      <button
                        key={droit}
                        type="button"
                        onClick={() => handleToggleDroit(s, droit)}
                        title={titre}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                          possede
                            ? 'bg-brand-600 text-white'
                            : 'bg-card text-stone-500 border border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        {possede ? actif : inactif}
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
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
