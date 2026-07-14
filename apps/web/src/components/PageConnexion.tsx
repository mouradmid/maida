import { Link } from 'react-router-dom';
import { carte } from '../lib/ui';
import { Logo } from './Logo';

// Gabarit commun des écrans de connexion : logo centré + carte blanche.
export function PageConnexion({
  titre,
  sousTitre,
  children,
}: {
  titre: string;
  sousTitre?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <Link to="/" className="transition-opacity hover:opacity-80">
        <Logo grand />
      </Link>
      <div className={`${carte} w-full max-w-sm p-6`}>
        <h1 className="text-lg font-semibold text-stone-900">{titre}</h1>
        {sousTitre && <p className="mt-1 text-sm text-stone-500">{sousTitre}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}
