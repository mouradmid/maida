import { LoginPin } from '../components/LoginPin';
import { EspaceConnecte } from '../components/EspaceConnecte';
import { useMe } from '../hooks/useMe';

export function EspaceCaisse() {
  const { user, loading, refresh } = useMe();

  if (loading) return <p>Chargement...</p>;

  if (user?.role === 'SERVEUR') {
    return <EspaceConnecte titre="Interface caisse" user={user} onLogout={refresh} />;
  }

  return (
    <div className="flex flex-col gap-4 items-center">
      <h1 className="text-2xl font-semibold">Interface caisse</h1>
      <LoginPin onSuccess={refresh} />
    </div>
  );
}
