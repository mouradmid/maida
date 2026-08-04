import {
  DELAI_REQUETE_COURT_MS,
  DELAI_REQUETE_LONG_MS,
  DELAI_REQUETE_MS,
  reseauCoupe,
  signalerCoupure,
  signalerReponse,
} from './reseau';

const API_BASE = '/api';

export type DroitUtilisateur = 'ANNULER' | 'CLOTURER' | 'REMISER' | 'GERER_STOCK';

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
  suiteParDefaut: number;
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
  tauxTva: number;
  coutRevient: number | null;
  tempsPreparationMinutes: number | null;
  statut: 'ACTIF' | 'INACTIF';
  disponible: boolean;
  suiviQuantite: boolean;
  quantiteRestante: number | null;
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
  disponible: boolean;
  suiviQuantite: boolean;
  quantiteRestante: number | null;
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
  tauxTva: number | null;
  suite: number;
  quantite: number;
  quantitePayee: number;
  quantiteAnnulee: number;
  quantiteOfferte: number;
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
  // Addition en cours sur la table : ce qui permet au plan de salle d'afficher
  // le montant et l'état du service sans ouvrir la table.
  addition: {
    id: string;
    ouverteLe: string;
    total: number;
    solde: number;
    aReclamer: boolean;
  } | null;
  reservationProche: { date: string; nomClient: string } | null;
}

export type StatutReservation = 'A_VENIR' | 'ARRIVEE' | 'ANNULEE' | 'NO_SHOW';

export interface Reservation {
  id: string;
  nomClient: string;
  telephone: string | null;
  email: string | null;
  nombreCouverts: number;
  date: string;
  dureeMinutes: number;
  note: string | null;
  statut: StatutReservation;
  table: { id: string; numero: string };
  prisePar: { nom: string; prenom: string };
}

export interface Commande {
  id: string;
  canal: 'SUR_PLACE' | 'EMPORTER';
  noteCuisine: string | null;
  additionId: string;
  additionStatut: 'OUVERTE' | 'PAYEE';
  table: { numero: string } | null;
  statut: 'ENVOYEE' | 'ANNULEE';
  suiteReclamee: number;
  creeLe: string;
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
  montantRemises: number;
}

export interface RemiseAddition {
  id: string;
  type: 'REMISE' | 'OFFERT';
  montant: number;
  pourcentage: number | null;
  quantite: number | null;
  motif: string;
  creeLe: string;
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
  remises: RemiseAddition[];
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
  } | null;
  remises: {
    montant: number;
    nombre: number;
    offerts: { montant: number; quantite: number };
  };
  tva: {
    parTaux: Array<{ taux: number; ttc: number; ht: number; tva: number }>;
    totalTva: number;
    nonVentile: number;
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

export type ModuleCompte = 'FOOD_COST' | 'QR_MENU';

export interface ParametresGerant {
  moduleFoodCost: boolean;
  moduleQrMenu: boolean;
  suiviCoutsActive: boolean;
  commandeClientActive: boolean;
  // Code que l'on tape une fois sur une tablette pour la rattacher à ce
  // restaurant, présenté en deux blocs (« ABCD-2345 »).
  codeTerminal: string | null;
}

export interface DemandeClient {
  id: string;
  table: { numero: string };
  note: string | null;
  creeLe: string;
  lignes: Array<{
    nomProduit: string;
    quantite: number;
    prixUnitaire: number;
    options: string[];
  }> | null;
  total: number | null;
  probleme: string | null;
}

export interface CompteClient {
  id: string;
  nomEnseigne: string;
  statut: 'ACTIF' | 'SUSPENDU';
  modules: ModuleCompte[];
  // Compte de vitrine, reconstruit par le seed de démo (jamais un vrai client).
  demo: boolean;
  creeLe: string;
  etablissements: Array<{
    id: string;
    nom: string;
    ville: string | null;
    codeTerminal: string;
  }>;
  gerants: Array<{ id: string; nom: string; prenom: string; email: string | null }>;
  commandes7Jours: number;
  derniereCommande: string | null;
}

// Levée quand la requête n'a même pas atteint le serveur (coupure réseau) :
// permet de distinguer « hors ligne » d'une vraie erreur métier.
export class ErreurReseau extends Error {
  constructor() {
    super('Connexion impossible — vérifiez le réseau');
    this.name = 'ErreurReseau';
  }
}

// Toute requête a un délai maximal : sans lui, un réseau qui accepte la
// connexion sans jamais répondre bloquait l'écran plusieurs minutes au lieu de
// basculer sur la file locale. `delaiMs` s'allonge pour les écrans du gérant,
// qui n'ont pas de repli hors ligne.
async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  delaiMs: number = DELAI_REQUETE_MS,
): Promise<T> {
  // Réseau déjà connu comme muet : on échoue sans attendre, l'appelant bascule
  // aussitôt sur son repli local. C'est la sonde de lib/reseau.ts qui rouvrira
  // le passage dès que le serveur répond.
  if (reseauCoupe()) {
    throw new ErreurReseau();
  }

  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), delaiMs);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: 'include',
      signal: controleur.signal,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    });
  } catch {
    // Pas de réponse : le réseau est coupé ou muet, tout l'écran doit le savoir.
    signalerCoupure();
    throw new ErreurReseau();
  } finally {
    clearTimeout(minuteur);
  }

  // Le serveur a répondu, même une erreur métier : le réseau fonctionne.
  signalerReponse();

  if (res.status === 204) {
    return undefined as T;
  }

  const data = await res.json().catch(() => null);

  if (!res.ok) {
    throw new Error(data?.error ?? 'Une erreur est survenue');
  }

  return data as T;
}

