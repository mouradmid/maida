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
        <p className="max-w-md text-lg text-stone-600">
          Le point de vente pensé pour la restauration algérienne.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-4 sm:grid-cols-3">
        {ESPACES.map((espace) => (
          <Link
            key={espace.lien}
            to={espace.lien}
            className="group flex flex-col gap-3 rounded-xl border border-stone-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-2xl">
              {espace.icone}
            </span>
            <span className="text-lg font-semibold text-stone-900 group-hover:text-brand-700">
              {espace.titre}
            </span>
            <span className="text-sm leading-relaxed text-stone-500">{espace.description}</span>
          </Link>
        ))}
      </div>

      <div className="w-full max-w-4xl rounded-xl border border-dashed border-stone-300 bg-white/60 px-5 py-4 text-sm text-stone-500">
        <p className="font-medium text-stone-600">Accès démo — Le Bon Grill (Hydra)</p>
        <p className="mt-1">
          Gérant : <code className="rounded bg-stone-100 px-1.5 py-0.5">karim@lebongrill.dz</code> /{' '}
          <code className="rounded bg-stone-100 px-1.5 py-0.5">demo1234</code> · Caisse : PIN{' '}
          <code className="rounded bg-stone-100 px-1.5 py-0.5">1234</code> (Sofiane) ou{' '}
          <code className="rounded bg-stone-100 px-1.5 py-0.5">5678</code> (Yacine)
        </p>
      </div>
    </div>
  );
}
