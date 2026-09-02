import { useEffect, useState } from 'react';
import { api, type ParametresGerant } from '../lib/api';
import { LoginMotDePasse } from '../components/LoginMotDePasse';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { GestionMenu } from '../components/GestionMenu';
import { GestionServeurs } from '../components/GestionServeurs';
import { PlanDeSalle } from '../components/PlanDeSalle';
import { CodeTerminal } from '../components/CodeTerminal';
import { ConfigMoyensPaiement } from '../components/ConfigMoyensPaiement';
import { AnnulationsRemises } from '../components/AnnulationsRemises';
import { HistoriqueJournees } from '../components/HistoriqueJournees';
import { QrCodes } from '../components/QrCodes';
import { RapportsGerant } from '../components/RapportsGerant';
import { ReservationsGerant } from '../components/ReservationsGerant';
import { IndicateurHorsLigne } from '../components/IndicateurHorsLigne';
import { NavigationGerant, type OngletGerant } from '../components/NavigationGerant';
import { SelecteurEtablissement } from '../components/SelecteurEtablissement';
import { useMe } from '../hooks/useMe';

// Rangées par intention : ce qu'on consulte au quotidien, puis ce qu'on règle
// une fois pour toutes. L'ordre à l'intérieur d'un groupe va du plus fréquent
// au plus rare.
const ONGLETS = [
  { id: 'rapports', libelle: 'Rapports', groupe: 'suivi' },
  { id: 'reservations', libelle: 'Réservations', groupe: 'suivi' },
  { id: 'journees', libelle: 'Journées de caisse', groupe: 'suivi' },
  { id: 'annulations', libelle: 'Annulations & remises', groupe: 'suivi' },
  { id: 'menu', libelle: 'Menu', groupe: 'configuration' },
  { id: 'salle', libelle: 'Plan de salle', groupe: 'configuration' },
  { id: 'equipe', libelle: 'Équipe', groupe: 'configuration' },
  { id: 'paiements', libelle: 'Paiements', groupe: 'configuration' },
  { id: 'qrcodes', libelle: 'QR codes', groupe: 'configuration' },
] as const satisfies readonly OngletGerant[];

type Onglet = (typeof ONGLETS)[number]['id'];

export function EspaceGerant() {
  const { user, loading, refresh } = useMe();
  const [onglet, setOnglet] = useState<Onglet>('rapports');
  const [parametres, setParametres] = useState<ParametresGerant | null>(null);
  const [maison, setMaison] = useState<{
    actuelId: string;
    etablissements: Array<{ id: string; nom: string; ville: string | null }>;
  } | null>(null);
  const [bascule, setBascule] = useState(false);

  // Rechargés à chaque changement de restaurant : les paramètres (modules,
  // code d'installation) et la liste appartiennent à l'établissement affiché.
  const etablissementCourant = maison?.actuelId ?? user?.etablissementId ?? null;

  useEffect(() => {
    if (user?.role !== 'GERANT') return;
    api
      .getParametres()
      .then(setParametres)
      .catch(() => setParametres(null));
    api
      .listEtablissementsGerant()
      .then(setMaison)
      .catch(() => setMaison(null));
  }, [user?.role, user?.etablissementId]);

  async function changerEtablissement(id: string) {
    setBascule(true);
    try {
      await api.choisirEtablissement(id);
      // `refresh` relit la session : le nouvel établissement redescend jusqu'ici
      // et la clé du contenu change, ce qui remonte tous les écrans à neuf.
      await refresh();
    } finally {
      setBascule(false);
    }
  }

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  // L'onglet QR codes n'apparaît que si le module est accordé au compte.
  const onglets = ONGLETS.filter((o) => o.id !== 'qrcodes' || parametres?.moduleQrMenu);

  if (user?.role === 'GERANT') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Espace gérant" user={user} onLogout={refresh} />
        <main className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 md:grid-cols-[13rem_1fr]">
          <div className="flex flex-col gap-4 md:gap-5">
            {maison && (
              <SelecteurEtablissement
                etablissements={maison.etablissements}
                actuelId={maison.actuelId}
                enCours={bascule}
                onChoisir={changerEtablissement}
              />
            )}
            <NavigationGerant
              onglets={onglets}
              actif={onglet}
              onChoisir={(id) => setOnglet(id as Onglet)}
            />
          </div>

          {/* La clé force le remontage de tous les écrans au changement de
              restaurant : aucun ne peut garder en mémoire les chiffres du
              précédent. */}
          <div key={etablissementCourant ?? 'aucun'} className="flex min-w-0 flex-col gap-6">
            {onglet === 'rapports' && (
              <RapportsGerant nbRestaurants={maison?.etablissements.length ?? 1} />
            )}
            {onglet === 'reservations' && <ReservationsGerant />}
            {onglet === 'salle' && <PlanDeSalle />}
            {onglet === 'menu' && <GestionMenu />}
            {onglet === 'equipe' && (
              <>
                <CodeTerminal />
                <GestionServeurs />
              </>
            )}
            {onglet === 'paiements' && <ConfigMoyensPaiement />}
            {onglet === 'annulations' && <AnnulationsRemises />}
            {onglet === 'journees' && <HistoriqueJournees />}
            {onglet === 'qrcodes' && user.etablissementId && (
              <QrCodes etablissementId={user.etablissementId} />
            )}
          </div>
        </main>
        <IndicateurHorsLigne />
      </div>
    );
  }

  return (
    <PageConnexion titre="Espace gérant" sousTitre="Gérez votre établissement au quotidien.">
      <LoginMotDePasse onSuccess={refresh} />
    </PageConnexion>
  );
}
