import 'dotenv/config';
import cookieParser from 'cookie-parser';
import express from 'express';
import { adminRouter } from './routes/admin';
import { authRouter } from './routes/auth';
import { caisseRouter } from './routes/caisse';
import { gerantRouter } from './routes/gerant';

const app = express();
const port = process.env.PORT ?? 3001;

app.use(express.json());
app.use(cookieParser());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/auth', authRouter);
app.use('/admin', adminRouter);
app.use('/gerant', gerantRouter);
app.use('/caisse', caisseRouter);

app.listen(port, () => {
  console.log(`API démarrée sur http://localhost:${port}`);
});
