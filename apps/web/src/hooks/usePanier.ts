import { useState } from 'react';
import type { ProduitMenu } from '../lib/api';

// Ce que le serveur est en train de composer pour une table : les articles
// nouveaux (le panier), les « la même chose en plus » sur des articles déjà
// envoyés (les rajouts), et le service dans lequel part la saisie.

export interface ChoixOption {
  groupeOptionId: string;
  optionValeurId: string;
  nomGroupe: string;
  valeur: string;
}

export interface LignePanier {
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

export function usePanier() {
  const [panier, setPanier] = useState<Record<string, LignePanier>>({});
  // « La même chose en plus » : quantités à rajouter, par article déjà envoyé.
  const [rajouts, setRajouts] = useState<Record<string, number>>({});
  // « À suivre » : le service en cours de saisie. Tout article tapé part dans
  // cette suite ; le bouton « À suivre » passe au service suivant. C'est le
  // serveur qui décide (une entrée peut servir de plat), pas la catégorie.
  const [suiteSaisie, setSuiteSaisie] = useState(1);

  function ajouterAuPanier(produit: ProduitMenu, options: ChoixOption[]) {
    const cle = cleLigne(produit.id, options, suiteSaisie);
    setPanier((p) => ({
      ...p,
      [cle]: { cle, produit, options, suite: suiteSaisie, quantite: (p[cle]?.quantite ?? 0) + 1 },
    }));
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

  // Le badge « Suite N » d'une ligne du panier fait tourner sa suite (1→2→3→1).
  function changerSuiteLigne(cle: string) {
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

  // Changement de table ou de canal : les rajouts visaient les articles de la
  // table précédente, et la saisie repart au premier service.
  function reinitialiserService() {
    setRajouts({});
    setSuiteSaisie(1);
  }

  function viderPanier() {
    setPanier({});
    setSuiteSaisie(1);
  }

  function viderRajouts() {
    setRajouts({});
  }

  return {
    panier,
    lignesPanier: Object.values(panier),
    rajouts,
    suiteSaisie,
    setSuiteSaisie,
    ajouterAuPanier,
    changerQuantite,
    changerSuiteLigne,
    changerRajout,
    reinitialiserService,
    viderPanier,
    viderRajouts,
  };
}
