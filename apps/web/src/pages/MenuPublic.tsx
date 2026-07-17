import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { da } from '../lib/ui';
import { Logo } from '../components/Logo';

type MenuPublicData = Awaited<ReturnType<typeof api.menuPublic>>;

// Menu consultable par le client du restaurant, depuis le QR code posé sur
// sa table. Public, sans connexion, pensé pour un téléphone.
export function MenuPublic() {
  const { etablissementId } = useParams();
  const [parametres] = useSearchParams();
  const table = parametres.get('table');

  const [menu, setMenu] = useState<MenuPublicData | null>(null);
  const [erreur, setErreur] = useState(false);
  const [categorieActive, setCategorieActive] = useState<string | null>(null);

  useEffect(() => {
    if (!etablissementId) return;
    api
      .menuPublic(etablissementId)
      .then(setMenu)
      .catch(() => setErreur(true));
  }, [etablissementId]);

  if (erreur) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Logo />
        <p className="text-stone-600">Ce menu n'est pas disponible pour le moment.</p>
      </div>
    );
  }

  if (!menu) {
    return <p className="p-10 text-center text-stone-500">Chargement du menu...</p>;
  }

  const defiler = (categorieId: string) => {
    setCategorieActive(categorieId);
    document.getElementById(`categorie-${categorieId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className="min-h-screen pb-16">
      <header className="bg-gradient-to-br from-brand-600 to-brand-800 px-4 pb-6 pt-8 text-center text-white">
        <h1 className="text-2xl font-bold">{menu.etablissement.nom}</h1>
        {(menu.etablissement.adresse || menu.etablissement.ville) && (
          <p className="mt-1 text-sm text-white/80">
            {[menu.etablissement.adresse, menu.etablissement.ville].filter(Boolean).join(', ')}
          </p>
        )}
        {table && (
          <span className="mt-3 inline-flex items-center rounded-full bg-white/20 px-3 py-1 text-sm font-semibold">
            Table {table}
          </span>
        )}
      </header>

      <nav className="sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-stone-200 bg-white/95 px-4 py-3 backdrop-blur">
        {menu.categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => defiler(c.id)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              categorieActive === c.id ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'
            }`}
          >
            {c.nom}
          </button>
        ))}
      </nav>

      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-5">
        {menu.categories.map((categorie) => (
          <section key={categorie.id} id={`categorie-${categorie.id}`} className="scroll-mt-16">
            <h2 className="mb-3 text-lg font-bold text-stone-900">{categorie.nom}</h2>
            <ul className="flex flex-col gap-2.5">
              {categorie.produits.map((produit) => (
                <li
                  key={produit.id}
                  className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-semibold text-stone-900">{produit.nom}</span>
                    <span className="shrink-0 font-bold text-brand-700">{da(produit.prix)}</span>
                  </div>
                  {produit.description && (
                    <p className="mt-1 text-sm leading-relaxed text-stone-500">{produit.description}</p>
                  )}
                  {produit.options.length > 0 && (
                    <p className="mt-1.5 text-xs text-stone-400">
                      {produit.options.map((o) => `${o.nom} : ${o.valeurs.join(', ')}`).join(' · ')}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </main>

      <footer className="mt-4 px-4 text-center text-xs text-stone-400">
        Menu propulsé par <span className="font-semibold text-brand-700">Maïda</span> — les prix
        s'entendent en dinars, TVA comprise.
      </footer>
    </div>
  );
}
