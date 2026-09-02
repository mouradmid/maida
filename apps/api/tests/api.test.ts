// Tests d'intégration de l'API Maïda.
// Ils créent un compte client jetable « TEST-AUTO » (isolation multi-tenant),
// déroulent les parcours critiques, puis suppriment toutes leurs données :
// les données de démo (Le Bon Grill) ne sont jamais touchées.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { app } from '../src/app';
import { comptesReels, purgerDonneesDemo } from '../src/lib/demo';
import { emailConfirmationReservation, emailMotDePasseOublie } from '../src/lib/emails';
import { AUTH_COOKIE_NAME, signToken } from '../src/lib/jwt';
import { prisma } from '../src/lib/prisma';

const NOM_COMPTE_TEST = 'TEST-AUTO';
const EMAIL_GERANT = 'gerant@test-auto.maida';
const MDP_GERANT = 'test-auto-1234';
const PIN_GERANT = '4321';
const PIN_SERVEUR_DROITS = '1111';
const PIN_SERVEUR_SANS = '2222';
const CODE_TERMINAL_TEST = 'TESTAUTO';

let etablissementId = '';
let compteClientId = '';
let produitPlatId = '';
let produitBoissonId = '';
let produitOptionsId = '';
let groupeOptionId = '';
let optionValeurId = '';
let tableId = '';
// Deuxième table : addition vierge pour les tests de rajouts et de réclame,
// sans hériter des suites réclamées par les tests précédents sur T1.
let table2Id = '';

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
  await prisma.demandeClient.deleteMany({ where: filtreEtab });
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
  // Le journal des connexions n'a volontairement aucune clé étrangère (il doit
  // survivre à ce qu'il décrit) : rien ne le nettoie tout seul, et sans ça les
  // tentatives des tests polluent le journal de la base de développement. Les
  // identifiants se lisent AVANT la suppression des utilisateurs.
  const etablissements = await prisma.etablissement.findMany({
    where: { compteClientId: compte.id },
    select: { id: true },
  });
  const utilisateurs = await prisma.utilisateur.findMany({
    where: { compteClientId: compte.id },
    select: { id: true },
  });
  await prisma.connexionJournal.deleteMany({
    where: {
      OR: [
        { etablissementId: { in: etablissements.map((e) => e.id) } },
        { utilisateurId: { in: utilisateurs.map((u) => u.id) } },
        { acteur: EMAIL_GERANT },
      ],
    },
  });
  // Journal des e-mails : sans relation lui non plus, il faut le nettoyer à la main.
  await prisma.emailEnvoye.deleteMany({
    where: { etablissementId: { in: etablissements.map((e) => e.id) } },
  });
  // Les jetons de réinitialisation partent en cascade avec leur utilisateur.
  await prisma.utilisateur.deleteMany({ where: { compteClientId: compte.id } });
  await prisma.etablissement.deleteMany({ where: { compteClientId: compte.id } });
  await prisma.compteClient.delete({ where: { id: compte.id } });
}

