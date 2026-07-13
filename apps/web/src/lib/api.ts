const API_BASE = '/api';

export interface Utilisateur {
  id: string;
  email: string | null;
  nom: string;
  prenom: string;
  role: 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR';
  compteClientId: string | null;
  etablissementId: string | null;
}

export interface Categorie {
  id: string;
  nom: string;
  statut: 'ACTIF' | 'INACTIF';
  creeLe: string;
}

export interface OptionValeur {
  id: string;
  valeur: string;
}

export interface GroupeOption {
  id: string;
  nom: string;
  obligatoire: boolean;
  valeurs: OptionValeur[];
}

export interface Produit {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  tempsPreparationMinutes: number | null;
  statut: 'ACTIF' | 'INACTIF';
  categorieId: string;
  etablissementId: string;
  creeLe: string;
  groupesOptions: GroupeOption[];
}

export interface ProduitMenu {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  tempsPreparationMinutes: number | null;
  groupesOptions: GroupeOption[];
}

export interface CategorieMenu {
  id: string;
  nom: string;
  produits: ProduitMenu[];
}

export interface LigneCommande {
  id: string;
  nomProduit: string;
  prixUnitaire: number;
  quantite: number;
  quantitePayee: number;
  options: Array<{ nomGroupe: string; valeur: string }>;
}

export interface TablePlan {
  id: string;
  numero: string;
  forme: 'RONDE' | 'CARREE' | 'RECTANGULAIRE';
  nombreCouverts: number;
  largeur: number;
  hauteur: number;
  positionX: number;
  positionY: number;
  statut: 'ACTIF' | 'INACTIF';
  etablissementId: string;
  creeLe: string;
}

export interface TableCaisse {
  id: string;
  numero: string;
  nombreCouverts: number;
  forme: 'RONDE' | 'CARREE' | 'RECTANGULAIRE';
}

export interface Commande {
  id: string;
  canal: 'SUR_PLACE' | 'EMPORTER';
  noteCuisine: string | null;
  additionId: string;
  additionStatut: 'OUVERTE' | 'PAYEE';
  table: { numero: string } | null;
  statut: 'ENVOYEE' | 'ANNULEE';
  creeLe: string;
  serveur: { nom: string; prenom: string };
  lignes: LigneCommande[];
  total: number;
}

export interface AdditionResume {
  id: string;
  table: { numero: string } | null;
  statut: 'OUVERTE' | 'PAYEE';
  ouverteLe: string;
  total: number;
  totalPaye: number;
  solde: number;
}

export interface AdditionDetail extends AdditionResume {
  fermeeLe: string | null;
  commandes: Array<{
    id: string;
    canal: 'SUR_PLACE' | 'EMPORTER';
    creeLe: string;
    lignes: LigneCommande[];
  }>;
  paiements: Array<{
    id: string;
    montant: number;
    moyenPaiement: 'ESPECES' | 'CARTE' | 'AUTRE';
    montantRecu: number | null;
    creeLe: string;
  }>;
}

