// Impression directe sur l'imprimante thermique, sans boîte de dialogue.
//
// Le navigateur parle à l'imprimante en USB (WebUSB) et lui envoie des octets
// ESC/POS. L'appairage se fait une seule fois, par un geste du serveur ; la
// permission est ensuite mémorisée par le navigateur, y compris après
// redémarrage de la tablette.
//
// Tout est conçu pour se dégrader proprement : sans imprimante appairée, sans
// WebUSB (Safari, Firefox), ou en cas de panne du câble, on retombe sur
// l'impression HTML du navigateur. Le ticket sort toujours.

import { rendreEscpos } from './escpos';
import { imprimerHtml, rendreHtml } from './impression';
import type { Ticket } from './ticket';

// Classe USB 7 = « Printer » : c'est ainsi que les imprimantes thermiques se
// déclarent, quel que soit le fabricant.
const CLASSE_USB_IMPRIMANTE = 0x07;
const CLE_APPAIREE = 'maida.imprimante.appairee';

export type EtatImprimante =
  | { statut: 'indisponible' } // navigateur sans WebUSB
  | { statut: 'non-appairee' }
  | { statut: 'appairee'; nom: string };

interface PeripheriqueUsb {
  productName?: string;
  manufacturerName?: string;
  vendorId: number;
  productId: number;
  opened: boolean;
  configuration: { configurationValue: number; interfaces: InterfaceUsb[] } | null;
  configurations: Array<{ configurationValue: number; interfaces: InterfaceUsb[] }>;
  open(): Promise<void>;
  close(): Promise<void>;
  selectConfiguration(valeur: number): Promise<void>;
  claimInterface(numero: number): Promise<void>;
  releaseInterface(numero: number): Promise<void>;
  // On n'envoie que des octets ESC/POS : typer précisément évite le conflit
  // entre BufferSource et Uint8Array<ArrayBufferLike> depuis TypeScript 5.7.
  transferOut(endpoint: number, donnees: Uint8Array): Promise<{ status: string }>;
}

interface InterfaceUsb {
  interfaceNumber: number;
  alternates: Array<{
    interfaceClass: number;
    endpoints: Array<{ endpointNumber: number; direction: 'in' | 'out' }>;
  }>;
}

interface UsbNavigateur {
  requestDevice(options: { filters: Array<{ classCode?: number }> }): Promise<PeripheriqueUsb>;
  getDevices(): Promise<PeripheriqueUsb[]>;
}

function usb(): UsbNavigateur | null {
  return (navigator as Navigator & { usb?: UsbNavigateur }).usb ?? null;
}

export function webUsbDisponible(): boolean {
  return usb() !== null;
}

function nomLisible(appareil: PeripheriqueUsb): string {
  return (
    appareil.productName ??
    appareil.manufacturerName ??
    `Imprimante ${appareil.vendorId.toString(16)}:${appareil.productId.toString(16)}`
  );
}

// Retrouve l'appareil déjà autorisé, s'il est branché.
async function appareilAppaire(): Promise<PeripheriqueUsb | null> {
  const api = usb();
  if (!api) return null;
  const memorise = localStorage.getItem(CLE_APPAIREE);
  if (!memorise) return null;
  try {
    const { vendorId, productId } = JSON.parse(memorise) as {
      vendorId: number;
      productId: number;
    };
    const appareils = await api.getDevices();
    return (
      appareils.find((a) => a.vendorId === vendorId && a.productId === productId) ?? appareils[0] ?? null
    );
  } catch {
    return null;
  }
}

export async function etatImprimante(): Promise<EtatImprimante> {
  if (!webUsbDisponible()) return { statut: 'indisponible' };
  const appareil = await appareilAppaire();
  return appareil ? { statut: 'appairee', nom: nomLisible(appareil) } : { statut: 'non-appairee' };
}

/**
 * Demande au serveur de désigner son imprimante. DOIT être appelé depuis un
 * clic : le navigateur refuse la fenêtre de sélection autrement.
 */
export async function appairerImprimante(): Promise<EtatImprimante> {
  const api = usb();
  if (!api) return { statut: 'indisponible' };
  const appareil = await api.requestDevice({
    filters: [{ classCode: CLASSE_USB_IMPRIMANTE }],
  });
  localStorage.setItem(
    CLE_APPAIREE,
    JSON.stringify({ vendorId: appareil.vendorId, productId: appareil.productId }),
  );
  return { statut: 'appairee', nom: nomLisible(appareil) };
}

export function oublierImprimante() {
  localStorage.removeItem(CLE_APPAIREE);
}

// Trouve l'interface « imprimante » et son point de sortie.
function trouverSortie(appareil: PeripheriqueUsb) {
  const configuration = appareil.configuration ?? appareil.configurations[0];
  for (const interfaceUsb of configuration?.interfaces ?? []) {
    for (const variante of interfaceUsb.alternates) {
      if (variante.interfaceClass !== CLASSE_USB_IMPRIMANTE) continue;
      const sortie = variante.endpoints.find((e) => e.direction === 'out');
      if (sortie) {
        return { numeroInterface: interfaceUsb.interfaceNumber, endpoint: sortie.endpointNumber };
      }
    }
  }
  return null;
}

async function envoyerUsb(appareil: PeripheriqueUsb, octets: Uint8Array) {
  if (!appareil.opened) await appareil.open();
  if (!appareil.configuration) await appareil.selectConfiguration(1);
  const sortie = trouverSortie(appareil);
  if (!sortie) throw new Error('Cet appareil USB n’expose pas d’interface d’impression');
  await appareil.claimInterface(sortie.numeroInterface);
  try {
    await appareil.transferOut(sortie.endpoint, octets);
  } finally {
    await appareil.releaseInterface(sortie.numeroInterface).catch(() => {});
  }
}

export type ResultatImpression =
  | { voie: 'directe' }
  | { voie: 'navigateur'; raison: 'pas-d-imprimante' | 'caracteres-non-imprimables' | 'erreur' };

/**
 * Imprime un ticket par le meilleur chemin disponible.
 *
 * Retombe sur l'impression navigateur quand l'imprimante directe n'est pas
 * joignable, ou quand le ticket contient des caractères que la table de
 * l'imprimante ne sait pas composer (un nom d'établissement en arabe, par
 * exemple) : mieux vaut une boîte de dialogue qu'un ticket plein de « ? ».
 */
export async function imprimerTicket(ticket: Ticket): Promise<ResultatImpression> {
  const appareil = await appareilAppaire();
  if (!appareil) {
    imprimerHtml(rendreHtml(ticket));
    return { voie: 'navigateur', raison: 'pas-d-imprimante' };
  }

  const { octets, encodable } = rendreEscpos(ticket);
  if (!encodable) {
    imprimerHtml(rendreHtml(ticket));
    return { voie: 'navigateur', raison: 'caracteres-non-imprimables' };
  }

  try {
    await envoyerUsb(appareil, octets);
    return { voie: 'directe' };
  } catch (err) {
    // Câble débranché, imprimante éteinte, interface confisquée par un pilote
    // système : le service ne doit pas s'arrêter pour autant.
    console.warn('[impression] envoi direct impossible, repli navigateur', err);
    imprimerHtml(rendreHtml(ticket));
    return { voie: 'navigateur', raison: 'erreur' };
  }
}
