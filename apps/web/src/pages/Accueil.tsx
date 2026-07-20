import { Link } from 'react-router-dom';
import { Logo } from '../components/Logo';

const ESPACES = [
  {
    lien: '/caisse',
    titre: 'Caisse',
    description: 'Prise de commande et encaissement, pensés pour aller vite en plein service.',
    icone: '🧾',
  },
  {
    lien: '/gerant',
    titre: 'Gérant',
    description: 'Menu, plan de salle, équipe et moyens de paiement de votre établissement.',
    icone: '🍽️',
  },
  {
    lien: '/admin',
    titre: 'Super-admin',
    description: "Gestion des comptes clients et des établissements (réservé à l'éditeur).",
    icone: '🛠️',
  },
];

export function Accueil() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-10 p-6">
      <div className="flex flex-col items-center gap-3 text-center">
        <Logo grand />
        <p className="max-w-md text-lg text-ink-soft">
          Le point de vente pensé pour la restauration algérienne.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {ESPACES.map((espace) => (
          <Link
            key={espace.lien}
            to={espace.lien}
            className="group flex flex-col gap-3 rounded-xl border border-line bg-card p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-2xl">
              {espace.icone}
            </span>
            <span className="font-display text-lg font-semibold text-ink group-hover:text-brand-700">
              {espace.titre}
            </span>
            <span className="text-sm leading-relaxed text-ink-soft">{espace.description}</span>
          </Link>
        ))}
      </div>

      {/* Bloc démo : masqué sur un déploiement client en définissant
          VITE_MASQUER_DEMO=true au moment du build. */}
      {import.meta.env.VITE_MASQUER_DEMO !== 'true' && (
        <div className="w-full max-w-4xl rounded-xl border border-dashed border-line bg-card/60 px-5 py-4 text-sm text-ink-soft">
          <p className="font-medium text-ink">Accès démo — Le Bon Grill (Hydra)</p>
          <p className="mt-1">
            Gérant :{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono">karim@lebongrill.dz</code> /{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono">demo1234</code> · Caisse : PIN{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono">1234</code> (Sofiane) ou{' '}
            <code className="rounded bg-surface px-1.5 py-0.5 font-mono">5678</code> (Yacine)
          </p>
        </div>
      )}
    </div>
  );
}
