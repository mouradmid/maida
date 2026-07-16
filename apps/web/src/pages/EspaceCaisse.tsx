import { useState } from 'react';
import { LoginPin } from '../components/LoginPin';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { PriseDeCommande } from '../components/PriseDeCommande';
import { Encaissement } from '../components/Encaissement';
import { EcranCuisine } from '../components/EcranCuisine';
import { JourneeCaisse } from '../components/JourneeCaisse';
import { useMe } from '../hooks/useMe';

const ONGLETS = [
  { id: 'commande', libelle: 'Prise de commande' },
  { id: 'encaissement', libelle: 'Encaissement' },
  { id: 'cuisine', libelle: 'Cuisine' },
  { id: 'journee', libelle: 'Journée' },
] as const;

type Onglet = (typeof ONGLETS)[number]['id'];

export function EspaceCaisse() {
  const { user, loading, refresh } = useMe();
  const [onglet, setOnglet] = useState<Onglet>('commande');

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  if (user?.role === 'SERVEUR') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Caisse" user={user} onLogout={refresh} />
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
          <nav className="flex flex-wrap gap-2">
            {ONGLETS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setOnglet(o.id)}
                className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  onglet === o.id
                    ? 'bg-brand-600 text-white'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {o.libelle}
              </button>
            ))}
          </nav>

          {onglet === 'commande' && <PriseDeCommande droitAnnuler={user.droits.includes('ANNULER')} />}
          {onglet === 'encaissement' && <Encaissement />}
          {onglet === 'cuisine' && <EcranCuisine />}
          {onglet === 'journee' && <JourneeCaisse droitCloturer={user.droits.includes('CLOTURER')} />}
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
