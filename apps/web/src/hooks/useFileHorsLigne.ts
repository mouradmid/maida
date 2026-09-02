import { useEffect, useState } from 'react';
import { ciblesHorsLigne, quantitesEngageesHorsLigne, type CibleHorsLigne } from '../lib/horsLigne';

/**
 * Ce que la file locale sait, et que le serveur ignore encore.
 *
 * `cibles` : les additions encaissables sur le dernier état connu, quand
 * l'addition détaillée n'est plus joignable. `engagees` : les quantités déjà
 * offertes ou payées hors ligne — l'écran doit les retrancher lui-même, sinon
 * un article réglé pendant la coupure se représente au paiement.
 *
 * Recalculé à chaque bascule réseau et à chaque mouvement de la file.
 */
export function useFileHorsLigne(horsLigne: boolean, enAttente: number) {
  const [cibles, setCibles] = useState<CibleHorsLigne[]>([]);
  const [engagees, setEngagees] = useState<Record<string, number>>({});

  useEffect(() => {
    setCibles(horsLigne ? ciblesHorsLigne() : []);
    setEngagees(quantitesEngageesHorsLigne());
  }, [horsLigne, enAttente]);

  return { cibles, engagees };
}
