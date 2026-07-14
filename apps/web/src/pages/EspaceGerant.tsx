import { useState } from 'react';
import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { GestionMenu } from '../components/GestionMenu';
import { GestionServeurs } from '../components/GestionServeurs';
import { PlanDeSalle } from '../components/PlanDeSalle';
import { ConfigMoyensPaiement } from '../components/ConfigMoyensPaiement';
import { useMe } from '../hooks/useMe';

const ONGLETS = [
  { id: 'salle', libelle: 'Plan de salle' },
  { id: 'menu', libelle: 'Menu' },
  { id: 'equipe', libelle: 'Équipe' },
  { id: 'paiements', libelle: 'Paiements' },
] as const;

type Onglet = (typeof ONGLETS)[number]['id'];

export function EspaceGerant() {
  const { user, loading, refresh } = useMe();
  const [onglet, setOnglet] = useState<Onglet>('salle');

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  if (user?.role === 'GERANT') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Espace gérant" user={user} onLogout={refresh} />
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

          {onglet === 'salle' && <PlanDeSalle />}
          {onglet === 'menu' && <GestionMenu />}
          {onglet === 'equipe' && <GestionServeurs />}
          {onglet === 'paiements' && <ConfigMoyensPaiement />}
        </main>
      </div>
    );
  }

  return (
    <PageConnexion titre="Espace gérant" sousTitre="Gérez votre établissement au quotidien.">
      <LoginMotDePasse onSuccess={refresh} />
    </PageConnexion>
  );
}
