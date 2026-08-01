import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { requireCompteActif } from '../../middleware/requireCompteActif';
import { requireRole } from '../../middleware/requireRole';
import { additionsRouter } from './additions';
import { annulationsRouter } from './annulations';
import { commandesRouter } from './commandes';
import { demandesRouter } from './demandes';
import { etablissementRouter } from './etablissement';
import { gestesRouter } from './gestes';
import { journeeRouter } from './journee';
import { paiementsRouter } from './paiements';
import { reservationsRouter } from './reservations';
import { tablesRouter } from './tables';

// L'espace caisse, découpé par moment du service. Toutes les routes vivent
// sous /api/caisse et partagent la même garde : serveur authentifié dont le
// compte client est actif.

export const caisseRouter = Router();

caisseRouter.use(requireAuth, requireRole('SERVEUR'), requireCompteActif);

caisseRouter.use(etablissementRouter);
caisseRouter.use(tablesRouter);
caisseRouter.use(reservationsRouter);
caisseRouter.use(commandesRouter);
caisseRouter.use(annulationsRouter);
caisseRouter.use(demandesRouter);
caisseRouter.use(journeeRouter);
caisseRouter.use(additionsRouter);
caisseRouter.use(gestesRouter);
caisseRouter.use(paiementsRouter);
