import { useEffect, useState } from 'react';
import {
  api,
  ErreurReseau,
  type CategorieMenu,
  type Commande,
  type DemandeClient,
  type LigneCommande,
  type ProduitMenu,
  type TableCaisse,
  type Utilisateur,
} from '../lib/api';
import { lireCache, mettreEnAttente, sauvegarderCache } from '../lib/horsLigne';
import {
  badgeBrand,
  badgeNeutre,
  badgeVert,
  boutonPrimaire,
  boutonSecondaire,
  carte,
  champ,
  da,
  messageErreur,
  messageSucces,
} from '../lib/ui';
import { htmlTicketCuisine, htmlTicketReclame, imprimerHtml } from '../lib/impression';
import { PlanTablesCaisse } from './PlanTablesCaisse';
import { ModalAnnulation } from './ModalAnnulation';

interface ChoixOption {
  groupeOptionId: string;
  optionValeurId: string;
  nomGroupe: string;
  valeur: string;
}

interface LignePanier {
  cle: string;
  produit: ProduitMenu;
  quantite: number;
  options: ChoixOption[];
  // Suite de service de la ligne : le service en cours à la saisie
  // (« À suivre »), corrigeable via le badge de la ligne.
  suite: number;
}

function cleLigne(produitId: string, options: ChoixOption[], suite: number): string {
  const suffixe = options
    .map((o) => `${o.groupeOptionId}=${o.optionValeurId}`)
    .sort()
    .join(',');
  return `${produitId}::${suite}::${suffixe}`;
}

const SUITES = [1, 2, 3];

