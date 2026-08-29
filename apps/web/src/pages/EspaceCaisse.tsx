import { useEffect, useState } from 'react';
import { LoginPin } from '../components/LoginPin';
import { PageConnexion } from '../components/PageConnexion';
import { EnTeteEspace } from '../components/EnTeteEspace';
import { EcranTables } from '../components/EcranTables';
import { JourneeCaisse } from '../components/JourneeCaisse';
import { Reservations } from '../components/Reservations';
import { IndicateurHorsLigne } from '../components/IndicateurHorsLigne';
import { ReglageImprimante } from '../components/ReglageImprimante';
import { demarrerSynchronisation } from '../lib/horsLigne';
import { chipActive, chipInactive, messageErreur, messageSucces } from '../lib/ui';
import { useMe } from '../hooks/useMe';

// « Tables » porte tout le service : commander, envoyer, réclamer, encaisser,
// avec ou sans réseau. Les deux autres onglets sont périphériques.
const ONGLETS = [
  { id: 'tables', libelle: 'Tables' },
  { id: 'reservations', libelle: 'Réservations' },
  { id: 'journee', libelle: 'Journée' },
] as const;

type Onglet = (typeof ONGLETS)[number]['id'];

export function EspaceCaisse() {
  const { user, loading, refresh } = useMe();
  const [onglet, setOnglet] = useState<Onglet>('tables');
  const [messageSync, setMessageSync] = useState<{ texte: string; erreur: boolean } | null>(null);

  // Rejoue automatiquement les commandes prises hors ligne dès que possible.
  useEffect(() => {
    demarrerSynchronisation(({ commandes, gestes, paiements, reservations, erreurs }) => {
      if (erreurs.length > 0) {
        setMessageSync({
          texte: `Synchronisation : ${erreurs.length} opération${erreurs.length > 1 ? 's' : ''} refusée${erreurs.length > 1 ? 's' : ''} — ${erreurs.join(' · ')}`,
          erreur: true,
        });
      } else if (commandes > 0 || gestes > 0 || paiements > 0 || reservations > 0) {
        const parties = [
          commandes > 0 ? `${commandes} commande${commandes > 1 ? 's' : ''}` : null,
          gestes > 0
            ? `${gestes} geste${gestes > 1 ? 's' : ''} commercia${gestes > 1 ? 'ux' : 'l'}`
            : null,
          paiements > 0 ? `${paiements} paiement${paiements > 1 ? 's' : ''}` : null,
          reservations > 0 ? `${reservations} réservation${reservations > 1 ? 's' : ''}` : null,
        ].filter(Boolean);
        // Tournure invariable : la liste mêle des mots masculins et féminins
        // (« 1 commande et 2 paiements »), l'accord d'un participe final serait
        // faux dans un cas sur deux.
        setMessageSync({
          texte: `Réseau retrouvé — envoyé au serveur : ${parties.join(' et ')}.`,
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
        {/* La caisse prend toute la largeur disponible, contrairement aux
            écrans de lecture : sur une tablette en paysage ou un écran de
            comptoir, chaque pixel rendu au plan de salle et à la grille du
            menu est un article de plus visible sans faire défiler. */}
        <main className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6">
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
                className={onglet === o.id ? chipActive : chipInactive}
              >
                {o.libelle}
              </button>
            ))}
          </nav>

          {onglet === 'tables' && (
            <EcranTables
              droitAnnuler={user.droits.includes('ANNULER')}
              droitGererStock={user.droits.includes('GERER_STOCK')}
              droitRemiser={user.droits.includes('REMISER')}
            />
          )}
          {onglet === 'reservations' && <Reservations />}
          {onglet === 'journee' && (
            <div className="flex flex-col gap-6">
              <JourneeCaisse droitCloturer={user.droits.includes('CLOTURER')} />
              {/* Réglage du poste, pas de la journée : il vit ici parce que
                  c'est l'onglet du comptoir. */}
              <ReglageImprimante />
            </div>
          )}
        </main>
        <IndicateurHorsLigne />
      </div>
    );
  }

  return (
    // Sous-titre neutre : selon l'appareil, l'écran demande soit le code
    // d'installation, soit le code personnel du serveur.
    <PageConnexion titre="Caisse" sousTitre="Connectez-vous à votre caisse.">
      <LoginPin onSuccess={refresh} />
    </PageConnexion>
  );
}
