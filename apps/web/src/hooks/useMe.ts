import { useCallback, useEffect, useState } from 'react';
import { api, ErreurReseau, type Utilisateur } from '../lib/api';
import { lireCache, sauvegarderCache } from '../lib/horsLigne';

export function useMe() {
  const [user, setUser] = useState<Utilisateur | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.me();
      setUser(data);
      sauvegarderCache('utilisateur', data);
    } catch (err) {
      if (err instanceof ErreurReseau) {
        // Coupure réseau : on garde la dernière session connue pour que la
        // caisse reste utilisable (la session serveur, elle, est toujours valide).
        setUser(lireCache<Utilisateur>('utilisateur'));
      } else {
        // Vraie déconnexion (session expirée, compte suspendu...) : on repart au login.
        setUser(null);
        sauvegarderCache('utilisateur', null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { user, loading, refresh };
}
