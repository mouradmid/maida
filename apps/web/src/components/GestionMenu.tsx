import { useEffect, useState } from 'react';
import { api, type Categorie, type Produit } from '../lib/api';
import { badgeNeutre, boutonDiscret, boutonPrimaire, carte, champ, messageErreur } from '../lib/ui';
import { OptionsProduit } from './OptionsProduit';

export function GestionMenu() {
  const [categories, setCategories] = useState<Categorie[]>([]);
  const [produits, setProduits] = useState<Produit[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [produitOptionsOuvert, setProduitOptionsOuvert] = useState<string | null>(null);

  const [nouvelleCategorie, setNouvelleCategorie] = useState('');
  const [nouveauProduitNom, setNouveauProduitNom] = useState('');
  const [nouveauProduitPrix, setNouveauProduitPrix] = useState('');
  const [nouveauProduitCout, setNouveauProduitCout] = useState('');
  const [nouveauProduitCategorieId, setNouveauProduitCategorieId] = useState('');
  const [nouveauProduitTempsPrepa, setNouveauProduitTempsPrepa] = useState('');
  const [coutEnEdition, setCoutEnEdition] = useState<string | null>(null);
  const [coutSaisi, setCoutSaisi] = useState('');

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

  async function handleToggleTypeCategorie(categorie: Categorie) {
    await api.updateCategorie(categorie.id, {
      type: categorie.type === 'NOURRITURE' ? 'BOISSON' : 'NOURRITURE',
    });
    await chargerTout();
  }

  async function handleEnregistrerCout(produit: Produit) {
    setErreur(null);
    try {
      await api.updateProduit(produit.id, {
        coutRevient: coutSaisi === '' ? null : Number(coutSaisi),
      });
      setCoutEnEdition(null);
      setCoutSaisi('');
      await chargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
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
        coutRevient: nouveauProduitCout ? Number(nouveauProduitCout) : undefined,
      });
      setNouveauProduitNom('');
      setNouveauProduitPrix('');
      setNouveauProduitCout('');
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

  if (chargement) return <p className="text-center text-stone-500">Chargement du menu...</p>;

  return (
    <div className="flex w-full flex-col gap-4">
      {erreur && <p className={messageErreur}>{erreur}</p>}

      <div className="grid items-start gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          {categories.length === 0 && (
            <div className={`${carte} py-8 text-center text-stone-400`}>
              Aucune catégorie pour l'instant. Créez-en une pour démarrer votre menu.
            </div>
          )}

          {categories.map((categorie) => {
            const produitsCategorie = produits.filter((p) => p.categorieId === categorie.id);
            return (
              <div key={categorie.id} className={`${carte} flex flex-col gap-2`}>
                <div className="flex items-center justify-between">
                  <h3
                    className={`flex items-center gap-2 font-semibold ${
                      categorie.statut === 'INACTIF' ? 'text-stone-400' : 'text-stone-900'
                    }`}
                  >
                    {categorie.nom}
                    <span className={badgeNeutre}>{produitsCategorie.length}</span>
                    {categorie.statut === 'INACTIF' && <span className={badgeNeutre}>désactivée</span>}
                  </h3>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleTypeCategorie(categorie)}
                      title="Sert à séparer food cost et beverage cost dans les rapports"
                      className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        categorie.type === 'BOISSON'
                          ? 'bg-sky-100 text-sky-800 hover:bg-sky-200'
                          : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                      }`}
                    >
                      {categorie.type === 'BOISSON' ? 'Boisson' : 'Nourriture'}
                    </button>
                    <button type="button" onClick={() => handleToggleCategorie(categorie)} className={boutonDiscret}>
                      {categorie.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
                    </button>
                  </span>
                </div>

                <ul className="flex flex-col divide-y divide-stone-100">
                  {produitsCategorie.map((produit) => (
                    <li key={produit.id} className="flex flex-col gap-2 py-2.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span
                          className={`flex flex-wrap items-center gap-2 ${
                            produit.statut === 'INACTIF' ? 'text-stone-400' : 'text-stone-900'
                          }`}
                        >
                          <span className="font-medium">{produit.nom}</span>
                          <span className="font-semibold text-brand-700">{produit.prix} DA</span>
                          {produit.coutRevient != null && (
                            <span className={badgeNeutre}>
                              coût {produit.coutRevient} DA · marge{' '}
                              {Math.round(((produit.prix - produit.coutRevient) / produit.prix) * 100)} %
                            </span>
                          )}
                          {produit.tempsPreparationMinutes != null && (
                            <span className={badgeNeutre}>{produit.tempsPreparationMinutes} min</span>
                          )}
                          {produit.statut === 'INACTIF' && <span className={badgeNeutre}>désactivé</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setCoutEnEdition(coutEnEdition === produit.id ? null : produit.id);
                              setCoutSaisi(produit.coutRevient != null ? String(produit.coutRevient) : '');
                            }}
                            className={boutonDiscret}
                          >
                            Coût
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setProduitOptionsOuvert(produitOptionsOuvert === produit.id ? null : produit.id)
                            }
                            className={boutonDiscret}
                          >
                            Options ({produit.groupesOptions.length})
                          </button>
                          <button type="button" onClick={() => handleToggleProduit(produit)} className={boutonDiscret}>
                            {produit.statut === 'ACTIF' ? 'Désactiver' : 'Réactiver'}
                          </button>
                        </span>
                      </div>
                      {coutEnEdition === produit.id && (
                        <div className="flex items-center gap-2 rounded-lg bg-stone-50 px-3 py-2">
                          <label className="text-xs font-medium text-stone-600" htmlFor={`cout-${produit.id}`}>
                            Coût de revient (DA)
                          </label>
                          <input
                            id={`cout-${produit.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            value={coutSaisi}
                            onChange={(e) => setCoutSaisi(e.target.value)}
                            placeholder="vide = non suivi"
                            className={`${champ} w-36 px-2 py-1`}
                          />
                          <button
                            type="button"
                            onClick={() => handleEnregistrerCout(produit)}
                            className={`${boutonPrimaire} px-3 py-1 text-xs`}
                          >
                            Enregistrer
                          </button>
                        </div>
                      )}
                      {produitOptionsOuvert === produit.id && (
                        <OptionsProduit produit={produit} onChange={chargerTout} />
                      )}
                    </li>
                  ))}
                  {produitsCategorie.length === 0 && (
                    <li className="py-2 text-sm text-stone-400">Aucun produit dans cette catégorie.</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col gap-4">
          <form onSubmit={handleAjouterCategorie} className={`${carte} flex flex-col gap-3`}>
            <h3 className="font-semibold text-stone-900">Nouvelle catégorie</h3>
            <input
              type="text"
              placeholder="ex : Grillades"
              value={nouvelleCategorie}
              onChange={(e) => setNouvelleCategorie(e.target.value)}
              required
              className={champ}
            />
            <button type="submit" className={boutonPrimaire}>
              Ajouter la catégorie
            </button>
          </form>

          {categories.length > 0 && (
            <form onSubmit={handleAjouterProduit} className={`${carte} flex flex-col gap-3`}>
              <h3 className="font-semibold text-stone-900">Nouveau produit</h3>
              <input
                type="text"
                placeholder="Nom du produit"
                value={nouveauProduitNom}
                onChange={(e) => setNouveauProduitNom(e.target.value)}
                required
                className={champ}
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Prix (DA)"
                  value={nouveauProduitPrix}
                  onChange={(e) => setNouveauProduitPrix(e.target.value)}
                  required
                  className={champ}
                />
                <input
                  type="number"
                  min="1"
                  step="1"
                  placeholder="Prépa (min)"
                  value={nouveauProduitTempsPrepa}
                  onChange={(e) => setNouveauProduitTempsPrepa(e.target.value)}
                  className={champ}
                />
              </div>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Coût de revient (DA, optionnel — pour le food cost)"
                value={nouveauProduitCout}
                onChange={(e) => setNouveauProduitCout(e.target.value)}
                className={champ}
              />
              <select
                value={nouveauProduitCategorieId}
                onChange={(e) => setNouveauProduitCategorieId(e.target.value)}
                required
                className={champ}
              >
                <option value="">Choisir une catégorie</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
              <button type="submit" className={boutonPrimaire}>
                Ajouter le produit
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