export interface ResultatPaiement {
  id: string;
  montant: number;
  moyenPaiement: 'ESPECES' | 'CARTE' | 'AUTRE';
  montantRecu: number | null;
  rendu: number | null;
  soldeRestant: number;
  additionCloturee: boolean;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? 'Une erreur est survenue');
  }

  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<Utilisateur>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  loginPin: (etablissementId: string, codePin: string) =>
    apiFetch<Utilisateur>('/auth/login-pin', {
      method: 'POST',
      body: JSON.stringify({ etablissementId, codePin }),
    }),

  me: () => apiFetch<Utilisateur>('/auth/me'),

  logout: () => apiFetch<void>('/auth/logout', { method: 'POST' }),

  listCategories: () => apiFetch<Categorie[]>('/gerant/categories'),

  createCategorie: (nom: string) =>
    apiFetch<Categorie>('/gerant/categories', { method: 'POST', body: JSON.stringify({ nom }) }),

  updateCategorie: (id: string, data: { nom?: string; statut?: 'ACTIF' | 'INACTIF' }) =>
    apiFetch<Categorie>(`/gerant/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listProduits: () => apiFetch<Produit[]>('/gerant/produits'),

  createProduit: (data: {
    nom: string;
    prix: number;
    categorieId: string;
    description?: string;
    tempsPreparationMinutes?: number;
  }) => apiFetch<Produit>('/gerant/produits', { method: 'POST', body: JSON.stringify(data) }),

  updateProduit: (
    id: string,
    data: Partial<{
      nom: string;
      prix: number;
      categorieId: string;
      description: string;
      statut: 'ACTIF' | 'INACTIF';
      tempsPreparationMinutes: number | null;
    }>,
  ) => apiFetch<Produit>(`/gerant/produits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listServeurs: () =>
    apiFetch<Array<{ id: string; nom: string; prenom: string; statut: string; creeLe: string }>>(
      '/gerant/serveurs',
    ),

  createServeur: (data: { nom: string; prenom: string; codePin: string }) =>
    apiFetch('/gerant/serveurs', { method: 'POST', body: JSON.stringify(data) }),

  caisseMenu: () => apiFetch<CategorieMenu[]>('/caisse/menu'),

  caisseTables: () => apiFetch<TableCaisse[]>('/caisse/tables'),

  listCommandes: () => apiFetch<Commande[]>('/caisse/commandes'),

  creerCommande: (data: {
    canal: 'SUR_PLACE' | 'EMPORTER';
    tableId?: string;
    noteCuisine?: string;
    lignes: Array<{
      produitId: string;
      quantite: number;
      options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
    }>;
  }) => apiFetch<Commande>('/caisse/commandes', { method: 'POST', body: JSON.stringify(data) }),

  createGroupeOption: (produitId: string, data: { nom: string; obligatoire: boolean }) =>
    apiFetch<GroupeOption>(`/gerant/produits/${produitId}/groupes`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  deleteGroupeOption: (id: string) => apiFetch<void>(`/gerant/groupes/${id}`, { method: 'DELETE' }),

  createOptionValeur: (groupeId: string, valeur: string) =>
    apiFetch<OptionValeur>(`/gerant/groupes/${groupeId}/valeurs`, {
      method: 'POST',
      body: JSON.stringify({ valeur }),
    }),

  deleteOptionValeur: (id: string) => apiFetch<void>(`/gerant/valeurs/${id}`, { method: 'DELETE' }),

  listTables: () => apiFetch<TablePlan[]>('/gerant/tables'),

  createTable: (data: {
    numero: string;
    forme: 'RONDE' | 'CARREE' | 'RECTANGULAIRE';
    nombreCouverts: number;
    largeur?: number;
    hauteur?: number;
  }) => apiFetch<TablePlan>('/gerant/tables', { method: 'POST', body: JSON.stringify(data) }),

  updateTable: (
    id: string,
    data: Partial<{
      numero: string;
      forme: 'RONDE' | 'CARREE' | 'RECTANGULAIRE';
      nombreCouverts: number;
      largeur: number;
      hauteur: number;
      positionX: number;
      positionY: number;
      statut: 'ACTIF' | 'INACTIF';
    }>,
  ) => apiFetch<TablePlan>(`/gerant/tables/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listAdditionsOuvertes: () => apiFetch<AdditionResume[]>('/caisse/additions'),

  getAddition: (id: string) => apiFetch<AdditionDetail>(`/caisse/additions/${id}`),

  creerPaiement: (
    additionId: string,
    data:
      | { mode: 'MONTANT'; montant: number; moyenPaiement: 'ESPECES' | 'CARTE' | 'AUTRE'; montantRecu?: number }
      | {
          mode: 'ARTICLES';
          lignes: Array<{ ligneCommandeId: string; quantite: number }>;
          moyenPaiement: 'ESPECES' | 'CARTE' | 'AUTRE';
          montantRecu?: number;
        },
  ) =>
    apiFetch<ResultatPaiement>(`/caisse/additions/${additionId}/paiements`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};
