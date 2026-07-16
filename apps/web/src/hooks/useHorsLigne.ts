import { useEffect, useState } from 'react';
import { lireFileAttente, sAbonnerFileAttente } from '../lib/horsLigne';

// État réseau du navigateur + nombre de commandes en attente de synchronisation.
export function useHorsLigne() {
  const [horsLigne, setHorsLigne] = useState(!navigator.onLine);
  const [enAttente, setEnAttente] = useState(lireFileAttente().length);

  useEffect(() => {
    const surReseau = () => setHorsLigne(!navigator.onLine);
    window.addEventListener('online', surReseau);
    window.addEventListener('offline', surReseau);
    const desabonner = sAbonnerFileAttente(() => setEnAttente(lireFileAttente().length));
    return () => {
      window.removeEventListener('online', surReseau);
      window.removeEventListener('offline', surReseau);
      desabonner();
    };
  }, []);

  return { horsLigne, enAttente };
}