beforeAll(async () => {
  await purgerCompteTest(); // au cas où une exécution précédente a planté

  const compte = await prisma.compteClient.create({ data: { nomEnseigne: NOM_COMPTE_TEST } });
  compteClientId = compte.id;
  const etab = await prisma.etablissement.create({
    data: {
      nom: 'Resto Test',
      ville: 'Testville',
      codeTerminal: CODE_TERMINAL_TEST,
      compteClientId: compte.id,
    },
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
      droits: ['ANNULER', 'CLOTURER', 'REMISER', 'GERER_STOCK'],
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
  const table2 = await prisma.table.create({
    data: { numero: 'T2', nombreCouverts: 2, etablissementId: etab.id },
  });
  table2Id = table2.id;
}, 60_000);

afterAll(async () => {
  await purgerCompteTest();
  await prisma.$disconnect();
}, 60_000);

// La caisse s'appuie sur cette sonde pour détecter le retour du réseau pendant
// une coupure : elle doit répondre sans authentification et sans base.
describe('Sonde de disponibilité', () => {
  it('répond sur /api/health, sans session', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

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

  it('crée une commande envoyée en cuisine', async () => {
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

    const liste = await serveur.get('/api/caisse/commandes');
    const envoyee = liste.body.find((c: { id: string }) => c.id === res.body.id);
    expect(envoyee.statut).toBe('ENVOYEE');
    expect(envoyee.noteCuisine).toBe('Test note');
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

  it('filtre les annulations sur la période demandée', async () => {
    const heure = 60 * 60 * 1000;
    const jour = 24 * heure;
    const iso = (decalage: number) => new Date(Date.now() + decalage).toISOString();

    const dedans = await gerant.get(`/api/gerant/annulations?debut=${iso(-heure)}&fin=${iso(heure)}`);
    expect(dedans.status).toBe(200);
    expect(dedans.body.length).toBeGreaterThan(0);

    // Une période entièrement passée ne doit rien remonter.
    const dehors = await gerant.get(
      `/api/gerant/annulations?debut=${iso(-3 * jour)}&fin=${iso(-2 * jour)}`,
    );
    expect(dehors.status).toBe(200);
    expect(dehors.body).toHaveLength(0);

    const incomplete = await gerant.get(`/api/gerant/annulations?debut=${iso(-heure)}`);
    expect(incomplete.status).toBe(400);

    const inversee = await gerant.get(`/api/gerant/annulations?debut=${iso(heure)}&fin=${iso(-heure)}`);
    expect(inversee.status).toBe(400);
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

describe('Journées de caisse (gérant)', () => {
  const ilYAUneHeure = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const dansUneHeure = () => new Date(Date.now() + 60 * 60 * 1000).toISOString();

  it('liste les journées avec leurs totaux par moyen de paiement', async () => {
    const res = await gerant.get('/api/gerant/journees');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);

    const journee = res.body[0];
    expect(journee.statut).toBe('CLOTUREE');
    expect(journee.fondDeCaisse).toBe(1000);
    expect(journee.especesAttendues).toBe(3200);
    expect(journee.especesComptees).toBe(3150);
    expect(journee.ecart).toBe(-50);
    expect(journee.commentaire).toBe('Test clôture');
    expect(journee.totaux.total).toBe(2200);
    expect(journee.totaux.parMoyen).toEqual([{ moyenPaiement: 'ESPECES', montant: 2200, nombre: 2 }]);
  });

  it('filtre les journées sur la période demandée', async () => {
    const dedans = await gerant.get(
      `/api/gerant/journees?debut=${ilYAUneHeure()}&fin=${dansUneHeure()}`,
    );
    expect(dedans.status).toBe(200);
    expect(dedans.body).toHaveLength(1);

    // Une période entièrement passée ne doit rien remonter.
    const jour = 24 * 60 * 60 * 1000;
    const dehors = await gerant.get(
      `/api/gerant/journees?debut=${new Date(Date.now() - 3 * jour).toISOString()}&fin=${new Date(
        Date.now() - 2 * jour,
      ).toISOString()}`,
    );
    expect(dehors.status).toBe(200);
    expect(dehors.body).toHaveLength(0);
  });

  it('rejette une période incomplète ou incohérente', async () => {
    const incomplete = await gerant.get(`/api/gerant/journees?debut=${ilYAUneHeure()}`);
    expect(incomplete.status).toBe(400);

    const inversee = await gerant.get(
      `/api/gerant/journees?debut=${dansUneHeure()}&fin=${ilYAUneHeure()}`,
    );
    expect(inversee.status).toBe(400);

    const illisible = await gerant.get('/api/gerant/journees?debut=hier&fin=demain');
    expect(illisible.status).toBe(400);
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

  it('filtre les remises sur la période demandée', async () => {
    const heure = 60 * 60 * 1000;
    const jour = 24 * heure;
    const iso = (decalage: number) => new Date(Date.now() + decalage).toISOString();

    const dedans = await gerant.get(`/api/gerant/remises?debut=${iso(-heure)}&fin=${iso(heure)}`);
    expect(dedans.status).toBe(200);
    expect(dedans.body).toHaveLength(3);

    // Une période entièrement passée ne doit rien remonter.
    const dehors = await gerant.get(`/api/gerant/remises?debut=${iso(-3 * jour)}&fin=${iso(-2 * jour)}`);
    expect(dehors.status).toBe(200);
    expect(dehors.body).toHaveLength(0);

    const illisible = await gerant.get('/api/gerant/remises?debut=hier&fin=demain');
    expect(illisible.status).toBe(400);
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

  // Réservation prise pendant une coupure : la resynchronisation peut être
  // rejouée sans créer de doublon.
  it('rejoue une réservation hors ligne sans la dupliquer', async () => {
    const donnees = {
      nomClient: 'Client Hors Ligne',
      nombreCouverts: 2,
      date: new Date(Date.now() + 5 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      cleIdempotence: `hlr-test-${Date.now()}`,
    };

    const premier = await serveur.post('/api/caisse/reservations').send(donnees);
    expect(premier.status).toBe(201);

    // Même clé rejouée : on retrouve la même réservation, pas une seconde.
    const rejeu = await serveur.post('/api/caisse/reservations').send(donnees);
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.id).toBe(premier.body.id);

    const debut = new Date(Date.now() + 4 * 60 * 60_000).toISOString();
    const fin = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
    const liste = await serveur.get(`/api/caisse/reservations?debut=${debut}&fin=${fin}`);
    expect(
      liste.body.filter((r: { nomClient: string }) => r.nomClient === 'Client Hors Ligne'),
    ).toHaveLength(1);
  });

  // La tablette peut n'être reconnectée qu'après l'heure prévue.
  it('accepte une réservation hors ligne dont le créneau vient de passer', async () => {
    const res = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Créneau Passé',
      nombreCouverts: 2,
      date: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      cleIdempotence: `hlr-passe-${Date.now()}`,
    });
    expect(res.status).toBe(201);

    // Sans clé (prise en direct), le passé reste refusé.
    const direct = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Créneau Passé',
      nombreCouverts: 2,
      date: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
      tableId: table2Id,
    });
    expect(direct.status).toBe(400);
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

  it('déplace une réservation vers une autre table', async () => {
    const creation = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'À déplacer',
      nombreCouverts: 2,
      date: new Date(Date.now() + 10 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(creation.status).toBe(201);
    expect(creation.body.table.numero).toBe('T1');

    const deplacee = await serveur
      .patch(`/api/caisse/reservations/${creation.body.id}`)
      .send({ tableId: table2Id });
    expect(deplacee.status).toBe(200);
    expect(deplacee.body.table.numero).toBe('T2');
  });

  it('refuse de déplacer vers une table déjà occupée sur le créneau', async () => {
    // « À déplacer » occupe désormais T2 à +10h. On crée une résa sur T1 au même créneau.
    const creation = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Bloqué',
      nombreCouverts: 2,
      date: new Date(Date.now() + 10.5 * 60 * 60_000).toISOString(),
      tableId,
    });
    expect(creation.status).toBe(201);

    const refus = await serveur
      .patch(`/api/caisse/reservations/${creation.body.id}`)
      .send({ tableId: table2Id });
    expect(refus.status).toBe(409);
    expect(refus.body.error).toContain('À déplacer');
  });

  it("modifie l'heure d'une réservation à venir", async () => {
    const creation = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Horaire',
      nombreCouverts: 2,
      date: new Date(Date.now() + 30 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      dureeMinutes: 60,
    });
    expect(creation.status).toBe(201);

    const nouvelleHeure = new Date(Date.now() + 40 * 60 * 60_000).toISOString();
    const maj = await serveur
      .patch(`/api/caisse/reservations/${creation.body.id}`)
      .send({ date: nouvelleHeure });
    expect(maj.status).toBe(200);
    expect(new Date(maj.body.date).getTime()).toBe(new Date(nouvelleHeure).getTime());
  });

  it('refuse un nouvel horaire qui chevauche une autre résa de la table', async () => {
    // Deux résas sur T2 à des créneaux distincts, puis on tente de les superposer.
    const a = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Créneau A',
      nombreCouverts: 2,
      date: new Date(Date.now() + 50 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      dureeMinutes: 60,
    });
    const b = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Créneau B',
      nombreCouverts: 2,
      date: new Date(Date.now() + 55 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      dureeMinutes: 60,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);

    // Déplacer B sur le créneau de A → conflit.
    const refus = await serveur
      .patch(`/api/caisse/reservations/${b.body.id}`)
      .send({ date: new Date(Date.now() + 50 * 60 * 60_000).toISOString() });
    expect(refus.status).toBe(409);
    expect(refus.body.error).toContain('Créneau A');
  });

  it('refuse un horaire dans le passé', async () => {
    const creation = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Passé',
      nombreCouverts: 2,
      date: new Date(Date.now() + 60 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      dureeMinutes: 60,
    });
    const refus = await serveur
      .patch(`/api/caisse/reservations/${creation.body.id}`)
      .send({ date: new Date(Date.now() - 3 * 60 * 60_000).toISOString() });
    expect(refus.status).toBe(400);
  });

  it('corrige les coordonnées du client (nom, téléphone, email, note)', async () => {
    const creation = await serveur.post('/api/caisse/reservations').send({
      nomClient: 'Nom Erroné',
      nombreCouverts: 2,
      date: new Date(Date.now() + 70 * 60 * 60_000).toISOString(),
      tableId: table2Id,
      dureeMinutes: 60,
    });
    expect(creation.status).toBe(201);

    const maj = await serveur.patch(`/api/caisse/reservations/${creation.body.id}`).send({
      nomClient: 'Nom Corrigé',
      telephone: '0661 22 33 44',
      email: 'Corrige@Example.DZ',
      note: 'Près de la fenêtre',
    });
    expect(maj.status).toBe(200);
    expect(maj.body.nomClient).toBe('Nom Corrigé');
    expect(maj.body.telephone).toBe('0661 22 33 44');
    expect(maj.body.email).toBe('corrige@example.dz');
    expect(maj.body.note).toBe('Près de la fenêtre');

    // Vider téléphone et note (chaîne vide → null), et refuser un nom vide.
    const vidage = await serveur
      .patch(`/api/caisse/reservations/${creation.body.id}`)
      .send({ telephone: '', note: '' });
    expect(vidage.status).toBe(200);
    expect(vidage.body.telephone).toBeNull();
    expect(vidage.body.note).toBeNull();

    const nomVide = await serveur
      .patch(`/api/caisse/reservations/${creation.body.id}`)
      .send({ nomClient: '   ' });
    expect(nomVide.status).toBe(400);
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

  it('ajuste couverts et table même après arrivée du client, mais pas le statut', async () => {
    // reservationId est désormais ARRIVEE (test précédent).
    const couverts = await serveur
      .patch(`/api/caisse/reservations/${reservationId}`)
      .send({ nombreCouverts: 6 });
    expect(couverts.status).toBe(200);
    expect(couverts.body.nombreCouverts).toBe(6);

    const table = await serveur
      .patch(`/api/caisse/reservations/${reservationId}`)
      .send({ tableId: table2Id });
    expect(table.status).toBe(200);
    expect(table.body.table.numero).toBe('T2');

    // Le statut, lui, n'est plus modifiable une fois le client arrivé.
    const statut = await serveur
      .patch(`/api/caisse/reservations/${reservationId}`)
      .send({ statut: 'NO_SHOW' });
    expect(statut.status).toBe(409);
  });

  it('refuse un nombre de couverts invalide', async () => {
    const res = await serveur
      .patch(`/api/caisse/reservations/${reservationId}`)
      .send({ nombreCouverts: 0 });
    expect(res.status).toBe(400);
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

describe('Plan de salle', () => {
  it('place chaque nouvelle table sur un créneau libre (jamais empilée)', async () => {
    const a = await gerant
      .post('/api/gerant/tables')
      .send({ numero: 'P1', forme: 'CARREE', nombreCouverts: 2 });
    const b = await gerant
      .post('/api/gerant/tables')
      .send({ numero: 'P2', forme: 'CARREE', nombreCouverts: 2 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    // Deux tables ne doivent jamais partager exactement la même position.
    const memePosition = a.body.positionX === b.body.positionX && a.body.positionY === b.body.positionY;
    expect(memePosition).toBe(false);
  });

  it('enregistre un déplacement aux coordonnées fractionnaires (écran mis à l’échelle)', async () => {
    const creation = await gerant
      .post('/api/gerant/tables')
      .send({ numero: 'P3', forme: 'CARREE', nombreCouverts: 2, largeur: 80, hauteur: 80 });
    expect(creation.status).toBe(201);

    const deplacement = await gerant
      .patch(`/api/gerant/tables/${creation.body.id}`)
      .send({ positionX: 312.6, positionY: 148.2 });
    expect(deplacement.status).toBe(200);
    expect(deplacement.body.positionX).toBe(313);
    expect(deplacement.body.positionY).toBe(148);

    // Le déplacement doit survivre au rechargement de l'onglet plan de salle.
    const rechargement = await gerant.get('/api/gerant/tables');
    const table = rechargement.body.find((t: { id: string }) => t.id === creation.body.id);
    expect(table.positionX).toBe(313);
    expect(table.positionY).toBe(148);
  });

  it('ne pose pas une nouvelle table par-dessus une table déplacée hors grille', async () => {
    const deplacee = await gerant
      .post('/api/gerant/tables')
      .send({ numero: 'P4', forme: 'CARREE', nombreCouverts: 2, largeur: 80, hauteur: 80 });
    // Le gérant réorganise sa salle : la table n'est plus sur un créneau de la grille,
    // mais elle recouvre toujours le premier créneau.
    await gerant.patch(`/api/gerant/tables/${deplacee.body.id}`).send({ positionX: 25, positionY: 25 });

    const nouvelle = await gerant
      .post('/api/gerant/tables')
      .send({ numero: 'P5', forme: 'CARREE', nombreCouverts: 2, largeur: 80, hauteur: 80 });
    expect(nouvelle.status).toBe(201);

    const chevauche =
      nouvelle.body.positionX < 25 + 80 &&
      25 < nouvelle.body.positionX + 80 &&
      nouvelle.body.positionY < 25 + 80 &&
      25 < nouvelle.body.positionY + 80;
    expect(chevauche).toBe(false);
  });

  it('refuse une position illisible au lieu de l’ignorer en silence', async () => {
    const creation = await gerant
      .post('/api/gerant/tables')
      .send({ numero: 'P6', forme: 'CARREE', nombreCouverts: 2 });
    const reponse = await gerant
      .patch(`/api/gerant/tables/${creation.body.id}`)
      .send({ positionX: 'abc' });
    expect(reponse.status).toBe(400);
  });
});

describe('Suites de service', () => {
  let commandeId = '';
  let lignePlatId = '';
  let additionId = '';

  it('le gérant règle la suite par défaut de la catégorie Plats sur 2', async () => {
    const categories = await gerant.get('/api/gerant/categories');
    const plats = categories.body.find((c: { nom: string }) => c.nom === 'Plats Test');
    expect(plats.suiteParDefaut).toBe(1); // défaut initial
    const maj = await gerant.patch(`/api/gerant/categories/${plats.id}`).send({ suiteParDefaut: 2 });
    expect(maj.status).toBe(200);
    expect(maj.body.suiteParDefaut).toBe(2);
  });

  it('les lignes héritent de la suite de leur catégorie', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId,
      lignes: [
        { produitId: produitPlatId, quantite: 1 },
        { produitId: produitBoissonId, quantite: 1 },
      ],
    });
    expect(res.status).toBe(201);
    commandeId = res.body.id;
    additionId = res.body.additionId;
    expect(res.body.suiteReclamee).toBe(1);
    const plat = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Plat T');
    const boisson = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Boisson T');
    expect(plat.suite).toBe(2);
    expect(boisson.suite).toBe(1);
    lignePlatId = plat.id;
  });

  // Une vente à emporter part d'un bloc : pas de service en plusieurs temps,
  // donc pas de suite à réclamer — même si la catégorie est réglée sur 2.
  it('force la suite 1 sur une vente à emporter', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [
        { produitId: produitPlatId, quantite: 1 },
        { produitId: produitBoissonId, quantite: 1 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.lignes.every((l: { suite: number }) => l.suite === 1)).toBe(true);
    expect(res.body.suiteReclamee).toBe(1);

    // Rien à réclamer : la réclame est refusée.
    const reclame = await serveur.post(`/api/caisse/additions/${res.body.additionId}/reclamer`);
    expect(reclame.status).toBe(409);
  });

  it("corrige la suite d'une ligne (glisser-déposer côté caisse)", async () => {
    const res = await serveur.patch(`/api/caisse/lignes/${lignePlatId}/suite`).send({ suite: 3 });
    expect(res.status).toBe(200);
    const plat = res.body.lignes.find((l: { id: string }) => l.id === lignePlatId);
    expect(plat.suite).toBe(3);
  });

  // Le plan de salle doit se lire sans ouvrir les tables : montant en cours et
  // service restant à réclamer.
  it("porte le montant et l'état du service sur le plan de salle", async () => {
    const tables = await serveur.get('/api/caisse/tables');
    const t1 = tables.body.find((t: { numero: string }) => t.numero === 'T1');
    expect(t1.occupee).toBe(true);
    expect(t1.addition.id).toBe(additionId);
    expect(t1.addition.total).toBeGreaterThan(0);
    expect(t1.addition.solde).toBe(t1.addition.total); // rien d'encaissé encore
    expect(t1.addition.aReclamer).toBe(true); // le plat est en suite 3, réclamée : 1

    const libre = tables.body.find((t: { addition: unknown }) => t.addition === null);
    expect(libre.occupee).toBe(false);
  });

  it('réclame les suites de la table une à une, jamais au-delà de la dernière', async () => {
    const deux = await serveur.post(`/api/caisse/additions/${additionId}/reclamer`);
    expect(deux.status).toBe(200);
    expect(deux.body.suiteReclamee).toBe(2);
    const commande = deux.body.commandes.find((c: { id: string }) => c.id === commandeId);
    expect(commande.suiteReclamee).toBe(2);
    const trois = await serveur.post(`/api/caisse/additions/${additionId}/reclamer`);
    expect(trois.body.suiteReclamee).toBe(3);
    const trop = await serveur.post(`/api/caisse/additions/${additionId}/reclamer`);
    expect(trop.status).toBe(409);

    // Tous les services lancés : le plan n'affiche plus « à réclamer ».
    const tables = await serveur.get('/api/caisse/tables');
    const t1 = tables.body.find((t: { numero: string }) => t.numero === 'T1');
    expect(t1.addition.aReclamer).toBe(false);
  });

  it('la commande client par QR hérite aussi des suites', async () => {
    // Ce describe tourne avant celui de la commande client : on active l'option ici.
    await gerant.patch('/api/gerant/parametres').send({ commandeClientActive: true });
    const demande = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T1',
        lignes: [
          { produitId: produitPlatId, quantite: 1 },
          { produitId: produitBoissonId, quantite: 1 },
        ],
      });
    expect(demande.status).toBe(201);
    const acceptee = await serveur.post(`/api/caisse/demandes/${demande.body.id}/accepter`);
    expect(acceptee.status).toBe(201);
    const plat = acceptee.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Plat T');
    const boisson = acceptee.body.lignes.find(
      (l: { nomProduit: string }) => l.nomProduit === 'Boisson T',
    );
    expect(plat.suite).toBe(2);
    expect(boisson.suite).toBe(1);
    // On rend l'option comme on l'a trouvée : désactivée.
    await gerant.patch('/api/gerant/parametres').send({ commandeClientActive: false });
  });
});

describe('Rajouts (« la même chose en plus ») et réclame par table', () => {
  let commandeId = '';
  let additionId = '';
  let lignePlatId = '';
  let ligneBoissonId = '';

  it('prépare une commande sur une deuxième table et réclame la suite 2', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId: table2Id,
      lignes: [
        { produitId: produitPlatId, quantite: 1 },
        { produitId: produitBoissonId, quantite: 2 },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.suiteReclamee).toBe(1); // addition vierge : pas d'héritage
    commandeId = res.body.id;
    additionId = res.body.additionId;
    lignePlatId = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Plat T').id;
    ligneBoissonId = res.body.lignes.find(
      (l: { nomProduit: string }) => l.nomProduit === 'Boisson T',
    ).id;
    const reclame = await serveur.post(`/api/caisse/additions/${additionId}/reclamer`);
    expect(reclame.status).toBe(200);
    expect(reclame.body.suiteReclamee).toBe(2);
  });

  it('mélange nouveaux produits et rajouts en une seule commande, suites héritées', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId: table2Id,
      lignes: [
        { produitId: produitOptionsId, quantite: 1, options: [{ groupeOptionId, optionValeurId }] },
        { ligneSourceId: lignePlatId, quantite: 2 },
        { ligneSourceId: lignePlatId, quantite: 1 }, // trois « + » successifs se cumulent
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.id).not.toBe(commandeId);
    expect(res.body.additionId).toBe(additionId);
    expect(res.body.statut).toBe('ENVOYEE');
    // La table est déjà aux plats : la nouvelle commande part avec la même
    // progression, pas besoin de re-réclamer la suite 2.
    expect(res.body.suiteReclamee).toBe(2);
    const rajout = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Plat T');
    expect(rajout.quantite).toBe(3);
    expect(rajout.suite).toBe(2); // héritée de l'article d'origine
    const nouveau = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Plat Options');
    expect(nouveau.options).toHaveLength(1);
    expect(nouveau.suite).toBe(2); // catégorie Plats réglée sur 2 plus haut

    const liste = await serveur.get('/api/caisse/commandes');
    expect(liste.body.some((c: { id: string }) => c.id === res.body.id)).toBe(true);
  });

  it("refuse un rajout venant d'une autre addition", async () => {
    const autre = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitBoissonId, quantite: 1 }],
    });
    expect(autre.status).toBe(201);
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId: table2Id,
      lignes: [{ ligneSourceId: autre.body.lignes[0].id, quantite: 1 }],
    });
    expect(res.status).toBe(400);
  });

  it('refuse un rajout dont le produit a été retiré du menu', async () => {
    await gerant.patch(`/api/gerant/produits/${produitBoissonId}`).send({ statut: 'INACTIF' });
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'SUR_PLACE',
      tableId: table2Id,
      lignes: [{ ligneSourceId: ligneBoissonId, quantite: 1 }],
    });
    expect(res.status).toBe(409);
    await gerant.patch(`/api/gerant/produits/${produitBoissonId}`).send({ statut: 'ACTIF' });
  });

  it('la route publique refuse les rajouts (réservés à la caisse)', async () => {
    const res = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T2',
        lignes: [{ ligneSourceId: lignePlatId, quantite: 1 }],
      });
    expect(res.status).toBe(400);
  });

  it('« à suivre » : la suite explicite de la caisse prime sur la catégorie', async () => {
    const res = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [
        { produitId: produitPlatId, quantite: 1, suite: 1 }, // plat servi en premier
        { produitId: produitBoissonId, quantite: 1 }, // sans suite : celle de la catégorie
      ],
    });
    expect(res.status).toBe(201);
    const plat = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Plat T');
    expect(plat.suite).toBe(1); // la catégorie dit 2, la saisie dit 1
    const boisson = res.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === 'Boisson T');
    expect(boisson.suite).toBe(1);

    const invalide = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [{ produitId: produitPlatId, quantite: 1, suite: 9 }],
    });
    expect(invalide.status).toBe(400);
  });

  it('la route publique refuse aussi le champ suite', async () => {
    const res = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T2',
        lignes: [{ produitId: produitPlatId, quantite: 1, suite: 1 }],
      });
    expect(res.status).toBe(400);
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

