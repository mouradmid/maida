const API_BASE = '/api';

export type DroitUtilisateur = 'ANNULER' | 'CLOTURER';

export interface Utilisateur {
  id: string;
  email: string | null;
  nom: string;
  prenom: string;
  role: 'SUPER_ADMIN' | 'GERANT' | 'SERVEUR';
  droits: DroitUtilisateur[];
  compteClientId: string | null;
  etablissementId: string | null;
}

export type TypeCategorie = 'NOURRITURE' | 'BOISSON';

export interface Categorie {
  id: string;
  nom: string;
  type: TypeCategorie;
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
  coutRevient: number | null;
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
  quantiteAnnulee: number;
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
  largeur: number;
  hauteur: number;
  positionX: number;
  positionY: number;
  occupee: boolean;
}

export interface Commande {
  id: string;
  canal: 'SUR_PLACE' | 'EMPORTER';
  noteCuisine: string | null;
  additionId: string;
  additionStatut: 'OUVERTE' | 'PAYEE';
  table: { numero: string } | null;
  statut: 'ENVOYEE' | 'PRETE' | 'ANNULEE';
  creeLe: string;
  preteLe: string | null;
  serveur: { nom: string; prenom: string };
  lignes: LigneCommande[];
  total: number;
}

export type ModePaiement = 'ESPECES' | 'CARTE' | 'CHEQUE' | 'AUTRE';

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
    moyenPaiement: ModePaiement;
    montantRecu: number | null;
    creeLe: string;
  }>;
}

export interface TotauxJournee {
  parMoyen: Array<{ moyenPaiement: ModePaiement; montant: number; nombre: number }>;
  total: number;
}

export interface JourneeCaisse {
  id: string;
  statut: 'OUVERTE' | 'CLOTUREE';
  fondDeCaisse: number;
  ouverteLe: string;
  clotureeLe: string | null;
  especesAttendues: number | null;
  especesComptees: number | null;
  ecart: number | null;
  commentaire: string | null;
  ouvertePar: { nom: string; prenom: string };
  clotureePar: { nom: string; prenom: string; role: string } | null;
  clotureDemandeePar: { nom: string; prenom: string } | null;
}

export interface EtatJournee {
  journee: JourneeCaisse | null;
  totaux?: TotauxJournee;
  especesAttendues?: number;
  additionsOuvertes?: number;
  derniereCloture?: (JourneeCaisse & { totaux: TotauxJournee }) | null;
}

export interface JourneeGerant extends JourneeCaisse {
  totaux: TotauxJournee;
}

export interface RapportVentes {
  periode: { debut: string; fin: string };
  caEncaisse: number;
  nbPaiements: number;
  parMoyen: Array<{ moyenPaiement: ModePaiement; montant: number; nombre: number }>;
  caCommande: number;
  nbCommandes: number;
  ticketMoyen: number;
  parProduit: Array<{
    nom: string;
    categorie: string;
    quantite: number;
    montant: number;
    cout: number | null;
    marge: number | null;
    foodCostPct: number | null;
  }>;
  parCategorie: Array<{ nom: string; quantite: number; montant: number }>;
  parServeur: Array<{ nom: string; prenom: string; nbCommandes: number; montant: number }>;
  pertes: {
    montant: number;
    quantite: number;
    apresPreparation: { montant: number; quantite: number };
  };
  foodCost: {
    nourriture: ResumeCout;
    boissons: ResumeCout;
  };
}

export interface ResumeCout {
  ventes: number;
  cout: number | null;
  marge: number | null;
  pct: number | null;
  couverturePct: number | null;
}

export interface ResultatPaiement {
  id: string;
  montant: number;
  moyenPaiement: ModePaiement;
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

  listEtablissementsPublics: () =>
    apiFetch<Array<{ id: string; nom: string; ville: string | null }>>('/auth/etablissements'),

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

