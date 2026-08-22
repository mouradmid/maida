import { useEffect, useState } from 'react';
import {
  api,
  ErreurReseau,
  type AdditionDetail,
  type CategorieMenu,
  type Commande,
  type DemandeClient,
  type ModePaiement,
  type ProduitMenu,
  type TableCaisse,
  type Utilisateur,
} from '../lib/api';
import {
  ciblesHorsLigne,
  lireCache,
  mettreEnAttente,
  nouvelleCle,
  sauvegarderCache,
  type CibleHorsLigne,
} from '../lib/horsLigne';
import { useHorsLigne } from '../hooks/useHorsLigne';
import { usePanier, type ChoixOption } from '../hooks/usePanier';
import { badgeBrand, badgeNeutre, carte, da } from '../lib/ui';
import { ZoneMessages } from './ZoneMessages';
import { imprimerTicket } from '../lib/imprimante';
import { ticketCuisine, ticketReclame, type Ticket } from '../lib/ticket';
import { PlanTablesCaisse } from './PlanTablesCaisse';
import { ModalAnnulation } from './ModalAnnulation';
import { ModalStock } from './ModalStock';
import { ArticlesEnvoyes, type LigneEnvoyee } from './ArticlesEnvoyes';
import { BandeauDemandesClients } from './BandeauDemandesClients';
import { GrilleMenu } from './GrilleMenu';
import { ListeEmporterEnPreparation, ListeEmporterHorsLigne } from './ListesEmporter';
import { ModalOptionsProduit } from './ModalOptionsProduit';
import { PanierCommande, type LigneRajout } from './PanierCommande';
import {
  PanneauAddition,
  vueDepuisDetail,
  type InfosEtablissement,
  type VueAddition,
} from './PanneauAddition';
import { PanneauPaiement } from './PanneauPaiement';

// Les deux faces d'une table : ce qu'on lui envoie, et ce qu'elle doit.
type Volet = 'commande' | 'addition';

/**
 * Écran unique de la caisse, centré sur la table : le plan de salle sert de
 * point d'entrée, et tout se règle dans le panneau de droite — commander,
 * envoyer, réclamer un service, annuler, remiser puis encaisser — sans jamais
 * changer d'écran.
 */
