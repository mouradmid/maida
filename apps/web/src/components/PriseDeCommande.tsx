import { useEffect, useState } from 'react';
import { api, type CategorieMenu, type Commande, type ProduitMenu, type TableCaisse } from '../lib/api';
import { badgeBrand, badgeNeutre, boutonPrimaire, boutonSecondaire, carte, champ, messageErreur, messageSucces } from '../lib/ui';
import { PlanTablesCaisse } from './PlanTablesCaisse';

interface ChoixOption {
  groupeOptionId: string;
  optionValeurId: string;
  nomGroupe: string;
  valeur: string;
}

interface LignePanier {
  cle: string;
  produit: ProduitMenu;
  quantite: number;
  options: ChoixOption[];
}

function cleLigne(produitId: string, options: ChoixOption[]): string {
  const suffixe = options
    .map((o) => `${o.groupeOptionId}=${o.optionValeurId}`)
    .sort()
    .join(',');
  return `${produitId}::${suffixe}`;
}

export function PriseDeCommande() {
  const [categories, setCategories] = useState<CategorieMenu[]>([]);
  const [tables, setTables] = useState<TableCaisse[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [canal, setCanal] = useState<'SUR_PLACE' | 'EMPORTER'>('SUR_PLACE');
  const [tableId, setTableId] = useState('');
  const [noteCuisine, setNoteCuisine] = useState('');
  const [panier, setPanier] = useState<Record<string, LignePanier>>({});
  const [categorieActiveId, setCategorieActiveId] = useState<string | null>(null);

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitMenu | null>(null);
  const [choixEnCours, setChoixEnCours] = useState<Record<string, string>>({});
  const [erreurOptions, setErreurOptions] = useState<string | null>(null);

  async function chargerTout() {
    setChargement(true);
    try {
      const [menu, tablesActives, commandesRecentes] = await Promise.all([
        api.caisseMenu(),
        api.caisseTables(),
        api.listCommandes(),
      ]);
      setCategories(menu);
      setTables(tablesActives);
      setCommandes(commandesRecentes);
      setCategorieActiveId((actif) => actif ?? menu[0]?.id ?? null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    chargerTout();
  }, []);

  function ajouterAuPanierDirect(produit: ProduitMenu, options: ChoixOption[]) {
    const cle = cleLigne(produit.id, options);
    setPanier((p) => ({
      ...p,
      [cle]: { cle, produit, options, quantite: (p[cle]?.quantite ?? 0) + 1 },
    }));
  }

  function handleClicProduit(produit: ProduitMenu) {
    if (produit.groupesOptions.length === 0) {
      ajouterAuPanierDirect(produit, []);
      return;
    }
    setProduitEnSelection(produit);
    setChoixEnCours({});
    setErreurOptions(null);
  }

  function handleConfirmerSelection() {
    if (!produitEnSelection) return;
    const groupesManquants = produitEnSelection.groupesOptions.filter(
      (g) => g.obligatoire && !choixEnCours[g.id],
    );
    if (groupesManquants.length > 0) {
      setErreurOptions(`Choisissez : ${groupesManquants.map((g) => g.nom).join(', ')}`);
      return;
    }
    setErreurOptions(null);
    const options: ChoixOption[] = produitEnSelection.groupesOptions
      .filter((g) => choixEnCours[g.id])
      .map((g) => {
        const valeur = g.valeurs.find((v) => v.id === choixEnCours[g.id])!;
        return { groupeOptionId: g.id, optionValeurId: valeur.id, nomGroupe: g.nom, valeur: valeur.valeur };
      });
    ajouterAuPanierDirect(produitEnSelection, options);
    setProduitEnSelection(null);
    setChoixEnCours({});
  }

  function changerQuantite(cle: string, delta: number) {
    setPanier((p) => {
      const existant = p[cle];
      if (!existant) return p;
      const quantite = existant.quantite + delta;
      if (quantite <= 0) {
        const { [cle]: _retire, ...reste } = p;
        return reste;
      }
      return { ...p, [cle]: { ...existant, quantite } };
    });
  }

  const lignesPanier = Object.values(panier);
  const total = lignesPanier.reduce((s, l) => s + l.produit.prix * l.quantite, 0);
  const nbArticles = lignesPanier.reduce((s, l) => s + l.quantite, 0);
  const categorieActive = categories.find((c) => c.id === categorieActiveId) ?? categories[0];
  const tableSelectionnee = tables.find((t) => t.id === tableId) ?? null;

  async function handleEnvoyerCommande() {
    setErreur(null);
    setConfirmation(null);
    if (canal === 'SUR_PLACE' && !tableId) {
      setErreur('Choisissez une table');
      return;
    }
    try {
      const commande = await api.creerCommande({
        canal,
        tableId: canal === 'SUR_PLACE' ? tableId : undefined,
        noteCuisine: noteCuisine.trim() || undefined,
        lignes: lignesPanier.map((l) => ({
          produitId: l.produit.id,
          quantite: l.quantite,
          options: l.options.map((o) => ({ groupeOptionId: o.groupeOptionId, optionValeurId: o.optionValeurId })),
        })),
      });
      setConfirmation(`Commande envoyée — total ${commande.total} DA`);
      setPanier({});
      setTableId('');
      setNoteCuisine('');
      await chargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement du menu...</p>;

  return (
    <div className="flex w-full flex-col gap-6">
      {erreur && <p className={messageErreur}>{erreur}</p>}
      {confirmation && <p className={messageSucces}>{confirmation}</p>}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {/* Colonne menu */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-stone-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setCanal('SUR_PLACE')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  canal === 'SUR_PLACE' ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                Sur place
              </button>
              <button
                type="button"
                onClick={() => setCanal('EMPORTER')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  canal === 'EMPORTER' ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                À emporter
              </button>
            </div>
          </div>

          {canal === 'SUR_PLACE' && (
            <PlanTablesCaisse tables={tables} tableId={tableId} onSelect={setTableId} />
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategorieActiveId(cat.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  categorieActive?.id === cat.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {cat.nom}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categorieActive?.produits.map((produit) => (
              <button
                key={produit.id}
                type="button"
                onClick={() => handleClicProduit(produit)}
                className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow"
              >
                <span className="text-sm font-semibold leading-snug text-stone-900">{produit.nom}</span>
                <span className="text-base font-bold text-brand-700">{produit.prix} DA</span>
                <span className="flex flex-wrap gap-1">
                  {produit.tempsPreparationMinutes != null && (
                    <span className={badgeNeutre}>{produit.tempsPreparationMinutes} min</span>
                  )}
                  {produit.groupesOptions.length > 0 && <span className={badgeNeutre}>options</span>}
                </span>
              </button>
            ))}
            {(categorieActive?.produits.length ?? 0) === 0 && (
              <p className="col-span-full text-sm text-stone-400">Aucun produit dans cette catégorie.</p>
            )}
          </div>
        </div>

        {/* Colonne panier */}
        <div className={`${carte} sticky top-20 flex flex-col gap-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Commande</h2>
            {nbArticles > 0 && <span className={badgeNeutre}>{nbArticles} article{nbArticles > 1 ? 's' : ''}</span>}
          </div>

          <div>
            {canal === 'EMPORTER' ? (
              <span className={badgeBrand}>À emporter</span>
            ) : tableSelectionnee ? (
              <span className={badgeBrand}>
                Table {tableSelectionnee.numero}
                {tableSelectionnee.occupee && ' — s’ajoute à l’addition en cours'}
              </span>
            ) : (
              <span className={badgeNeutre}>Touchez une table sur le plan</span>
            )}
          </div>

          {lignesPanier.length === 0 && (
            <p className="py-6 text-center text-sm text-stone-400">
              Touchez un produit pour l'ajouter à la commande.
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {lignesPanier.map((ligne) => (
              <li key={ligne.cle} className="flex items-start justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">{ligne.produit.nom}</p>
                  {ligne.options.length > 0 && (
                    <p className="text-xs text-stone-500">
                      {ligne.options.map((o) => `${o.nomGroupe} : ${o.valeur}`).join(' · ')}
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-stone-500">{ligne.produit.prix * ligne.quantite} DA</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => changerQuantite(ligne.cle, -1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                    aria-label="Retirer un"
                  >
                    −
                  </button>
                  <span className="w-6 text-center font-semibold">{ligne.quantite}</span>
                  <button
                    type="button"
                    onClick={() => changerQuantite(ligne.cle, 1)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                    aria-label="Ajouter un"
                  >
                    +
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {lignesPanier.length > 0 && (
            <div className="flex items-center justify-between border-t border-stone-100 pt-3">
              <span className="text-sm font-medium text-stone-600">Total</span>
              <span className="text-xl font-bold text-stone-900">{total} DA</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="noteCuisine">
              Message pour la cuisine (optionnel)
            </label>
            <textarea
              id="noteCuisine"
              value={noteCuisine}
              onChange={(e) => setNoteCuisine(e.target.value)}
              rows={2}
              placeholder="ex : client allergique aux fruits de mer"
              className={champ}
            />
          </div>

          <button
            type="button"
            disabled={lignesPanier.length === 0}
            onClick={handleEnvoyerCommande}
            className={`${boutonPrimaire} py-3 text-base`}
          >
            Envoyer la commande
          </button>
        </div>
      </div>

      {/* Sélection des options en surimpression */}
      {produitEnSelection && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 p-4">
          <div className={`${carte} w-full max-w-md`}>
            <h3 className="text-lg font-semibold text-stone-900">{produitEnSelection.nom}</h3>
            <p className="mt-0.5 text-sm font-semibold text-brand-700">{produitEnSelection.prix} DA</p>

            <div className="mt-4 flex flex-col gap-4">
              {produitEnSelection.groupesOptions.map((groupe) => (
                <div key={groupe.id}>
                  <p className="mb-2 text-sm font-medium text-stone-700">
                    {groupe.nom}
                    {groupe.obligatoire && <span className="text-brand-600"> *</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupe.valeurs.map((valeur) => (
                      <button
                        key={valeur.id}
                        type="button"
                        onClick={() => setChoixEnCours((c) => ({ ...c, [groupe.id]: valeur.id }))}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                          choixEnCours[groupe.id] === valeur.id
                            ? 'bg-brand-600 text-white'
                            : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        {valeur.valeur}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {erreurOptions && <p className={`${messageErreur} mt-4`}>{erreurOptions}</p>}

            <div className="mt-5 flex gap-2">
              <button type="button" onClick={handleConfirmerSelection} className={`${boutonPrimaire} flex-1`}>
                Ajouter à la commande
              </button>
              <button type="button" onClick={() => setProduitEnSelection(null)} className={boutonSecondaire}>
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Commandes récentes */}
      <div className={carte}>
        <h2 className="mb-3 text-lg font-semibold text-stone-900">Commandes récentes</h2>
        <ul className="flex flex-col divide-y divide-stone-100">
          {commandes.map((c) => (
            <li key={c.id} className="flex flex-col gap-1 py-3 text-sm first:pt-0 last:pb-0">
              <div className="flex items-center justify-between">
                <span className="font-medium text-stone-900">
                  {c.canal === 'SUR_PLACE' ? `Table ${c.table?.numero ?? '?'}` : 'À emporter'}
                  <span className="ml-2 font-normal text-stone-500">
                    {c.serveur.prenom} {c.serveur.nom}
                  </span>
                </span>
                <span className="font-semibold text-stone-900">{c.total} DA</span>
              </div>
              <p className="text-xs text-stone-500">
                {c.lignes
                  .map(
                    (l) =>
                      `${l.quantite}× ${l.nomProduit}${
                        l.options.length > 0 ? ` (${l.options.map((o) => o.valeur).join(', ')})` : ''
                      }`,
                  )
                  .join(' · ')}
              </p>
              {c.noteCuisine && <p className="text-xs italic text-brand-700">Cuisine : {c.noteCuisine}</p>}
            </li>
          ))}
          {commandes.length === 0 && <li className="text-sm text-stone-400">Aucune commande pour l'instant.</li>}
        </ul>
      </div>
    </div>
  );
}
