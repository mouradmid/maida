// Tests d'intégration de l'API Maïda.
// Ils créent un compte client jetable « TEST-AUTO » (isolation multi-tenant),
// déroulent les parcours critiques, puis suppriment toutes leurs données :
// les données de démo (Le Bon Grill) ne sont jamais touchées.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { prisma } from '../src/lib/prisma';

const NOM_COMPTE_TEST = 'TEST-AUTO';
const EMAIL_GERANT = 'gerant@test-auto.maida';
const MDP_GERANT = 'test-auto-1234';
const PIN_GERANT = '4321';
const PIN_SERVEUR_DROITS = '1111';
const PIN_SERVEUR_SANS = '2222';

let etablissementId = '';
let compteClientId = '';
let produitPlatId = '';
let produitBoissonId = '';
let produitOptionsId = '';
let groupeOptionId = '';
let optionValeurId = '';
let tableId = '';

// Agents = sessions (cookies conservés entre les requêtes)
const gerant = request.agent(app);
const serveur = request.agent(app); // avec droits ANNULER + CLOTURER
const serveurSans = request.agent(app); // sans droits

async function purgerCompteTest() {
  const compte = await prisma.compteClient.findFirst({ where: { nomEnseigne: NOM_COMPTE_TEST } });
  if (!compte) return;
  const filtreEtab = { etablissement: { compteClientId: compte.id } };
  await prisma.paiementLigne.deleteMany({ where: { paiement: { addition: filtreEtab } } });
  await prisma.paiement.deleteMany({ where: { addition: filtreEtab } });
  await prisma.annulation.deleteMany({ where: filtreEtab });
  await prisma.remise.deleteMany({ where: filtreEtab });
  await prisma.reservation.deleteMany({ where: filtreEtab });
  await prisma.ligneCommandeOption.deleteMany({ where: { ligneCommande: { commande: filtreEtab } } });
  await prisma.ligneCommande.deleteMany({ where: { commande: filtreEtab } });
  await prisma.commande.deleteMany({ where: filtreEtab });
  await prisma.addition.deleteMany({ where: filtreEtab });
  await prisma.journeeCaisse.deleteMany({ where: filtreEtab });
  await prisma.optionValeur.deleteMany({ where: { groupeOption: { produit: filtreEtab } } });
  await prisma.groupeOption.deleteMany({ where: { produit: filtreEtab } });
  await prisma.produit.deleteMany({ where: filtreEtab });
  await prisma.categorie.deleteMany({ where: filtreEtab });
  await prisma.table.deleteMany({ where: filtreEtab });
  await prisma.utilisateur.deleteMany({ where: { compteClientId: compte.id } });
  await prisma.etablissement.deleteMany({ where: { compteClientId: compte.id } });
  await prisma.compteClient.delete({ where: { id: compte.id } });
}

beforeAll(async () => {
  await purgerCompteTest(); // au cas où une exécution précédente a planté

  const compte = await prisma.compteClient.create({ data: { nomEnseigne: NOM_COMPTE_TEST } });
  compteClientId = compte.id;
  const etab = await prisma.etablissement.create({
    data: { nom: 'Resto Test', ville: 'Testville', compteClientId: compte.id },
  });
  etablissementId = etab.id;

  await prisma.utilisateur.create({
    data: {
      role: 'GERANT',
      nom: 'Test',
      prenom: 'Gérant',
      email: EMAIL_GERANT,
      motDePasseHash: await bcrypt.hash(MDP_GERANT, 12),
      codePinHash: await bcrypt.hash(PIN_GERANT, 12),
      compteClientId: compte.id,
      etablissementId: etab.id,
    },
  });
  await prisma.utilisateur.create({
    data: {
      role: 'SERVEUR',
      nom: 'Test',
      prenom: 'AvecDroits',
      codePinHash: await bcrypt.hash(PIN_SERVEUR_DROITS, 12),
      droits: ['ANNULER', 'CLOTURER', 'REMISER'],
      compteClientId: compte.id,
      etablissementId: etab.id,
    },
  });
  await prisma.utilisateur.create({
    data: {
      role: 'SERVEUR',
      nom: 'Test',
      prenom: 'SansDroit',
      codePinHash: await bcrypt.hash(PIN_SERVEUR_SANS, 12),
      droits: [],
      compteClientId: compte.id,
      etablissementId: etab.id,
    },
  });

  const catPlats = await prisma.categorie.create({
    data: { nom: 'Plats Test', type: 'NOURRITURE', etablissementId: etab.id },
  });
  const catBoissons = await prisma.categorie.create({
    data: { nom: 'Boissons Test', type: 'BOISSON', etablissementId: etab.id },
  });
  const plat = await prisma.produit.create({
    data: {
      nom: 'Plat T',
      prix: 1000,
      coutRevient: 300,
      tauxTva: 9,
      categorieId: catPlats.id,
      etablissementId: etab.id,
    },
  });
  produitPlatId = plat.id;
  const boisson = await prisma.produit.create({
    data: {
      nom: 'Boisson T',
      prix: 200,
      coutRevient: 80,
      tauxTva: 19,
      categorieId: catBoissons.id,
      etablissementId: etab.id,
    },
  });
  produitBoissonId = boisson.id;
  const platOptions = await prisma.produit.create({
    data: { nom: 'Plat Options', prix: 500, categorieId: catPlats.id, etablissementId: etab.id },
  });
  produitOptionsId = platOptions.id;
  const groupe = await prisma.groupeOption.create({
    data: { nom: 'Choix', obligatoire: true, produitId: platOptions.id },
  });
  groupeOptionId = groupe.id;
  const valeur = await prisma.optionValeur.create({ data: { valeur: 'A', groupeOptionId: groupe.id } });
  optionValeurId = valeur.id;

  const table = await prisma.table.create({
    data: { numero: 'T1', nombreCouverts: 4, etablissementId: etab.id },
  });
  tableId = table.id;
}, 60_000);

