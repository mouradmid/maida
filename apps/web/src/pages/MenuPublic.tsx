import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { api, ErreurReseau } from '../lib/api';
import { da } from '../lib/ui';
import { Logo } from '../components/Logo';

type MenuPublicData = Awaited<ReturnType<typeof api.menuPublic>>;
type ProduitPublic = MenuPublicData['categories'][number]['produits'][number];

interface LignePanier {
  produit: ProduitPublic;
  quantite: number;
  options: Array<{ groupeOptionId: string; optionValeurId: string; valeur: string }>;
}

function cleLigne(produitId: string, options: LignePanier['options']) {
  return `${produitId}::${options
    .map((o) => o.optionValeurId)
    .sort()
    .join(',')}`;
}

// Menu consultable — et commandable si le restaurant l'a activé — par le
// client, depuis le QR code posé sur sa table. Public, pensé pour un téléphone.
export function MenuPublic() {
  const { etablissementId } = useParams();
  const [parametres] = useSearchParams();
  const table = parametres.get('table');

  const [menu, setMenu] = useState<MenuPublicData | null>(null);
  const [erreur, setErreur] = useState(false);
  const [categorieActive, setCategorieActive] = useState<string | null>(null);

  // Commande client
  const [panier, setPanier] = useState<Record<string, LignePanier>>({});
  const [produitEnSelection, setProduitEnSelection] = useState<ProduitPublic | null>(null);
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [panierOuvert, setPanierOuvert] = useState(false);
  const [note, setNote] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [erreurCommande, setErreurCommande] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<number | null>(null);

  useEffect(() => {
    if (!etablissementId) return;
    api
      .menuPublic(etablissementId)
      .then(setMenu)
      .catch(() => setErreur(true));
  }, [etablissementId]);

  const commandePossible = Boolean(menu?.commandeClientActive && table);
  const lignes = Object.entries(panier);
  const nbArticles = lignes.reduce((s, [, l]) => s + l.quantite, 0);
  const total = Math.round(lignes.reduce((s, [, l]) => s + l.produit.prix * l.quantite, 0) * 100) / 100;

  function ajouter(produit: ProduitPublic, options: LignePanier['options']) {
    const cle = cleLigne(produit.id, options);
    setPanier((p) => ({
      ...p,
      [cle]: { produit, options, quantite: (p[cle]?.quantite ?? 0) + 1 },
    }));
  }

  function changerQuantite(cle: string, delta: number) {
    setPanier((p) => {
      const ligne = p[cle];
      if (!ligne) return p;
      const quantite = ligne.quantite + delta;
      if (quantite <= 0) {
        const { [cle]: _retiree, ...reste } = p;
        return reste;
      }
      return { ...p, [cle]: { ...ligne, quantite } };
    });
  }

  function handleChoisirProduit(produit: ProduitPublic) {
    if (produit.options.length === 0) {
      ajouter(produit, []);
      return;
    }
    setChoix({});
    setProduitEnSelection(produit);
  }

  function validerOptions() {
    if (!produitEnSelection) return;
    const manquant = produitEnSelection.options.find((g) => g.obligatoire && !choix[g.id]);
    if (manquant) return;
    ajouter(
      produitEnSelection,
      produitEnSelection.options
        .filter((g) => choix[g.id])
        .map((g) => ({
          groupeOptionId: g.id,
          optionValeurId: choix[g.id],
          valeur: g.valeurs.find((v) => v.id === choix[g.id])?.valeur ?? '',
        })),
    );
    setProduitEnSelection(null);
  }

  async function handleEnvoyer() {
    if (!etablissementId || !table || nbArticles === 0) return;
    setErreurCommande(null);
    setEnvoiEnCours(true);
    try {
      const resultat = await api.commanderClient({
        etablissementId,
        tableNumero: table,
        lignes: lignes.map(([, l]) => ({
          produitId: l.produit.id,
          quantite: l.quantite,
          options: l.options.length
            ? l.options.map((o) => ({
                groupeOptionId: o.groupeOptionId,
                optionValeurId: o.optionValeurId,
              }))
            : undefined,
        })),
        note: note.trim() || undefined,
      });
      setConfirmation(resultat.total);
      setPanier({});
      setNote('');
      setPanierOuvert(false);
    } catch (err) {
      setErreurCommande(
        err instanceof ErreurReseau
          ? 'Pas de connexion — réessayez ou appelez un serveur.'
          : err instanceof Error
            ? err.message
            : 'Une erreur est survenue',
      );
    } finally {
      setEnvoiEnCours(false);
    }
  }

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

  if (confirmation !== null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
        <span className="text-6xl">✅</span>
        <h1 className="text-xl font-bold text-stone-900">Commande envoyée !</h1>
        <p className="text-stone-600">
          Total : <span className="font-bold text-brand-700">{da(confirmation)}</span>
          <br />
          Un serveur va la confirmer dans un instant.
        </p>
        <button
          type="button"
          onClick={() => setConfirmation(null)}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-semibold text-white"
        >
          Commander autre chose
        </button>
      </div>
    );
  }

  const defiler = (categorieId: string) => {
    setCategorieActive(categorieId);
    document.getElementById(`categorie-${categorieId}`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  return (
    <div className={`min-h-screen ${nbArticles > 0 ? 'pb-28' : 'pb-16'}`}>
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
                    <div className="min-w-0">
                      <span className="font-semibold text-stone-900">{produit.nom}</span>
                      {produit.description && (
                        <p className="mt-1 text-sm leading-relaxed text-stone-500">
                          {produit.description}
                        </p>
                      )}
                      {!commandePossible && produit.options.length > 0 && (
                        <p className="mt-1.5 text-xs text-stone-400">
                          {produit.options
                            .map((o) => `${o.nom} : ${o.valeurs.map((v) => v.valeur).join(', ')}`)
                            .join(' · ')}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="font-bold text-brand-700">{da(produit.prix)}</span>
                      {commandePossible && (
                        <button
                          type="button"
                          onClick={() => handleChoisirProduit(produit)}
                          aria-label={`Ajouter ${produit.nom}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-xl font-bold text-white active:bg-brand-800"
                        >
                          +
                        </button>
                      )}
                    </div>
                  </div>
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

      {/* Choix des options d'un produit */}
      {produitEnSelection && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-stone-900/50">
          <div className="w-full max-w-2xl rounded-t-2xl bg-white p-5">
            <h3 className="text-lg font-bold text-stone-900">{produitEnSelection.nom}</h3>
            {produitEnSelection.options.map((groupe) => (
              <div key={groupe.id} className="mt-4">
                <p className="mb-2 text-sm font-medium text-stone-700">
                  {groupe.nom}
                  {groupe.obligatoire && <span className="text-brand-700"> *</span>}
                </p>
                <div className="flex flex-wrap gap-2">
                  {groupe.valeurs.map((valeur) => (
                    <button
                      key={valeur.id}
                      type="button"
                      onClick={() => setChoix((c) => ({ ...c, [groupe.id]: valeur.id }))}
                      className={`rounded-full px-3.5 py-2 text-sm font-medium ${
                        choix[groupe.id] === valeur.id
                          ? 'bg-brand-600 text-white'
                          : 'bg-stone-100 text-stone-700'
                      }`}
                    >
                      {valeur.valeur}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={validerOptions}
                disabled={produitEnSelection.options.some((g) => g.obligatoire && !choix[g.id])}
                className="flex-1 rounded-lg bg-brand-600 py-3 font-semibold text-white disabled:opacity-40"
              >
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => setProduitEnSelection(null)}
                className="rounded-lg border border-stone-300 px-4 py-3 text-stone-600"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Panier */}
      {panierOuvert && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-stone-900/50">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-5">
            <h3 className="text-lg font-bold text-stone-900">Ma commande — Table {table}</h3>
            <ul className="mt-3 flex flex-col divide-y divide-stone-100">
              {lignes.map(([cle, ligne]) => (
                <li key={cle} className="flex items-center justify-between gap-2 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900">{ligne.produit.nom}</p>
                    {ligne.options.length > 0 && (
                      <p className="text-xs text-stone-500">
                        {ligne.options.map((o) => o.valeur).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => changerQuantite(cle, -1)}
                      className="h-8 w-8 rounded-full bg-stone-100 font-bold text-stone-700"
                    >
                      −
                    </button>
                    <span className="w-5 text-center font-semibold">{ligne.quantite}</span>
                    <button
                      type="button"
                      onClick={() => changerQuantite(cle, 1)}
                      className="h-8 w-8 rounded-full bg-stone-100 font-bold text-stone-700"
                    >
                      +
                    </button>
                    <span className="w-20 text-right font-semibold text-stone-900">
                      {da(ligne.produit.prix * ligne.quantite)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              placeholder="Une précision ? (allergie, cuisson...)"
              className="mt-3 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-sm"
            />
            {erreurCommande && (
              <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {erreurCommande}
              </p>
            )}
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleEnvoyer}
                disabled={envoiEnCours || nbArticles === 0}
                className="flex-1 rounded-lg bg-brand-600 py-3 font-semibold text-white disabled:opacity-40"
              >
                {envoiEnCours ? 'Envoi...' : `Envoyer la commande · ${da(total)}`}
              </button>
              <button
                type="button"
                onClick={() => setPanierOuvert(false)}
                className="rounded-lg border border-stone-300 px-4 py-3 text-stone-600"
              >
                Retour
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barre panier */}
      {commandePossible && nbArticles > 0 && !panierOuvert && (
        <button
          type="button"
          onClick={() => setPanierOuvert(true)}
          className="fixed bottom-4 left-1/2 z-20 flex w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 items-center justify-between rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white shadow-lg"
        >
          <span>
            {nbArticles} article{nbArticles > 1 ? 's' : ''}
          </span>
          <span>Voir ma commande · {da(total)}</span>
        </button>
      )}
    </div>
  );
}
