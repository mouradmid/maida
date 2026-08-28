import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth';
import { requireCompteActif } from '../../middleware/requireCompteActif';
import { requireRole } from '../../middleware/requireRole';
import { categoriesRouter } from './categories';
import { equipeRouter } from './equipe';
import { historiquesRouter } from './historiques';
import { journeesRouter } from './journees';
import { moyensPaiementRouter } from './moyensPaiement';
import { parametresRouter } from './parametres';
import { produitsRouter } from './produits';
import { rapportsRouter } from './rapports';
import { reservationsRouter } from './reservations';
import { tablesRouter } from './tables';

// L'arrière-boutique du gérant, découpée par domaine administré. Toutes les
// routes vivent sous /api/gerant et partagent la même garde : gérant
// authentifié dont le compte client est actif.

export const gerantRouter = Router();

gerantRouter.use(requireAuth, requireRole('GERANT'), requireCompteActif);

gerantRouter.use(equipeRouter);
gerantRouter.use(categoriesRouter);
gerantRouter.use(produitsRouter);
gerantRouter.use(tablesRouter);
gerantRouter.use(moyensPaiementRouter);
gerantRouter.use(parametresRouter);
gerantRouter.use(historiquesRouter);
gerantRouter.use(rapportsRouter);
gerantRouter.use(reservationsRouter);
gerantRouter.use(journeesRouter);