// Pendant une coupure, le serveur peut offrir un article, accorder une remise
// et faire payer chacun sa part. Tout part dans une file locale et se rejoue au
// retour du réseau : ce bloc vérifie qu'un rejeu n'applique jamais deux fois le
// même geste ni le même encaissement.
describe('Gestes commerciaux et paiement par article hors ligne', () => {
  const cleOffert = `test-hl-offert-${Date.now()}`;
  const cleRemise = `test-hl-remise-${Date.now()}`;
  const clePaiement = `test-hl-articles-${Date.now()}`;
  const horsLigneIlYA20Min = () => new Date(Date.now() - 20 * 60_000).toISOString();
  let additionId = '';
  let lignePlatId = '';
  let ligneBoissonId = '';

  it('prépare une addition à emporter (2 plats + 2 boissons)', async () => {
    const commande = await serveur.post('/api/caisse/commandes').send({
      canal: 'EMPORTER',
      lignes: [
        { produitId: produitPlatId, quantite: 2 },
        { produitId: produitBoissonId, quantite: 2 },
      ],
    });
    expect(commande.status).toBe(201);
    additionId = commande.body.additionId;
    const ligne = (nom: string) =>
      commande.body.lignes.find((l: { nomProduit: string }) => l.nomProduit === nom).id as string;
    lignePlatId = ligne('Plat T');
    ligneBoissonId = ligne('Boisson T');
  });

  it('refuse une date de geste hors ligne aberrante', async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/offert`).send({
      lignes: [{ ligneCommandeId: ligneBoissonId, quantite: 1 }],
      motif: 'Client fidèle',
      cleIdempotence: `${cleOffert}-refuse`,
      creeLeHorsLigne: new Date(Date.now() + 3 * 60 * 60_000).toISOString(),
    });
    expect(res.status).toBe(400);
  });

  it('offre un article hors ligne, et le rejeu ne l’offre pas deux fois', async () => {
    const premier = await serveur.post(`/api/caisse/additions/${additionId}/offert`).send({
      lignes: [{ ligneCommandeId: ligneBoissonId, quantite: 1 }],
      motif: 'Attente trop longue',
      cleIdempotence: cleOffert,
      creeLeHorsLigne: horsLigneIlYA20Min(),
    });
    expect(premier.status).toBe(201);
    const soldeApresOffert = premier.body.soldeRestant;

    const rejeu = await serveur.post(`/api/caisse/additions/${additionId}/offert`).send({
      lignes: [{ ligneCommandeId: ligneBoissonId, quantite: 1 }],
      motif: 'Attente trop longue',
      cleIdempotence: cleOffert,
    });
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.soldeRestant).toBe(soldeApresOffert);

    const ligne = await prisma.ligneCommande.findUniqueOrThrow({ where: { id: ligneBoissonId } });
    expect(ligne.quantiteOfferte).toBe(1);
    expect(await prisma.remise.count({ where: { cleIdempotence: cleOffert } })).toBe(1);
  });

  it("garde l'heure réelle du geste, pas celle de la synchronisation", async () => {
    const remise = await prisma.remise.findUniqueOrThrow({ where: { cleIdempotence: cleOffert } });
    expect(Date.now() - remise.creeLe.getTime()).toBeGreaterThan(15 * 60_000);
  });

  it('accorde une remise hors ligne, et le rejeu ne la double pas', async () => {
    const premier = await serveur.post(`/api/caisse/additions/${additionId}/remise`).send({
      mode: 'MONTANT',
      valeur: 100,
      motif: 'Geste commercial',
      cleIdempotence: cleRemise,
      creeLeHorsLigne: horsLigneIlYA20Min(),
    });
    expect(premier.status).toBe(201);
    const soldeApresRemise = premier.body.soldeRestant;

    const rejeu = await serveur.post(`/api/caisse/additions/${additionId}/remise`).send({
      mode: 'MONTANT',
      valeur: 100,
      motif: 'Geste commercial',
      cleIdempotence: cleRemise,
    });
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.montant).toBe(100);
    expect(rejeu.body.soldeRestant).toBe(soldeApresRemise);
    expect(await prisma.remise.count({ where: { cleIdempotence: cleRemise } })).toBe(1);
  });

  it('encaisse par article hors ligne, et le rejeu ne double pas le paiement', async () => {
    const premier = await serveur.post(`/api/caisse/additions/${additionId}/paiements`).send({
      mode: 'ARTICLES',
      lignes: [{ ligneCommandeId: lignePlatId, quantite: 1 }],
      moyenPaiement: 'ESPECES',
      cleIdempotence: clePaiement,
      creeLeHorsLigne: horsLigneIlYA20Min(),
    });
    expect(premier.status).toBe(201);

    const rejeu = await serveur.post(`/api/caisse/additions/${additionId}/paiements`).send({
      mode: 'ARTICLES',
      lignes: [{ ligneCommandeId: lignePlatId, quantite: 1 }],
      moyenPaiement: 'ESPECES',
      cleIdempotence: clePaiement,
    });
    expect(rejeu.status).toBe(200);
    expect(rejeu.body.id).toBe(premier.body.id);

    const ligne = await prisma.ligneCommande.findUniqueOrThrow({ where: { id: lignePlatId } });
    expect(ligne.quantitePayee).toBe(1);
    expect(await prisma.paiement.count({ where: { cleIdempotence: clePaiement } })).toBe(1);
  });

  it('refuse de payer un article déjà offert', async () => {
    const res = await serveur.post(`/api/caisse/additions/${additionId}/paiements`).send({
      mode: 'ARTICLES',
      lignes: [{ ligneCommandeId: ligneBoissonId, quantite: 2 }],
      moyenPaiement: 'ESPECES',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('reste 1');
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

describe('Commande client depuis le QR', () => {
  let demandeId = '';
  let demandeARefuserId = '';

  it("refuse tant que le gérant n'a pas activé la commande client", async () => {
    const res = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T1',
        lignes: [{ produitId: produitBoissonId, quantite: 1 }],
      });
    expect(res.status).toBe(403);
  });

  it('le gérant active la commande client depuis ses paramètres', async () => {
    const res = await gerant.patch('/api/gerant/parametres').send({ commandeClientActive: true });
    expect(res.status).toBe(200);
    expect(res.body.commandeClientActive).toBe(true);
    const menu = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(menu.body.commandeClientActive).toBe(true);
  });

  it('valide les options obligatoires dès la demande', async () => {
    const res = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T1',
        lignes: [{ produitId: produitOptionsId, quantite: 1 }],
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Choix');
  });

  it('crée une demande en attente avec le bon total', async () => {
    const res = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T1',
        lignes: [
          { produitId: produitPlatId, quantite: 2 },
          { produitId: produitBoissonId, quantite: 1 },
        ],
        note: 'Sans oignons svp',
      });
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(2200); // 2 × 1000 + 200
    demandeId = res.body.id;

    const seconde = await request(app)
      .post('/api/public/commandes')
      .send({
        etablissementId,
        tableNumero: 'T1',
        lignes: [{ produitId: produitBoissonId, quantite: 1 }],
      });
    demandeARefuserId = seconde.body.id;
  });

  it('la caisse voit les demandes résolues contre le menu', async () => {
    const res = await serveur.get('/api/caisse/demandes');
    expect(res.status).toBe(200);
    const demande = res.body.find((d: { id: string }) => d.id === demandeId);
    expect(demande.table.numero).toBe('T1');
    expect(demande.total).toBe(2200);
    expect(demande.note).toBe('Sans oignons svp');
    expect(demande.lignes.map((l: { nomProduit: string }) => l.nomProduit)).toContain('Plat T');
  });

  it("l'acceptation crée une vraie commande en cuisine, une seule fois", async () => {
    const res = await serveur.post(`/api/caisse/demandes/${demandeId}/accepter`);
    expect(res.status).toBe(201);
    expect(res.body.canal).toBe('SUR_PLACE');
    expect(res.body.table.numero).toBe('T1');
    expect(res.body.total).toBe(2200);
    expect(res.body.noteCuisine).toContain('Sans oignons');

    const liste = await serveur.get('/api/caisse/commandes');
    expect(liste.body.map((c: { id: string }) => c.id)).toContain(res.body.id);

    const rejeu = await serveur.post(`/api/caisse/demandes/${demandeId}/accepter`);
    expect(rejeu.status).toBe(409);
  });

  it('le refus est tracé et la demande disparaît de la liste', async () => {
    const res = await serveur.post(`/api/caisse/demandes/${demandeARefuserId}/refuser`);
    expect(res.status).toBe(204);
    const liste = await serveur.get('/api/caisse/demandes');
    expect(liste.body.map((d: { id: string }) => d.id)).not.toContain(demandeARefuserId);
    const enBase = await prisma.demandeClient.findUnique({ where: { id: demandeARefuserId } });
    expect(enBase?.statut).toBe('REFUSEE');
  });
});

// Le client réserve lui-même depuis le menu QR. La réservation est confirmée
// sur-le-champ : ce qui la borne, ce sont les limites du gérant et le plan de
// salle — on ne peut pas réserver plus de tables qu'il n'en existe.
describe('Réservation en ligne depuis le QR', () => {
  // Un créneau lointain, à l'écart de celui des réservations prises à la caisse
  // par les tests précédents : ici, les deux tables doivent être libres.
  const creneau = (decalageJours = 10) =>
    new Date(Date.now() + decalageJours * 24 * 60 * 60_000).toISOString();
  const clientType = { nomClient: 'Client QR', telephone: '0550 99 88 77', nombreCouverts: 2 };
  let tableAttribuee = '';

  it("refuse tant que le gérant n'a pas ouvert la réservation en ligne", async () => {
    const res = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId, ...clientType, date: creneau() });
    expect(res.status).toBe(403);
  });

  it('le gérant ouvre la réservation en ligne et fixe ses limites', async () => {
    const res = await gerant.patch('/api/gerant/parametres').send({
      reservationEnLigneActive: true,
      reservationCouvertsMax: 4,
      reservationDelaiMinMinutes: 120,
      reservationHorizonJours: 30,
    });
    expect(res.status).toBe(200);
    expect(res.body.reservationEnLigneActive).toBe(true);

    // Les limites descendent avec le menu, pour que le formulaire les applique
    // avant même d'envoyer quoi que ce soit.
    const menu = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(menu.body.reservationEnLigne).toEqual({
      couvertsMax: 4,
      delaiMinMinutes: 120,
      horizonJours: 30,
    });
  });

  it('refuse une valeur de réglage hors bornes', async () => {
    const res = await gerant.patch('/api/gerant/parametres').send({ reservationCouvertsMax: 0 });
    expect(res.status).toBe(400);
  });

  it('exige un téléphone : sans lui, le restaurant ne peut pas rappeler', async () => {
    const res = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId, nomClient: 'Sans Téléphone', nombreCouverts: 2, date: creneau() });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('téléphone');
  });

  it('refuse hors des limites du gérant, en disant quoi faire à la place', async () => {
    const tropGrand = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId, ...clientType, nombreCouverts: 12, date: creneau() });
    expect(tropGrand.status).toBe(400);
    expect(tropGrand.body.error).toContain('4 personnes');

    // Dans une heure : en deçà des deux heures de préavis exigées.
    const tropTot = await request(app)
      .post('/api/public/reservations')
      .send({
        etablissementId,
        ...clientType,
        date: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
    expect(tropTot.status).toBe(400);
    expect(tropTot.body.error).toContain("2 heures à l'avance");

    const tropLoin = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId, ...clientType, date: creneau(60) });
    expect(tropLoin.status).toBe(400);
    expect(tropLoin.body.error).toContain('30 jours');
  });

  it('attribue la plus petite table qui convient, puis se déclare complet', async () => {
    const date = creneau();
    // Le plan de salle du compte de test, tel que les blocs précédents l'ont
    // laissé : le test se déduit de la salle réelle plutôt que d'un nombre de
    // tables figé qu'un autre test pourrait faire mentir.
    const accueillantes = await prisma.table.findMany({
      where: { etablissementId, statut: 'ACTIF', nombreCouverts: { gte: 2 } },
      orderBy: [{ nombreCouverts: 'asc' }, { numero: 'asc' }],
    });
    expect(accueillantes.length).toBeGreaterThanOrEqual(2);

    // La plus petite table qui tient deux personnes, pas la première venue :
    // bloquer une grande table pour deux, c'est refuser le groupe qui
    // appellera juste après.
    const premiere = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId, ...clientType, date, email: 'client.qr@test-auto.maida' });
    expect(premiere.status).toBe(201);
    expect(premiere.body.table).toBe(accueillantes[0].numero);
    expect(premiere.body.confirmationEnvoyee).toBe(true);
    tableAttribuee = premiere.body.table;

    // On sature le créneau : une réservation par table restante, dans l'ordre
    // du plus petit au plus grand.
    for (const table of accueillantes.slice(1)) {
      const suivante = await request(app)
        .post('/api/public/reservations')
        .send({ etablissementId, ...clientType, nomClient: `Client QR ${table.numero}`, date });
      expect(suivante.status).toBe(201);
      expect(suivante.body.table).toBe(table.numero);
      expect(suivante.body.confirmationEnvoyee).toBe(false);
    }

    // Plus une seule table à donner sur ce créneau.
    const enTrop = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId, ...clientType, nomClient: 'Client QR en trop', date });
    expect(enTrop.status).toBe(409);
    expect(enTrop.body.error).toContain('autre créneau');

    // Une heure plus tard, le créneau chevauche encore (2 h d'occupation).
    const chevauchante = await request(app)
      .post('/api/public/reservations')
      .send({
        etablissementId,
        ...clientType,
        nomClient: 'Client Chevauchant',
        date: new Date(new Date(date).getTime() + 60 * 60_000).toISOString(),
      });
    expect(chevauchante.status).toBe(409);
  });

  it('la caisse la voit comme les autres, mais sans personne qui l’ait prise', async () => {
    const debut = new Date(Date.now() + 9 * 24 * 60 * 60_000).toISOString();
    const fin = new Date(Date.now() + 11 * 24 * 60 * 60_000).toISOString();
    const res = await serveur.get(`/api/caisse/reservations?debut=${debut}&fin=${fin}`);
    expect(res.status).toBe(200);

    const enLigne = res.body.find((r: { nomClient: string }) => r.nomClient === 'Client QR');
    expect(enLigne.statut).toBe('A_VENIR');
    expect(enLigne.telephone).toBe('0550 99 88 77');
    expect(enLigne.table.numero).toBe(tableAttribuee);
    // Personne n'a décroché : c'est ce nul qui distingue les deux origines.
    expect(enLigne.prisePar).toBeNull();

    // Et elle reste modifiable par la caisse comme n'importe quelle autre.
    const arrivee = await serveur
      .patch(`/api/caisse/reservations/${enLigne.id}`)
      .send({ nombreCouverts: 3 });
    expect(arrivee.status).toBe(200);
    expect(arrivee.body.nombreCouverts).toBe(3);
  });

  it('ne réserve rien chez un établissement inconnu', async () => {
    const res = await request(app)
      .post('/api/public/reservations')
      .send({ etablissementId: 'inconnu-xyz', ...clientType, date: creneau() });
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!identifiantsAdmin)('Module food cost activable', () => {
  const admin = request.agent(app);

  it('par défaut : module accordé et suivi actif', async () => {
    const res = await gerant.get('/api/gerant/parametres');
    expect(res.status).toBe(200);
    expect(res.body.moduleFoodCost).toBe(true);
    expect(res.body.moduleQrMenu).toBe(true);
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

  it('module QR menu : retiré → menu public coupé, réaccordé → rétabli', async () => {
    // À ce stade le compte n'a que FOOD_COST (retiré au test précédent) : menu coupé.
    const coupe = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(coupe.status).toBe(404);
    const parametres = await gerant.get('/api/gerant/parametres');
    expect(parametres.body.moduleQrMenu).toBe(false);

    await admin
      .patch(`/api/admin/comptes-clients/${compteClientId}`)
      .send({ modules: ['FOOD_COST', 'QR_MENU'] });
    const retabli = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(retabli.status).toBe(200);
    const parametresApres = await gerant.get('/api/gerant/parametres');
    expect(parametresApres.body.moduleQrMenu).toBe(true);
  });
});

describe('Gestion du stock (ruptures et quantités)', () => {
  // On rétablit la boisson à son état par défaut après ce bloc.
  afterAll(async () => {
    await prisma.produit.update({
      where: { id: produitBoissonId },
      data: { disponible: true, suiviQuantite: false, quantiteRestante: null },
    });
  });

  it('refuse la gestion du stock sans le droit GERER_STOCK', async () => {
    const res = await serveurSans
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ disponible: false });
    expect(res.status).toBe(403);
  });

  it('permet la rupture avec le droit, et la commande est alors bloquée', async () => {
    const rupture = await serveur
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ disponible: false });
    expect(rupture.status).toBe(200);
    expect(rupture.body.disponible).toBe(false);

    const commande = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', tableId, lignes: [{ produitId: produitBoissonId, quantite: 1 }] });
    expect(commande.status).toBe(400);

    const retour = await serveur
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ disponible: true });
    expect(retour.status).toBe(200);
  });

  it('décompte la quantité à l’envoi et refuse quand le stock est épuisé', async () => {
    const init = await serveur
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ suiviQuantite: true, quantiteRestante: 2 });
    expect(init.status).toBe(200);

    const c1 = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', tableId, lignes: [{ produitId: produitBoissonId, quantite: 2 }] });
    expect(c1.status).toBe(201);

    const menu = await serveur.get('/api/caisse/menu');
    const boisson = menu.body
      .flatMap(
        (cat: { produits: Array<{ id: string; quantiteRestante: number | null }> }) => cat.produits,
      )
      .find((p: { id: string }) => p.id === produitBoissonId);
    expect(boisson.quantiteRestante).toBe(0);

    const c2 = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', tableId, lignes: [{ produitId: produitBoissonId, quantite: 1 }] });
    expect(c2.status).toBe(400);
  });

  it('rend la quantité au stock quand on annule avant préparation', async () => {
    await serveur
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ suiviQuantite: true, quantiteRestante: 5 });

    const commande = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', tableId, lignes: [{ produitId: produitBoissonId, quantite: 2 }] });
    expect(commande.status).toBe(201);
    const apresEnvoi = await prisma.produit.findUnique({ where: { id: produitBoissonId } });
    expect(apresEnvoi?.quantiteRestante).toBe(3);

    const annulation = await serveur
      .post(`/api/caisse/commandes/${commande.body.id}/annulation`)
      .send({ portee: 'COMMANDE', motif: 'test retour stock' });
    expect(annulation.status).toBe(201);
    const apresAnnulation = await prisma.produit.findUnique({ where: { id: produitBoissonId } });
    expect(apresAnnulation?.quantiteRestante).toBe(5);
  });

  // Le serveur déclare lui-même que la cuisine avait lancé le plat : perte
  // sèche au rapport, et rien ne revient en stock.
  it('garde la quantité perdue quand le serveur déclare le plat déjà préparé', async () => {
    await serveur
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ suiviQuantite: true, quantiteRestante: 4 });

    const commande = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', tableId, lignes: [{ produitId: produitBoissonId, quantite: 2 }] });
    expect(commande.status).toBe(201);

    const annulation = await serveur
      .post(`/api/caisse/commandes/${commande.body.id}/annulation`)
      .send({ portee: 'COMMANDE', motif: 'Client parti', apresPreparation: true });
    expect(annulation.status).toBe(201);

    const apres = await prisma.produit.findUnique({ where: { id: produitBoissonId } });
    expect(apres?.quantiteRestante).toBe(2); // perdu, pas rendu au stock

    const historique = await gerant.get('/api/gerant/annulations');
    expect(historique.body[0].apresPreparation).toBe(true);
    expect(historique.body[0].motif).toBe('Client parti');
  });

  it("refuse un indicateur « déjà préparé » qui n'est pas un booléen", async () => {
    const commande = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'SUR_PLACE', tableId, lignes: [{ produitId: produitPlatId, quantite: 1 }] });
    const res = await serveur
      .post(`/api/caisse/commandes/${commande.body.id}/annulation`)
      .send({ portee: 'COMMANDE', motif: 'Test', apresPreparation: 'oui' });
    expect(res.status).toBe(400);
  });

  it('masque les produits épuisés dans le menu public (QR)', async () => {
    await serveur
      .patch(`/api/caisse/produits/${produitBoissonId}/stock`)
      .send({ disponible: false, suiviQuantite: false });
    const menu = await request(app).get(`/api/public/menu/${etablissementId}`);
    expect(menu.status).toBe(200);
    const ids = menu.body.categories
      .flatMap((c: { produits: Array<{ id: string }> }) => c.produits)
      .map((p: { id: string }) => p.id);
    expect(ids).not.toContain(produitBoissonId);
  });
});

// L'écran « Équipe » propose un bouton par droit de l'énumération : chacun doit
// être réellement attribuable. GERER_STOCK ne l'était pas — la liste des droits
// acceptés par l'API avait été oubliée à l'ajout du droit, et le gérant
// recevait « Droits invalides ».
describe('Droits attribués par le gérant', () => {
  async function idServeurSansDroit() {
    const res = await gerant.get('/api/gerant/serveurs');
    expect(res.status).toBe(200);
    const cible = res.body.find((s: { prenom: string }) => s.prenom === 'SansDroit');
    expect(cible).toBeDefined();
    return cible.id as string;
  }

  it('accepte chaque droit proposé par l’application', async () => {
    const id = await idServeurSansDroit();
    for (const droit of ['ANNULER', 'CLOTURER', 'REMISER', 'GERER_STOCK']) {
      const res = await gerant.patch(`/api/gerant/serveurs/${id}/droits`).send({ droits: [droit] });
      expect(res.status).toBe(200);
      expect(res.body.droits).toEqual([droit]);
    }
    // On rend le serveur à son état d'origine : d'autres blocs comptent dessus.
    const remise = await gerant.patch(`/api/gerant/serveurs/${id}/droits`).send({ droits: [] });
    expect(remise.status).toBe(200);
    expect(remise.body.droits).toHaveLength(0);
  });

  it('refuse un droit inconnu', async () => {
    const id = await idServeurSansDroit();
    const res = await gerant
      .patch(`/api/gerant/serveurs/${id}/droits`)
      .send({ droits: ['TOUT_POUVOIR'] });
    expect(res.status).toBe(400);
  });
});

// Un vrai client s'appellera « Le Café Étoilé » et servira des « crèmes
// brûlées » rue des « Frères Boudjema ». L'établissement de démo a été créé
// avec une adresse cassée (« Fr?res ») : on verrouille ici tout le chemin, de
// la saisie du gérant jusqu'aux données du ticket, pour que ça ne se
// reproduise pas chez un client payant.
describe('Caractères accentués et non latins', () => {
  const NOM_CATEGORIE = 'Desserts & douceurs';
  const NOM_PRODUIT = 'Crème brûlée à l’œuf';
  const NOM_ARABE = 'مطعم الأصالة';
  const NOM_ETABLISSEMENT = 'Le Café Étoilé';
  const ADRESSE = '12 rue des Frères Boudjema, Château-Neuf';

  let categorieAccentsId = '';
  let produitAccentsId = '';

  it('conserve les accents de la saisie du gérant à la relecture', async () => {
    const categorie = await gerant.post('/api/gerant/categories').send({ nom: NOM_CATEGORIE });
    expect(categorie.status).toBe(201);
    expect(categorie.body.nom).toBe(NOM_CATEGORIE);
    categorieAccentsId = categorie.body.id;

    const produit = await gerant
      .post('/api/gerant/produits')
      .send({ nom: NOM_PRODUIT, prix: 450, categorieId: categorieAccentsId });
    expect(produit.status).toBe(201);
    expect(produit.body.nom).toBe(NOM_PRODUIT);
    produitAccentsId = produit.body.id;

    // En base, sans passer par la couche HTTP.
    const enBase = await prisma.produit.findUniqueOrThrow({ where: { id: produitAccentsId } });
    expect(enBase.nom).toBe(NOM_PRODUIT);
  });

  it('sert les accents intacts à la caisse et au menu public (QR)', async () => {
    const menuCaisse = await serveur.get('/api/caisse/menu');
    expect(menuCaisse.headers['content-type']).toMatch(/charset=utf-8/i);
    const produitCaisse = menuCaisse.body
      .flatMap((c: { produits: Array<{ id: string; nom: string }> }) => c.produits)
      .find((p: { id: string }) => p.id === produitAccentsId);
    expect(produitCaisse?.nom).toBe(NOM_PRODUIT);

    const menuPublic = await request(app).get(`/api/public/menu/${etablissementId}`);
    const produitPublic = menuPublic.body.categories
      .flatMap((c: { produits: Array<{ id: string; nom: string }> }) => c.produits)
      .find((p: { id: string }) => p.id === produitAccentsId);
    expect(produitPublic?.nom).toBe(NOM_PRODUIT);
  });

  // Le nom du produit est figé sur la ligne de commande : c'est lui qui
  // s'imprime sur le bon cuisine et le ticket client, des mois plus tard.
  it('fige les accents dans les données du ticket', async () => {
    const commande = await serveur
      .post('/api/caisse/commandes')
      .send({ canal: 'EMPORTER', lignes: [{ produitId: produitAccentsId, quantite: 1 }] });
    expect(commande.status).toBe(201);
    expect(commande.body.lignes[0].nomProduit).toBe(NOM_PRODUIT);

    const addition = await serveur.get(`/api/caisse/additions/${commande.body.additionId}`);
    expect(addition.body.commandes[0].lignes[0].nomProduit).toBe(NOM_PRODUIT);
  });

  it("conserve les accents de l'en-tête d'établissement imprimée sur les tickets", async () => {
    const avant = await prisma.etablissement.findUniqueOrThrow({ where: { id: etablissementId } });
    await prisma.etablissement.update({
      where: { id: etablissementId },
      data: { nom: NOM_ETABLISSEMENT, adresse: ADRESSE, ville: 'Aïn Témouchent' },
    });

    const entete = await serveur.get('/api/caisse/etablissement');
    expect(entete.body.nom).toBe(NOM_ETABLISSEMENT);
    expect(entete.body.adresse).toBe(ADRESSE);
    expect(entete.body.ville).toBe('Aïn Témouchent');

    await prisma.etablissement.update({
      where: { id: etablissementId },
      data: { nom: avant.nom, adresse: avant.adresse, ville: avant.ville },
    });
  });

  // Le marché algérien nomme aussi ses établissements en arabe.
  it('accepte les caractères non latins', async () => {
    const maj = await gerant.patch(`/api/gerant/produits/${produitAccentsId}`).send({
      nom: NOM_ARABE,
    });
    expect(maj.status).toBe(200);
    expect(maj.body.nom).toBe(NOM_ARABE);

    const enBase = await prisma.produit.findUniqueOrThrow({ where: { id: produitAccentsId } });
    expect(enBase.nom).toBe(NOM_ARABE);
  });
});

// La base de production héberge la vitrine publique ET, à terme, de vrais
// restaurants. Le seed de démo efface pour reconstruire : ces tests vérifient
// qu'il ne peut atteindre que la vitrine.
describe('Frontière entre la démonstration et les vrais clients', () => {
  let compteVitrineId = '';
  let etabVitrineId = '';

  // Une fausse vitrine jetable : on ne touche pas au vrai compte de démo de la
  // base de développement, que Mourad utilise pour travailler.
  beforeAll(async () => {
    const compte = await prisma.compteClient.create({
      data: { nomEnseigne: 'VITRINE-TEST', demo: true },
    });
    compteVitrineId = compte.id;
    const etab = await prisma.etablissement.create({
      data: { nom: 'Vitrine Test', codeTerminal: 'VTRNTEST', compteClientId: compte.id },
    });
    etabVitrineId = etab.id;
    const categorie = await prisma.categorie.create({
      data: { nom: 'Vitrine', etablissementId: etab.id },
    });
    await prisma.produit.create({
      data: { nom: 'Plat vitrine', prix: 100, categorieId: categorie.id, etablissementId: etab.id },
    });
    await prisma.table.create({
      data: { numero: 'V1', nombreCouverts: 2, etablissementId: etab.id },
    });
  }, 60_000);

  afterAll(async () => {
    await prisma.produit.deleteMany({ where: { etablissementId: etabVitrineId } });
    await prisma.categorie.deleteMany({ where: { etablissementId: etabVitrineId } });
    await prisma.table.deleteMany({ where: { etablissementId: etabVitrineId } });
    await prisma.etablissement.deleteMany({ where: { compteClientId: compteVitrineId } });
    await prisma.compteClient.delete({ where: { id: compteVitrineId } });
  }, 60_000);

  it('un compte client est un vrai client par défaut, jamais une démo', async () => {
    const compteTest = await prisma.compteClient.findUniqueOrThrow({
      where: { id: compteClientId },
    });
    expect(compteTest.demo).toBe(false);
  });

  // Sans ce garde-fou, rafraîchir la démo sur la base de production effacerait
  // le chiffre d'affaires du premier vrai restaurant.
  it('signale les comptes réels qui interdisent un rafraîchissement aveugle', async () => {
    const reels = await comptesReels(prisma);
    const noms = reels.map((c) => c.nomEnseigne);
    expect(noms).toContain(NOM_COMPTE_TEST);
    expect(noms).not.toContain('VITRINE-TEST');
  });

  it('la purge de la démo efface la vitrine et épargne le vrai client', async () => {
    // Le compte de test porte des commandes créées par les tests précédents.
    const avant = await prisma.commande.count({ where: { etablissementId } });
    expect(avant).toBeGreaterThan(0);

    await purgerDonneesDemo(prisma);

    // La vitrine est vidée…
    expect(await prisma.produit.count({ where: { etablissementId: etabVitrineId } })).toBe(0);
    expect(await prisma.table.count({ where: { etablissementId: etabVitrineId } })).toBe(0);
    // …mais le compte lui-même survit : le seed le repeuple ensuite.
    expect(await prisma.compteClient.count({ where: { id: compteVitrineId } })).toBe(1);

    // Et le vrai client n'a rien perdu.
    expect(await prisma.commande.count({ where: { etablissementId } })).toBe(avant);
    expect(await prisma.produit.count({ where: { etablissementId } })).toBeGreaterThan(0);
    expect(await prisma.table.count({ where: { etablissementId } })).toBeGreaterThan(0);
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
    // Le code d'installation ne rattache plus aucune tablette
    const rattachement = await request(app)
      .post('/api/auth/terminal')
      .send({ code: CODE_TERMINAL_TEST });
    expect(rattachement.status).toBe(404);
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

// La tablette se rattache une fois par code, au lieu de choisir son restaurant
// dans une liste que n'importe qui pouvait lire.
describe("Rattachement de la tablette par code d'installation", () => {
  it("l'ancienne liste publique des établissements n'existe plus", async () => {
    const res = await request(app).get('/api/auth/etablissements');
    expect(res.status).toBe(404);
  });

  it('accepte le code quelle que soit la façon de le recopier', async () => {
    for (const saisie of [CODE_TERMINAL_TEST, ' test-auto ', 'Test Auto']) {
      const res = await request(app).post('/api/auth/terminal').send({ code: saisie });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ id: etablissementId, nom: 'Resto Test', ville: 'Testville' });
    }
  });

  it('refuse un code inconnu sans rien laisser deviner', async () => {
    const res = await request(app).post('/api/auth/terminal').send({ code: 'ZZZZ9999' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Code d'installation inconnu");
  });

  it('le gérant lit son code et le régénère quand une tablette est perdue', async () => {
    const parametres = await gerant.get('/api/gerant/parametres');
    expect(parametres.body.codeTerminal).toBe('TEST-AUTO');

    const regenere = await gerant.post('/api/gerant/terminal/code');
    expect(regenere.status).toBe(200);
    expect(regenere.body.codeTerminal).not.toBe('TEST-AUTO');

    // L'ancien code est mort, le nouveau rattache.
    const ancien = await request(app).post('/api/auth/terminal').send({ code: CODE_TERMINAL_TEST });
    expect(ancien.status).toBe(404);
    const nouveau = await request(app)
      .post('/api/auth/terminal')
      .send({ code: regenere.body.codeTerminal });
    expect(nouveau.body.id).toBe(etablissementId);

    await prisma.etablissement.update({
      where: { id: etablissementId },
      data: { codeTerminal: CODE_TERMINAL_TEST },
    });
  });
});

describe('Journal des connexions et révocation immédiate', () => {
  it('trace les tentatives sans jamais enregistrer le code saisi', async () => {
    await request(app).post('/api/auth/login-pin').send({ etablissementId, codePin: '0000' });
    await request(app).post('/api/auth/login-pin').send({ etablissementId, codePin: PIN_SERVEUR_SANS });

    const entrees = await prisma.connexionJournal.findMany({
      where: { etablissementId },
      orderBy: { creeLe: 'desc' },
      take: 2,
    });
    expect(entrees[0].resultat).toBe('REUSSIE');
    expect(entrees[0].acteur).toBe('SansDroit Test');
    expect(entrees[0].etablissement).toBe('Resto Test');
    expect(entrees[1].resultat).toBe('IDENTIFIANTS_INVALIDES');
    // Un journal qui contiendrait les codes essayés serait pire que pas de
    // journal. On inspecte les champs de texte libre — pas le JSON entier :
    // un identifiant tiré au hasard peut contenir « 0000 » par pure malchance,
    // et faisait alors échouer ce test sans qu'aucun code n'ait fuité.
    const texteLibre = entrees.flatMap((e) => [e.acteur, e.etablissement, e.ip, e.navigateur]);
    for (const valeur of texteLibre) {
      expect(valeur ?? '').not.toContain(PIN_SERVEUR_SANS);
      expect(valeur ?? '').not.toContain('0000');
    }
  });

  it("un serveur désactivé perd la main sans attendre l'expiration de son jeton", async () => {
    const sansDroit = await prisma.utilisateur.findFirstOrThrow({
      where: { etablissementId, prenom: 'SansDroit' },
    });
    expect((await serveurSans.get('/api/caisse/menu')).status).toBe(200);

    await prisma.utilisateur.update({
      where: { id: sansDroit.id },
      data: { statut: 'DESACTIVE' },
    });
    expect((await serveurSans.get('/api/caisse/menu')).status).toBe(401);

    await prisma.utilisateur.update({ where: { id: sansDroit.id }, data: { statut: 'ACTIF' } });
    expect((await serveurSans.get('/api/caisse/menu')).status).toBe(200);
  });
});

describe.skipIf(!identifiantsAdmin)('Journal des connexions vu par le super-admin', () => {
  const admin = request.agent(app);

  it('liste les connexions et sait isoler les échecs', async () => {
    const login = await admin.post('/api/auth/login').send({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);

    const toutes = await admin.get('/api/admin/connexions');
    expect(toutes.status).toBe(200);
    expect(toutes.body.length).toBeGreaterThan(0);

    const echecs = await admin.get('/api/admin/connexions?echecs=true');
    expect(echecs.status).toBe(200);
    expect(echecs.body.length).toBeGreaterThan(0);
    expect(echecs.body.every((c: { resultat: string }) => c.resultat !== 'REUSSIE')).toBe(true);
  });
});

// Placé en dernier : ces tests changent le mot de passe du gérant et coupent sa
// session. L'état est rendu à la fin, mais rien ne doit s'exécuter entre-temps.
describe('Mot de passe oublié', () => {
  const NOUVEAU_MDP = 'nouveau-mdp-test-1234';
  let gerantId = '';

  beforeAll(async () => {
    const g = await prisma.utilisateur.findUniqueOrThrow({ where: { email: EMAIL_GERANT } });
    gerantId = g.id;
  });

  afterAll(async () => {
    // Remise en état : le mot de passe d'origine et une session gérant valide,
    // pour ne rien laisser de cassé derrière ces tests.
    await prisma.utilisateur.update({
      where: { id: gerantId },
      data: {
        motDePasseHash: await bcrypt.hash(MDP_GERANT, 12),
        sessionsInvalidesAvant: null,
      },
    });
    await gerant.post('/api/auth/login').send({ email: EMAIL_GERANT, password: MDP_GERANT });
  });

  it("répond la même chose que l'adresse existe ou non", async () => {
    const inconnue = await request(app)
      .post('/api/auth/mot-de-passe-oublie')
      .send({ email: 'personne@nulle-part.dz' });
    const connue = await request(app)
      .post('/api/auth/mot-de-passe-oublie')
      .send({ email: EMAIL_GERANT });

    expect(inconnue.status).toBe(200);
    expect(connue.status).toBe(200);
    expect(connue.body).toEqual(inconnue.body);

    // Seule l'adresse connue a réellement produit une demande.
    expect(await prisma.jetonReinitialisation.count({ where: { utilisateurId: gerantId } })).toBe(1);
  });

  it("accepte l'adresse quelle que soit la casse, et remplace la demande précédente", async () => {
    const premier = await prisma.jetonReinitialisation.findFirstOrThrow({
      where: { utilisateurId: gerantId },
    });

    const res = await request(app)
      .post('/api/auth/mot-de-passe-oublie')
      .send({ email: EMAIL_GERANT.toUpperCase() });
    expect(res.status).toBe(200);

    const jetons = await prisma.jetonReinitialisation.findMany({
      where: { utilisateurId: gerantId },
    });
    expect(jetons).toHaveLength(1);
    expect(jetons[0].jeton).not.toBe(premier.jeton);

    // L'ancien lien est mort sur-le-champ.
    const ancien = await request(app).get(`/api/auth/reinitialisation/${premier.jeton}`);
    expect(ancien.status).toBe(404);
  });

  // Un serveur se connecte au code PIN et n'a pas de mot de passe : il n'y a
  // rien à réinitialiser, même s'il a renseigné une adresse.
  it('un compte sans mot de passe ne déclenche rien', async () => {
    const serveurSansMdp = await prisma.utilisateur.findFirstOrThrow({
      where: { etablissementId, prenom: 'SansDroit' },
    });
    const email = 'serveur@test-auto.maida';
    await prisma.utilisateur.update({ where: { id: serveurSansMdp.id }, data: { email } });

    const avant = await prisma.jetonReinitialisation.count();
    const res = await request(app).post('/api/auth/mot-de-passe-oublie').send({ email });
    expect(res.status).toBe(200);
    expect(await prisma.jetonReinitialisation.count()).toBe(avant);

    await prisma.utilisateur.update({ where: { id: serveurSansMdp.id }, data: { email: null } });
  });

  it('un lien expiré ne vaut plus rien', async () => {
    const jeton = await prisma.jetonReinitialisation.findFirstOrThrow({
      where: { utilisateurId: gerantId },
    });
    await prisma.jetonReinitialisation.update({
      where: { id: jeton.id },
      data: { expireLe: new Date(Date.now() - 1000) },
    });

    expect((await request(app).get(`/api/auth/reinitialisation/${jeton.jeton}`)).status).toBe(404);
    const refus = await request(app)
      .post('/api/auth/reinitialisation')
      .send({ jeton: jeton.jeton, motDePasse: NOUVEAU_MDP });
    expect(refus.status).toBe(404);

    // Remis en état pour la suite.
    await prisma.jetonReinitialisation.update({
      where: { id: jeton.id },
      data: { expireLe: new Date(Date.now() + 60 * 60 * 1000) },
    });
  });

  it('refuse un mot de passe trop court', async () => {
    const jeton = await prisma.jetonReinitialisation.findFirstOrThrow({
      where: { utilisateurId: gerantId },
    });
    const res = await request(app)
      .post('/api/auth/reinitialisation')
      .send({ jeton: jeton.jeton, motDePasse: 'court' });
    expect(res.status).toBe(400);
  });

  it("change le mot de passe, coupe les sessions ouvertes, et ne sert qu'une fois", async () => {
    // La session gérant en cours fonctionne encore avant le changement.
    expect((await gerant.get('/api/gerant/categories')).status).toBe(200);

    const jeton = await prisma.jetonReinitialisation.findFirstOrThrow({
      where: { utilisateurId: gerantId },
    });
    const apercu = await request(app).get(`/api/auth/reinitialisation/${jeton.jeton}`);
    expect(apercu.status).toBe(200);
    expect(apercu.body.prenom).toBe('Gérant');

    const changement = await request(app)
      .post('/api/auth/reinitialisation')
      .send({ jeton: jeton.jeton, motDePasse: NOUVEAU_MDP });
    expect(changement.status).toBe(200);

    // L'ancien mot de passe ne vaut plus rien, le nouveau ouvre la porte.
    const ancien = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL_GERANT, password: MDP_GERANT });
    expect(ancien.status).toBe(401);
    const nouveau = await request(app)
      .post('/api/auth/login')
      .send({ email: EMAIL_GERANT, password: NOUVEAU_MDP });
    expect(nouveau.status).toBe(200);

    // Et la session ouverte AVANT le changement est éjectée : c'est tout
    // l'intérêt de la manœuvre si quelqu'un d'autre était connecté.
    expect((await gerant.get('/api/gerant/categories')).status).toBe(401);
    expect((await gerant.get('/api/auth/me')).status).toBe(401);

    // Le jeton est consommé.
    const rejeu = await request(app)
      .post('/api/auth/reinitialisation')
      .send({ jeton: jeton.jeton, motDePasse: 'encore-un-autre-1234' });
    expect(rejeu.status).toBe(404);

    // Et la réinitialisation laisse une trace.
    const trace = await prisma.connexionJournal.findFirstOrThrow({
      where: { utilisateurId: gerantId, type: 'REINITIALISATION' },
      orderBy: { creeLe: 'desc' },
    });
    expect(trace.resultat).toBe('REUSSIE');
  });
});

describe.skipIf(!identifiantsAdmin)('Demandes de mot de passe vues par le super-admin', () => {
  const admin = request.agent(app);
  let gerantId = '';

  beforeAll(async () => {
    const g = await prisma.utilisateur.findUniqueOrThrow({ where: { email: EMAIL_GERANT } });
    gerantId = g.id;
    await admin.post('/api/auth/login').send({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    });
  });

  afterAll(async () => {
    await prisma.jetonReinitialisation.deleteMany({ where: { utilisateurId: gerantId } });
  });

  it("voit la demande en attente avec son lien, et peut l'annuler", async () => {
    await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: EMAIL_GERANT });

    const liste = await admin.get('/api/admin/reinitialisations');
    expect(liste.status).toBe(200);
    const demande = liste.body.find(
      (d: { utilisateur: { email: string } }) => d.utilisateur.email === EMAIL_GERANT,
    );
    expect(demande).toBeDefined();
    expect(demande.jeton).toBeTruthy();

    const annulation = await admin.delete(`/api/admin/reinitialisations/${demande.id}`);
    expect(annulation.status).toBe(204);

    // Le lien annulé ne mène plus nulle part.
    expect((await request(app).get(`/api/auth/reinitialisation/${demande.jeton}`)).status).toBe(404);
  });

  it("le dépannage manuel par l'éditeur efface la demande en cours", async () => {
    await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: EMAIL_GERANT });
    expect(
      await prisma.jetonReinitialisation.count({ where: { utilisateurId: gerantId, utiliseLe: null } }),
    ).toBe(1);

    const reset = await admin
      .post(`/api/admin/gerants/${gerantId}/mot-de-passe`)
      .send({ motDePasse: MDP_GERANT });
    expect(reset.status).toBe(204);

    expect(
      await prisma.jetonReinitialisation.count({ where: { utilisateurId: gerantId, utiliseLe: null } }),
    ).toBe(0);
  });
});

// L'envoi d'e-mails est volontairement optionnel : tant qu'aucun serveur n'est
// configuré, Maïda prépare les messages, les trace, et ne les envoie pas. Ces
// tests vérifient les deux états, avec le transport « json » de nodemailer qui
// sérialise le message au lieu de l'expédier — tout le chemin est donc joué,
// gabarit compris, sans serveur SMTP.
describe("Envoi d'e-mails", () => {
  const configInitiale = {
    hote: process.env.SMTP_HOTE,
    expediteur: process.env.EMAIL_EXPEDITEUR,
    transport: process.env.EMAIL_TRANSPORT,
    url: process.env.URL_PUBLIQUE,
  };
  let tableReservationId = '';

  const brancherServeurEmail = () => {
    process.env.SMTP_HOTE = 'smtp.exemple.test';
    process.env.EMAIL_EXPEDITEUR = 'bonjour@maidapos.com';
    process.env.EMAIL_TRANSPORT = 'json';
  };
  const debrancherServeurEmail = () => {
    delete process.env.SMTP_HOTE;
    delete process.env.EMAIL_EXPEDITEUR;
    delete process.env.EMAIL_TRANSPORT;
  };

  const reserver = (email: string, dansMinutes: number) =>
    serveur.post('/api/caisse/reservations').send({
      nomClient: 'Client Email',
      email,
      nombreCouverts: 2,
      date: new Date(Date.now() + dansMinutes * 60_000).toISOString(),
      tableId: tableReservationId,
    });

  beforeAll(async () => {
    const table = await prisma.table.create({
      data: { numero: 'T-MAIL', forme: 'RONDE', nombreCouverts: 4, etablissementId },
    });
    tableReservationId = table.id;
    debrancherServeurEmail();
    delete process.env.URL_PUBLIQUE;
  });

  afterAll(() => {
    for (const [cle, valeur] of Object.entries({
      SMTP_HOTE: configInitiale.hote,
      EMAIL_EXPEDITEUR: configInitiale.expediteur,
      EMAIL_TRANSPORT: configInitiale.transport,
      URL_PUBLIQUE: configInitiale.url,
    })) {
      if (valeur === undefined) delete process.env[cle];
      else process.env[cle] = valeur;
    }
  });

  it('trace une confirmation de réservation même sans serveur configuré', async () => {
    const res = await reserver('client.sans.serveur@exemple.test', 200);
    expect(res.status).toBe(201);

    const email = await prisma.emailEnvoye.findFirst({
      where: { destinataire: 'client.sans.serveur@exemple.test' },
    });
    expect(email?.resultat).toBe('NON_CONFIGURE');
    expect(email?.type).toBe('CONFIRMATION_RESERVATION');
    expect(email?.sujet).toContain('Resto Test');
  });

  it('envoie la confirmation dès qu’un serveur est branché', async () => {
    brancherServeurEmail();
    const res = await reserver('client.avec.serveur@exemple.test', 400);
    expect(res.status).toBe(201);

    const email = await prisma.emailEnvoye.findFirst({
      where: { destinataire: 'client.avec.serveur@exemple.test' },
    });
    expect(email?.resultat).toBe('ENVOYE');
    expect(email?.erreur).toBeNull();
  });

  it("n'envoie aucun lien de réinitialisation sans adresse publique déclarée", async () => {
    brancherServeurEmail();
    delete process.env.URL_PUBLIQUE;

    const res = await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: EMAIL_GERANT });
    expect(res.status).toBe(200);
    // La demande existe (l'éditeur peut dépanner), mais rien n'est parti :
    // composer le lien depuis l'en-tête Host de la requête serait exploitable.
    expect(
      await prisma.emailEnvoye.count({
        where: { type: 'MOT_DE_PASSE_OUBLIE', destinataire: EMAIL_GERANT },
      }),
    ).toBe(0);
  });

  it("envoie le lien de réinitialisation quand l'adresse publique est déclarée", async () => {
    brancherServeurEmail();
    process.env.URL_PUBLIQUE = 'https://maidapos.com/';

    const res = await request(app).post('/api/auth/mot-de-passe-oublie').send({ email: EMAIL_GERANT });
    expect(res.status).toBe(200);

    const email = await prisma.emailEnvoye.findFirst({
      where: { type: 'MOT_DE_PASSE_OUBLIE', destinataire: EMAIL_GERANT },
      orderBy: { creeLe: 'desc' },
    });
    expect(email?.resultat).toBe('ENVOYE');
    // Le journal ne doit jamais archiver le lien lui-même : il vaut mot de passe.
    expect(JSON.stringify(email)).not.toContain('reinitialisation/');
  });
});

describe.skipIf(!identifiantsAdmin)("Journal des e-mails vu par l'éditeur", () => {
  const admin = request.agent(app);

  it("liste les envois et dit si un serveur d'envoi est branché", async () => {
    const login = await admin.post('/api/auth/login').send({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);

    const sansServeur = await admin.get('/api/admin/emails');
    expect(sansServeur.status).toBe(200);
    expect(sansServeur.body.configure).toBe(false);
    expect(sansServeur.body.emails.length).toBeGreaterThan(0);

    process.env.SMTP_HOTE = 'smtp.exemple.test';
    process.env.EMAIL_EXPEDITEUR = 'bonjour@maidapos.com';
    try {
      const avecServeur = await admin.get('/api/admin/emails');
      expect(avecServeur.body.configure).toBe(true);
    } finally {
      delete process.env.SMTP_HOTE;
      delete process.env.EMAIL_EXPEDITEUR;
    }

    const echecs = await admin.get('/api/admin/emails?echecs=true');
    expect(echecs.status).toBe(200);
    for (const e of echecs.body.emails) expect(e.resultat).not.toBe('ENVOYE');
  });
});

describe('Gabarits des e-mails', () => {
  it("échappe ce que le client a saisi, pour qu'un nom ne casse pas le message", () => {
    const message = emailConfirmationReservation({
      destinataire: 'client@exemple.test',
      nomClient: '<script>alert(1)</script>',
      etablissement: 'Le Café « Étoilé »',
      date: new Date('2026-09-01T19:30:00.000Z'),
      nombreCouverts: 2,
      table: '12',
    });
    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
    // La version texte est toujours présente : sans elle, le message part avec
    // un handicap chez les filtres anti-spam.
    expect(message.texte).toContain('Le Café « Étoilé »');
  });

  it("annonce l'heure du restaurant, pas celle du serveur", () => {
    const message = emailConfirmationReservation({
      destinataire: 'client@exemple.test',
      nomClient: 'Karim',
      etablissement: 'Le Bon Grill',
      // 19 h 30 UTC = 20 h 30 à Alger.
      date: new Date('2026-09-01T19:30:00.000Z'),
      nombreCouverts: 4,
      table: '3',
    });
    expect(message.texte).toContain('20:30');
  });

  it('rappelle la durée de validité du lien de mot de passe', () => {
    const message = emailMotDePasseOublie({
      destinataire: 'karim@exemple.test',
      prenom: 'Karim',
      lien: 'https://maidapos.com/reinitialisation/abc',
      dureeHeures: 1,
    });
    expect(message.texte).toContain('une heure');
    expect(message.html).toContain('https://maidapos.com/reinitialisation/abc');
  });
});

// Une enseigne peut tenir plusieurs restaurants sous le même compte client. Le
// gérant bascule de l'un à l'autre depuis le même identifiant. Le risque de
// cette fonctionnalité est évident : elle ne doit JAMAIS servir de passerelle
// vers l'établissement d'un autre client.
describe('Plusieurs restaurants pour un même compte', () => {
  const deuxieme = request.agent(app);
  let secondEtablissementId = '';
  let etablissementEtranger = '';
  // Une vente réelle dans l'annexe : sans elle, un rapport d'enseigne ne
  // prouverait rien (il rendrait les mêmes chiffres qu'un seul restaurant).
  const CA_ANNEXE = 3000;

  beforeAll(async () => {
    const etab = await prisma.etablissement.create({
      data: {
        nom: 'Resto Test — Annexe',
        ville: 'Testville',
        codeTerminal: `${CODE_TERMINAL_TEST}2`,
        compteClientId,
      },
    });
    secondEtablissementId = etab.id;
    const categorie = await prisma.categorie.create({
      data: { nom: 'Carte annexe', type: 'NOURRITURE', etablissementId: etab.id },
    });

    const produit = await prisma.produit.create({
      data: {
        nom: 'Couscous annexe',
        prix: CA_ANNEXE,
        tauxTva: 9,
        categorieId: categorie.id,
        etablissementId: etab.id,
      },
    });
    const serveurAnnexe = await prisma.utilisateur.create({
      data: {
        role: 'SERVEUR',
        nom: 'Annexe',
        prenom: 'Serveur',
        compteClientId,
        etablissementId: etab.id,
      },
    });
    const addition = await prisma.addition.create({ data: { etablissementId: etab.id } });
    await prisma.commande.create({
      data: {
        canal: 'SUR_PLACE',
        etablissementId: etab.id,
        serveurId: serveurAnnexe.id,
        additionId: addition.id,
        lignes: {
          create: {
            nomProduit: produit.nom,
            prixUnitaire: CA_ANNEXE,
            tauxTva: 9,
            quantite: 1,
            produitId: produit.id,
          },
        },
      },
    });
    await prisma.paiement.create({
      data: { montant: CA_ANNEXE, moyenPaiement: 'ESPECES', additionId: addition.id },
    });

    const autre = await prisma.etablissement.findFirst({
      where: { compteClientId: { not: compteClientId } },
      select: { id: true },
    });
    etablissementEtranger = autre?.id ?? '';

    const login = await deuxieme
      .post('/api/auth/login')
      .send({ email: EMAIL_GERANT, password: MDP_GERANT });
    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    const dansAnnexe = { etablissementId: secondEtablissementId };
    await prisma.paiement.deleteMany({ where: { addition: dansAnnexe } });
    await prisma.ligneCommande.deleteMany({ where: { commande: dansAnnexe } });
    await prisma.commande.deleteMany({ where: dansAnnexe });
    await prisma.addition.deleteMany({ where: dansAnnexe });
    await prisma.produit.deleteMany({ where: dansAnnexe });
    await prisma.utilisateur.deleteMany({ where: dansAnnexe });
    await prisma.categorie.deleteMany({ where: dansAnnexe });
    await prisma.etablissement.delete({ where: { id: secondEtablissementId } });
  });

  it("liste les restaurants de l'enseigne, et seulement eux", async () => {
    const res = await deuxieme.get('/api/gerant/etablissements');
    expect(res.status).toBe(200);
    expect(res.body.etablissements).toHaveLength(2);
    expect(res.body.etablissements.map((e: { id: string }) => e.id)).toContain(secondEtablissementId);
    expect(res.body.actuelId).toBe(etablissementId);
  });

  it("consolide les rapports de toute l'enseigne à la demande", async () => {
    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const seul = await deuxieme.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}`);
    expect(seul.status).toBe(200);
    expect(seul.body.portee).toBe('etablissement');
    expect(seul.body.parEtablissement).toBeNull();

    const enseigne = await deuxieme.get(
      `/api/gerant/rapports?debut=${debut}&fin=${fin}&portee=enseigne`,
    );
    expect(enseigne.status).toBe(200);
    expect(enseigne.body.portee).toBe('enseigne');
    expect(enseigne.body.caEncaisse).toBe(seul.body.caEncaisse + CA_ANNEXE);
    expect(enseigne.body.nbCommandes).toBe(seul.body.nbCommandes + 1);

    // Le détail restaurant par restaurant recompose exactement le total.
    const detail: Array<{ id: string; caEncaisse: number; nbCommandes: number }> =
      enseigne.body.parEtablissement;
    expect(detail).toHaveLength(2);
    expect(detail.reduce((s, e) => s + e.caEncaisse, 0)).toBe(enseigne.body.caEncaisse);
    const annexe = detail.find((e) => e.id === secondEtablissementId);
    expect(annexe?.caEncaisse).toBe(CA_ANNEXE);
    expect(annexe?.nbCommandes).toBe(1);

    // Palmarès et activité par serveur suivent la portée.
    const nomsSeul = seul.body.parProduit.map((p: { nom: string }) => p.nom);
    const nomsEnseigne = enseigne.body.parProduit.map((p: { nom: string }) => p.nom);
    expect(nomsSeul).not.toContain('Couscous annexe');
    expect(nomsEnseigne).toContain('Couscous annexe');
    expect(
      enseigne.body.parServeur.some(
        (s: { etablissement: string }) => s.etablissement === 'Resto Test — Annexe',
      ),
    ).toBe(true);
  });

  it("la portée enseigne s'arrête au compte client, jamais au-delà", async () => {
    const debut = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fin = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const res = await deuxieme.get(`/api/gerant/rapports?debut=${debut}&fin=${fin}&portee=enseigne`);
    expect(res.status).toBe(200);

    // Exactement les établissements du compte du gérant, et rien d'autre : ce
    // sont ses droits, pas le paramètre d'URL, qui bornent la consolidation.
    const rendus = res.body.parEtablissement.map((e: { id: string }) => e.id).sort();
    const attendus = await prisma.etablissement.findMany({
      where: { compteClientId },
      select: { id: true },
    });
    expect(rendus).toEqual(attendus.map((e) => e.id).sort());
    if (etablissementEtranger) expect(rendus).not.toContain(etablissementEtranger);
  });

  it('bascule sur le second restaurant, et les écrans suivent', async () => {
    const avant = await deuxieme.get('/api/gerant/categories');
    expect(avant.body.map((c: { nom: string }) => c.nom)).not.toContain('Carte annexe');

    const bascule = await deuxieme
      .post('/api/gerant/etablissement')
      .send({ etablissementId: secondEtablissementId });
    expect(bascule.status).toBe(200);
    expect(bascule.body.nom).toBe('Resto Test — Annexe');

    const apres = await deuxieme.get('/api/gerant/categories');
    expect(apres.body.map((c: { nom: string }) => c.nom)).toEqual(['Carte annexe']);

    // La session dit désormais travailler sur l'annexe.
    const moi = await deuxieme.get('/api/auth/me');
    expect(moi.body.etablissementId).toBe(secondEtablissementId);
  });

  it("refuse de basculer sur l'établissement d'un autre client", async () => {
    if (!etablissementEtranger) return; // pas d'autre compte en base : rien à tester
    const res = await deuxieme
      .post('/api/gerant/etablissement')
      .send({ etablissementId: etablissementEtranger });
    expect(res.status).toBe(404);
  });

  it("un jeton portant l'établissement d'un autre client ne donne accès à rien", async () => {
    if (!etablissementEtranger) return;
    // On fabrique nous-mêmes la session que fabriquerait un attaquant capable
    // de forger le jeton : le serveur ne doit pas s'y fier.
    const gerant = await prisma.utilisateur.findFirstOrThrow({ where: { email: EMAIL_GERANT } });
    const jetonTrafique = signToken({
      sub: gerant.id,
      role: 'GERANT',
      etab: etablissementEtranger,
    });

    const res = await request(app)
      .get('/api/gerant/categories')
      .set('Cookie', [`${AUTH_COOKIE_NAME}=${jetonTrafique}`]);
    expect(res.status).toBe(200);

    // Repli sur l'établissement de rattachement : la réponse contient la carte
    // du restaurant de test, et aucune ligne de celui de l'autre client.
    const rendues = res.body.map((c: { id: string }) => c.id);
    const attendues = await prisma.categorie.findMany({
      where: { etablissementId },
      select: { id: true },
    });
    expect(rendues.sort()).toEqual(attendues.map((c) => c.id).sort());

    const etrangeres = await prisma.categorie.findMany({
      where: { etablissementId: etablissementEtranger },
      select: { id: true },
    });
    for (const categorie of etrangeres) expect(rendues).not.toContain(categorie.id);
  });

  it("revient sur le restaurant d'origine", async () => {
    const retour = await deuxieme.post('/api/gerant/etablissement').send({ etablissementId });
    expect(retour.status).toBe(200);
    const apres = await deuxieme.get('/api/gerant/categories');
    expect(apres.body.map((c: { nom: string }) => c.nom)).not.toContain('Carte annexe');
  });
});

