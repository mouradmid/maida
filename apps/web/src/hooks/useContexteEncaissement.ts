import { useCallback, useEffect, useState } from 'react';
import { api, type ModePaiement } from '../lib/api';
import { lireCache, sauvegarderCache } from '../lib/horsLigne';
import type { InfosEtablissement } from '../components/PanneauAddition';

/**
 * Ce qu'il faut pour encaisser : moyens de paiement acceptés, journée de caisse
 * ouverte ou non, et l'en-tête du ticket.
 *
 * Chargé à part du menu, exprès : une panne ici ne doit pas empêcher de prendre
 * une commande. Et si le réseau manque, on repart du dernier état connu plutôt
 * que de bloquer la caisse — sauf pour la journée ouverte, qui ne se devine pas
 * hors ligne et reste à sa valeur précédente.
 */
export function useContexteEncaissement(horsLigne: boolean) {
  const [moyensActifs, setMoyensActifs] = useState<ModePaiement[]>(['ESPECES']);
  const [journeeOuverte, setJourneeOuverte] = useState(true);
  const [etablissement, setEtablissement] = useState<InfosEtablissement | null>(null);

  const charger = useCallback(async () => {
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
      setMoyensActifs(lireCache<ModePaiement[]>('moyensPaiement') ?? ['ESPECES']);
      setEtablissement(lireCache<InfosEtablissement>('etablissement'));
    }
  }, []);

  // Rechargé au retour du réseau : les moyens de paiement ou la journée ont pu
  // changer pendant la coupure.
  useEffect(() => {
    if (!horsLigne) charger();
  }, [horsLigne, charger]);

  return { moyensActifs, journeeOuverte, etablissement };
}