afterAll(async () => {
  await purgerCompteTest();
  await prisma.$disconnect();
}, 60_000);

describe('Authentification', () => {
  it('refuse un mauvais mot de passe', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL_GERANT, password: 'mauvais' });
    expect(res.status).toBe(401);
  });

  it('connecte le gérant', async () => {
    const res = await gerant.post('/api/auth/login').send({ email: EMAIL_GERANT, password: MDP_GERANT });
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('GERANT');
  });

  it('refuse un PIN inconnu', async () => {
    const res = await request(app)
      .post('/api/auth/login-pin')
      .send({ etablissementId, codePin: '0000' });
    expect(res.status).toBe(401);
  });

  it('connecte les serveurs par PIN', async () => {
    const res1 = await serveur
      .post('/api/auth/login-pin')
      .send({ etablissementId, codePin: PIN_SERVEUR_DROITS });
    expect(res1.status).toBe(200);
    expect(res1.body.droits).toContain('CLOTURER');
    expect(res1.body.droits).toContain('REMISER');
    const res2 = await serveurSans
      .post('/api/auth/login-pin')
      .send({ etablissementId, codePin: PIN_SERVEUR_SANS });
    expect(res2.status).toBe(200);
    expect(res2.body.droits).toHaveLength(0);
  });
});

describe('Isolation multi-tenant', () => {
  it('le gérant test ne voit que ses produits', async () => {
    const res = await gerant.get('/api/gerant/produits');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
    for (const p of res.body) expect(p.etablissementId).toBe(etablissementId);
  });

  it("le gérant test ne peut pas modifier un produit d'un autre restaurant", async () => {
    const autre = await prisma.produit.findFirst({
      where: { etablissementId: { not: etablissementId } },
    });
    if (!autre) return; // pas d'autre resto en base : rien à tester
    const res = await gerant.patch(`/api/gerant/produits/${autre.id}`).send({ prix: 1 });
    expect(res.status).toBe(404);
  });

  it('le menu caisse ne contient que les produits du resto', async () => {
    const res = await serveur.get('/api/caisse/menu');
    expect(res.status).toBe(200);
    const noms = res.body.flatMap((c: { produits: Array<{ nom: string }> }) =>
      c.produits.map((p) => p.nom),
    );
    expect(noms).toContain('Plat T');
    expect(noms).not.toContain('Burger maison');
  });
});

