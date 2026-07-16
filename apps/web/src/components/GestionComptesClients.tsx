import { useEffect, useState } from 'react';
import { api, type CompteClient } from '../lib/api';
import {
  badgeNeutre,
  badgeVert,
  boutonDiscret,
  boutonPrimaire,
  carte,
  champ,
  messageErreur,
  messageSucces,
} from '../lib/ui';

function dateCourte(date: string) {
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function depuis(date: string) {
  const minutes = Math.floor((Date.now() - new Date(date).getTime()) / 60_000);
  if (minutes < 60) return `il y a ${Math.max(1, minutes)} min`;
  if (minutes < 24 * 60) return `il y a ${Math.floor(minutes / 60)} h`;
  return `il y a ${Math.floor(minutes / (24 * 60))} j`;
}

export function GestionComptesClients() {
  const [comptes, setComptes] = useState<CompteClient[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Formulaire nouveau compte
  const [nomEnseigne, setNomEnseigne] = useState('');
  const [etabNom, setEtabNom] = useState('');
  const [etabVille, setEtabVille] = useState('');
  const [gerantPrenom, setGerantPrenom] = useState('');
  const [gerantNom, setGerantNom] = useState('');
  const [gerantEmail, setGerantEmail] = useState('');
  const [gerantMdp, setGerantMdp] = useState('');

  // Réinitialisation de mot de passe gérant
  const [mdpEnEdition, setMdpEnEdition] = useState<string | null>(null);
  const [nouveauMdp, setNouveauMdp] = useState('');

  async function charger() {
    try {
      setComptes(await api.listComptesClients());
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function handleCreer(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    setMessage(null);
    try {
      await api.createCompteClient({
        nomEnseigne,
        etablissement: { nom: etabNom, ville: etabVille || undefined },
        gerant: { prenom: gerantPrenom, nom: gerantNom, email: gerantEmail, motDePasse: gerantMdp },
      });
      setMessage(`Compte « ${nomEnseigne} » créé — le gérant peut se connecter avec ${gerantEmail}.`);
      setNomEnseigne('');
      setEtabNom('');
      setEtabVille('');
      setGerantPrenom('');
      setGerantNom('');
      setGerantEmail('');
      setGerantMdp('');
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleToggleStatut(compte: CompteClient) {
    setErreur(null);
    setMessage(null);
    const suspendre = compte.statut === 'ACTIF';
    if (
      suspendre &&
      !window.confirm(
        `Suspendre « ${compte.nomEnseigne} » ? Le gérant et les serveurs ne pourront plus se connecter, la caisse sera coupée immédiatement.`,
      )
    ) {
      return;
    }
    try {
      await api.updateCompteClient(compte.id, { statut: suspendre ? 'SUSPENDU' : 'ACTIF' });
      setMessage(
        suspendre
          ? `« ${compte.nomEnseigne} » est suspendu : plus aucun accès jusqu'à réactivation.`
          : `« ${compte.nomEnseigne} » est réactivé.`,
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleToggleModuleFoodCost(compte: CompteClient) {
    setErreur(null);
    setMessage(null);
    const actif = compte.modules.includes('FOOD_COST');
    try {
      await api.updateCompteClient(compte.id, {
        modules: actif ? compte.modules.filter((m) => m !== 'FOOD_COST') : [...compte.modules, 'FOOD_COST'],
      });
      setMessage(
        actif
          ? `Module food cost retiré pour « ${compte.nomEnseigne} » : les coûts et marges disparaissent de son espace.`
          : `Module food cost accordé à « ${compte.nomEnseigne} ».`,
      );
      await charger();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleResetMdp(gerantId: string) {
    setErreur(null);
    setMessage(null);
    try {
      await api.resetMotDePasseGerant(gerantId, nouveauMdp);
      setMdpEnEdition(null);
      setNouveauMdp('');
      setMessage('Mot de passe du gérant mis à jour.');
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement des comptes clients...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}
      {message && <p className={messageSucces}>{message}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          {comptes.length === 0 && (
            <div className={`${carte} py-10 text-center text-stone-400`}>
              Aucun compte client pour l'instant. Créez le premier avec le formulaire ci-contre.
            </div>
          )}

          {comptes.map((compte) => (
            <div key={compte.id} className={`${carte} flex flex-col gap-3`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-lg font-semibold text-stone-900">
                    {compte.nomEnseigne}
                    <span className={compte.statut === 'ACTIF' ? badgeVert : 'inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-800'}>
                      {compte.statut === 'ACTIF' ? 'actif' : 'suspendu'}
                    </span>
                  </h3>
                  <p className="text-sm text-stone-500">
                    Client depuis le {dateCourte(compte.creeLe)} ·{' '}
                    {compte.commandes7Jours > 0
                      ? `${compte.commandes7Jours} commande${compte.commandes7Jours > 1 ? 's' : ''} sur 7 jours`
                      : 'aucune commande sur 7 jours'}
                    {compte.derniereCommande && ` · dernière activité ${depuis(compte.derniereCommande)}`}
                  </p>
                </div>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleModuleFoodCost(compte)}
                    title="Module optionnel : suivi des coûts de revient, marges et food cost dans l'espace gérant"
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      compte.modules.includes('FOOD_COST')
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-stone-500 border border-stone-300 hover:bg-stone-50'
                    }`}
                  >
                    {compte.modules.includes('FOOD_COST') ? '✓ Food cost' : 'Food cost désactivé'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleStatut(compte)}
                    className={
                      compte.statut === 'ACTIF'
                        ? 'rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50'
                        : boutonPrimaire
                    }
                  >
                    {compte.statut === 'ACTIF' ? 'Suspendre' : 'Réactiver'}
                  </button>
                </span>
              </div>

              <div className="flex flex-col gap-1 text-sm text-stone-600">
                {compte.etablissements.map((e) => (
                  <p key={e.id}>
                    🏠 {e.nom}
                    {e.ville ? ` — ${e.ville}` : ''}
                  </p>
                ))}
                {compte.gerants.map((g) => (
                  <p key={g.id} className="flex flex-wrap items-center gap-2">
                    👤 {g.prenom} {g.nom}
                    {g.email && <span className={badgeNeutre}>{g.email}</span>}
                    <button
                      type="button"
                      onClick={() => {
                        setMdpEnEdition(mdpEnEdition === g.id ? null : g.id);
                        setNouveauMdp('');
                      }}
                      className={boutonDiscret}
                    >
                      Réinitialiser le mot de passe
                    </button>
                  </p>
                ))}
                {mdpEnEdition && compte.gerants.some((g) => g.id === mdpEnEdition) && (
                  <div className="mt-1 flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2">
                    <input
                      type="text"
                      value={nouveauMdp}
                      onChange={(e) => setNouveauMdp(e.target.value)}
                      placeholder="Nouveau mot de passe (8 caractères min.)"
                      className={`${champ} max-w-xs px-2 py-1`}
                    />
                    <button
                      type="button"
                      onClick={() => handleResetMdp(mdpEnEdition)}
                      className={`${boutonPrimaire} px-3 py-1 text-xs`}
                    >
                      Enregistrer
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleCreer} className={`${carte} flex flex-col gap-3`}>
          <h3 className="font-semibold text-stone-900">Nouveau compte client</h3>
          <input
            type="text"
            placeholder="Nom de l'enseigne"
            value={nomEnseigne}
            onChange={(e) => setNomEnseigne(e.target.value)}
            required
            className={champ}
          />
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-stone-400">Établissement</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nom (ex : Le Bon Grill - Hydra)"
              value={etabNom}
              onChange={(e) => setEtabNom(e.target.value)}
              required
              className={champ}
            />
            <input
              type="text"
              placeholder="Ville"
              value={etabVille}
              onChange={(e) => setEtabVille(e.target.value)}
              className={`${champ} w-32`}
            />
          </div>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-stone-400">Gérant</p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Prénom"
              value={gerantPrenom}
              onChange={(e) => setGerantPrenom(e.target.value)}
              required
              className={champ}
            />
            <input
              type="text"
              placeholder="Nom"
              value={gerantNom}
              onChange={(e) => setGerantNom(e.target.value)}
              required
              className={champ}
            />
          </div>
          <input
            type="email"
            placeholder="Email de connexion"
            value={gerantEmail}
            onChange={(e) => setGerantEmail(e.target.value)}
            required
            className={champ}
          />
          <input
            type="text"
            placeholder="Mot de passe provisoire (8 caractères min.)"
            value={gerantMdp}
            onChange={(e) => setGerantMdp(e.target.value)}
            required
            minLength={8}
            className={champ}
          />
          <button type="submit" className={boutonPrimaire}>
            Créer le compte client
          </button>
        </form>
      </div>
    </div>
  );
}
