import { useEffect, useState } from 'react';
import { api, type Categorie, type ParametresGerant, type Produit } from '../lib/api';
import { badgeNeutre, boutonDiscret, boutonPrimaire, carte, champ, messageErreur } from '../lib/ui';
import { OptionsProduit } from './OptionsProduit';

// Taux de TVA proposés (Algérie) : le gérant choisit, « Autre » ouvre la saisie libre.
const TAUX_TVA_PROPOSES = [
  { valeur: '19', libelle: '19 % — taux normal' },
  { valeur: '9', libelle: '9 % — taux réduit' },
  { valeur: '0', libelle: '0 % — exonéré' },
];

function SelecteurTva({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const estPredefini = TAUX_TVA_PROPOSES.some((t) => t.valeur === valeur);
  const [libre, setLibre] = useState(!estPredefini && valeur !== '');

  return (
    <span className="flex items-center gap-2">
      <select
        value={libre ? 'autre' : valeur}
        onChange={(e) => {
          if (e.target.value === 'autre') {
            setLibre(true);
            onChange('');
          } else {
            setLibre(false);
            onChange(e.target.value);
          }
        }}
        className={`${champ} w-auto px-2 py-1.5`}
      >
        {TAUX_TVA_PROPOSES.map((t) => (
          <option key={t.valeur} value={t.valeur}>
            {t.libelle}
          </option>
        ))}
        <option value="autre">Autre…</option>
      </select>
      {libre && (
        <input
          type="number"
          min="0"
          max="100"
          step="1"
          value={valeur}
          onChange={(e) => onChange(e.target.value)}
          placeholder="%"
          className={`${champ} w-16 px-2 py-1`}
        />
      )}
    </span>
  );
}

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
  const [nouveauProduitTva, setNouveauProduitTva] = useState('19');
  const [nouveauProduitCategorieId, setNouveauProduitCategorieId] = useState('');
  const [nouveauProduitTempsPrepa, setNouveauProduitTempsPrepa] = useState('');
  // Édition d'un produit existant (formulaire inline)
  const [produitEnEdition, setProduitEnEdition] = useState<string | null>(null);
  const [editNom, setEditNom] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPrix, setEditPrix] = useState('');
  const [editPrepa, setEditPrepa] = useState('');
  const [editCout, setEditCout] = useState('');
  const [editTva, setEditTva] = useState('19');
  const [editCategorieId, setEditCategorieId] = useState('');

  // Renommage d'une catégorie
  const [categorieEnEdition, setCategorieEnEdition] = useState<string | null>(null);
  const [nouveauNomCategorie, setNouveauNomCategorie] = useState('');

  const [parametres, setParametres] = useState<ParametresGerant | null>(null);
  const voirCouts = (parametres?.moduleFoodCost ?? false) && (parametres?.suiviCoutsActive ?? true);

  async function chargerTout() {
    setChargement(true);
    try {
      const [cats, prods, params] = await Promise.all([
        api.listCategories(),
        api.listProduits(),
        api.getParametres(),
      ]);
      setCategories(cats);
      setProduits(prods);
      setParametres(params);
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

  function ouvrirEditionProduit(produit: Produit) {
    setProduitEnEdition(produit.id);
    setEditNom(produit.nom);
    setEditDescription(produit.description ?? '');
    setEditPrix(String(produit.prix));
    setEditPrepa(produit.tempsPreparationMinutes != null ? String(produit.tempsPreparationMinutes) : '');
    setEditCout(produit.coutRevient != null ? String(produit.coutRevient) : '');
    setEditTva(String(produit.tauxTva));
    setEditCategorieId(produit.categorieId);
  }

  async function handleEnregistrerProduit(produit: Produit) {
    setErreur(null);
    const prix = Number(editPrix);
    if (!editNom.trim() || !Number.isFinite(prix) || prix <= 0) {
      setErreur('Nom et prix (positif) sont requis');
      return;
    }
    try {
      await api.updateProduit(produit.id, {
        nom: editNom,
        description: editDescription,
        prix,
        categorieId: editCategorieId,
        tempsPreparationMinutes: editPrepa === '' ? null : Number(editPrepa),
        coutRevient: editCout === '' ? null : Number(editCout),
        tauxTva: editTva === '' ? undefined : Number(editTva),
      });
      setProduitEnEdition(null);
      await chargerTout();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleRenommerCategorie(categorieId: string) {
    setErreur(null);
    if (!nouveauNomCategorie.trim()) {
      setErreur('Le nom de la catégorie ne peut pas être vide');
      return;
    }
    try {
      await api.updateCategorie(categorieId, { nom: nouveauNomCategorie });
      setCategorieEnEdition(null);
      setNouveauNomCategorie('');
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
        tauxTva: nouveauProduitTva !== '' ? Number(nouveauProduitTva) : undefined,
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
                    {categorieEnEdition === categorie.id ? (
                      <span className="flex items-center gap-2">
                        <input
                          type="text"
                          value={nouveauNomCategorie}
                          onChange={(e) => setNouveauNomCategorie(e.target.value)}
                          className={`${champ} w-44 px-2 py-1`}
                        />
                        <button
                          type="button"
                          onClick={() => handleRenommerCategorie(categorie.id)}
                          className={`${boutonPrimaire} px-3 py-1 text-xs`}
                        >
                          OK
                        </button>
                      </span>
                    ) : (
                      categorie.nom
                    )}
                    <span className={badgeNeutre}>{produitsCategorie.length}</span>
                    {categorie.statut === 'INACTIF' && <span className={badgeNeutre}>désactivée</span>}
                  </h3>
                  <span className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setCategorieEnEdition(categorieEnEdition === categorie.id ? null : categorie.id);
                        setNouveauNomCategorie(categorie.nom);
                      }}
                      className={boutonDiscret}
                    >
                      Renommer
                    </button>
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
                          {voirCouts && produit.coutRevient != null && (
                            <span className={badgeNeutre}>
                              coût {produit.coutRevient} DA · marge{' '}
                              {Math.round(((produit.prix - produit.coutRevient) / produit.prix) * 100)} %
                            </span>
                          )}
                          <span className={badgeNeutre}>TVA {produit.tauxTva} %</span>
                          {produit.tempsPreparationMinutes != null && (
                            <span className={badgeNeutre}>{produit.tempsPreparationMinutes} min</span>
                          )}
                          {produit.statut === 'INACTIF' && <span className={badgeNeutre}>désactivé</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-3">
                          <button
                            type="button"
                            onClick={() =>
                              produitEnEdition === produit.id
                                ? setProduitEnEdition(null)
                                : ouvrirEditionProduit(produit)
                            }
                            className={boutonDiscret}
                          >
                            Modifier
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
                      {produitEnEdition === produit.id && (
                        <div className="flex flex-col gap-2 rounded-lg bg-stone-50 px-3 py-3">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                              Nom
                              <input
                                type="text"
                                value={editNom}
                                onChange={(e) => setEditNom(e.target.value)}
                                className={`${champ} px-2 py-1`}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                              Catégorie
                              <select
                                value={editCategorieId}
                                onChange={(e) => setEditCategorieId(e.target.value)}
                                className={`${champ} px-2 py-1.5`}
                              >
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.nom}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>
                          <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                            Description
                            <input
                              type="text"
                              value={editDescription}
                              onChange={(e) => setEditDescription(e.target.value)}
                              className={`${champ} px-2 py-1`}
                            />
                          </label>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                              Prix (DA)
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editPrix}
                                onChange={(e) => setEditPrix(e.target.value)}
                                className={`${champ} px-2 py-1`}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                              Préparation (min)
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={editPrepa}
                                onChange={(e) => setEditPrepa(e.target.value)}
                                placeholder="vide = sans suivi"
                                className={`${champ} px-2 py-1`}
                              />
                            </label>
                            {voirCouts && (
                              <label className="flex flex-col gap-1 text-xs font-medium text-stone-600">
                                Coût de revient (DA)
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={editCout}
                                  onChange={(e) => setEditCout(e.target.value)}
                                  placeholder="vide = non suivi"
                                  className={`${champ} px-2 py-1`}
                                />
                              </label>
                            )}
                            <label
                              className="flex flex-col gap-1 text-xs font-medium text-stone-600"
                              title="Prix TTC : la TVA est extraite du prix affiché."
                            >
                              TVA
                              <SelecteurTva valeur={editTva} onChange={setEditTva} />
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => handleEnregistrerProduit(produit)}
                              className={`${boutonPrimaire} px-4 py-1.5 text-xs`}
                            >
                              Enregistrer les modifications
                            </button>
                            <button
                              type="button"
                              onClick={() => setProduitEnEdition(null)}
                              className={boutonDiscret}
                            >
                              Annuler
                            </button>
                          </div>
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
              <div className="flex gap-2">
                {voirCouts && (
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Coût de revient (DA, optionnel)"
                    value={nouveauProduitCout}
                    onChange={(e) => setNouveauProduitCout(e.target.value)}
                    className={champ}
                  />
                )}
                <label
                  className="flex shrink-0 items-center gap-1.5 text-xs text-stone-500"
                  title="Prix TTC : la TVA est extraite du prix affiché."
                >
                  TVA
                  <SelecteurTva valeur={nouveauProduitTva} onChange={setNouveauProduitTva} />
                </label>
              </div>
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