describe('Commandes', () => {
  it('refuse une commande sur place sans table', async () => {
    const res = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', lignes: [{ produitId: produitPlatId, quantite: 1 }] });
    expect(res.status).toBe(400);
  });

  it('exige les options obligatoires', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId,
      lignes: [{ produitId: produitOptionsId, quantite: 1 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Choix');
  });

  it('crée une commande et la fait passer en cuisine puis prête', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId,
      noteCuisine: 'Test note',
      lignes: [
        { produitId: produitPlatId, quantite: 1 },
        { produitId: produitBoissonId, quantite: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(1200);
    expect(res.body.lignes[0].tauxTva).toBe(9); // figé depuis le produit

    const cuisine = await serveur.get('/api/caisse/cuisine/commandes');
    expect(cuisine.body.map((c: { id: string }) => c.id)).toContain(res.body.id);

    const prete = await serveur.patch(`/api/caisse/commandes/${res.body.id}/prete`);
    expect(prete.status).toBe(200);
    expect(prete.body.statut).toBe('PRETE');
  });
});

describe('Journée de caisse et encaissement', () => {
  let additionId = '';

  it("bloque l'encaissement sans journée ouverte", async () => {
    const additions = await serveur.get('/api/caisse/additions');
    additionId = additions.body[0].id;
    const res = await serveur
      .post(`/api/caisse/additions/${additionId}/paiements`)
      .send({ mode: 'MONTANT', montant: 100, moyenPaiement: 'ESPECES' });
    expect(res.status).toBe(409);
  });

  it('ouvre la journée (et refuse une double ouverture)', async () => {
    const res = await serveur.post('/api/caisse/journee/ouverture').send({ fondDeCaisse: 1000 });
    expect(res.status).toBe(201);
    const double = await serveur.post('/api/caisse/journee/ouverture').send({ fondDeCaisse: 500 });
    expect(double.status).toBe(409);
  });

  it("encaisse le total et clôt l'addition", async () => {
    const res = await serveur
      .post(`/api/caisse/additions/${additionId}/paiements`)
      .send({ mode: 'MONTANT', montant: 1200, moyenPaiement: 'ESPECES', montantRecu: 1500 });
    expect(res.status).toBe(201);
    expect(res.body.rendu).toBe(300);
    expect(res.body.additionCloturee).toBe(true);

    const ouvertes = await serveur.get('/api/caisse/additions');
    expect(ouvertes.body).toHaveLength(0);
  });

  it('refuse un paiement au-delà du solde', async () => {
    const commande = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId,
      lignes: [{ produitId: produitPlatId, quantite: 2 }],
    });
    expect(commande.status).toBe(201);
    const res = await serveur
      .post(`/api/caisse/additions/${commande.body.additionId}/paiements`)
      .send({ mode: 'MONTANT', montant: 99999, moyenPaiement: 'ESPECES' });
    expect(res.status).toBe(400);
  });
});

describe('Annulations', () => {
  let commandeId = '';
  let ligneId = '';

  it('refuse une annulation sans droit et sans code gérant', async () => {
    const commandes = await serveurSans.get('/api/caisse/commandes');
    const enCours = commandes.body.find((c: { statut: string }) => c.statut === 'ENVOYEE');
    commandeId = enCours.id;
    ligneId = enCours.lignes[0].id;

    const res = await serveurSans
      .post(`/api/caisse/commandes/${commandeId}/annulation`)
      .send({ portee: 'LIGNES', lignes: [{ ligneCommandeId: ligneId, quantite: 1 }], motif: 'Test' });
    expect(res.status).toBe(403);
    expect(res.body.codeGerantRequis).toBe(true);
  });

  it('refuse un mauvais code gérant', async () => {
    const res = await serveurSans.post(`/api/caisse/commandes/${commandeId}/annulation`).send({
      portee: 'LIGNES',
      lignes: [{ ligneCommandeId: ligneId, quantite: 1 }],
      motif: 'Test',
      codeGerant: '9998',
    });
    expect(res.status).toBe(403);
  });

  it('annule une ligne avec validation du gérant et trace la demande', async () => {
    const res = await serveurSans.post(`/api/caisse/commandes/${commandeId}/annulation`).send({
      portee: 'LIGNES',
      lignes: [{ ligneCommandeId: ligneId, quantite: 1 }],
      motif: 'Erreur de saisie',
      codeGerant: PIN_GERANT,
    });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(1000); // 2 × 1000 − 1 annulé

    const annulations = await gerant.get('/api/gerant/annulations');
    expect(annulations.body[0].montant).toBe(1000);
    expect(annulations.body[0].demandeePar?.prenom).toBe('SansDroit');
  });
});