  updateCategorie: (id: string, data: { nom?: string; statut?: 'ACTIF' | 'INACTIF'; type?: TypeCategorie }) =>
    apiFetch<Categorie>(`/gerant/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listProduits: () => apiFetch<Produit[]>('/gerant/produits'),

  createProduit: (data: {
    nom: string;
    prix: number;
    categorieId: string;
    description?: string;
    tempsPreparationMinutes?: number;
    coutRevient?: number;
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
      coutRevient: number | null;
    }>,
  ) => apiFetch<Produit>(`/gerant/produits/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listServeurs: () =>
    apiFetch<
      Array<{
        id: string;
        nom: string;
        prenom: string;
        statut: string;
        droits: DroitUtilisateur[];
        creeLe: string;
      }>
    >('/gerant/serveurs'),

  createServeur: (data: { nom: string; prenom: string; codePin: string }) =>
    apiFetch('/gerant/serveurs', { method: 'POST', body: JSON.stringify(data) }),

  updateDroitsServeur: (id: string, droits: DroitUtilisateur[]) =>
    apiFetch<{ id: string; droits: DroitUtilisateur[] }>(`/gerant/serveurs/${id}/droits`, {
      method: 'PATCH',
      body: JSON.stringify({ droits }),
    }),

  listAnnulations: () =>
    apiFetch<
      Array<{
        id: string;
        motif: string;
        commentaire: string | null;
        quantite: number;
        montant: number;
        apresPreparation: boolean;
        creeLe: string;
        canal: 'SUR_PLACE' | 'EMPORTER';
        table: { numero: string } | null;
        produit: string | null;
        annuleePar: { nom: string; prenom: string; role: string };
        demandeePar: { nom: string; prenom: string } | null;
      }>
    >('/gerant/annulations'),

  caisseMenu: () => apiFetch<CategorieMenu[]>('/caisse/menu'),

  caisseTables: () => apiFetch<TableCaisse[]>('/caisse/tables'),

  listCommandes: () => apiFetch<Commande[]>('/caisse/commandes'),

  listCommandesCuisine: () => apiFetch<Commande[]>('/caisse/cuisine/commandes'),

  marquerCommandePrete: (id: string) =>
    apiFetch<Commande>(`/caisse/commandes/${id}/prete`, { method: 'PATCH' }),

  annulerCommande: (
    id: string,
    data:
      | { portee: 'COMMANDE'; motif: string; commentaire?: string; codeGerant?: string }
      | {
          portee: 'LIGNES';
          lignes: Array<{ ligneCommandeId: string; quantite: number }>;
          motif: string;
          commentaire?: string;
          codeGerant?: string;
        },
  ) => apiFetch<Commande>(`/caisse/commandes/${id}/annulation`, { method: 'POST', body: JSON.stringify(data) }),

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
      | { mode: 'MONTANT'; montant: number; moyenPaiement: ModePaiement; montantRecu?: number }
      | {
          mode: 'ARTICLES';
          lignes: Array<{ ligneCommandeId: string; quantite: number }>;
          moyenPaiement: ModePaiement;
          montantRecu?: number;
        },
  ) =>
    apiFetch<ResultatPaiement>(`/caisse/additions/${additionId}/paiements`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  getMoyensPaiement: () =>
    apiFetch<{ actifs: ModePaiement[]; tous: ModePaiement[] }>('/gerant/moyens-paiement'),

  updateMoyensPaiement: (actifs: ModePaiement[]) =>
    apiFetch<{ actifs: ModePaiement[]; tous: ModePaiement[] }>('/gerant/moyens-paiement', {
      method: 'PATCH',
      body: JSON.stringify({ actifs }),
    }),

  caisseMoyensPaiement: () => apiFetch<{ actifs: ModePaiement[] }>('/caisse/moyens-paiement'),

  getJournee: () => apiFetch<EtatJournee>('/caisse/journee'),

  ouvrirJournee: (fondDeCaisse: number) =>
    apiFetch<JourneeCaisse>('/caisse/journee/ouverture', {
      method: 'POST',
      body: JSON.stringify({ fondDeCaisse }),
    }),

  cloturerJournee: (data: { especesComptees: number; commentaire?: string; codeGerant?: string }) =>
    apiFetch<JourneeCaisse & { totaux: TotauxJournee }>('/caisse/journee/cloture', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listJournees: () => apiFetch<JourneeGerant[]>('/gerant/journees'),

  getRapports: (debut: Date, fin: Date) =>
    apiFetch<RapportVentes>(
      `/gerant/rapports?debut=${encodeURIComponent(debut.toISOString())}&fin=${encodeURIComponent(fin.toISOString())}`,
    ),
};
