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
}

export interface ProduitMenu {
  id: string;
  nom: string;
  description: string | null;
  prix: number;
  tempsPreparationMinutes: number | null;
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

export interface Commande {
  id: string;
  canal: 'SUR_PLACE' | 'EMPORTER';
  numeroTable: string | null;
  statut: 'ENVOYEE' | 'ANNULEE';
  creeLe: string;
  serveur: { nom: string; prenom: string };
  lignes: LigneCommande[];
  total: number;
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

  listCommandes: () => apiFetch<Commande[]>('/caisse/commandes'),

  creerCommande: (data: {
    canal: 'SUR_PLACE' | 'EMPORTER';
    numeroTable?: string;
    lignes: Array<{ produitId: string; quantite: number }>;
  }) => apiFetch<Commande>('/caisse/commandes', { method: 'POST', body: JSON.stringify(data) }),

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
};
