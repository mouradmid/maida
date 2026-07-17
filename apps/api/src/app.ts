import path from 'path';
import cookieParser from 'cookie-parser';
import express, { type NextFunction, type Request, type Response } from 'express';
import { prisma } from './lib/prisma';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { caisseRouter } from './routes/caisse';
import { gerantRouter } from './routes/gerant';

export const app = express();

const production = process.env.NODE_ENV === 'production';

// Derrière le proxy de l'hébergeur (Railway) : vraies IP clientes pour le
// rate limiting, et cookies `secure` acceptés.
if (production) {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Tout est sous /api : même origine que le front en production,
// et le proxy Vite transmet tel quel en développement.
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/gerant', gerantRouter);
app.use('/api/caisse', caisseRouter);

// En production, l'API sert aussi le front construit (apps/web/dist) :
// une seule URL, pas de CORS, cookies même origine.
if (production) {
  const webDist = path.join(__dirname, '../../web/dist');
  app.use(express.static(webDist));
  app.get(/^\/(?!api\/).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'));
  });
}

// Filet de sécurité : toute erreur non gérée (y compris dans les routes async,
// qu'Express 5 transmet ici) est journalisée — console ET base de données,
// pour être visible dans l'espace super-admin — puis renvoie un 500 propre.
app.use((err: unknown, req: Request, res: Response, next: NextFunction) => {
  console.error(`[erreur] ${req.method} ${req.path}`, err);
  const message = err instanceof Error ? err.message : String(err);
  const detail = err instanceof Error ? (err.stack ?? null) : null;
  prisma.erreurServeur
    .create({
      data: { methode: req.method, chemin: req.path, message: message.slice(0, 500), detail },
    })
    .catch(() => {
      // Si la base est injoignable, la console reste le dernier témoin.
    });
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ error: 'Erreur interne du serveur' });
});