describe('Clôture de caisse', () => {
  it('bloque la clôture tant que des additions sont ouvertes', async () => {
    const res = await serveur.post('/api/caisse/journee/cloture').send({ especesComptees: 2200 });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('addition');
  });

  it('clôture avec écart après avoir tout soldé', async () => {
    const additions = await serveur.get('/api/caisse/additions');
    for (const a of additions.body) {
      await serveur
        .post(`/api/caisse/additions/${a.id}/paiements`)
        .send({ mode: 'MONTANT', montant: a.solde, moyenPaiement: 'ESPECES' });
    }

    const refus = await serveurSans.post('/api/caisse/journee/cloture').send({ especesComptees: 3150 });
    expect(refus.status).toBe(403);

    // fond 1000 + espèces 1200 + 1000 = 3200 attendues, 3150 comptées → écart −50
    const res = await serveur
      .post('/api/caisse/journee/cloture')
      .send({ especesComptees: 3150, commentaire: 'Test clôture' });
    expect(res.status).toBe(200);
    expect(res.body.especesAttendues).toBe(3200);
    expect(res.body.ecart).toBe(-50);
  });

  it("bloque l'encaissement une fois la journée clôturée", async () => {
    const commande = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitBoissonId, quantite: 1 }],
    });
    const res = await serveur
      .post(`/api/caisse/additions/${commande.body.additionId}/paiements`)
      .send({ mode: 'MONTANT', montant: 200, moyenPaiement: 'ESPECES' });
    expect(res.status).toBe(409);
  });
});

describe('Rapports', () => {
  it('calcule CA, palmarès et food cost sur la période', async () => {
    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await gerant.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}`);
    expect(res.status).toBe(200);
    expect(res.body.caEncaisse).toBe(2200); // 1200 + 1000
    expect(res.body.pertes.montant).toBe(1000);
    expect(res.body.parProduit[0].nom).toBe('Plat T');
    expect(res.body.foodCost.nourriture.pct).toBe(30); // coût 300 / prix 1000
    expect(res.body.foodCost.boissons.pct).toBe(40); // coût 80 / prix 200
  });

  it('ventile la TVA collectée par taux (prix TTC)', async () => {
    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const res = await gerant.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}`);

    // Facturable : 2 × Plat T (2000 DA à 9 %) + 2 × Boisson T (400 DA à 19 %,
    // dont celle de la commande créée par le test de blocage après clôture)
    const taux9 = res.body.tva.parTaux.find((t: { taux: number }) => t.taux === 9);
    const taux19 = res.body.tva.parTaux.find((t: { taux: number }) => t.taux === 19);
    expect(taux9.ttc).toBe(2000);
    expect(taux9.ht).toBe(1834.86); // 2000 / 1,09
    expect(taux9.tva).toBe(165.14);
    expect(taux19.ttc).toBe(400);
    expect(taux19.tva).toBe(63.87); // 400 − 400/1,19
    expect(res.body.tva.totalTva).toBe(229.01);
  });
});

describe('Options de produit', () => {
  it('accepte une commande avec option valide', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [
        { produitId: produitOptionsId, quantite: 1, options: [{ groupeOptionId, optionValeurId }] },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.lignes[0].options[0].valeur).toBe('A');
  });
});