describe.skipIf(!identifiantsAdmin)("Ajout d'un restaurant par l'éditeur", () => {
  const admin = request.agent(app);
  let ajouteId = '';

  afterAll(async () => {
    if (ajouteId) await prisma.etablissement.delete({ where: { id: ajouteId } });
  });

  it('ajoute un restaurant au compte, avec son propre code d’installation', async () => {
    const login = await admin.post('/api/auth/login').send({
      email: process.env.SEED_SUPER_ADMIN_EMAIL,
      password: process.env.SEED_SUPER_ADMIN_PASSWORD,
    });
    expect(login.status).toBe(200);

    const res = await admin
      .post(`/api/admin/comptes-clients/${compteClientId}/etablissements`)
      .send({ nom: 'Resto Test — Second service', ville: 'Testville' });
    expect(res.status).toBe(201);
    expect(res.body.codeTerminal).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    ajouteId = res.body.id;

    // Le gérant du compte le voit immédiatement, sans nouvel identifiant.
    // Session neuve : celle des blocs précédents a pu être révoquée en route
    // (les tests de mot de passe oublié ferment les sessions ouvertes).
    const gerantFrais = request.agent(app);
    const connexion = await gerantFrais
      .post('/api/auth/login')
      .send({ email: EMAIL_GERANT, password: MDP_GERANT });
    expect(connexion.status).toBe(200);

    const vus = await gerantFrais.get('/api/gerant/etablissements');
    expect(vus.status).toBe(200);
    expect(vus.body.etablissements.map((e: { id: string }) => e.id)).toContain(ajouteId);
  });

  it('refuse un compte client inconnu', async () => {
    const res = await admin
      .post('/api/admin/comptes-clients/inconnu-xyz/etablissements')
      .send({ nom: 'Nulle part' });
    expect(res.status).toBe(404);
  });
});
