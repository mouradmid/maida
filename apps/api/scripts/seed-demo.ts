import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma';

// Seed de démo : remet l'établissement « Le Bon Grill - Hydra » dans un état
// présentable (menu complet, plan de salle, commandes en cours).
// Identifiants après exécution :
//   Gérant  : karim@lebongrill.dz / demo1234
//   Serveur : Sofiane PIN 1234, Yacine PIN 5678

const CUISSONS = ['Bleu', 'Saignant', 'À point', 'Bien cuit'];
const SAUCES = ['Algérienne', 'Blanche', 'Harissa', 'Biggy'];
const TAILLES_PIZZA = ['Moyenne', 'Grande'];

interface ProduitSeed {
  nom: string;
  description?: string;
  prix: number;
  cout?: number;
  tempsPreparationMinutes?: number;
  options?: { nom: string; obligatoire: boolean; valeurs: string[] }[];
}

const MENU: { categorie: string; produits: ProduitSeed[] }[] = [
  {
    categorie: 'Entrées',
    produits: [
      { nom: 'Chorba frik', description: 'Soupe traditionnelle au blé vert et agneau', prix: 300, cout: 90, tempsPreparationMinutes: 5 },
      { nom: 'Bourek viande (2 pièces)', description: 'Feuilles de brick croustillantes à la viande hachée', prix: 250, cout: 80, tempsPreparationMinutes: 8 },
      { nom: 'Salade variée', description: 'Tomates, concombre, oignons, olives', prix: 350, cout: 100, tempsPreparationMinutes: 5 },
      // Volontairement sans coût de revient : montre l'alerte de couverture dans les rapports.
      { nom: 'Salade César', description: 'Poulet grillé, parmesan, croûtons', prix: 550, tempsPreparationMinutes: 8 },
    ],
  },
  {
    categorie: 'Grillades',
    produits: [
      {
        nom: 'Entrecôte grillée',
        description: '350 g, frites maison et sauce au choix',
        prix: 1600,
        cout: 560,
        tempsPreparationMinutes: 20,
        options: [{ nom: 'Cuisson', obligatoire: true, valeurs: CUISSONS }],
      },
      { nom: "Côtelettes d'agneau", description: 'Grillées au charbon de bois, garniture', prix: 1400, cout: 480, tempsPreparationMinutes: 18 },
      { nom: 'Brochettes de poulet', description: '3 brochettes marinées, frites et salade', prix: 900, cout: 280, tempsPreparationMinutes: 15 },
      { nom: 'Brochettes kefta', description: '3 brochettes de viande hachée épicée', prix: 850, cout: 260, tempsPreparationMinutes: 15 },
      { nom: 'Merguez grillées', description: '5 merguez, frites maison', prix: 700, cout: 210, tempsPreparationMinutes: 12 },
      { nom: 'Demi-poulet braisé', description: 'Mariné aux épices, riz ou frites', prix: 950, cout: 300, tempsPreparationMinutes: 20 },
    ],
  },
  {
    categorie: 'Burgers & Tacos',
    produits: [
      { nom: 'Burger maison', description: 'Steak haché frais 150 g, cheddar, sauce secrète', prix: 750, cout: 230, tempsPreparationMinutes: 12 },
      {
        nom: 'Tacos poulet',
        description: 'Poulet mariné, frites, fromage fondu',
        prix: 600,
        cout: 180,
        tempsPreparationMinutes: 10,
        options: [{ nom: 'Sauce', obligatoire: true, valeurs: SAUCES }],
      },
      {
        nom: 'Tacos mixte',
        description: 'Poulet + viande hachée, frites, fromage fondu',
        prix: 750,
        cout: 230,
        tempsPreparationMinutes: 10,
        options: [{ nom: 'Sauce', obligatoire: true, valeurs: SAUCES }],
      },
    ],
  },
  {
    categorie: 'Pizzas',
    produits: [
      {
        nom: 'Pizza Margherita',
        description: 'Tomate, mozzarella, basilic',
        prix: 700,
        cout: 190,
        tempsPreparationMinutes: 15,
        options: [{ nom: 'Taille', obligatoire: true, valeurs: TAILLES_PIZZA }],
      },
      {
        nom: 'Pizza 4 fromages',
        description: 'Mozzarella, chèvre, bleu, emmental',
        prix: 950,
        cout: 310,
        tempsPreparationMinutes: 15,
        options: [{ nom: 'Taille', obligatoire: true, valeurs: TAILLES_PIZZA }],
      },
      {
        nom: 'Pizza Pepperoni',
        description: 'Tomate, mozzarella, pepperoni de boeuf',
        prix: 900,
        cout: 270,
        tempsPreparationMinutes: 15,
        options: [{ nom: 'Taille', obligatoire: true, valeurs: TAILLES_PIZZA }],
      },
    ],
  },
  {
    categorie: 'Boissons',
    produits: [
      { nom: 'Eau minérale 50 cl', prix: 60, cout: 25 },
      { nom: 'Coca-Cola 33 cl', prix: 150, cout: 70 },
      { nom: 'Hamoud Boualem 33 cl', prix: 120, cout: 55 },
      // Volontairement sans coût de revient : montre l'alerte de couverture dans les rapports.
      { nom: "Jus d'orange frais", description: 'Pressé minute', prix: 300, tempsPreparationMinutes: 5 },
      { nom: 'Thé à la menthe', prix: 150, cout: 30 },
      { nom: 'Café expresso', prix: 120, cout: 35 },
    ],
  },
  {
    categorie: 'Desserts',
    produits: [
      { nom: 'Tiramisu maison', prix: 450, cout: 130, tempsPreparationMinutes: 5 },
      { nom: 'Crème brûlée', prix: 400, cout: 110, tempsPreparationMinutes: 5 },
      { nom: 'Baklawa (2 pièces)', description: 'Aux amandes et miel', prix: 300, cout: 90 },
      { nom: 'Kalb el louz', description: 'Gâteau de semoule aux amandes', prix: 250, cout: 70 },
    ],
  },
];

