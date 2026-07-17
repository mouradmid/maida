import { useEffect, useState } from 'react';
import { nombreEnAttente, sAbonnerFileAttente } from '../lib/horsLigne';

// État réseau du navigateur + nombre d'opérations (commandes et paiements)
// en attente de synchronisation.
export function useHorsLigne() {
  const [horsLigne, setHorsLigne] = useState(() => !navigator.onLine);
  const [enAttente, setEnAttente] = useState(() => nombreEnAttente());

  useEffect(() => {
    const surReseau = () => setHorsLigne(!navigator.onLine);
    window.addEventListener('online', surReseau);
    window.addEventListener('offline', surReseau);
    const desabonner = sAbonnerFileAttente(() => setEnAttente(nombreEnAttente()));
    return () => {
      window.removeEventListener('online', surReseau);
      window.removeEventListener('offline', surReseau);
      desabonner();
    };
  }, []);

  return { horsLigne, enAttente };
}