describe('Remises et offerts', () => {
  let additionId = '';
  let lignePlatId = '';

  it('prépare une addition à emporter', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitPlatId, quantite: 3 }],
    });
    expect(res.status).toBe(201);
    additionId = res.body.additionId;
    lignePlatId = res.body.lignes[0].id;
  });

  it('refuse un offert sans droit et sans code gérant', async () => {
    const res = await serveurSans.post(`/api/caisse/additions/${additionId}/offert`).send({
      lignes: [{ ligneCommandeId: lignePlatId, quantite: 1 }],
      motif: 'Client fidèle',
    });
    expect(res.status).toBe(403);
    expect(res.body.codeGerantRequis).toBe(true);
  });

  it('offre un article avec validation gérant : le solde baisse', async () => {
    const res = await serveurSans.post(`/api/caisse/additions/${additionId}/offert`).send({
      lignes: [{ ligneCommandeId: lignePlatId, quantite: 1 }],
      motif: 'Client fidèle',
      codeGerant: PIN_GERANT,
    });
    expect(res.status).toBe(201);
    expect(res.body.soldeRestant).toBe(2000); // 3 × 1000 − 1 offert
    expect(res.body.additionCloturee).toBe(false);
  });

  it("refuse d'offrir plus que le disponible", async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/offert`).send({
      lignes: [{ ligneCommandeId: lignePlatId, quantite: 5 }],
      motif: 'Client fidèle',
    });
    expect(res.status).toBe(400);
  });

  it('applique une remise de 10 % avec le droit REMISER', async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/remise`).send({
      mode: 'POURCENTAGE',
      valeur: 10,
      motif: 'Geste commercial',
    });
    expect(res.status).toBe(201);
    expect(res.body.montant).toBe(200); // 10 % de 2000
    expect(res.body.soldeRestant).toBe(1800);
  });

  it('refuse une remise supérieure au solde', async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/remise`).send({
      mode: 'MONTANT',
      valeur: 99999,
      motif: 'Geste commercial',
    });
    expect(res.status).toBe(400);
  });

  it("une remise qui couvre tout le solde clôt l'addition sans paiement", async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/remise`).send({
      mode: 'MONTANT',
      valeur: 1800,
      motif: 'Geste commercial',
      commentaire: 'Test remise totale',
    });
    expect(res.status).toBe(201);
    expect(res.body.additionCloturee).toBe(true);

    const detail = await serveur.get(`/api/caisse/additions/${additionId}`);
    expect(detail.body.statut).toBe('PAYEE');
    expect(detail.body.total).toBe(0); // 2000 facturables − 2000 de remises
    expect(detail.body.montantRemises).toBe(2000);
  });

  it("trace tout dans l'historique gérant et les rapports", async () => {
    const remises = await gerant.get('/api/gerant/remises');
    expect(remises.status).toBe(200);
    expect(remises.body).toHaveLength(3); // 1 offert + 2 remises
    const offert = remises.body.find((r: { type: string }) => r.type === 'OFFERT');
    expect(offert.montant).toBe(1000);
    expect(offert.demandeePar?.prenom).toBe('SansDroit');

    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const rapport = await gerant.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}`);
    expect(rapport.body.remises.montant).toBe(3000); // 1000 offert + 200 + 1800
    expect(rapport.body.remises.offerts.quantite).toBe(1);
  });
});

describe('Réservations', () => {
  let reservationId = '';

  it('crée une réservation', async () => {
    const res = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Famille Test',
      telephone: '0550 12 34 56',
      nombreCouverts: 4,
      date: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(res.status).toBe(201);
    expect(res.body.statut).toBe('A_VENIR');
    expect(res.body.table.numero).toBe('T1');
    reservationId = res.body.id;
  });

  it('refuse un chevauchement sur la même table', async () => {
    const res = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Doublon',
      nombreCouverts: 2,
      date: new Date(Date.now() + 3.5 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toContain('Famille Test');
  });

  it('accepte un créneau plus tard sur la même table', async () => {
    const res = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Second service',
      nombreCouverts: 2,
      date: new Date(Date.now() + 6 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(res.status).toBe(201);
  });

  it('signale la table sur le plan quand la réservation approche', async () => {
    await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Imminent',
      nombreCouverts: 2,
      date: new Date(Date.now() + 90 * 60_000).toISOString(),
      tableId,
      dureeMinutes: 60,
    });
    const tables = await serveur.get('/api/caisse/tables');
    const t1 = tables.body.find((t: { numero: string }) => t.numero === 'T1');
    expect(t1.reservationProche?.nomClient).toBe('Imminent');
  });

  it("marque l'arrivée du client, une seule fois", async () => {
    const arrivee = await serveur
      .patch(`/api/caisse/reservations/${reservationId}`)
      .send({ statut: 'ARRIVEE' });
    expect(arrivee.status).toBe(200);
    expect(arrivee.body.statut).toBe('ARRIVEE');
    const rejeu = await serveur
      .patch(`/api/caisse/reservations/${reservationId}`)
      .send({ statut: 'NO_SHOW' });
    expect(rejeu.status).toBe(409);
  });

  it('refuse une adresse email invalide, accepte une valide', async () => {
    const invalide = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Email cassé',
      email: 'pas-un-email',
      nombreCouverts: 2,
      date: new Date(Date.now() + 26 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(invalide.status).toBe(400);

    const valide = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Avec Email',
      email: 'Client.Test@Example.DZ',
      nombreCouverts: 2,
      date: new Date(Date.now() + 26 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(valide.status).toBe(201);
    expect(valide.body.email).toBe('client.test@example.dz');
  });

  it('le gérant voit les statistiques no-show et les clients à surveiller', async () => {
    // Le "Second service" pose un lapin.
    const debut = new Date(Date.now() - 60 * 60_000).toISOString();
    const fin = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const liste = await serveur.get(`/api/caisse/reservations?debut=${debut}&fin=${fin}`);
    const seconde = liste.body.find((r: { nomClient: string }) => r.nomClient === 'Second service');
    await serveur.patch(`/api/caisse/reservations/${seconde.id}`).send({ statut: 'NO_SHOW' });

    const res = await gerant.get('/api/gerant/reservations');
    expect(res.status).toBe(200);
    expect(res.body.stats.arrivees).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.noShows).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.tauxNoShow).not.toBeNull();
    const risque = res.body.clientsARisque.find(
      (c: { nomClient: string }) => c.nomClient === 'Second service',
    );
    expect(risque.noShows).toBe(1);
  });

  it('liste les réservations de la journée', async () => {
    const debut = new Date(Date.now() - 60 * 60_000).toISOString();
    const fin = new Date(Date.now() + 24 * 60 * 60_000).toISOString();
    const res = await serveur.get(`/api/caisse/reservations?debut=${debut}&fin=${fin}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
  });
});