const TABLES: { numero: string; forme: 'RONDE' | 'CARREE' | 'RECTANGULAIRE'; couverts: number; x: number; y: number }[] = [
  { numero: '1', forme: 'RONDE', couverts: 2, x: 40, y: 40 },
  { numero: '2', forme: 'RONDE', couverts: 2, x: 160, y: 40 },
  { numero: '3', forme: 'CARREE', couverts: 4, x: 290, y: 35 },
  { numero: '4', forme: 'CARREE', couverts: 4, x: 420, y: 35 },
  { numero: '5', forme: 'RECTANGULAIRE', couverts: 6, x: 560, y: 40 },
  { numero: '6', forme: 'RECTANGULAIRE', couverts: 8, x: 730, y: 40 },
  { numero: '7', forme: 'RONDE', couverts: 4, x: 40, y: 210 },
  { numero: '8', forme: 'RONDE', couverts: 4, x: 160, y: 210 },
  { numero: '9', forme: 'CARREE', couverts: 4, x: 290, y: 205 },
  { numero: '10', forme: 'CARREE', couverts: 4, x: 420, y: 205 },
  { numero: '11', forme: 'RECTANGULAIRE', couverts: 6, x: 560, y: 210 },
  { numero: '12', forme: 'RONDE', couverts: 2, x: 40, y: 380 },
];

const TAILLES_PAR_FORME = {
  RONDE: { largeur: 70, hauteur: 70 },
  CARREE: { largeur: 80, hauteur: 80 },
  RECTANGULAIRE: { largeur: 130, hauteur: 70 },
};

