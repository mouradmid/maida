import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, ErreurReseau, type OccasionReservation, type RestrictionAlimentaire } from '../lib/api';
import { LIBELLES_OCCASION, LIBELLES_RESTRICTION, OCCASIONS, RESTRICTIONS } from '../lib/libelles';
import { Logo } from '../components/Logo';

type Page = Awaited<ReturnType<typeof api.pageReservation>>;
type Creneau = Awaited<ReturnType<typeof api.creneauxReservation>>['creneaux'][number];
type Confirmation = Awaited<ReturnType<typeof api.reserverEnLigne>>;

// L'Algérie vit à UTC+1 toute l'année : le restaurant et son client partagent
// la même heure, quel que soit le réglage du téléphone qui affiche la page.
const DECALAGE_ALGER_MS = 60 * 60_000;
const JOUR_MS = 24 * 60 * 60_000;
// Au-delà, le choix du jour devient une liste interminable : le client qui
// réserve à deux mois appelle de toute façon.
const JOURS_AFFICHES_MAX = 60;
const COUVERTS_EN_BOUTONS = 12;

function instantAlger(jour: string, heure: string): number {
  const [a, mo, j] = jour.split('-').map(Number);
  const [h, mi] = heure.split(':').map(Number);
  return Date.UTC(a, mo - 1, j, h, mi) - DECALAGE_ALGER_MS;
}

/** Les jours proposés, du jour même à l'horizon du restaurant (heure d'Alger). */
function joursProposes(horizonJours: number, joursOuverts: number[]) {
  const jours = [];
  for (let n = 0; n <= Math.min(horizonJours, JOURS_AFFICHES_MAX); n++) {
    const d = new Date(Date.now() + n * JOUR_MS + DECALAGE_ALGER_MS);
    const iso = d.toISOString().slice(0, 10);
    const libelle =
      n === 0
        ? "Aujourd'hui"
        : n === 1
          ? 'Demain'
          : d.toLocaleDateString('fr-FR', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              timeZone: 'UTC',
            });
    jours.push({ iso, libelle, ouvert: joursOuverts.includes(d.getUTCDay()) });
  }
  return jours;
}

function dateLisible(jour: string, heure: string): string {
  return new Date(instantAlger(jour, heure)).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Algiers',
  });
}

const pastille = (actif: boolean) =>
  `min-h-11 rounded-full px-4 text-sm font-medium transition-colors ${
    actif
      ? 'bg-brand-600 text-white'
      : 'border border-stone-300 bg-card text-stone-700 hover:bg-stone-50'
  }`;

const champ = 'w-full rounded-lg border border-stone-300 bg-card px-3 py-2.5 text-sm';

/**
 * Page publique de réservation d'un restaurant, à la manière de Zenchef ou
 * TheFork : le client choisit le nombre de personnes, le jour, puis un
 * créneau parmi ceux que le restaurant ouvre — les complets sont grisés. Il
 * laisse ensuite ses coordonnées, son occasion et ses restrictions
 * alimentaires.
 *
 * Atteinte par le lien que le restaurant partage (réseaux, site, WhatsApp,
 * affiche en vitrine), pas par le QR code de table, qui sert à commander sur
 * place.
 */
