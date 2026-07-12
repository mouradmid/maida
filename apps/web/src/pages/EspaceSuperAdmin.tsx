import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { EspaceConnecte } from '../components/EspaceConnecte';
import { useMe } from '../hooks/useMe';

export function EspaceSuperAdmin() {
  const { user, loading, refresh } = useMe();

  if (loading) return <p>Chargement...</p>;

  if (user?.role === 'SUPER_ADMIN') {
    return <EspaceConnecte titre="Espace super-admin" user={user} onLogout={refresh} />;
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">Espace super-admin</h1>
      <LoginMotDePasse onSuccess={refresh} />
    </div>
  );
}
