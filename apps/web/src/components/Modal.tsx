import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * Fenêtre modale : voile sombre plein écran, monté à la racine du document.
 *
 * Le portail n'est pas un détail de mise en œuvre. Les modals de la caisse sont
 * déclarés dans le panneau de commande de droite, qui est `sticky` — et une
 * position sticky crée un contexte d'empilement. Rendus sur place, ils restaient
 * prisonniers de ce contexte : leur z-50 ne valait plus rien face au plan de
 * salle, et les badges « à réclamer » comme la table sélectionnée (z-10)
 * passaient PAR-DESSUS le modal. Monté sur <body>, le voile retrouve son rang.
 *
 * `ancrage` : centré (le cas courant, sur tablette et sur PC) ou collé en bas
 * (feuille qui remonte du bord, utilisée par le menu public sur mobile).
 */
export function Modal({
  children,
  ancrage = 'centre',
  onFondClique,
}: {
  children: ReactNode;
  ancrage?: 'centre' | 'bas';
  /** Fermeture au clic hors de la fenêtre, quand le modal s'y prête. */
  onFondClique?: () => void;
}) {
  return createPortal(
    <div
      onClick={onFondClique}
      className={`fixed inset-0 z-50 flex justify-center bg-voile ${
        ancrage === 'bas' ? 'items-end' : 'items-center p-4'
      }`}
    >
      {children}
    </div>,
    document.body,
  );
}
