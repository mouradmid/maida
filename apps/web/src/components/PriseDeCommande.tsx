import { useEffect, useState } from 'react';
import { api, type CategorieMenu, type Commande, type ProduitMenu, type TableCaisse } from '../lib/api';

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

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitMenu | null>(null);
  const [choixEnCours, setChoixEnCours] = useState<Record<string, string>>({});

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
  }

  function handleConfirmerSelection() {
    if (!produitEnSelection) return;
    const groupesManquants = produitEnSelection.groupesOptions.filter(
      (g) => g.obligatoire && !choixEnCours[g.id],
    );
    if (groupesManquants.length > 0) {
      setErreur(`Choisissez : ${groupesManquants.map((g) => g.nom).join(', ')}`);
      return;
    }
    setErreur(null);
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

  function retirerDuPanier(cle: string) {
    setPanier((p) => {
      const existant = p[cle];
      if (!existant) return p;
      if (existant.quantite <= 1) {
        const { [cle]: _retire, ...reste } = p;
        return reste;
      }
      return { ...p, [cle]: { ...existant, quantite: existant.quantite - 1 } };
    });
  }

  const lignesPanier = Object.values(panier);
  const total = lignesPanier.reduce((s, l) => s + l.produit.prix * l.quantite, 0);

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
      setConfirmation(`Commande envoyée — total ${commande.total} DZD`);
      setPanier({});
      setTableId('');
      setNoteCuisine('');
      await chargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  if (chargement) return <p>Chargement du menu...</p>;

  return (
    <div className="w-full max-w-3xl flex flex-col gap-6 text-left">
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}
      {confirmation && <p className="text-sm text-green-700">{confirmation}</p>}

      <div className="flex gap-4 items-center">
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={canal === 'SUR_PLACE'} onChange={() => setCanal('SUR_PLACE')} />
          Sur place
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" checked={canal === 'EMPORTER'} onChange={() => setCanal('EMPORTER')} />
          À emporter
        </label>
        {canal === 'SUR_PLACE' && (
          <select
            value={tableId}
            onChange={(e) => setTableId(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1 text-sm"
          >
            <option value="">Choisir une table</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>
                Table {t.numero} ({t.nombreCouverts} couverts)
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Menu</h2>
          {categories.map((cat) => (
            <div key={cat.id}>
              <h3 className="font-medium text-sm text-gray-500">{cat.nom}</h3>
              <ul className="flex flex-col gap-1">
                {cat.produits.map((produit) => (
                  <li key={produit.id} className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => handleClicProduit(produit)}
                      className="w-full text-left rounded border border-gray-200 px-3 py-2 hover:bg-gray-50"
                    >
                      {produit.nom} — {produit.prix} DZD
                      {produit.tempsPreparationMinutes != null && ` (${produit.tempsPreparationMinutes} min)`}
                      {produit.groupesOptions.length > 0 && (
                        <span className="text-xs text-gray-500"> · options</span>
                      )}
                    </button>

                    {produitEnSelection?.id === produit.id && (
                      <div className="border border-gray-300 rounded p-3 flex flex-col gap-2 bg-gray-50">
                        {produit.groupesOptions.map((groupe) => (
                          <div key={groupe.id}>
                            <p className="text-xs font-medium mb-1">
                              {groupe.nom} {groupe.obligatoire && '*'}
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {groupe.valeurs.map((valeur) => (
                                <label key={valeur.id} className="flex items-center gap-1 text-xs">
                                  <input
                                    type="radio"
                                    name={`groupe-${groupe.id}`}
                                    checked={choixEnCours[groupe.id] === valeur.id}
                                    onChange={() =>
                                      setChoixEnCours((c) => ({ ...c, [groupe.id]: valeur.id }))
                                    }
                                  />
                                  {valeur.valeur}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleConfirmerSelection}
                            className="rounded bg-gray-900 text-white px-3 py-1 text-xs"
                          >
                            Ajouter au panier
                          </button>
                          <button
                            type="button"
                            onClick={() => setProduitEnSelection(null)}
                            className="rounded border border-gray-300 px-3 py-1 text-xs"
                          >
                            Annuler
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Panier</h2>
          {lignesPanier.length === 0 && <p className="text-sm text-gray-400">Panier vide</p>}
          <ul className="flex flex-col gap-1">
            {lignesPanier.map((ligne) => (
              <li key={ligne.cle} className="flex items-center justify-between text-sm">
                <span>
                  {ligne.produit.nom} × {ligne.quantite}
                  {ligne.options.length > 0 && (
                    <span className="text-xs text-gray-500">
                      {' '}
                      ({ligne.options.map((o) => `${o.nomGroupe}: ${o.valeur}`).join(', ')})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  <span>{ligne.produit.prix * ligne.quantite} DZD</span>
                  <button type="button" onClick={() => retirerDuPanier(ligne.cle)} className="underline text-xs">
                    retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="font-semibold">Total : {total} DZD</p>

          <div>
            <label className="block text-xs font-medium mb-1" htmlFor="noteCuisine">
              Message pour la cuisine (optionnel)
            </label>
            <textarea
              id="noteCuisine"
              value={noteCuisine}
              onChange={(e) => setNoteCuisine(e.target.value)}
              rows={2}
              placeholder="ex: client allergique aux fruits de mer"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            type="button"
            disabled={lignesPanier.length === 0}
            onClick={handleEnvoyerCommande}
            className="rounded bg-gray-900 text-white py-2 font-medium disabled:opacity-50"
          >
            Envoyer la commande
          </button>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Commandes récentes</h2>
        <ul className="flex flex-col gap-2">
          {commandes.map((c) => (
            <li key={c.id} className="text-sm border-b border-gray-100 pb-2">
              <p>
                {c.canal === 'SUR_PLACE' ? `Table ${c.table?.numero ?? '?'}` : 'À emporter'} — {c.total} DZD —{' '}
                {c.serveur.prenom} {c.serveur.nom}
              </p>
              {c.noteCuisine && <p className="text-xs italic text-gray-600">Cuisine : {c.noteCuisine}</p>}
              <ul className="text-xs text-gray-500">
                {c.lignes.map((l) => (
                  <li key={l.id}>
                    {l.quantite}× {l.nomProduit}
                    {l.options.length > 0 && ` (${l.options.map((o) => `${o.nomGroupe}: ${o.valeur}`).join(', ')})`}
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {commandes.length === 0 && <li className="text-sm text-gray-400">Aucune commande pour l'instant.</li>}
        </ul>
      </div>
    </div>
  );
}
