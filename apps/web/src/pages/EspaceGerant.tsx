import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { EspaceConnecte } from '../components/EspaceConnecte';
import { useMe } from '../hooks/useMe';

export function EspaceGerant() {
  const { user, loading, refresh } = useMe();

  if (loading) return <p>Chargement...</p>;

  if (user?.role === 'GERANT') {
    return <EspaceConnecte titre="Espace gérant" user={user} onLogout={refresh} />;
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">Espace gérant</h1>
      <LoginMotDePasse onSuccess={refresh} />
    </div>
  );
}
