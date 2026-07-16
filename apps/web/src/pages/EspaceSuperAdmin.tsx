import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { GestionComptesClients } from '../components/GestionComptesClients';
import { useMe } from '../hooks/useMe';

export function EspaceSuperAdmin() {
  const { user, loading, refresh } = useMe();

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  if (user?.role === 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Super-admin" user={user} onLogout={refresh} />
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
          <GestionComptesClients />
        </main>
      </div>
    );
  }

  return (
    <PageConnexion titre="Espace super-admin" sousTitre="Réservé à l'éditeur de Maïda.">
      <LoginMotDePasse onSuccess={refresh} />
    </PageConnexion>
  );
}
