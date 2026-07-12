import { api, type Utilisateur } from '../lib/api';

export function EspaceConnecte({
  titre,
  user,
  onLogout,
}: {
  titre: string;
  user: Utilisateur;
  onLogout: () => void;
}) {
  async function handleLogout() {
    await api.logout();
    onLogout();
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">{titre}</h1>
      <p>
        Connecté en tant que <strong>{user.prenom} {user.nom}</strong> ({user.role})
      </p>
      <button
        type="button"
        onClick={handleLogout}
        className="rounded border border-gray-300 px-4 py-2"
      >
        Se déconnecter
      </button>
    </div>
  );
}