export function ReservationPublique() {
  const { lien } = useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [introuvable, setIntrouvable] = useState(false);

  const [couverts, setCouverts] = useState(2);
  const [jour, setJour] = useState<string | null>(null);
  const [creneaux, setCreneaux] = useState<Creneau[] | null>(null);
  const [heure, setHeure] = useState<string | null>(null);
  const [etape, setEtape] = useState<'creneau' | 'coordonnees'>('creneau');
  // Vrai dès que le client touche un jour : on ne le déplace plus ensuite.
  const jourChoisiParClient = useRef(false);

  const [nomClient, setNomClient] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [occasion, setOccasion] = useState<OccasionReservation | null>(null);
  const [restrictions, setRestrictions] = useState<RestrictionAlimentaire[]>([]);
  const [note, setNote] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    if (!lien) return;
    api
      .pageReservation(lien)
      .then(setPage)
      .catch(() => setIntrouvable(true));
  }, [lien]);

  const limites = page?.reservationEnLigne ?? null;
  const jours = useMemo(
    () => (limites ? joursProposes(limites.horizonJours, limites.joursOuverts) : []),
    [limites],
  );

  // Premier jour ouvert sélectionné d'office : le client voit tout de suite
  // des créneaux, comme sur les plateformes qu'il connaît.
  useEffect(() => {
    if (!jour && jours.length > 0) {
      setJour(jours.find((j) => j.ouvert)?.iso ?? null);
    }
  }, [jours, jour]);

  useEffect(() => {
    if (!lien || !jour) return;
    let annule = false;
    setCreneaux(null);
    setHeure(null);
    api
      .creneauxReservation(lien, jour, couverts)
      .then((r) => {
        if (annule) return;
        // Tant que le client n'a pas choisi lui-même, on ne l'accueille pas sur
        // un jour sans place : le soir, « aujourd'hui » n'a plus de créneau, et
        // il croirait le restaurant complet. On avance au jour ouvert suivant.
        if (!jourChoisiParClient.current && !r.creneaux.some((c) => c.disponible)) {
          const suivant = jours.find((j) => j.ouvert && j.iso > jour);
          if (suivant) {
            setJour(suivant.iso);
            return;
          }
        }
        setCreneaux(r.creneaux);
      })
      .catch(() => !annule && setCreneaux([]));
    return () => {
      annule = true;
    };
  }, [lien, jour, couverts, jours]);

  async function reserver(e: React.FormEvent) {
    e.preventDefault();
    if (!page || !jour || !heure || enCours) return;
    setErreur(null);
    setEnCours(true);
    try {
      setConfirmation(
        await api.reserverEnLigne({
          etablissementId: page.etablissementId,
          nomClient: nomClient.trim(),
          telephone: telephone.trim(),
          email: email.trim() || undefined,
          nombreCouverts: couverts,
          date: new Date(instantAlger(jour, heure)).toISOString(),
          note: note.trim() || undefined,
          occasion: occasion ?? undefined,
          restrictions: restrictions.length ? restrictions : undefined,
        }),
      );
    } catch (err) {
      setErreur(
        err instanceof ErreurReseau
          ? 'Pas de connexion — réessayez, ou appelez le restaurant.'
          : err instanceof Error
            ? err.message
            : 'Une erreur est survenue',
      );
    } finally {
      setEnCours(false);
    }
  }

  if (introuvable) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <Logo />
        <p className="text-stone-600">Ce lien de réservation n'existe pas, ou plus.</p>
      </div>
    );
  }

  if (!page) {
    return <p className="p-10 text-center text-stone-500">Chargement...</p>;
  }

  const enTete = (
    <header className="bg-gradient-to-br from-brand-600 to-brand-800 px-4 pb-6 pt-8 text-center text-white">
      <p className="text-sm font-medium uppercase tracking-wide text-white/70">Réserver une table</p>
      <h1 className="mt-1 text-2xl font-bold">{page.etablissement.nom}</h1>
      {(page.etablissement.adresse || page.etablissement.ville) && (
        <p className="mt-1 text-sm text-white/80">
          {[page.etablissement.adresse, page.etablissement.ville].filter(Boolean).join(', ')}
        </p>
      )}
    </header>
  );

  if (confirmation) {
    return (
      <div className="min-h-screen">
        {enTete}
        <main className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-10 text-center">
          <span className="text-6xl">🍽️</span>
          <h2 className="text-xl font-bold text-stone-900">Votre table est réservée</h2>
          <p className="text-stone-600">
            {jour && heure && dateLisible(jour, heure)}
            <br />
            {confirmation.nombreCouverts} personne{confirmation.nombreCouverts > 1 ? 's' : ''} · table{' '}
            <span className="font-bold text-brand-700">{confirmation.table}</span>
          </p>
          {occasion && (
            <p className="text-sm text-stone-600">
              {LIBELLES_OCCASION[occasion].icone} Le restaurant sait que c'est pour{' '}
              {LIBELLES_OCCASION[occasion].texte.toLowerCase()}.
            </p>
          )}
          <p className="max-w-sm text-sm text-stone-500">
            {confirmation.confirmationEnvoyee
              ? 'Une confirmation part par e-mail. En cas d’empêchement, prévenez le restaurant.'
              : 'En cas d’empêchement, prévenez le restaurant : la table pourra servir à quelqu’un d’autre.'}
          </p>
        </main>
      </div>
    );
  }

  if (!limites) {
    return (
      <div className="min-h-screen">
        {enTete}
        <p className="mx-auto max-w-xl px-4 py-10 text-center text-stone-600">
          Ce restaurant ne prend pas de réservation en ligne pour le moment. Appelez-le directement.
        </p>
      </div>
    );
  }

  const parService = new Map<string, Creneau[]>();
  for (const c of creneaux ?? []) {
    parService.set(c.service, [...(parService.get(c.service) ?? []), c]);
  }

  return (
    <div className="min-h-screen pb-16">
      {enTete}

      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-6">
        {etape === 'creneau' ? (
          <>
            <section>
              <h2 className="mb-2 font-semibold text-stone-900">Combien de personnes ?</h2>
              <div className="flex flex-wrap gap-2">
                {Array.from(
                  { length: Math.min(limites.couvertsMax, COUVERTS_EN_BOUTONS) },
                  (_, i) => i + 1,
                ).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setCouverts(n)}
                    aria-pressed={couverts === n}
                    className={`${pastille(couverts === n)} w-11 px-0`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-stone-500">
                Plus de {Math.min(limites.couvertsMax, COUVERTS_EN_BOUTONS)} personnes ? Appelez le
                restaurant, il organisera votre venue.
              </p>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-stone-900">Quel jour ?</h2>
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
                {jours.map((j) => (
                  <button
                    key={j.iso}
                    type="button"
                    disabled={!j.ouvert}
                    onClick={() => {
                      jourChoisiParClient.current = true;
                      setJour(j.iso);
                    }}
                    aria-pressed={jour === j.iso}
                    className={`${pastille(jour === j.iso)} shrink-0 first-letter:uppercase disabled:cursor-not-allowed disabled:opacity-35`}
                  >
                    {j.libelle}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-2 font-semibold text-stone-900">À quelle heure ?</h2>
              {creneaux === null ? (
                <p className="text-sm text-stone-500">Recherche des tables libres...</p>
              ) : creneaux.length === 0 ? (
                <p className="text-sm text-stone-500">
                  Plus de réservation possible ce jour-là. Essayez un autre jour.
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  {[...parService].map(([service, liste]) => (
                    <div key={service}>
                      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">
                        {service}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {liste.map((c) => (
                          <button
                            key={c.heure}
                            type="button"
                            disabled={!c.disponible}
                            onClick={() => setHeure(c.heure)}
                            aria-pressed={heure === c.heure}
                            title={c.disponible ? undefined : 'Complet'}
                            className={`${pastille(heure === c.heure)} disabled:cursor-not-allowed disabled:line-through disabled:opacity-40`}
                          >
                            {c.heure}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                  {creneaux.every((c) => !c.disponible) && (
                    <p className="text-sm text-stone-500">
                      Complet ce jour-là pour {couverts} personne{couverts > 1 ? 's' : ''}. Essayez un
                      autre jour.
                    </p>
                  )}
                </div>
              )}
            </section>

            <button
              type="button"
              disabled={!heure}
              onClick={() => setEtape('coordonnees')}
              className="rounded-lg bg-brand-600 py-3 font-semibold text-white disabled:opacity-40"
            >
              Continuer
            </button>
          </>
        ) : (
          <form onSubmit={reserver} className="flex flex-col gap-5">
            <div className="flex items-start justify-between gap-3 rounded-xl border border-stone-200 bg-card p-4">
              <p className="text-sm text-stone-700">
                <span className="inline-block font-semibold first-letter:uppercase">
                  {jour && heure && dateLisible(jour, heure)}
                </span>
                <br />
                {couverts} personne{couverts > 1 ? 's' : ''}
              </p>
              <button
                type="button"
                onClick={() => setEtape('creneau')}
                className="shrink-0 text-sm font-medium text-brand-700"
              >
                Modifier
              </button>
            </div>

            <section className="flex flex-col gap-3">
              <h2 className="font-semibold text-stone-900">Vos coordonnées</h2>
              <input
                type="text"
                required
                maxLength={100}
                autoComplete="name"
                placeholder="Nom"
                value={nomClient}
                onChange={(e) => setNomClient(e.target.value)}
                className={champ}
              />
              <div>
                <input
                  type="tel"
                  required
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="Téléphone"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  className={champ}
                />
                <p className="mt-1 text-xs text-stone-500">
                  Pour vous joindre si le restaurant doit vous rappeler.
                </p>
              </div>
              <div>
                <input
                  type="email"
                  maxLength={100}
                  autoComplete="email"
                  placeholder="E-mail (facultatif, pour recevoir la confirmation)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={champ}
                />
              </div>
            </section>

            <section>
              <h2 className="font-semibold text-stone-900">
                Une occasion particulière ?{' '}
                <span className="font-normal text-stone-400">(facultatif)</span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {OCCASIONS.map((o) => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOccasion(occasion === o ? null : o)}
                    aria-pressed={occasion === o}
                    className={pastille(occasion === o)}
                  >
                    {LIBELLES_OCCASION[o].icone} {LIBELLES_OCCASION[o].texte}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h2 className="font-semibold text-stone-900">
                Restrictions alimentaires{' '}
                <span className="font-normal text-stone-400">(facultatif)</span>
              </h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {RESTRICTIONS.map((r) => {
                  const choisie = restrictions.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() =>
                        setRestrictions(
                          choisie ? restrictions.filter((x) => x !== r) : [...restrictions, r],
                        )
                      }
                      aria-pressed={choisie}
                      className={pastille(choisie)}
                    >
                      {choisie ? '✓ ' : ''}
                      {LIBELLES_RESTRICTION[r]}
                    </button>
                  );
                })}
              </div>
            </section>

            <textarea
              maxLength={200}
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Une autre demande ? (chaise haute, table en terrasse, allergie précise...)"
              className={champ}
            />

            {erreur && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {erreur}
              </p>
            )}

            <button
              type="submit"
              disabled={enCours}
              className="rounded-lg bg-brand-600 py-3 font-semibold text-white disabled:opacity-40"
            >
              {enCours ? 'Réservation...' : 'Confirmer la réservation'}
            </button>
          </form>
        )}
      </main>

      <footer className="px-4 text-center text-xs text-stone-400">
        Réservation propulsée par <span className="font-semibold text-brand-700">Maïda</span>
      </footer>
    </div>
  );
}
