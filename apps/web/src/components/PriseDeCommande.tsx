import { useEffect, useState } from 'react';
import { api, type CategorieMenu, type Commande, type ProduitMenu } from '../lib/api';

interface LignePanier {
  produit: ProduitMenu;
  quantite: number;
}

export function PriseDeCommande() {
  const [categories, setCategories] = useState<CategorieMenu[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [canal, setCanal] = useState<'SUR_PLACE' | 'EMPORTER'>('SUR_PLACE');
  const [numeroTable, setNumeroTable] = useState('');
  const [panier, setPanier] = useState<Record<string, LignePanier>>({});

  async function chargerTout() {
    setChargement(true);
    try {
      const [menu, commandesRecentes] = await Promise.all([api.caisseMenu(), api.listCommandes()]);
      setCategories(menu);
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

  function ajouterAuPanier(produit: ProduitMenu) {
    setPanier((p) => ({
      ...p,
      [produit.id]: { produit, quantite: (p[produit.id]?.quantite ?? 0) + 1 },
    }));
  }

  function retirerDuPanier(produitId: string) {
    setPanier((p) => {
      const existant = p[produitId];
      if (!existant) return p;
      if (existant.quantite <= 1) {
        const { [produitId]: _retire, ...reste } = p;
        return reste;
      }
      return { ...p, [produitId]: { ...existant, quantite: existant.quantite - 1 } };
    });
  }

  const lignesPanier = Object.values(panier);
  const total = lignesPanier.reduce((s, l) => s + l.produit.prix * l.quantite, 0);

  async function handleEnvoyerCommande() {
    setErreur(null);
    setConfirmation(null);
    try {
      const commande = await api.creerCommande({
        canal,
        numeroTable: canal === 'SUR_PLACE' ? numeroTable : undefined,
        lignes: lignesPanier.map((l) => ({ produitId: l.produit.id, quantite: l.quantite })),
      });
      setConfirmation(`Commande envoyée — total ${commande.total} DZD`);
      setPanier({});
      setNumeroTable('');
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
          <input
            type="radio"
            checked={canal === 'SUR_PLACE'}
            onChange={() => setCanal('SUR_PLACE')}
          />
          Sur place
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={canal === 'EMPORTER'}
            onChange={() => setCanal('EMPORTER')}
          />
          À emporter
        </label>
        {canal === 'SUR_PLACE' && (
          <input
            type="text"
            placeholder="N° table"
            value={numeroTable}
            onChange={(e) => setNumeroTable(e.target.value)}
            className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
          />
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
                  <li key={produit.id}>
                    <button
                      type="button"
                      onClick={() => ajouterAuPanier(produit)}
                      className="w-full text-left rounded border border-gray-200 px-3 py-2 hover:bg-gray-50"
                    >
                      {produit.nom} — {produit.prix} DZD
                    </button>
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
              <li key={ligne.produit.id} className="flex items-center justify-between text-sm">
                <span>
                  {ligne.produit.nom} × {ligne.quantite}
                </span>
                <div className="flex items-center gap-2">
                  <span>{ligne.produit.prix * ligne.quantite} DZD</span>
                  <button
                    type="button"
                    onClick={() => retirerDuPanier(ligne.produit.id)}
                    className="underline text-xs"
                  >
                    retirer
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="font-semibold">Total : {total} DZD</p>
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
        <ul className="flex flex-col gap-1">
          {commandes.map((c) => (
            <li key={c.id} className="text-sm">
              {c.canal === 'SUR_PLACE' ? `Table ${c.numeroTable ?? '?'}` : 'À emporter'} — {c.total} DZD —{' '}
              {c.serveur.prenom} {c.serveur.nom}
            </li>
          ))}
          {commandes.length === 0 && <li className="text-sm text-gray-400">Aucune commande pour l'instant.</li>}
        </ul>
      </div>
    </div>
  );
}
