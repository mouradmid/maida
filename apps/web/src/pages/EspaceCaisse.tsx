import { useEffect, useState } from 'react';
import { LoginPin } from '../components/LoginPin';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { PriseDeCommande } from '../components/PriseDeCommande';
import { Encaissement } from '../components/Encaissement';
import { EcranCuisine } from '../components/EcranCuisine';
import { JourneeCaisse } from '../components/JourneeCaisse';
import { demarrerSynchronisation } from '../lib/horsLigne';
import { messageErreur, messageSucces } from '../lib/ui';
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
  const [messageSync, setMessageSync] = useState<{ texte: string; erreur: boolean } | null>(null);

  // Rejoue automatiquement les commandes prises hors ligne dès que possible.
  useEffect(() => {
    demarrerSynchronisation(({ commandes, paiements, erreurs }) => {
      if (erreurs.length > 0) {
        setMessageSync({
          texte: `Synchronisation : ${erreurs.length} opération${erreurs.length > 1 ? 's' : ''} refusée${erreurs.length > 1 ? 's' : ''} — ${erreurs.join(' · ')}`,
          erreur: true,
        });
      } else if (commandes > 0 || paiements > 0) {
        const parties = [
          commandes > 0 ? `${commandes} commande${commandes > 1 ? 's' : ''}` : null,
          paiements > 0 ? `${paiements} paiement${paiements > 1 ? 's' : ''}` : null,
        ].filter(Boolean);
        setMessageSync({
          texte: `Réseau retrouvé : ${parties.join(' et ')} hors ligne synchronisé${commandes + paiements > 1 ? 's' : ''}.`,
          erreur: false,
        });
      }
    });
  }, []);

  if (loading) {
    return <p className="p-8 text-center text-stone-500">Chargement...</p>;
  }

  if (user?.role === 'SERVEUR') {
    return (
      <div className="min-h-screen">
        <EnTeteEspace espace="Caisse" user={user} onLogout={refresh} />
        <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6">
          {messageSync && (
            <p className={messageSync.erreur ? messageErreur : messageSucces}>
              {messageSync.texte}{' '}
              <button type="button" onClick={() => setMessageSync(null)} className="ml-2 underline">
                OK
              </button>
            </p>
          )}
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
          {onglet === 'encaissement' && <Encaissement droitRemiser={user.droits.includes('REMISER')} />}
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