describe('Idempotence des commandes hors ligne', () => {
  const cle = `test-idem-${Date.now()}`;
  let premiereId = '';

  it('crée la commande avec sa clé et son heure de prise hors ligne', async () => {
    const creeLe = new Date(Date.now() - 10 * 60_000).toISOString();
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitBoissonId, quantite: 1 }],
      cleIdempotence: cle,
      creeLeHorsLigne: creeLe,
    });
    expect(res.status).toBe(201);
    premiereId = res.body.id;
    expect(new Date(res.body.creeLe).toISOString()).toBe(creeLe);
  });

  it('rejouer la même commande ne crée pas de doublon', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitBoissonId, quantite: 1 }],
      cleIdempotence: cle,
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(premiereId);

    const nombre = await prisma.commande.count({ where: { cleIdempotence: cle } });
    expect(nombre).toBe(1);
  });

  it('refuse une date de prise hors ligne trop ancienne', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitBoissonId, quantite: 1 }],
      cleIdempotence: `${cle}-vieille`,
      creeLeHorsLigne: new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString(),
    });
    expect(res.status).toBe(400);
  });
});

const identifiantsAdmin = process.env.SEED_SUPER_ADMIN_EMAIL && process.env.SEED_SUPER_ADMIN_PASSWORD;

describe('Idempotence des paiements hors ligne', () => {
  const clePaiement = `test-idem-paiement-${Date.now()}`;
  let additionId = '';
  let premierId = '';

  it('prépare une nouvelle journée et une addition', async () => {
    const journee = await serveur.post('/api/caisse/journee/ouverture').send({ fondDeCaisse: 500 });
    expect(journee.status).toBe(201);
    const commande = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitBoissonId, quantite: 2 }],
    });
    expect(commande.status).toBe(201);
    additionId = commande.body.additionId;
  });

  it('encaisse avec clé et heure hors ligne', async () => {
    const creeLe = new Date(Date.now() - 20 * 60_000).toISOString();
    const res = await serveur.post(`/api/caisse/additions/${additionId}/paiements`).send({
      mode: 'MONTANT',
      montant: 400,
      moyenPaiement: 'ESPECES',
      montantRecu: 500,
      cleIdempotence: clePaiement,
      creeLeHorsLigne: creeLe,
    });
    expect(res.status).toBe(201);
    expect(res.body.rendu).toBe(100);
    expect(res.body.additionCloturee).toBe(true);
    premierId = res.body.id;
  });

  it("rejouer le même paiement ne double pas l'encaissement", async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/paiements`).send({
      mode: 'MONTANT',
      montant: 400,
      moyenPaiement: 'ESPECES',
      montantRecu: 500,
      cleIdempotence: clePaiement,
    });
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(premierId);
    expect(res.body.additionCloturee).toBe(true);

    const nombre = await prisma.paiement.count({ where: { cleIdempotence: clePaiement } });
    expect(nombre).toBe(1);
  });
});

describe('Menu public (QR code)', () => {
  it('sert le menu sans authentification, sans données sensibles', async () => {
    const res = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(res.status).toBe(200);
    expect(res.body.etablissement.nom).toBe('Resto Test');
    const noms = res.body.categories.flatMap((c: { produits: Array<{ nom: string }> }) =>
      c.produits.map((p) => p.nom),
    );
    expect(noms).toContain('Plat T');
    // Jamais de coût de revient ni de TVA détaillée côté client final.
    expect(JSON.stringify(res.body)).not.toContain('coutRevient');
    expect(JSON.stringify(res.body)).not.toContain('tauxTva');
  });

  it('masque les produits désactivés', async () => {
    const inactif = await prisma.produit.create({
      data: {
        nom: 'Produit Retiré',
        prix: 100,
        statut: 'INACTIF',
        categorieId: (await prisma.categorie.findFirst({
          where: { etablissementId, nom: 'Plats Test' },
        }))!.id,
        etablissementId,
      },
    });
    const res = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(JSON.stringify(res.body)).not.toContain('Produit Retiré');
    await prisma.produit.delete({ where: { id: inactif.id } });
  });

  it('renvoie 404 pour un établissement inconnu', async () => {
    const res = await request(app).get('/api/public/menu/inconnu-xyz');
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!identifiantsAdmin)('Module food cost activable', () => {
  const admin = request.agent(app);

  it('par défaut : module accordé et suivi actif', async () => {
    const res = await gerant.get('/api/gerant/parametres');
    expect(res.status).toBe(200);
    expect(res.body.moduleFoodCost).toBe(true);
    expect(res.body.suiviCoutsActive).toBe(true);
  });

  it('le gérant peut masquer puis réafficher le suivi des coûts', async () => {
    const masque = await gerant.patch('/api/gerant/parametres').send({ suiviCoutsActive: false });
    expect(masque.body.suiviCoutsActive).toBe(false);
    const reaffiche = await gerant.patch('/api/gerant/parametres').send({ suiviCoutsActive: true });
    expect(reaffiche.body.suiviCoutsActive).toBe(true);
  });

  it('module retiré par le super-admin : le food cost disparaît des rapports', async () => {
    await admin.post('/api/auth/login').send({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    });
    const retrait = await admin
      .patch(`/api/admin/comptes-clients/${compteClientId}`)
      .send({ modules: [] });
    expect(retrait.status).toBe(200);
    expect(retrait.body.modules).toHaveLength(0);

    const parametres = await gerant.get('/api/gerant/parametres');
    expect(parametres.body.moduleFoodCost).toBe(false);

    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const rapport = await gerant.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}`);
    expect(rapport.body.foodCost).toBeNull();
    expect(rapport.body.parProduit[0].cout).toBeNull();
    expect(rapport.body.parProduit[0].marge).toBeNull();
  });

  it('module réaccordé : le food cost revient', async () => {
    await admin.patch(`/api/admin/comptes-clients/${compteClientId}`).send({ modules: ['FOOD_COST'] });
    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const rapport = await gerant.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}`);
    expect(rapport.body.foodCost).not.toBeNull();
    expect(rapport.body.foodCost.nourriture.pct).toBe(30);
  });
});

describe.skipIf(!identifiantsAdmin)('Suspension par le super-admin', () => {
  const admin = request.agent(app);

  it('suspend le compte test : tous les accès sont coupés', async () => {
    const login = await admin.post('/api/auth/login').send({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);

    const suspension = await admin
      .patch(`/api/admin/comptes-clients/${compteClientId}`)
      .send({ statut: 'SUSPENDU' });
    expect(suspension.status).toBe(200);

    // Session gérant existante coupée
    const gerantCoupe = await gerant.get('/api/gerant/categories');
    expect(gerantCoupe.status).toBe(403);
    // Session serveur existante coupée
    const serveurCoupe = await serveur.get('/api/caisse/menu');
    expect(serveurCoupe.status).toBe(403);
    // Nouveau login refusé
    const reconnexion = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL_GERANT, password: MDP_GERANT });
    expect(reconnexion.status).toBe(403);
    // Établissement retiré de la liste publique
    const etabs = await request(app).get('/api/auth/etablissements');
    expect(etabs.body.map((e: { id: string }) => e.id)).not.toContain(etablissementId);
    // Et le menu public (QR) est coupé aussi
    const menuPublic = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(menuPublic.status).toBe(404);
  });

  it('la réactivation rétablit les accès', async () => {
    const reactivation = await admin
      .patch(`/api/admin/comptes-clients/${compteClientId}`)
      .send({ statut: 'ACTIF' });
    expect(reactivation.status).toBe(200);
    const acces = await gerant.get('/api/gerant/categories');
    expect(acces.status).toBe(200);
  });
});