export function PriseDeCommande({ droitAnnuler }: { droitAnnuler: boolean }) {
  const [categories, setCategories] = useState<CategorieMenu[]>([]);
  const [tables, setTables] = useState<TableCaisse[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [canal, setCanal] = useState<'SUR_PLACE' | 'EMPORTER'>('SUR_PLACE');
  const [tableId, setTableId] = useState('');
  const [noteCuisine, setNoteCuisine] = useState('');
  const [panier, setPanier] = useState<Record<string, LignePanier>>({});
  // « À suivre » : le service en cours de saisie. Tout article tapé part dans
  // cette suite ; le bouton « À suivre » passe au service suivant. C'est le
  // serveur qui décide (une entrée peut servir de plat), pas la catégorie.
  const [suiteSaisie, setSuiteSaisie] = useState(1);
  // « La même chose en plus » : quantités à rajouter, par article déjà envoyé.
  const [rajouts, setRajouts] = useState<Record<string, number>>({});
  const [categorieActiveId, setCategorieActiveId] = useState<string | null>(null);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const [produitEnSelection, setProduitEnSelection] = useState<ProduitMenu | null>(null);
  const [choixEnCours, setChoixEnCours] = useState<Record<string, string>>({});
  const [erreurOptions, setErreurOptions] = useState<string | null>(null);
  const [commandeAAnnuler, setCommandeAAnnuler] = useState<Commande | null>(null);
  // Dernier bon imprimable depuis le bandeau de confirmation : bon cuisine
  // après un envoi, bon de réclame après une réclame.
  const [ticketAImprimer, setTicketAImprimer] = useState<{ libelle: string; html: string } | null>(null);
  const [demandes, setDemandes] = useState<DemandeClient[]>([]);
  // Article en cours de déplacement vers une autre suite (toucher-toucher).
  const [ligneEnDeplacement, setLigneEnDeplacement] = useState<string | null>(null);

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
    } catch {
      // hors ligne : on garde le dernier état connu
    }
  }

  useEffect(() => {
    chargerDemandes();
    const minuterie = setInterval(() => {
      chargerDemandes();
      rafraichirCommandes();
    }, 15_000);
    return () => clearInterval(minuterie);
  }, []);

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
    } catch (err) {
      // Coupure réseau : on continue avec le dernier menu connu.
      const menuCache = err instanceof ErreurReseau ? lireCache<CategorieMenu[]>('menu') : null;
      if (menuCache && menuCache.length > 0) {
        setCategories(menuCache);
        setTables(lireCache<TableCaisse[]>('tables') ?? []);
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

  function ajouterAuPanierDirect(produit: ProduitMenu, options: ChoixOption[]) {
    const cle = cleLigne(produit.id, options, suiteSaisie);
    setPanier((p) => ({
      ...p,
      [cle]: { cle, produit, options, suite: suiteSaisie, quantite: (p[cle]?.quantite ?? 0) + 1 },
    }));
  }

  // Le badge « Suite N » d'une ligne du panier fait tourner sa suite (1→2→3→1).
  function changerSuiteLignePanier(cle: string) {
    setPanier((p) => {
      const ligne = p[cle];
      if (!ligne) return p;
      const suite = (ligne.suite % 3) + 1;
      const nouvelleCle = cleLigne(ligne.produit.id, ligne.options, suite);
      const { [cle]: _retire, ...reste } = p;
      const existante = reste[nouvelleCle];
      return {
        ...reste,
        [nouvelleCle]: {
          ...ligne,
          cle: nouvelleCle,
          suite,
          quantite: ligne.quantite + (existante?.quantite ?? 0),
        },
      };
    });
  }

  function handleClicProduit(produit: ProduitMenu) {
    if (produit.groupesOptions.length === 0) {
      ajouterAuPanierDirect(produit, []);
      return;
    }
    setProduitEnSelection(produit);
    setChoixEnCours({});
    setErreurOptions(null);
  }

  function handleConfirmerSelection() {
    if (!produitEnSelection) return;
    const groupesManquants = produitEnSelection.groupesOptions.filter(
      (g) => g.obligatoire && !choixEnCours[g.id],
    );
    if (groupesManquants.length > 0) {
      setErreurOptions(`Choisissez : ${groupesManquants.map((g) => g.nom).join(', ')}`);
      return;
    }
    setErreurOptions(null);
    const options: ChoixOption[] = produitEnSelection.groupesOptions
      .filter((g) => choixEnCours[g.id])
      .map((g) => {
        const valeur = g.valeurs.find((v) => v.id === choixEnCours[g.id])!;
        return {
          groupeOptionId: g.id,
          optionValeurId: valeur.id,
          nomGroupe: g.nom,
          valeur: valeur.valeur,
        };
      });
    ajouterAuPanierDirect(produitEnSelection, options);
    setProduitEnSelection(null);
    setChoixEnCours({});
  }

  function changerQuantite(cle: string, delta: number) {
    setPanier((p) => {
      const existant = p[cle];
      if (!existant) return p;
      const quantite = existant.quantite + delta;
      if (quantite <= 0) {
        const { [cle]: _retire, ...reste } = p;
        return reste;
      }
      return { ...p, [cle]: { ...existant, quantite } };
    });
  }

  function changerRajout(ligneId: string, delta: number) {
    setRajouts((r) => {
      const quantite = Math.min((r[ligneId] ?? 0) + delta, 50);
      if (quantite <= 0) {
        const { [ligneId]: _retire, ...reste } = r;
        return reste;
      }
      return { ...r, [ligneId]: quantite };
    });
  }

  const lignesPanier = Object.values(panier);
  const categorieActive = categories.find((c) => c.id === categorieActiveId) ?? categories[0];
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
  const lignesEnvoyees: Array<{ ligne: LigneCommande; commande: Commande }> = commandesTable.flatMap(
    (c) => c.lignes.map((ligne) => ({ ligne, commande: c })),
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

  const lignesRajouts = Object.entries(rajouts)
    .map(([ligneId, quantite]) => ({ entree: lignesParId.get(ligneId), ligneId, quantite }))
    .filter(
      (
        r,
      ): r is {
        entree: { ligne: LigneCommande; commande: Commande };
        ligneId: string;
        quantite: number;
      } => Boolean(r.entree),
    );
  const totalRajouts = lignesRajouts.reduce((s, r) => s + r.entree.ligne.prixUnitaire * r.quantite, 0);
  const totalPanier = lignesPanier.reduce((s, l) => s + l.produit.prix * l.quantite, 0);
  const totalAEnvoyer = totalPanier + totalRajouts;
  const nbArticles =
    lignesPanier.reduce((s, l) => s + l.quantite, 0) + lignesRajouts.reduce((s, r) => s + r.quantite, 0);

  function handleChoisirTable(id: string) {
    if (id !== tableId) {
      // Les rajouts visent les articles de la table précédente : on repart à zéro.
      setRajouts({});
      setLigneEnDeplacement(null);
      setSuiteSaisie(1);
    }
    setTableId(id);
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
        html: htmlTicketReclame(destination, res.suiteReclamee, lignesSuite),
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
    const lignesProduits = lignesPanier.map((l) => ({
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

    setEnvoiEnCours(true);
    try {
      const commande = await api.creerCommande(donnees);
      setConfirmation(`Commande envoyée — total ${commande.total} DA`);
      setTicketAImprimer({ libelle: '🖨 Bon cuisine', html: htmlTicketCuisine(commande) });
      setPanier({});
      setRajouts({});
      setSuiteSaisie(1);
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
        // Coupure réseau : la commande part dans la file locale, le service continue.
        const entree = mettreEnAttente({
          description: `${tableSelectionnee ? `Table ${tableSelectionnee.numero}` : 'À emporter'} — ${totalPanier} DA`,
          total: totalPanier,
          donnees: {
            canal,
            tableId: donnees.tableId,
            noteCuisine: donnees.noteCuisine,
            lignes: lignesProduits,
          },
        });
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
          preteLe: null,
          serveur: {
            nom: utilisateurLocal?.nom ?? '',
            prenom: utilisateurLocal?.prenom ?? 'Caisse',
          },
          lignes: lignesPanier.map((l, i) => ({
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
        setTicketAImprimer({ libelle: '🖨 Bon cuisine', html: htmlTicketCuisine(commandeLocale) });
        setConfirmation(
          `Hors ligne — commande enregistrée (${totalPanier} DA), elle sera envoyée au retour du réseau`,
        );
        if (canal === 'SUR_PLACE' && tableId) {
          setTables((liste) => liste.map((t) => (t.id === tableId ? { ...t, occupee: true } : t)));
        }
        setPanier({});
        setSuiteSaisie(1);
        setNoteCuisine('');
        if (canal === 'EMPORTER') setTableId('');
        return;
      }
      setErreur(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setEnvoiEnCours(false);
    }
  }

  function boutonRajout(ligne: LigneCommande) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          changerRajout(ligne.id, 1);
        }}
        aria-label={`Ajouter un ${ligne.nomProduit}`}
        title="En rajouter un (part en cuisine avec le prochain envoi)"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 text-xs font-bold leading-none text-white hover:bg-brand-700"
      >
        +
      </button>
    );
  }

  // Petit « ✕ » sur un article envoyé : ouvre l'annulation de sa commande.
  function boutonAnnulerCommande(commande: Commande) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setCommandeAAnnuler(commande);
        }}
        aria-label="Annuler des articles de cette commande"
        title="Annuler des articles de cette commande"
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-red-200 bg-white text-xs font-bold leading-none text-red-600 hover:bg-red-50"
      >
        ✕
      </button>
    );
  }

  if (chargement) return <p className="text-center text-stone-500">Chargement du menu...</p>;

  return (
    <div className="flex w-full flex-col gap-6">
      {erreur && <p className={messageErreur}>{erreur}</p>}
      {demandes.length > 0 && (
        <div className="flex flex-col gap-2 rounded-xl border-2 border-sky-300 bg-sky-50 p-4">
          <h3 className="flex items-center gap-2 font-semibold text-sky-900">
            📱 Commandes clients à valider
            <span className="inline-flex items-center rounded-full bg-sky-600 px-2.5 py-0.5 text-xs font-semibold text-white">
              {demandes.length}
            </span>
          </h3>
          <ul className="flex flex-col divide-y divide-sky-200">
            {demandes.map((demande) => (
              <li key={demande.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold text-stone-900">
                    Table {demande.table.numero}
                    <span className="ml-2 font-normal text-stone-500">
                      {new Date(demande.creeLe).toLocaleTimeString('fr-FR', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {demande.total !== null && (
                      <span className="ml-2 font-bold text-sky-900">{da(demande.total)}</span>
                    )}
                  </p>
                  {demande.lignes && (
                    <p className="text-stone-600">
                      {demande.lignes
                        .map(
                          (l) =>
                            `${l.quantite}× ${l.nomProduit}${l.options.length ? ` (${l.options.join(', ')})` : ''}`,
                        )
                        .join(' · ')}
                    </p>
                  )}
                  {demande.note && <p className="text-xs text-stone-500">« {demande.note} »</p>}
                  {demande.probleme && (
                    <p className="text-xs font-medium text-red-700">⚠ {demande.probleme}</p>
                  )}
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    disabled={demande.probleme !== null}
                    onClick={() => handleAccepterDemande(demande)}
                    className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-40"
                  >
                    Accepter → cuisine
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRefuserDemande(demande)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50"
                  >
                    Refuser
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {confirmation && (
        <div className={`${messageSucces} flex items-center justify-between gap-3`}>
          <span>{confirmation}</span>
          {ticketAImprimer && (
            <button
              type="button"
              onClick={() => imprimerHtml(ticketAImprimer.html)}
              className="shrink-0 rounded-lg border border-green-300 bg-white px-3 py-1.5 text-xs font-semibold text-green-800 transition-colors hover:bg-green-100"
            >
              {ticketAImprimer.libelle}
            </button>
          )}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
        {/* Colonne menu */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-lg border border-stone-200 bg-white p-1">
              <button
                type="button"
                onClick={() => setCanal('SUR_PLACE')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  canal === 'SUR_PLACE' ? 'bg-brand-600 text-white' : 'text-stone-600 hover:bg-stone-50'
                }`}
              >
                Sur place
              </button>
              <button
                type="button"
                onClick={() => setCanal('EMPORTER')}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
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

          {canal === 'EMPORTER' && commandesEmporter.length > 0 && (
            <div className={carte}>
              <h3 className="mb-2 text-sm font-semibold text-stone-900">À emporter en préparation</h3>
              <ul className="flex flex-col divide-y divide-stone-100">
                {commandesEmporter.map((c) => {
                  const annulable =
                    c.statut !== 'ANNULEE' &&
                    c.lignes.some((l) => l.quantite - l.quantitePayee - l.quantiteAnnulee > 0);
                  const suiteMax = Math.max(1, ...c.lignes.map((l) => l.suite));
                  return (
                    <li
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-stone-900">
                          {new Date(c.creeLe).toLocaleTimeString('fr-FR', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                        {c.statut === 'PRETE' && <span className={`${badgeVert} ml-2`}>prête</span>}
                        <span className="ml-2 text-xs text-stone-500">
                          {c.lignes
                            .filter((l) => l.quantite - l.quantiteAnnulee > 0)
                            .map(
                              (l) =>
                                `${l.quantite - l.quantiteAnnulee}× ${l.nomProduit}${
                                  l.options.length
                                    ? ` (${l.options.map((o) => o.valeur).join(', ')})`
                                    : ''
                                }`,
                            )
                            .join(' · ')}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="font-semibold text-stone-900">{da(c.total)}</span>
                        {c.statut === 'ENVOYEE' && c.suiteReclamee < suiteMax && (
                          <button
                            type="button"
                            onClick={() => handleReclamerTable(c.additionId)}
                            className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
                          >
                            Réclamer la suite {c.suiteReclamee + 1}
                          </button>
                        )}
                        {annulable && (
                          <button
                            type="button"
                            onClick={() => setCommandeAAnnuler(c)}
                            className="text-xs font-medium text-red-600 transition-colors hover:text-red-800"
                          >
                            Annuler
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategorieActiveId(cat.id)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                  categorieActive?.id === cat.id
                    ? 'bg-stone-900 text-white'
                    : 'bg-white text-stone-600 border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {cat.nom}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {categorieActive?.produits.map((produit) => (
              <button
                key={produit.id}
                type="button"
                onClick={() => handleClicProduit(produit)}
                className="flex flex-col gap-1 rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow"
              >
                <span className="text-sm font-semibold leading-snug text-stone-900">{produit.nom}</span>
                <span className="text-base font-bold text-brand-700">{produit.prix} DA</span>
                <span className="flex flex-wrap gap-1">
                  {produit.tempsPreparationMinutes != null && (
                    <span className={badgeNeutre}>{produit.tempsPreparationMinutes} min</span>
                  )}
                  {produit.groupesOptions.length > 0 && <span className={badgeNeutre}>options</span>}
                </span>
              </button>
            ))}
            {(categorieActive?.produits.length ?? 0) === 0 && (
              <p className="col-span-full text-sm text-stone-400">Aucun produit dans cette catégorie.</p>
            )}
          </div>
        </div>

        {/* Panneau de commande : tout ce qui concerne la table sélectionnée */}
        <div className={`${carte} sticky top-20 flex flex-col gap-4`}>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">Commande</h2>
            {nbArticles > 0 && (
              <span className={badgeNeutre}>
                {nbArticles} article{nbArticles > 1 ? 's' : ''} à envoyer
              </span>
            )}
          </div>

          <div>
            {canal === 'EMPORTER' ? (
              <span className={badgeBrand}>À emporter</span>
            ) : tableSelectionnee ? (
              <span className={badgeBrand}>Table {tableSelectionnee.numero}</span>
            ) : (
              <span className={badgeNeutre}>Touchez une table sur le plan</span>
            )}
          </div>

          {/* Déjà envoyé : les articles en cuisine, groupés par suite */}
          {commandesTable.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-stone-50/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">
                  Déjà envoyé — {da(totalEnvoye)}
                </span>
                {commandesEnvoyees.length > 0 && suiteReclameeTable < suiteMaxTable && (
                  <button
                    type="button"
                    onClick={() => additionIdTable && handleReclamerTable(additionIdTable)}
                    title="La table est prête pour la suite : la cuisine peut la préparer"
                    className="rounded-full bg-sky-600 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-sky-700"
                  >
                    Réclamer la suite {suiteReclameeTable + 1}
                  </button>
                )}
              </div>

              {SUITES.filter(
                (suite) =>
                  lignesEnvoyees.some((e) => e.ligne.suite === suite) || ligneEnDeplacement !== null,
              ).map((suite) => (
                <div
                  key={suite}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => handleDeposerDansSuite(suite)}
                  onClick={() => {
                    // Équivalent tactile du glisser-déposer : on touche
                    // l'article, puis la suite de destination.
                    if (ligneEnDeplacement) handleDeposerDansSuite(suite);
                  }}
                  className={`flex flex-col gap-1 rounded-lg border px-2 py-1.5 ${
                    ligneEnDeplacement
                      ? 'cursor-pointer border-dashed border-sky-400 bg-sky-50'
                      : 'border-stone-200 bg-white'
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                    Suite {suite}
                    {suite <= suiteReclameeTable ? ' · en cuisine' : ' · en attente'}
                  </span>
                  {lignesEnvoyees
                    .filter((e) => e.ligne.suite === suite)
                    .map(({ ligne, commande }) => {
                      const active = ligne.quantite - ligne.quantiteAnnulee;
                      const deplacable = commande.statut === 'ENVOYEE';
                      return (
                        <span
                          key={ligne.id}
                          draggable={deplacable}
                          onDragStart={() => deplacable && setLigneEnDeplacement(ligne.id)}
                          onDragEnd={() => setLigneEnDeplacement(null)}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!deplacable) return;
                            setLigneEnDeplacement(ligneEnDeplacement === ligne.id ? null : ligne.id);
                          }}
                          title={
                            deplacable
                              ? 'Glissez (ou touchez puis touchez la suite de destination) pour changer de suite'
                              : undefined
                          }
                          className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs shadow-sm ring-1 ${
                            deplacable ? 'cursor-grab active:cursor-grabbing' : ''
                          } ${
                            ligneEnDeplacement === ligne.id
                              ? 'bg-sky-600 text-white ring-sky-600'
                              : `bg-white ring-stone-200 ${active === 0 ? 'text-stone-400 line-through' : 'text-stone-700'}`
                          }`}
                        >
                          <span className="min-w-0">
                            {active === 0 ? ligne.quantite : active}× {ligne.nomProduit}
                            {ligne.options.length > 0 &&
                              ` (${ligne.options.map((o) => o.valeur).join(', ')})`}
                            {commande.statut === 'PRETE' && (
                              <span className="ml-1 font-semibold text-green-700">✓ prête</span>
                            )}
                          </span>
                          <span className="flex shrink-0 items-center gap-1">
                            {active > 0 && boutonRajout(ligne)}
                            {active > 0 && boutonAnnulerCommande(commande)}
                          </span>
                        </span>
                      );
                    })}
                </div>
              ))}

              {commandesTable.some((c) => c.noteCuisine) && (
                <p className="text-xs italic text-brand-700">
                  Cuisine :{' '}
                  {commandesTable
                    .filter((c) => c.noteCuisine)
                    .map((c) => c.noteCuisine)
                    .join(' · ')}
                </p>
              )}
            </div>
          )}

          {/* À envoyer : rajouts + nouveaux articles */}
          {lignesRajouts.length > 0 && (
            <ul className="flex flex-col gap-2 rounded-lg border border-brand-200 bg-brand-50 p-2.5">
              {lignesRajouts.map(({ entree, ligneId, quantite }) => (
                <li key={ligneId} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 text-stone-800">
                    {entree.ligne.nomProduit}
                    {entree.ligne.options.length > 0 && (
                      <span className="text-stone-500">
                        {' '}
                        ({entree.ligne.options.map((o) => o.valeur).join(', ')})
                      </span>
                    )}
                    <span className="ml-1 text-xs text-stone-500">— rajout</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => changerRajout(ligneId, -1)}
                      aria-label={`Retirer un ${entree.ligne.nomProduit}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-semibold">+{quantite}</span>
                    <button
                      type="button"
                      onClick={() => changerRajout(ligneId, 1)}
                      aria-label={`Ajouter un ${entree.ligne.nomProduit}`}
                      className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
                    >
                      +
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {lignesPanier.length === 0 && lignesRajouts.length === 0 && (
            <p className="py-4 text-center text-sm text-stone-400">
              Touchez un produit pour l'ajouter à la commande
              {commandesTable.length > 0 ? ', ou « + » sur un article envoyé pour en rajouter un' : ''}.
            </p>
          )}

          <ul className="flex flex-col gap-3">
            {[...lignesPanier]
              .sort((a, b) => a.suite - b.suite)
              .map((ligne, index, triees) => (
                <li key={ligne.cle} className="flex flex-col gap-1">
                  {/* Séparateur de service quand le panier couvre plusieurs suites */}
                  {new Set(triees.map((l) => l.suite)).size > 1 &&
                    (index === 0 || triees[index - 1].suite !== ligne.suite) && (
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                        Suite {ligne.suite}
                      </p>
                    )}
                  <div className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-stone-900">{ligne.produit.nom}</p>
                      {ligne.options.length > 0 && (
                        <p className="text-xs text-stone-500">
                          {ligne.options.map((o) => `${o.nomGroupe} : ${o.valeur}`).join(' · ')}
                        </p>
                      )}
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-stone-500">
                        {ligne.produit.prix * ligne.quantite} DA
                        <button
                          type="button"
                          onClick={() => changerSuiteLignePanier(ligne.cle)}
                          title="Changer l'article de service (entrée / plat / dessert)"
                          className="rounded-full border border-stone-300 bg-white px-2 py-px text-[10px] font-semibold text-stone-600 hover:bg-stone-50"
                        >
                          Suite {ligne.suite}
                        </button>
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => changerQuantite(ligne.cle, -1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                        aria-label="Retirer un"
                      >
                        −
                      </button>
                      <span className="w-6 text-center font-semibold">{ligne.quantite}</span>
                      <button
                        type="button"
                        onClick={() => changerQuantite(ligne.cle, 1)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-50"
                        aria-label="Ajouter un"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </li>
              ))}
          </ul>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSuiteSaisie((s) => Math.min(s + 1, 3))}
              disabled={suiteSaisie >= 3}
              title="Passer au service suivant : les prochains articles partiront à suivre"
              className="rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:opacity-40"
            >
              À suivre →
            </button>
            {suiteSaisie > 1 && (
              <span className="flex items-center gap-1.5 text-xs text-sky-800">
                saisie en suite {suiteSaisie}
                <button
                  type="button"
                  onClick={() => setSuiteSaisie(1)}
                  aria-label="Revenir à la suite 1"
                  title="Revenir à la suite 1"
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-sky-300 bg-white text-[10px] font-bold leading-none text-sky-700 hover:bg-sky-100"
                >
                  ✕
                </button>
              </span>
            )}
          </div>

          {nbArticles > 0 && (
            <div className="flex items-center justify-between border-t border-stone-100 pt-3">
              <span className="text-sm font-medium text-stone-600">À envoyer</span>
              <span className="text-xl font-bold text-stone-900">{totalAEnvoyer} DA</span>
            </div>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium text-stone-600" htmlFor="noteCuisine">
              Message pour la cuisine (optionnel)
            </label>
            <textarea
              id="noteCuisine"
              value={noteCuisine}
              onChange={(e) => setNoteCuisine(e.target.value)}
              rows={2}
              placeholder="ex : client allergique aux fruits de mer"
              className={champ}
            />
          </div>

          <button
            type="button"
            disabled={nbArticles === 0 || envoiEnCours}
            onClick={handleEnvoyerCommande}
            className={`${boutonPrimaire} py-3 text-base`}
          >
            Envoyer en cuisine
          </button>
        </div>
      </div>

      {/* Sélection des options en surimpression */}
      {produitEnSelection && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-stone-900/40 p-4">
          <div className={`${carte} w-full max-w-md`}>
            <h3 className="text-lg font-semibold text-stone-900">{produitEnSelection.nom}</h3>
            <p className="mt-0.5 text-sm font-semibold text-brand-700">{produitEnSelection.prix} DA</p>

            <div className="mt-4 flex flex-col gap-4">
              {produitEnSelection.groupesOptions.map((groupe) => (
                <div key={groupe.id}>
                  <p className="mb-2 text-sm font-medium text-stone-700">
                    {groupe.nom}
                    {groupe.obligatoire && <span className="text-brand-600"> *</span>}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {groupe.valeurs.map((valeur) => (
                      <button
                        key={valeur.id}
                        type="button"
                        onClick={() => setChoixEnCours((c) => ({ ...c, [groupe.id]: valeur.id }))}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                          choixEnCours[groupe.id] === valeur.id
                            ? 'bg-brand-600 text-white'
                            : 'bg-white text-stone-600 border border-stone-300 hover:bg-stone-50'
                        }`}
                      >
                        {valeur.valeur}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {erreurOptions && <p className={`${messageErreur} mt-4`}>{erreurOptions}</p>}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handleConfirmerSelection}
                className={`${boutonPrimaire} flex-1`}
              >
                Ajouter à la commande
              </button>
              <button
                type="button"
                onClick={() => setProduitEnSelection(null)}
                className={boutonSecondaire}
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
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
    </div>
  );
}