// Suffixe « ?debut=&fin= » des historiques filtrables par période. Sans bornes
// complètes, l'API renvoie son historique par défaut.
function queryPeriode(debut?: Date, fin?: Date): string {
  if (!debut || !fin) return '';
  return `?debut=${encodeURIComponent(debut.toISOString())}&fin=${encodeURIComponent(fin.toISOString())}`;
}

export const api = {
  login: (email: string, password: string) =>
    apiFetch<Utilisateur>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  // Rattache la tablette à son restaurant. Remplace l'ancienne liste publique
  // des établissements, qui exposait le portefeuille client de Maïda.
  rattacherTerminal: (code: string) =>
    apiFetch<{ id: string; nom: string; ville: string | null }>('/auth/terminal', {
      method: 'POST',
      body: JSON.stringify({ code }),
    }),

  // Récupération de mot de passe. La réponse est volontairement la même que
  // l'adresse soit connue ou non : le formulaire ne doit pas servir d'annuaire.
  demanderReinitialisation: (email: string) =>
    apiFetch<{ message: string }>('/auth/mot-de-passe-oublie', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  verifierJetonReinitialisation: (jeton: string) =>
    apiFetch<{ prenom: string; email: string | null }>(
      `/auth/reinitialisation/${encodeURIComponent(jeton)}`,
    ),

  reinitialiserMotDePasse: (jeton: string, motDePasse: string) =>
    apiFetch<{ message: string }>('/auth/reinitialisation', {
      method: 'POST',
      body: JSON.stringify({ jeton, motDePasse }),
    }),

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

  updateCategorie: (
    id: string,
    data: {
      nom?: string;
      statut?: 'ACTIF' | 'INACTIF';
      type?: TypeCategorie;
      suiteParDefaut?: number;
    },
  ) => apiFetch<Categorie>(`/gerant/categories/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  listProduits: () => apiFetch<Produit[]>('/gerant/produits'),

  createProduit: (data: {
    nom: string;
    prix: number;
    categorieId: string;
    description?: string;
    tempsPreparationMinutes?: number;
    coutRevient?: number;
    tauxTva?: number;
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
      tauxTva: number;
      disponible: boolean;
      suiviQuantite: boolean;
      quantiteRestante: number | null;
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

  // Sans période, l'API renvoie les 200 dernières annulations.
  listAnnulations: (debut?: Date, fin?: Date) =>
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
    >(`/gerant/annulations${queryPeriode(debut, fin)}`, {}, DELAI_REQUETE_LONG_MS),

  caisseMenu: () => apiFetch<CategorieMenu[]>('/caisse/menu'),

  // Gestion du stock depuis la caisse (droit GERER_STOCK) : rupture, suivi de
  // quantité, ajustement de la quantité restante.
  majStockCaisse: (
    produitId: string,
    data: Partial<{ disponible: boolean; suiviQuantite: boolean; quantiteRestante: number | null }>,
  ) =>
    apiFetch<{
      id: string;
      disponible: boolean;
      suiviQuantite: boolean;
      quantiteRestante: number | null;
    }>(`/caisse/produits/${produitId}/stock`, { method: 'PATCH', body: JSON.stringify(data) }),

  // Rafraîchis en boucle par l'écran Tables : délai court, leur échec sert de
  // détecteur de coupure.
  caisseTables: () => apiFetch<TableCaisse[]>('/caisse/tables', {}, DELAI_REQUETE_COURT_MS),

  listCommandes: () => apiFetch<Commande[]>('/caisse/commandes', {}, DELAI_REQUETE_COURT_MS),

  reclamerSuiteTable: (additionId: string) =>
    apiFetch<{ suiteReclamee: number; commandes: Commande[] }>(
      `/caisse/additions/${additionId}/reclamer`,
      { method: 'POST' },
    ),

  updateSuiteLigne: (ligneId: string, suite: number) =>
    apiFetch<Commande>(`/caisse/lignes/${ligneId}/suite`, {
      method: 'PATCH',
      body: JSON.stringify({ suite }),
    }),

  // `apresPreparation` est déclaré par le serveur au moment d'annuler : il
  // conditionne la perte sèche des rapports et le retour au stock.
  annulerCommande: (
    id: string,
    data:
      | {
          portee: 'COMMANDE';
          motif: string;
          commentaire?: string;
          codeGerant?: string;
          apresPreparation: boolean;
        }
      | {
          portee: 'LIGNES';
          lignes: Array<{ ligneCommandeId: string; quantite: number }>;
          motif: string;
          commentaire?: string;
          codeGerant?: string;
          apresPreparation: boolean;
        },
  ) =>
    apiFetch<Commande>(`/caisse/commandes/${id}/annulation`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  creerCommande: (data: {
    canal: 'SUR_PLACE' | 'EMPORTER';
    tableId?: string;
    noteCuisine?: string;
    lignes: Array<
      | {
          produitId: string;
          quantite: number;
          options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
          // Suite choisie à la saisie (« à suivre ») ; sinon celle de la catégorie.
          suite?: number;
        }
      // « La même chose en plus » : duplique un article déjà envoyé de l'addition.
      | { ligneSourceId: string; quantite: number }
    >;
    cleIdempotence?: string;
    creeLeHorsLigne?: string;
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

  // Les additions ouvertes se lisent sur le plan de salle (/caisse/tables) :
  // l'écran Tables ne charge le détail que de la table ouverte.
  getAddition: (id: string) => apiFetch<AdditionDetail>(`/caisse/additions/${id}`),

  creerPaiement: (
    additionId: string,
    data:
      | {
          mode: 'MONTANT';
          montant: number;
          moyenPaiement: ModePaiement;
          montantRecu?: number;
          cleIdempotence?: string;
          creeLeHorsLigne?: string;
        }
      | {
          mode: 'ARTICLES';
          lignes: Array<{ ligneCommandeId: string; quantite: number }>;
          moyenPaiement: ModePaiement;
          montantRecu?: number;
          cleIdempotence?: string;
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

  caisseEtablissement: () =>
    apiFetch<{ nom: string; adresse: string | null; ville: string | null }>('/caisse/etablissement'),

  creerRemise: (
    additionId: string,
    data: {
      mode: 'POURCENTAGE' | 'MONTANT';
      valeur: number;
      motif: string;
      commentaire?: string;
      codeGerant?: string;
    },
  ) =>
    apiFetch<{ montant: number; soldeRestant: number; additionCloturee: boolean }>(
      `/caisse/additions/${additionId}/remise`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  offrirArticles: (
    additionId: string,
    data: {
      lignes: Array<{ ligneCommandeId: string; quantite: number }>;
      motif: string;
      commentaire?: string;
      codeGerant?: string;
    },
  ) =>
    apiFetch<{ soldeRestant: number; additionCloturee: boolean }>(
      `/caisse/additions/${additionId}/offert`,
      { method: 'POST', body: JSON.stringify(data) },
    ),

  // Sans période, l'API renvoie les 200 derniers gestes commerciaux.
  listRemises: (debut?: Date, fin?: Date) =>
    apiFetch<
      Array<{
        id: string;
        type: 'REMISE' | 'OFFERT';
        montant: number;
        pourcentage: number | null;
        quantite: number | null;
        motif: string;
        commentaire: string | null;
        creeLe: string;
        table: { numero: string } | null;
        produit: string | null;
        accordeePar: { nom: string; prenom: string; role: string };
        demandeePar: { nom: string; prenom: string } | null;
      }>
    >(`/gerant/remises${queryPeriode(debut, fin)}`, {}, DELAI_REQUETE_LONG_MS),

  menuPublic: (etablissementId: string) =>
    apiFetch<{
      etablissement: { nom: string; adresse: string | null; ville: string | null };
      commandeClientActive: boolean;
      categories: Array<{
        id: string;
        nom: string;
        produits: Array<{
          id: string;
          nom: string;
          description: string | null;
          prix: number;
          options: Array<{
            id: string;
            nom: string;
            obligatoire: boolean;
            valeurs: Array<{ id: string; valeur: string }>;
          }>;
        }>;
      }>;
    }>(`/public/menu/${etablissementId}`),

  commanderClient: (data: {
    etablissementId: string;
    tableNumero: string;
    lignes: Array<{
      produitId: string;
      quantite: number;
      options?: Array<{ groupeOptionId: string; optionValeurId: string }>;
    }>;
    note?: string;
  }) =>
    apiFetch<{ id: string; total: number; message: string }>('/public/commandes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  listDemandes: () => apiFetch<DemandeClient[]>('/caisse/demandes', {}, DELAI_REQUETE_COURT_MS),

  accepterDemande: (id: string) =>
    apiFetch<Commande>(`/caisse/demandes/${id}/accepter`, { method: 'POST' }),

  refuserDemande: (id: string) => apiFetch<void>(`/caisse/demandes/${id}/refuser`, { method: 'POST' }),

  listReservations: (debut: Date, fin: Date) =>
    apiFetch<Reservation[]>(
      `/caisse/reservations?debut=${encodeURIComponent(debut.toISOString())}&fin=${encodeURIComponent(fin.toISOString())}`,
    ),

  creerReservation: (data: {
    nomClient: string;
    telephone?: string;
    email?: string;
    nombreCouverts: number;
    date: string;
    dureeMinutes?: number;
    note?: string;
    tableId: string;
    // Présente quand la réservation a été prise hors ligne : rejouable sans doublon.
    cleIdempotence?: string;
  }) => apiFetch<Reservation>('/caisse/reservations', { method: 'POST', body: JSON.stringify(data) }),

  updateReservation: (id: string, statut: 'ARRIVEE' | 'ANNULEE' | 'NO_SHOW') =>
    apiFetch<Reservation>(`/caisse/reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ statut }),
    }),

  modifierReservation: (
    id: string,
    data: {
      tableId?: string;
      nombreCouverts?: number;
      date?: string;
      nomClient?: string;
      telephone?: string;
      email?: string;
      note?: string;
    },
  ) =>
    apiFetch<Reservation>(`/caisse/reservations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

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

  // Sans période, l'API renvoie les 90 dernières journées.
  listJournees: (debut?: Date, fin?: Date) =>
    apiFetch<JourneeGerant[]>(`/gerant/journees${queryPeriode(debut, fin)}`, {}, DELAI_REQUETE_LONG_MS),

  reservationsGerant: () =>
    apiFetch<{
      stats: {
        total: number;
        arrivees: number;
        noShows: number;
        annulees: number;
        aVenir: number;
        tauxNoShow: number | null;
      };
      clientsARisque: Array<{
        nomClient: string;
        telephone: string | null;
        email: string | null;
        noShows: number;
        venues: number;
      }>;
      reservations: Array<Omit<Reservation, 'dureeMinutes' | 'table'> & { table: { numero: string } }>;
    }>('/gerant/reservations'),

  listComptesClients: () => apiFetch<CompteClient[]>('/admin/comptes-clients'),

  createCompteClient: (data: {
    nomEnseigne: string;
    etablissement: { nom: string; ville?: string; adresse?: string };
    gerant: { nom: string; prenom: string; email: string; motDePasse: string };
  }) => apiFetch('/admin/comptes-clients', { method: 'POST', body: JSON.stringify(data) }),

  updateCompteClient: (id: string, data: { statut?: 'ACTIF' | 'SUSPENDU'; modules?: ModuleCompte[] }) =>
    apiFetch<{ id: string; statut: string; modules: ModuleCompte[] }>(`/admin/comptes-clients/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  listReinitialisations: () =>
    apiFetch<
      Array<{
        id: string;
        jeton: string;
        creeLe: string;
        expireLe: string;
        ip: string | null;
        utilisateur: {
          nom: string;
          prenom: string;
          email: string | null;
          compteClient: { nomEnseigne: string } | null;
        };
      }>
    >('/admin/reinitialisations'),

  annulerReinitialisation: (id: string) =>
    apiFetch<void>(`/admin/reinitialisations/${id}`, { method: 'DELETE' }),

  listErreurs: () =>
    apiFetch<
      Array<{
        id: string;
        methode: string;
        chemin: string;
        message: string;
        detail: string | null;
        creeLe: string;
      }>
    >('/admin/erreurs'),

  viderErreurs: () => apiFetch<void>('/admin/erreurs', { method: 'DELETE' }),

  listConnexions: (echecsSeulement: boolean) =>
    apiFetch<
      Array<{
        id: string;
        creeLe: string;
        type: 'MOT_DE_PASSE' | 'PIN';
        resultat: 'REUSSIE' | 'IDENTIFIANTS_INVALIDES' | 'COMPTE_SUSPENDU' | 'TROP_DE_TENTATIVES';
        acteur: string | null;
        etablissement: string | null;
        ip: string | null;
        navigateur: string | null;
      }>
    >(`/admin/connexions${echecsSeulement ? '?echecs=true' : ''}`),

  getParametres: () => apiFetch<ParametresGerant>('/gerant/parametres'),

  updateParametres: (data: { suiviCoutsActive?: boolean; commandeClientActive?: boolean }) =>
    apiFetch<ParametresGerant>('/gerant/parametres', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  regenererCodeTerminal: () =>
    apiFetch<{ codeTerminal: string }>('/gerant/terminal/code', { method: 'POST' }),

  resetMotDePasseGerant: (gerantId: string, motDePasse: string) =>
    apiFetch<void>(`/admin/gerants/${gerantId}/mot-de-passe`, {
      method: 'POST',
      body: JSON.stringify({ motDePasse }),
    }),

  // Agrégations sur toute une période : plus long, et sans repli hors ligne.
  getRapports: (debut: Date, fin: Date) =>
    apiFetch<RapportVentes>(
      `/gerant/rapports?debut=${encodeURIComponent(debut.toISOString())}&fin=${encodeURIComponent(fin.toISOString())}`,
      {},
      DELAI_REQUETE_LONG_MS,
    ),
};