export function EcranTables({
  droitAnnuler,
  droitGererStock,
  droitRemiser,
}: {
  droitAnnuler: boolean;
  droitGererStock: boolean;
  droitRemiser: boolean;
}) {
  const [categories, setCategories] = useState<CategorieMenu[]>([]);
  const [tables, setTables] = useState<TableCaisse[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [canal, setCanal] = useState<'SUR_PLACE' | 'EMPORTER'>('SUR_PLACE');
  const [tableId, setTableId] = useState('');
  const [noteCuisine, setNoteCuisine] = useState('');
  const [categorieActiveId, setCategorieActiveId] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  // Le panier, les rajouts et le service en cours de saisie.
  const panier = usePanier();

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitMenu | null>(null);
  // Gestion du stock (droit GERER_STOCK) : mode d'édition + produit en cours d'ajustement.
  const [modeStock, setModeStock] = useState(false);
  const [produitStock, setProduitStock] = useState<ProduitMenu | null>(null);
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);
  // Dernier bon imprimable depuis le bandeau de confirmation : bon cuisine
  // après un envoi, bon de réclame après une réclame.
  const [ticketAImprimer, setTicketAImprimer] = useState<{
    libelle: string;
    ticket: Ticket;
  } | null>(null);
  const [demandes, setDemandes] = useState<DemandeClient[]>([]);
  // Produit qui vient d'entrer au panier : sa vignette s'allume brièvement
  // pour accuser réception du toucher (voir GrilleMenu). Le compteur `tick`
  // rejoue le flash quand on retouche le MÊME produit (deux cafés d'affilée),
  // ce qu'un simple identifiant ne permettrait pas.
  const [flashProduit, setFlashProduit] = useState<{ id: string; tick: number } | null>(null);

  function accuserReception(produitId: string) {
    setFlashProduit((precedent) => ({ id: produitId, tick: (precedent?.tick ?? 0) + 1 }));
  }
  // Article en cours de déplacement vers une autre suite (toucher-toucher).
  const [ligneEnDeplacement, setLigneEnDeplacement] = useState<string | null>(null);

  // Volet « addition » : encaissement de la table sans quitter l'écran.
  const [volet, setVolet] = useState<Volet>('commande');
  const [detailAddition, setDetailAddition] = useState<AdditionDetail | null>(null);
  const [chargementAddition, setChargementAddition] = useState(false);
  // Addition d'une vente à emporter sélectionnée dans la liste (une vente à
  // emporter n'a pas de table sur laquelle s'appuyer).
  const [additionEmporterId, setAdditionEmporterId] = useState<string | null>(null);
  const [moyensActifs, setMoyensActifs] = useState<ModePaiement[]>(['ESPECES']);
  const [journeeOuverte, setJourneeOuverte] = useState(true);
  const [etablissement, setEtablissement] = useState<InfosEtablissement | null>(null);

  // Hors ligne : l'addition détaillée n'est pas joignable, on encaisse le solde
  // total sur le dernier état connu (tables en cache + commandes en file).
  const { horsLigne, enAttente } = useHorsLigne();
  const [cibles, setCibles] = useState<CibleHorsLigne[]>([]);
  const [cleCibleEmporter, setCleCibleEmporter] = useState<string | null>(null);

  useEffect(() => {
    setCibles(horsLigne ? ciblesHorsLigne() : []);
  }, [horsLigne, enAttente]);

  async function chargerDemandes() {
    try {
      setDemandes(await api.listDemandes());
    } catch {
      // hors ligne ou erreur passagère : on garde la dernière liste connue
    }
  }

  // Rafraîchit l'état des commandes et des tables sans toucher au menu :
  // le panneau de commande reste fidèle à ce que voit la cuisine.
  async function rafraichirCommandes() {
    try {
      const [tablesActives, commandesRecentes] = await Promise.all([
        api.caisseTables(),
        api.listCommandes(),
      ]);
      setTables(tablesActives);
      setCommandes(commandesRecentes);
      sauvegarderCache('tables', tablesActives);
      sauvegarderCache('commandes', commandesRecentes);
    } catch {
      // hors ligne : on garde le dernier état connu
    }
  }

  // Ce qu'il faut pour encaisser : moyens acceptés, journée ouverte, en-tête du
  // ticket. Isolé du menu pour qu'une panne ici n'empêche pas de commander.
  async function chargerContexteEncaissement() {
    try {
      const [moyens, etatJournee, infosEtab] = await Promise.all([
        api.caisseMoyensPaiement(),
        api.getJournee(),
        api.caisseEtablissement(),
      ]);
      setMoyensActifs(moyens.actifs.length > 0 ? moyens.actifs : ['ESPECES']);
      setJourneeOuverte(etatJournee.journee !== null);
      setEtablissement(infosEtab);
      sauvegarderCache('moyensPaiement', moyens.actifs);
      sauvegarderCache('etablissement', infosEtab);
    } catch {
      // Hors ligne : on repart du dernier état connu.
      setMoyensActifs(lireCache<ModePaiement[]>('moyensPaiement') ?? ['ESPECES']);
      setEtablissement(lireCache<InfosEtablissement>('etablissement'));
    }
  }

  // Rafraîchissement périodique, suspendu pendant une coupure : inutile
  // d'encombrer un réseau muet, la sonde de lib/reseau.ts guette le retour. Dès
  // qu'il revient, on recharge tout de suite pour rattraper le service.
  useEffect(() => {
    if (horsLigne) return;
    chargerDemandes();
    chargerContexteEncaissement();
    rafraichirCommandes();
    const minuterie = setInterval(() => {
      chargerDemandes();
      rafraichirCommandes();
    }, 15_000);
    return () => clearInterval(minuterie);
  }, [horsLigne]);

  async function handleAccepterDemande(demande: DemandeClient) {
    setErreur(null);
    try {
      await api.accepterDemande(demande.id);
      setConfirmation(
        `Commande client de la table ${demande.table.numero} acceptée — envoyée en cuisine.`,
      );
      await Promise.all([chargerDemandes(), chargerTout()]);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
      await chargerDemandes();
    }
  }

  async function handleRefuserDemande(demande: DemandeClient) {
    setErreur(null);
    try {
      await api.refuserDemande(demande.id);
      await chargerDemandes();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function chargerTout() {
    try {
      const [menu, tablesActives, commandesRecentes] = await Promise.all([
        api.caisseMenu(),
        api.caisseTables(),
        api.listCommandes(),
      ]);
      setCategories(menu);
      setTables(tablesActives);
      setCommandes(commandesRecentes);
      setCategorieActiveId((actif) => actif ?? menu[0]?.id ?? null);
      sauvegarderCache('menu', menu);
      sauvegarderCache('tables', tablesActives);
      sauvegarderCache('commandes', commandesRecentes);
    } catch (err) {
      // Coupure réseau : on continue avec le dernier menu connu.
      const menuCache = err instanceof ErreurReseau ? lireCache<CategorieMenu[]>('menu') : null;
      if (menuCache && menuCache.length > 0) {
        setCategories(menuCache);
        setTables(lireCache<TableCaisse[]>('tables') ?? []);
        // Les articles déjà envoyés restent affichés (fiche table et addition).
        setCommandes(lireCache<Commande[]>('commandes') ?? []);
        setCategorieActiveId((actif) => actif ?? menuCache[0]?.id ?? null);
      } else if (err instanceof ErreurReseau) {
        setErreur(
          'Hors ligne et aucun menu en mémoire : connectez-vous une première fois avec du réseau.',
        );
      } else {
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
      }
    } finally {
      setChargement(false);
    }
  }

  useEffect(() => {
    chargerTout();
  }, []);

  // Le flash s'éteint tout seul ; la minuterie est nettoyée au démontage pour
  // ne pas écrire dans un composant disparu.
  useEffect(() => {
    if (!flashProduit) return;
    const minuterie = setTimeout(() => setFlashProduit(null), 450);
    return () => clearTimeout(minuterie);
  }, [flashProduit]);

  function handleClicProduit(produit: ProduitMenu) {
    if (produit.groupesOptions.length === 0) {
      panier.ajouterAuPanier(produit, []);
      accuserReception(produit.id);
      return;
    }
    setProduitEnSelection(produit);
  }

  function handleConfirmerOptions(options: ChoixOption[]) {
    if (!produitEnSelection) return;
    panier.ajouterAuPanier(produitEnSelection, options);
    accuserReception(produitEnSelection.id);
    setProduitEnSelection(null);
  }

  const tableSelectionnee = tables.find((t) => t.id === tableId) ?? null;

  // Commandes en cours de l'addition de la table sélectionnée : la partie
  // « déjà envoyé » du panneau de commande.
  const commandesTable = tableSelectionnee
    ? commandes
        .filter(
          (c) =>
            c.canal === 'SUR_PLACE' &&
            c.table?.numero === tableSelectionnee.numero &&
            c.additionStatut === 'OUVERTE' &&
            c.statut !== 'ANNULEE',
        )
        .sort((a, b) => new Date(a.creeLe).getTime() - new Date(b.creeLe).getTime())
    : [];
  const additionIdTable = commandesTable[0]?.additionId ?? null;
  const lignesEnvoyees: LigneEnvoyee[] = commandesTable.flatMap((c) =>
    c.lignes.map((ligne) => ({ ligne, commande: c })),
  );
  const lignesParId = new Map(lignesEnvoyees.map((e) => [e.ligne.id, e]));
  const commandesEnvoyees = commandesTable.filter((c) => c.statut === 'ENVOYEE');
  const suiteMaxTable = Math.max(1, ...commandesEnvoyees.flatMap((c) => c.lignes.map((l) => l.suite)));
  const suiteReclameeTable = Math.max(1, ...commandesEnvoyees.map((c) => c.suiteReclamee));
  const totalEnvoye = commandesTable.reduce((s, c) => s + c.total, 0);

  // À emporter en préparation : gestion minimale (réclame, annulation).
  const commandesEmporter = commandes.filter(
    (c) => c.canal === 'EMPORTER' && c.additionStatut === 'OUVERTE' && c.statut !== 'ANNULEE',
  );

  const lignesRajouts = Object.entries(panier.rajouts)
    .map(([ligneId, quantite]) => ({ entree: lignesParId.get(ligneId), ligneId, quantite }))
    .filter((r): r is LigneRajout => Boolean(r.entree));
  const totalRajouts = lignesRajouts.reduce((s, r) => s + r.entree.ligne.prixUnitaire * r.quantite, 0);
  const totalPanier = panier.lignesPanier.reduce((s, l) => s + l.produit.prix * l.quantite, 0);
  const totalAEnvoyer = totalPanier + totalRajouts;
  const nbArticles =
    panier.lignesPanier.reduce((s, l) => s + l.quantite, 0) +
    lignesRajouts.reduce((s, r) => s + r.quantite, 0);

  // Sur place et à emporter sont deux contextes distincts : on ne garde pas la
  // table (ni son addition) en passant de l'un à l'autre.
  function handleChoisirCanal(nouveau: 'SUR_PLACE' | 'EMPORTER') {
    if (nouveau === canal) return;
    setCanal(nouveau);
    setTableId('');
    panier.reinitialiserService();
    setLigneEnDeplacement(null);
    setVolet('commande');
    setDetailAddition(null);
    setAdditionEmporterId(null);
  }

  function handleChoisirTable(id: string) {
    if (id !== tableId) {
      // Les rajouts visent les articles de la table précédente : on repart à zéro.
      panier.reinitialiserService();
      setLigneEnDeplacement(null);
      setVolet('commande');
      setDetailAddition(null);
    }
    setTableId(id);
  }

  // Addition affichée dans le volet : celle de la table choisie, ou celle de la
  // vente à emporter sélectionnée.
  const additionCouranteId =
    canal === 'SUR_PLACE' ? (tableSelectionnee?.addition?.id ?? additionIdTable) : additionEmporterId;

  // Hors ligne, la même bascule s'appuie sur la cible reconstruite localement.
  const cibleCourante = !horsLigne
    ? null
    : canal === 'SUR_PLACE'
      ? (cibles.find((c) => c.tableId === tableId) ?? null)
      : (cibles.find((c) => c.cle === cleCibleEmporter) ?? null);
  const ciblesEmporter = cibles.filter((c) => !c.tableId);

  const additionAccessible = horsLigne ? cibleCourante !== null : additionCouranteId !== null;

  // Le volet Addition affiche toujours la même chose ; hors ligne, les chiffres
  // viennent du dernier état connu de la table et les articles des commandes
  // déjà envoyées, faute de pouvoir interroger le serveur.
  const libelleAddition =
    canal === 'SUR_PLACE' && tableSelectionnee
      ? `Table ${tableSelectionnee.numero}`
      : (cibleCourante?.libelle ?? 'À emporter');
  let vueAddition: VueAddition | null = null;
  if (horsLigne && cibleCourante) {
    vueAddition = {
      libelle: cibleCourante.libelle,
      total: cibleCourante.total,
      totalPaye: cibleCourante.dejaPaye,
      solde: cibleCourante.solde,
      montantRemises: 0,
      lignes: canal === 'SUR_PLACE' ? lignesEnvoyees.map((e) => e.ligne) : [],
      paiements: [],
    };
  } else if (!horsLigne && detailAddition) {
    vueAddition = vueDepuisDetail(detailAddition, libelleAddition);
  }
  const soldeCourant = horsLigne
    ? (cibleCourante?.solde ?? null)
    : canal === 'SUR_PLACE'
      ? (tableSelectionnee?.addition?.solde ?? null)
      : (detailAddition?.solde ?? null);

  async function chargerAddition(id: string) {
    setChargementAddition(true);
    try {
      setDetailAddition(await api.getAddition(id));
    } catch (err) {
      setDetailAddition(null);
      // Coupure : pas de message d'erreur à afficher, le volet vient de basculer
      // sur le solde connu et reste utilisable.
      if (!(err instanceof ErreurReseau)) {
        setErreur(err instanceof Error ? err.message : 'Erreur de chargement');
      }
    } finally {
      setChargementAddition(false);
    }
  }

  useEffect(() => {
    if (volet !== 'addition' || !additionCouranteId) return;
    chargerAddition(additionCouranteId);
  }, [volet, additionCouranteId]);

  function handleOuvrirAddition(additionId: string | null) {
    if (!additionId) return;
    setErreur(null);
    setConfirmation(null);
    if (canal === 'EMPORTER') setAdditionEmporterId(additionId);
    setVolet('addition');
  }

  // Après remise, offert ou encaissement : le détail ET le plan doivent bouger
  // (le solde de la table est affiché sur le plan).
  async function rafraichirApresAddition(additionId: string) {
    await Promise.all([chargerAddition(additionId), rafraichirCommandes()]);
  }

  async function handleReclamerTable(additionId: string) {
    setErreur(null);
    try {
      const res = await api.reclamerSuiteTable(additionId);
      // Bon de réclame : les articles de la suite réclamée, toutes commandes
      // en préparation de la table confondues.
      const enPreparation = res.commandes.filter((c) => c.statut === 'ENVOYEE');
      const destination = enPreparation[0]?.table
        ? `Table ${enPreparation[0].table.numero}`
        : 'À emporter';
      const lignesSuite = enPreparation
        .flatMap((c) => c.lignes)
        .filter((l) => l.suite === res.suiteReclamee);
      setConfirmation(`Suite ${res.suiteReclamee} réclamée en cuisine — ${destination}.`);
      setTicketAImprimer({
        libelle: '🖨 Bon de réclame',
        ticket: ticketReclame(destination, res.suiteReclamee, lignesSuite),
      });
      await rafraichirCommandes();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleDeposerDansSuite(suite: number) {
    const ligneId = ligneEnDeplacement;
    setLigneEnDeplacement(null);
    if (!ligneId) return;
    const entree = lignesParId.get(ligneId);
    if (!entree || entree.ligne.suite === suite || entree.commande.statut !== 'ENVOYEE') return;
    setErreur(null);
    try {
      await api.updateSuiteLigne(ligneId, suite);
      await rafraichirCommandes();
    } catch (err) {
      setErreur(err instanceof Error ? err.message : 'Erreur');
    }
  }

  async function handleEnvoyerCommande() {
    setErreur(null);
    setConfirmation(null);
    if (canal === 'SUR_PLACE' && !tableId) {
      setErreur('Choisissez une table');
      return;
    }
    const lignesProduits = panier.lignesPanier.map((l) => ({
      produitId: l.produit.id,
      quantite: l.quantite,
      suite: l.suite,
      options: l.options.map((o) => ({
        groupeOptionId: o.groupeOptionId,
        optionValeurId: o.optionValeurId,
      })),
    }));
    const lignesSources = lignesRajouts.map((r) => ({
      ligneSourceId: r.ligneId,
      quantite: r.quantite,
    }));
    const donnees = {
      canal,
      tableId: canal === 'SUR_PLACE' ? tableId : undefined,
      noteCuisine: noteCuisine.trim() || undefined,
      lignes: [...lignesProduits, ...lignesSources],
    };
    // Clé générée avant l'envoi et réutilisée si l'on retombe sur la file : une
    // requête arrivée au serveur mais dont la réponse s'est perdue ne créera
    // jamais une seconde commande.
    const cleIdempotence = nouvelleCle('hl');

    setEnvoiEnCours(true);
    try {
      const commande = await api.creerCommande({ ...donnees, cleIdempotence });
      setConfirmation(`Commande envoyée — total ${commande.total} DA`);
      setTicketAImprimer({ libelle: '🖨 Bon cuisine', ticket: ticketCuisine(commande) });
      panier.viderPanier();
      panier.viderRajouts();
      setNoteCuisine('');
      if (canal === 'EMPORTER') setTableId('');
      await chargerTout();
    } catch (err) {
      if (err instanceof ErreurReseau) {
        if (lignesSources.length > 0) {
          // La duplication d'articles existants se résout côté serveur : elle
          // ne peut pas partir dans la file locale.
          setErreur(
            'Hors ligne : les rajouts d’articles déjà envoyés nécessitent du réseau. Retirez-les pour envoyer le reste, puis rajoutez-les à la reconnexion.',
          );
          return;
        }
        // Coupure réseau : la commande part dans la file locale, le service
        // continue. Même clé que la tentative en ligne — si celle-ci a en
        // réalité abouti, la resynchronisation retrouvera la commande existante
        // au lieu d'en créer une seconde.
        const entree = mettreEnAttente(
          {
            description: `${tableSelectionnee ? `Table ${tableSelectionnee.numero}` : 'À emporter'} — ${totalPanier} DA`,
            total: totalPanier,
            donnees: {
              canal,
              tableId: donnees.tableId,
              noteCuisine: donnees.noteCuisine,
              lignes: lignesProduits,
            },
          },
          cleIdempotence,
        );
        const utilisateurLocal = lireCache<Utilisateur>('utilisateur');
        // Reconstitution locale de la commande : permet d'imprimer le ticket
        // cuisine même sans réseau.
        const commandeLocale: Commande = {
          id: entree.cleIdempotence,
          canal,
          noteCuisine: noteCuisine.trim() || null,
          additionId: '',
          additionStatut: 'OUVERTE',
          table: tableSelectionnee ? { numero: tableSelectionnee.numero } : null,
          statut: 'ENVOYEE',
          suiteReclamee: 1,
          creeLe: entree.creeLe,
          serveur: {
            nom: utilisateurLocal?.nom ?? '',
            prenom: utilisateurLocal?.prenom ?? 'Caisse',
          },
          lignes: panier.lignesPanier.map((l, i) => ({
            id: `${entree.cleIdempotence}-${i}`,
            nomProduit: l.produit.nom,
            prixUnitaire: l.produit.prix,
            tauxTva: null,
            suite: l.suite,
            quantite: l.quantite,
            quantitePayee: 0,
            quantiteAnnulee: 0,
            quantiteOfferte: 0,
            options: l.options.map((o) => ({ nomGroupe: o.nomGroupe, valeur: o.valeur })),
          })),
          total: totalPanier,
        };
        setTicketAImprimer({ libelle: '🖨 Bon cuisine', ticket: ticketCuisine(commandeLocale) });
        setConfirmation(
          `Hors ligne — commande enregistrée (${totalPanier} DA), elle sera envoyée au retour du réseau`,
        );
        if (canal === 'SUR_PLACE' && tableId) {
          setTables((liste) => liste.map((t) => (t.id === tableId ? { ...t, occupee: true } : t)));
        }
        panier.viderPanier();
        setNoteCuisine('');
        if (canal === 'EMPORTER') setTableId('');
        return;
      }
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement du menu...</p>;

  return (
    <div className="flex w-full flex-col gap-6">
      <BandeauDemandesClients
        demandes={demandes}
        onAccepter={handleAccepterDemande}
        onRefuser={handleRefuserDemande}
      />

      {/* Erreurs et confirmations flottent en bas de l'écran : en plein service
          on lit la grille du menu, pas le haut de la page. */}
      <ZoneMessages
        erreur={erreur}
        confirmation={confirmation}
        onFermerErreur={() => setErreur(null)}
        onFermerConfirmation={() => setConfirmation(null)}
        action={
          ticketAImprimer && (
            <button
              type="button"
              onClick={() => imprimerTicket(ticketAImprimer.ticket)}
              className="flex min-h-11 shrink-0 items-center rounded-lg border border-green-300 bg-card px-3 text-xs font-semibold text-green-800 transition-[colors,transform] hover:bg-green-100 active:scale-95"
            >
              {ticketAImprimer.libelle}
            </button>
          )
        }
      />

      {/* Le panneau de droite passe à côté du menu dès la tablette (md), pas
          seulement sur grand écran : en portrait, le serveur doit voir son
          panier pendant qu'il tape, sans faire défiler la page. */}
      <div className="grid items-start gap-6 md:grid-cols-[1fr_320px] xl:grid-cols-[1fr_400px]">
        {/* Colonne menu */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-stone-200 bg-card p-1">
              <button
                type="button"
                onClick={() => handleChoisirCanal('SUR_PLACE')}
                className={`flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-[colors,transform] active:scale-95 ${
                  canal === 'SUR_PLACE' ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                Sur place
              </button>
              <button
                type="button"
                onClick={() => handleChoisirCanal('EMPORTER')}
                className={`flex min-h-11 items-center rounded-md px-4 text-sm font-medium transition-[colors,transform] active:scale-95 ${
                  canal === 'EMPORTER' ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                À emporter
              </button>
            </div>
          </div>

          {canal === 'SUR_PLACE' && (
            <PlanTablesCaisse tables={tables} tableId={tableId} onSelect={handleChoisirTable} />
          )}

          {canal === 'EMPORTER' && (
            <ListeEmporterEnPreparation
              commandes={commandesEmporter}
              additionOuverteId={volet === 'addition' ? additionEmporterId : null}
              onOuvrirAddition={handleOuvrirAddition}
              onAnnuler={setCommandeAAnnuler}
            />
          )}

          {canal === 'EMPORTER' && horsLigne && (
            <ListeEmporterHorsLigne
              cibles={ciblesEmporter}
              cleOuverte={volet === 'addition' ? cleCibleEmporter : null}
              onEncaisser={(cle) => {
                setCleCibleEmporter(cle);
                setVolet('addition');
              }}
            />
          )}

          <GrilleMenu
            categories={categories}
            categorieActiveId={categorieActiveId}
            onChoisirCategorie={setCategorieActiveId}
            droitGererStock={droitGererStock}
            modeStock={modeStock}
            onBasculerModeStock={() => setModeStock((v) => !v)}
            onChoisirProduit={handleClicProduit}
            onAjusterStock={setProduitStock}
            produitFlash={flashProduit?.id ?? null}
          />
        </div>

        {/* Fiche de la table : commande d'un côté, addition de l'autre */}
        <div className={`${carte} sticky top-20 flex flex-col gap-4`}>
          <div className="flex items-center justify-between gap-2">
            {canal === 'EMPORTER' ? (
              <span className={badgeBrand}>À emporter</span>
            ) : tableSelectionnee ? (
              <span className={badgeBrand}>Table {tableSelectionnee.numero}</span>
            ) : (
              <span className={badgeNeutre}>Touchez une table sur le plan</span>
            )}
            {nbArticles > 0 && (
              <span className={badgeNeutre}>
                {nbArticles} article{nbArticles > 1 ? 's' : ''} à envoyer
              </span>
            )}
          </div>

          {/* Bascule commande / addition : le cœur de l'écran table */}
          <div className="flex rounded-lg border border-stone-200 bg-stone-50 p-1">
            <button
              type="button"
              onClick={() => setVolet('commande')}
              className={`flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-[colors,transform] active:scale-95 ${
                volet === 'commande' ? 'bg-card text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
            >
              Commande
            </button>
            <button
              type="button"
              disabled={!additionAccessible}
              onClick={() => setVolet('addition')}
              title={
                additionAccessible
                  ? "Voir l'addition, remiser et encaisser"
                  : 'Aucune addition ouverte sur cette table'
              }
              className={`flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium transition-[colors,transform] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100 ${
                volet === 'addition' ? 'bg-card text-stone-900 shadow-sm' : 'text-stone-500'
              }`}
            >
              Addition{soldeCourant != null && soldeCourant > 0 ? ` · ${da(soldeCourant)}` : ''}
            </button>
          </div>

          {volet === 'addition' && (
            <>
              {!journeeOuverte && !horsLigne && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  Aucune journée de caisse ouverte : ouvrez-la (onglet « Journée ») avant d'encaisser.
                </p>
              )}
              {!horsLigne && chargementAddition && !detailAddition && (
                <p className="py-6 text-center text-sm text-stone-400">Chargement de l'addition...</p>
              )}
              {vueAddition && (
                <>
                  <PanneauAddition
                    vue={vueAddition}
                    detail={horsLigne ? null : detailAddition}
                    etablissement={etablissement}
                    droitRemiser={droitRemiser}
                    horsLigne={horsLigne}
                    onGesteApplique={async () => {
                      setConfirmation('Geste commercial appliqué.');
                      if (detailAddition) await rafraichirApresAddition(detailAddition.id);
                    }}
                  />
                  <PanneauPaiement
                    vue={vueAddition}
                    additionId={horsLigne ? null : (detailAddition?.id ?? null)}
                    cible={cibleCourante}
                    moyensActifs={moyensActifs}
                    journeeOuverte={journeeOuverte}
                    horsLigne={horsLigne}
                    etablissement={etablissement}
                    onErreur={setErreur}
                    onEncaisse={async (message, additionSoldee) => {
                      setConfirmation(message);
                      setErreur(null);
                      if (!horsLigne && detailAddition) {
                        await rafraichirApresAddition(detailAddition.id);
                      }
                      if (additionSoldee) {
                        // Addition soldée : la table se libère, retour à la commande.
                        setVolet('commande');
                        setDetailAddition(null);
                        setAdditionEmporterId(null);
                        setCleCibleEmporter(null);
                        if (canal === 'SUR_PLACE') setTableId('');
                      }
                    }}
                  />
                </>
              )}
            </>
          )}

          {volet === 'commande' && (
            <>
              {commandesTable.length > 0 && (
                <ArticlesEnvoyes
                  lignesEnvoyees={lignesEnvoyees}
                  notesCuisine={commandesTable
                    .map((c) => c.noteCuisine)
                    .filter((note): note is string => Boolean(note))}
                  totalEnvoye={totalEnvoye}
                  suiteReclamee={suiteReclameeTable}
                  peutReclamer={commandesEnvoyees.length > 0 && suiteReclameeTable < suiteMaxTable}
                  ligneEnDeplacement={ligneEnDeplacement}
                  onDeplacerVers={handleDeposerDansSuite}
                  onSelectionnerLigne={setLigneEnDeplacement}
                  onRajouter={(ligne) => panier.changerRajout(ligne.id, 1)}
                  onAnnulerCommande={setCommandeAAnnuler}
                  onReclamer={() => additionIdTable && handleReclamerTable(additionIdTable)}
                />
              )}

              <PanierCommande
                lignesRajouts={lignesRajouts}
                lignesPanier={panier.lignesPanier}
                aDesArticlesEnvoyes={commandesTable.length > 0}
                surPlace={canal === 'SUR_PLACE'}
                suiteSaisie={panier.suiteSaisie}
                nbArticles={nbArticles}
                totalAEnvoyer={totalAEnvoyer}
                noteCuisine={noteCuisine}
                envoiEnCours={envoiEnCours}
                onChangerRajout={panier.changerRajout}
                onChangerQuantite={panier.changerQuantite}
                onChangerSuiteLigne={panier.changerSuiteLigne}
                onSuiteSaisie={panier.setSuiteSaisie}
                onNoteCuisine={setNoteCuisine}
                onEnvoyer={handleEnvoyerCommande}
              />
            </>
          )}
        </div>
      </div>

      {produitEnSelection && (
        <ModalOptionsProduit
          produit={produitEnSelection}
          onAnnuler={() => setProduitEnSelection(null)}
          onConfirmer={handleConfirmerOptions}
        />
      )}

      {commandeAAnnuler && (
        <ModalAnnulation
          commande={commandeAAnnuler}
          droitAnnuler={droitAnnuler}
          onFermer={() => setCommandeAAnnuler(null)}
          onAnnulee={async () => {
            setCommandeAAnnuler(null);
            setConfirmation('Annulation enregistrée');
            await chargerTout();
          }}
        />
      )}

      {produitStock && (
        <ModalStock
          produit={produitStock}
          onFerme={() => setProduitStock(null)}
          onEnregistre={async () => {
            setProduitStock(null);
            setConfirmation('Stock mis à jour');
            await chargerTout();
          }}
        />
      )}
    </div>
  );
}