async function main() {
  const etablissement = await prisma.etablissement.findFirst({ where: { nom: { contains: 'Bon Grill' } } });
  if (!etablissement) throw new Error('Établissement « Le Bon Grill - Hydra » introuvable');
  const etablissementId = etablissement.id;

  const gerant = await prisma.utilisateur.findFirst({ where: { etablissementId, role: 'GERANT' } });
  const serveurs = await prisma.utilisateur.findMany({
    where: { etablissementId, role: 'SERVEUR', statut: 'ACTIF' },
    orderBy: { creeLe: 'asc' },
  });
  if (!gerant || serveurs.length < 2) throw new Error('Gérant ou serveurs manquants');

  // Identifiants de démo connus. Sofiane a le droit d'annuler, Yacine non
  // (pour démontrer la validation par code gérant : PIN 9999).
  await prisma.utilisateur.update({
    where: { id: gerant.id },
    data: {
      motDePasseHash: await bcrypt.hash('demo1234', 12),
      codePinHash: await bcrypt.hash('9999', 12),
    },
  });
  await prisma.utilisateur.update({
    where: { id: serveurs[0].id },
    data: { codePinHash: await bcrypt.hash('1234', 12), droits: ['ANNULER', 'CLOTURER'] },
  });
  await prisma.utilisateur.update({
    where: { id: serveurs[1].id },
    data: { codePinHash: await bcrypt.hash('5678', 12), droits: [] },
  });
  console.log(`Gérant : ${gerant.email} / demo1234 — PIN validation 9999`);
  console.log(`Serveur ${serveurs[0].prenom} : PIN 1234 (droit annuler) — Serveur ${serveurs[1].prenom} : PIN 5678`);

  // Le compte de démo est toujours remis actif (au cas où il a été suspendu en test).
  await prisma.compteClient.update({
    where: { id: etablissement.compteClientId },
    data: { statut: 'ACTIF' },
  });

  // Deuxième compte client, suspendu : donne de la matière à l'espace super-admin.
  let palmeraie = await prisma.compteClient.findFirst({ where: { nomEnseigne: 'La Palmeraie' } });
  if (!palmeraie) {
    palmeraie = await prisma.compteClient.create({
      data: { nomEnseigne: 'La Palmeraie', statut: 'SUSPENDU' },
    });
    const etabPalmeraie = await prisma.etablissement.create({
      data: { nom: 'La Palmeraie - Front de mer', ville: 'Oran', compteClientId: palmeraie.id },
    });
    await prisma.utilisateur.create({
      data: {
        role: 'GERANT',
        nom: 'Mansouri',
        prenom: 'Leïla',
        email: 'leila@lapalmeraie.dz',
        motDePasseHash: await bcrypt.hash('demo1234', 12),
        compteClientId: palmeraie.id,
        etablissementId: etabPalmeraie.id,
      },
    });
  } else {
    await prisma.compteClient.update({ where: { id: palmeraie.id }, data: { statut: 'SUSPENDU' } });
  }
  console.log('Compte « La Palmeraie » (Oran) présent et suspendu — démo super-admin.');

  // Purge des données transactionnelles et du menu existant
  await prisma.paiementLigne.deleteMany({});
  await prisma.paiement.deleteMany({});
  await prisma.journeeCaisse.deleteMany({});
  await prisma.annulation.deleteMany({});
  await prisma.ligneCommandeOption.deleteMany({});
  await prisma.ligneCommande.deleteMany({});
  await prisma.commande.deleteMany({});
  await prisma.addition.deleteMany({});
  await prisma.optionValeur.deleteMany({});
  await prisma.groupeOption.deleteMany({});
  await prisma.produit.deleteMany({});
  await prisma.categorie.deleteMany({});
  await prisma.table.deleteMany({});
  console.log('Anciennes données purgées.');

  // Menu
  const produitsParNom = new Map<string, { id: string; prix: number; cout: number | null }>();
  const optionsParProduit = new Map<string, Map<string, { groupeNom: string; valeurId: string }>>();

  for (const bloc of MENU) {
    const categorie = await prisma.categorie.create({
      data: {
        nom: bloc.categorie,
        type: bloc.categorie === 'Boissons' ? 'BOISSON' : 'NOURRITURE',
        etablissementId,
      },
    });
    for (const p of bloc.produits) {
      const produit = await prisma.produit.create({
        data: {
          nom: p.nom,
          description: p.description,
          prix: p.prix,
          coutRevient: p.cout,
          tempsPreparationMinutes: p.tempsPreparationMinutes,
          categorieId: categorie.id,
          etablissementId,
        },
      });
      produitsParNom.set(p.nom, { id: produit.id, prix: p.prix, cout: p.cout ?? null });
      if (p.options) {
        const valeursMap = new Map<string, { groupeNom: string; valeurId: string }>();
        for (const groupe of p.options) {
          const groupeCree = await prisma.groupeOption.create({
            data: { nom: groupe.nom, obligatoire: groupe.obligatoire, produitId: produit.id },
          });
          for (const valeur of groupe.valeurs) {
            const valeurCreee = await prisma.optionValeur.create({
              data: { valeur, groupeOptionId: groupeCree.id },
            });
            valeursMap.set(valeur, { groupeNom: groupe.nom, valeurId: valeurCreee.id });
          }
        }
        optionsParProduit.set(p.nom, valeursMap);
      }
    }
  }
  console.log(`Menu créé : ${MENU.length} catégories, ${produitsParNom.size} produits.`);

  // Tables
  const tablesParNumero = new Map<string, string>();
  for (const t of TABLES) {
    const taille = TAILLES_PAR_FORME[t.forme];
    const table = await prisma.table.create({
      data: {
        numero: t.numero,
        forme: t.forme,
        nombreCouverts: t.couverts,
        positionX: t.x,
        positionY: t.y,
        largeur: taille.largeur,
        hauteur: taille.hauteur,
        etablissementId,
      },
    });
    tablesParNumero.set(t.numero, table.id);
  }
  console.log(`${TABLES.length} tables créées.`);

  // Commandes en cours pour rendre la démo vivante
  type LigneSeed = { produit: string; quantite: number; option?: string };
  async function creerCommande(
    additionId: string,
    serveurId: string,
    lignes: LigneSeed[],
    noteCuisine?: string,
    creeLe?: Date,
  ) {
    const commande = await prisma.commande.create({
      data: { canal: 'SUR_PLACE', etablissementId, serveurId, additionId, noteCuisine, ...(creeLe ? { creeLe } : {}) },
    });
    for (const l of lignes) {
      const produit = produitsParNom.get(l.produit);
      if (!produit) throw new Error(`Produit inconnu : ${l.produit}`);
      const ligne = await prisma.ligneCommande.create({
        data: {
          commandeId: commande.id,
          produitId: produit.id,
          nomProduit: l.produit,
          prixUnitaire: produit.prix,
          coutRevientUnitaire: produit.cout,
          quantite: l.quantite,
        },
      });
      if (l.option) {
        const opt = optionsParProduit.get(l.produit)?.get(l.option);
        if (opt) {
          await prisma.ligneCommandeOption.create({
            data: {
              ligneCommandeId: ligne.id,
              nomGroupe: opt.groupeNom,
              valeur: l.option,
              optionValeurId: opt.valeurId,
            },
          });
        }
      }
    }
    return commande;
  }

  const maintenant = Date.now();
  const ilYA = (minutes: number) => new Date(maintenant - minutes * 60_000);

  // Journée de caisse d'hier, clôturée avec un petit écart (pour l'historique gérant)
  const journeeHier = await prisma.journeeCaisse.create({
    data: {
      etablissementId,
      statut: 'CLOTUREE',
      fondDeCaisse: 5000,
      ouverteLe: ilYA(1560),
      clotureeLe: ilYA(1080),
      especesAttendues: 7000,
      especesComptees: 6900,
      ecart: -100,
      commentaire: 'Manque 100 DA, sûrement une erreur de rendu monnaie',
      ouverteParId: serveurs[0].id,
      clotureeParId: gerant.id,
      clotureDemandeeParId: serveurs[1].id,
    },
  });

  // Repas d'hier soir (table 2) pour donner de la matière à la journée clôturée
  const addHier = await prisma.addition.create({
    data: {
      etablissementId,
      tableId: tablesParNumero.get('2')!,
      statut: 'PAYEE',
      ouverteLe: ilYA(1320),
      fermeeLe: ilYA(1200),
    },
  });
  const commandeHier = await creerCommande(
    addHier.id,
    serveurs[1].id,
    [
      { produit: 'Brochettes kefta', quantite: 2 },
      { produit: 'Demi-poulet braisé', quantite: 1 },
      { produit: 'Coca-Cola 33 cl', quantite: 3 },
    ],
    undefined,
    ilYA(1315),
  );
  // Servie hier soir : ne doit pas rester « en préparation » sur l'écran cuisine.
  await prisma.commande.update({
    where: { id: commandeHier.id },
    data: { statut: 'PRETE', preteLe: ilYA(1290) },
  });
  await prisma.paiement.create({
    data: {
      additionId: addHier.id,
      journeeCaisseId: journeeHier.id,
      montant: 2000,
      moyenPaiement: 'ESPECES',
      montantRecu: 2000,
      creeLe: ilYA(1210),
    },
  });
  await prisma.paiement.create({
    data: {
      additionId: addHier.id,
      journeeCaisseId: journeeHier.id,
      montant: 1100,
      moyenPaiement: 'CARTE',
      creeLe: ilYA(1205),
    },
  });

  // Journée de caisse du jour, ouverte il y a 3 h par Sofiane
  const journeeDuJour = await prisma.journeeCaisse.create({
    data: {
      etablissementId,
      fondDeCaisse: 5000,
      ouverteLe: ilYA(180),
      ouverteParId: serveurs[0].id,
    },
  });

  // Table 3 — commande récente
  const addT3 = await prisma.addition.create({
    data: { etablissementId, tableId: tablesParNumero.get('3')!, ouverteLe: ilYA(25) },
  });
  await creerCommande(
    addT3.id,
    serveurs[0].id,
    [
      { produit: 'Chorba frik', quantite: 2 },
      { produit: 'Entrecôte grillée', quantite: 1, option: 'À point' },
      { produit: 'Hamoud Boualem 33 cl', quantite: 2 },
    ],
    'Sans piment sur la chorba',
    ilYA(22),
  );

  // Table 5 — tablée de 6, deux services
  const addT5 = await prisma.addition.create({
    data: { etablissementId, tableId: tablesParNumero.get('5')!, ouverteLe: ilYA(70) },
  });
  await creerCommande(
    addT5.id,
    serveurs[1].id,
    [
      { produit: 'Brochettes de poulet', quantite: 3 },
      { produit: 'Merguez grillées', quantite: 2 },
      { produit: 'Salade variée', quantite: 2 },
      { produit: 'Coca-Cola 33 cl', quantite: 4 },
      { produit: 'Eau minérale 50 cl', quantite: 2 },
    ],
    undefined,
    ilYA(65),
  );
  await creerCommande(
    addT5.id,
    serveurs[1].id,
    [
      { produit: 'Tiramisu maison', quantite: 2 },
      { produit: 'Baklawa (2 pièces)', quantite: 1 },
      { produit: 'Café expresso', quantite: 4 },
      { produit: 'Thé à la menthe', quantite: 2 },
    ],
    undefined,
    ilYA(8),
  );

  // Table 8 — commande qui vient d'arriver
  const addT8 = await prisma.addition.create({
    data: { etablissementId, tableId: tablesParNumero.get('8')!, ouverteLe: ilYA(6) },
  });
  await creerCommande(
    addT8.id,
    serveurs[0].id,
    [
      { produit: 'Pizza 4 fromages', quantite: 1, option: 'Grande' },
      { produit: 'Tacos poulet', quantite: 1, option: 'Algérienne' },
      { produit: "Jus d'orange frais", quantite: 2 },
    ],
    undefined,
    ilYA(5),
  );

  // Une addition déjà payée plus tôt (historique)
  const addPayee = await prisma.addition.create({
    data: {
      etablissementId,
      tableId: tablesParNumero.get('1')!,
      statut: 'PAYEE',
      ouverteLe: ilYA(150),
      fermeeLe: ilYA(95),
    },
  });
  await creerCommande(
    addPayee.id,
    serveurs[0].id,
    [
      { produit: 'Burger maison', quantite: 2 },
      { produit: 'Coca-Cola 33 cl', quantite: 2 },
    ],
    undefined,
    ilYA(145),
  );
  const lignesPayees = await prisma.ligneCommande.findMany({
    where: { commande: { additionId: addPayee.id } },
  });
  const totalPaye = lignesPayees.reduce((somme, l) => somme + Number(l.prixUnitaire) * l.quantite, 0);
  await prisma.ligneCommande.updateMany({
    where: { commande: { additionId: addPayee.id } },
    data: { quantitePayee: 2 },
  });
  const paiement = await prisma.paiement.create({
    data: {
      additionId: addPayee.id,
      journeeCaisseId: journeeDuJour.id,
      montant: totalPaye,
      moyenPaiement: 'ESPECES',
      montantRecu: 2000,
      creeLe: ilYA(95),
    },
  });
  for (const l of lignesPayees) {
    await prisma.paiementLigne.create({
      data: {
        paiementId: paiement.id,
        ligneCommandeId: l.id,
        quantite: l.quantite,
        montant: Number(l.prixUnitaire) * l.quantite,
      },
    });
  }

  console.log('Commandes de démo créées : tables 3, 5 et 8 ouvertes, table 1 payée (historique).');
  console.log('Journées de caisse : hier clôturée (écart -100 DA), aujourd\'hui ouverte (fond 5000 DA).');
  console.log('Seed de démo terminé.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
