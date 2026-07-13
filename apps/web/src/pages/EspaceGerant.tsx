import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { GestionMenu } from '../components/GestionMenu';
import { GestionServeurs } from '../components/GestionServeurs';
import { PlanDeSalle } from '../components/PlanDeSalle';
import { ConfigMoyensPaiement } from '../components/ConfigMoyensPaiement';
import { api } from '../lib/api';
import { useMe } from '../hooks/useMe';

export function EspaceGerant() {
  const { user, loading, refresh } = useMe();

  if (loading) return <p>Chargement...</p>;

  if (user?.role === 'GERANT') {
    return (
      <div className="w-full max-w-4xl flex flex-col gap-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Espace gérant</h1>
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

        <PlanDeSalle />
        <GestionMenu />
        <GestionServeurs />
        <ConfigMoyensPaiement />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">Espace gérant</h1>
      <LoginMotDePasse onSuccess={refresh} />
    </div>
  );
}
