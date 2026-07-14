import { api, type Utilisateur } from '../lib/api';
import { badgeBrand, boutonSecondaire } from '../lib/ui';
import { Logo } from './Logo';

export function EnTeteEspace({
  espace,
  user,
  onLogout,
}: {
  espace: string;
  user: Utilisateur;
  onLogout: () => void;
}) {
  async function handleLogout() {
    await api.logout();
    onLogout();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <Logo />
          <span className={badgeBrand}>{espace}</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-700">
              {user.prenom.charAt(0)}
              {user.nom.charAt(0)}
            </span>
            <span className="hidden text-sm text-stone-600 sm:inline">
              {user.prenom} {user.nom}
            </span>
          </div>
          <button type="button" onClick={handleLogout} className={boutonSecondaire}>
            Se déconnecter
          </button>
        </div>
      </div>
    </header>
  );
}
