import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { carte } from '../lib/ui';
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
          <div className={carte}>
            <h2 className="text-lg font-semibold text-stone-900">Comptes clients</h2>
            <p className="mt-2 text-sm text-stone-500">
              La gestion des comptes clients et de leurs établissements arrivera ici prochainement.
            </p>
          </div>
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
