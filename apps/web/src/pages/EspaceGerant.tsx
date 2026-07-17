import { useEffect, useState } from 'react';
import { api, type ParametresGerant } from '../lib/api';
import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { GestionMenu } from '../components/GestionMenu';
import { GestionServeurs } from '../components/GestionServeurs';
import { PlanDeSalle } from '../components/PlanDeSalle';
import { ConfigMoyensPaiement } from '../components/ConfigMoyensPaiement';
import { HistoriqueAnnulations } from '../components/HistoriqueAnnulations';
import { HistoriqueJournees } from '../components/HistoriqueJournees';
import { HistoriqueRemises } from '../components/HistoriqueRemises';
import { QrCodes } from '../components/QrCodes';
import { RapportsGerant } from '../components/RapportsGerant';
import { ReservationsGerant } from '../components/ReservationsGerant';
import { useMe } from '../hooks/useMe';

const ONGLETS = [
  { id: 'rapports', libelle: 'Rapports' },
  { id: 'reservations', libelle: 'Réservations' },
  { id: 'salle', libelle: 'Plan de salle' },
  { id: 'menu', libelle: 'Menu' },
  { id: 'equipe', libelle: 'Équipe' },
  { id: 'paiements', libelle: 'Paiements' },
  { id: 'annulations', libelle: 'Annulations & remises' },
  { id: 'qrcodes', libelle: 'QR codes' },
  { id: 'journees', libelle: 'Journées de caisse' },
] as const;

type Onglet = (typeof ONGLETS)[number]['id'];

export function EspaceGerant() {
  const { user, loading, refresh } = useMe();
  const [onglet, setOnglet] = useState<Onglet>('rapports');
  const [parametres, setParametres] = useState<ParametresGerant | null>(null);

  useEffect(() => {
    if (user?.role === 'GERANT') {
      api
        .getParametres()
        .then(setParametres)
        .catch(() => setParametres(null));
    }
  }, [user?.role]);

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  // L'onglet QR codes n'apparaît que si le module est accordé au compte.
  const onglets = ONGLETS.filter((o) => o.id !== 'qrcodes' || parametres?.moduleQrMenu);

  if (user?.role === 'GERANT') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Espace gérant" user={user} onLogout={refresh} />
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
          <nav className="flex flex-wrap gap-2">
            {onglets.map((o) => (
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

          {onglet === 'rapports' && <RapportsGerant />}
          {onglet === 'reservations' && <ReservationsGerant />}
          {onglet === 'salle' && <PlanDeSalle />}
          {onglet === 'menu' && <GestionMenu />}
          {onglet === 'equipe' && <GestionServeurs />}
          {onglet === 'paiements' && <ConfigMoyensPaiement />}
          {onglet === 'annulations' && (
            <div className="flex flex-col gap-4">
              <HistoriqueRemises />
              <HistoriqueAnnulations />
            </div>
          )}
          {onglet === 'journees' && <HistoriqueJournees />}
          {onglet === 'qrcodes' && user.etablissementId && (
            <QrCodes etablissementId={user.etablissementId} />
          )}
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
