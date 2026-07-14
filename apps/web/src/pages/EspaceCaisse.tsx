import { useState } from 'react';
import { LoginPin } from '../components/LoginPin';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { PriseDeCommande } from '../components/PriseDeCommande';
import { Encaissement } from '../components/Encaissement';
import { useMe } from '../hooks/useMe';

export function EspaceCaisse() {
  const { user, loading, refresh } = useMe();
  const [onglet, setOnglet] = useState<'commande' | 'encaissement'>('commande');

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  if (user?.role === 'SERVEUR') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Caisse" user={user} onLogout={refresh} />
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
          <nav className="flex gap-2">
            <button
              type="button"
              onClick={() => setOnglet('commande')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                onglet === 'commande'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              Prise de commande
            </button>
            <button
              type="button"
              onClick={() => setOnglet('encaissement')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                onglet === 'encaissement'
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
              }`}
            >
              Encaissement
            </button>
          </nav>

          {onglet === 'commande' ? <PriseDeCommande /> : <Encaissement />}
        </main>
      </div>
    );
  }

  return (
    <PageConnexion titre="Caisse" sousTitre="Connectez-vous avec votre code PIN.">
      <LoginPin onSuccess={refresh} />
    </PageConnexion>
  );
}
