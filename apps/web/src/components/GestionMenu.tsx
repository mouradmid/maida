import { useEffect, useState } from 'react';
import { api, type Categorie, type Produit } from '../lib/api';

export function GestionMenu() {
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const [nouvelleCategorie, setNouvelleCategorie] = useState('');
  const [nouveauProduitNom, setNouveauProduitNom] = useState('');
  const [nouveauProduitPrix, setNouveauProduitPrix] = useState('');
  const [nouveauProduitCategorieId, setNouveauProduitCategorieId] = useState('');
  const [nouveauProduitTempsPrepa, setNouveauProduitTempsPrepa] = useState('');

  async function chargerTout() {
    setChargement(true);
    try {
      const [cats, prods] = await Promise.all([api.listCategories(), api.listProduits()]);
      setCategories(cats);
      setProduits(prods);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    chargerTout();
  }, []);

  async function handleAjouterCategorie(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    try {
      await api.createCategorie(nouvelleCategorie);
      setNouvelleCategorie('');
      await chargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleToggleCategorie(categorie: Categorie) {
    await api.updateCategorie(categorie.id, {
      statut: categorie.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF',
    });
    await chargerTout();
  }

  async function handleAjouterProduit(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    const prix = Number(nouveauProduitPrix);
    if (!nouveauProduitCategorieId) {
      setErreur('Choisissez une catégorie');
      return;
    }
    try {
      await api.createProduit({
        nom: nouveauProduitNom,
        prix,
        categorieId: nouveauProduitCategorieId,
        tempsPreparationMinutes: nouveauProduitTempsPrepa ? Number(nouveauProduitTempsPrepa) : undefined,
      });
      setNouveauProduitNom('');
      setNouveauProduitPrix('');
      setNouveauProduitTempsPrepa('');
      await chargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleToggleProduit(produit: Produit) {
    await api.updateProduit(produit.id, { statut: produit.statut === 'ACTIF' ? 'INACTIF' : 'ACTIF' });
    await chargerTout();
  }

  if (chargement) return <p>Chargement du menu...</p>;

  return (
    <div className="w-full max-w-2xl flex flex-col gap-6 text-left">
      <h2 className="text-xl font-semibold">Menu</h2>
      {erreur && <p className="text-sm text-red-600">{erreur}</p>}

      <form onSubmit={handleAjouterCategorie} className="flex gap-2">
        <input
          type="text"
          placeholder="Nouvelle catégorie (ex: Plats)"
          value={nouvelleCategorie}
          onChange={(e) => setNouvelleCategorie(e.target.value)}
          required
          className="flex-1 rounded border border-gray-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-gray-900 text-white px-4 py-2">
          Ajouter la catégorie
        </button>
      </form>

      {categories.length === 0 && <p className="text-gray-500">Aucune catégorie pour l'instant.</p>}

      {categories.map((categorie) => (
        <div key={categorie.id} className="border border-gray-200 rounded p-4 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h3 className={`font-medium ${categorie.statut === 'INACTIF' ? 'text-gray-400' : ''}`}>
              {categorie.nom} {categorie.statut === 'INACTIF' && '(désactivée)'}
            </h3>
            <button type="button" onClick={() => handleToggleCategorie(categorie)} className="text-sm underline">
              {categorie.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
            </button>
          </div>

          <ul className="flex flex-col gap-1">
            {produits
              .filter((p) => p.categorieId === categorie.id)
              .map((produit) => (
                <li key={produit.id} className="flex items-center justify-between text-sm">
                  <span className={produit.statut === 'INACTIF' ? 'text-gray-400' : ''}>
                    {produit.nom} — {produit.prix} DZD
                    {produit.tempsPreparationMinutes != null && ` — ${produit.tempsPreparationMinutes} min`}
                    {produit.statut === 'INACTIF' && ' (désactivé)'}
                  </span>
                  <button type="button" onClick={() => handleToggleProduit(produit)} className="underline">
                    {produit.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
                  </button>
                </li>
              ))}
            {produits.filter((p) => p.categorieId === categorie.id).length === 0 && (
              <li className="text-sm text-gray-400">Aucun produit dans cette catégorie.</li>
            )}
          </ul>
        </div>
      ))}

      {categories.length > 0 && (
        <form onSubmit={handleAjouterProduit} className="border border-gray-200 rounded p-4 flex flex-col gap-2">
          <h3 className="font-medium">Ajouter un produit</h3>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Nom du produit"
              value={nouveauProduitNom}
              onChange={(e) => setNouveauProduitNom(e.target.value)}
              required
              className="flex-1 rounded border border-gray-300 px-3 py-2"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="Prix (DZD)"
              value={nouveauProduitPrix}
              onChange={(e) => setNouveauProduitPrix(e.target.value)}
              required
              className="w-32 rounded border border-gray-300 px-3 py-2"
            />
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Temps prépa (min, optionnel)"
              value={nouveauProduitTempsPrepa}
              onChange={(e) => setNouveauProduitTempsPrepa(e.target.value)}
              className="w-44 rounded border border-gray-300 px-3 py-2"
            />
          </div>
          <select
            value={nouveauProduitCategorieId}
            onChange={(e) => setNouveauProduitCategorieId(e.target.value)}
            required
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Choisir une catégorie</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
          </select>
          <button type="submit" className="rounded bg-gray-900 text-white px-4 py-2">
            Ajouter le produit
          </button>
        </form>
      )}
    </div>
  );
}
