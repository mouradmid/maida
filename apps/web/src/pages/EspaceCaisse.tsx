import { LoginPin } from '../components/LoginPin';
import { PriseDeCommande } from '../components/PriseDeCommande';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';

export function EspaceCaisse() {
  const { user, loading, refresh } = useMe();

  if (loading) return <p>Chargement...</p>;

  if (user?.role === 'SERVEUR') {
    return (
      <div className="w-full max-w-3xl flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Interface caisse</h1>
            <p className="text-sm text-gray-500">
              {user.prenom} {user.nom}
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await api.logout();
              refresh();
            }}
            className="rounded border border-gray-300 px-4 py-2"
          >
            Se déconnecter
          </button>
        </div>

        <PriseDeCommande />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">Interface caisse</h1>
      <LoginPin onSuccess={refresh} />
    </div>
  );
}
