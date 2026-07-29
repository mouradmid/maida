import { useEffect, useState } from 'react';
import { nombreEnAttente, sAbonnerFileAttente } from '../lib/horsLigne';
import { reseauCoupe, sAbonnerReseau } from '../lib/reseau';

// État réseau réel + nombre d'opérations (commandes et paiements) en attente de
// synchronisation. « Hors ligne » ne se limite pas à navigator.onLine : un
// serveur qui ne répond plus compte aussi (voir lib/reseau.ts).
export function useHorsLigne() {
  const [horsLigne, setHorsLigne] = useState(() => reseauCoupe());
  const [enAttente, setEnAttente] = useState(() => nombreEnAttente());

  useEffect(() => {
    const surReseau = () => setHorsLigne(reseauCoupe());
    window.addEventListener('online', surReseau);
    window.addEventListener('offline', surReseau);
    const desabonnerReseau = sAbonnerReseau(surReseau);
    const desabonnerFile = sAbonnerFileAttente(() => setEnAttente(nombreEnAttente()));
    return () => {
      window.removeEventListener('online', surReseau);
      window.removeEventListener('offline', surReseau);
      desabonnerReseau();
      desabonnerFile();
    };
  }, []);

  return { horsLigne, enAttente };
}
