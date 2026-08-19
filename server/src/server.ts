import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './lib/config.js';
import { getDb } from './db/index.js';
import { matchRoutes } from './routes/matches.js';
import { catalogRoutes } from './routes/catalog.js';
import { syncRoutes } from './routes/sync.js';

export async function buildServer() {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } });
  await app.register(cors, { origin: true });

  getDb();

  app.get('/api/health', async () => ({
    status: 'ok',
    database: config.databasePath,
    fff_source: config.fff.base,
    offline: config.fff.offline,
    time: new Date().toISOString(),
  }));

  await app.register(matchRoutes);
  await app.register(catalogRoutes);
  await app.register(syncRoutes);

  // Sert l'interface compilee si elle existe (npm run build).
  const webBuilt = fs.existsSync(path.join(config.webDist, 'index.html'));
  if (webBuilt) {
    await app.register(fastifyStatic, { root: config.webDist });
  } else {
    app.log.warn(
      `Interface non compilee (${config.webDist} absent) : seule l'API repond. ` +
        'Lancez "npm run build" a la racine du depot, ou "npm run dev" pour le mode developpement.',
    );
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) {
      return reply.code(404).send({ error: 'Route inconnue' });
    }
    if (webBuilt) return reply.sendFile('index.html');
    return reply.code(503).type('text/html; charset=utf-8').send(
      `<!doctype html><meta charset="utf-8"><title>Interface non compilee</title>
       <body style="font-family:system-ui;max-width:40rem;margin:4rem auto;line-height:1.5">
       <h1>Interface non compilee</h1>
       <p>L'API fonctionne (<a href="/api/health">/api/health</a>), mais les fichiers de
       l'interface sont introuvables&nbsp;:</p>
       <p><code>${config.webDist}</code></p>
       <p>Depuis la racine du depot&nbsp;:</p>
       <pre>npm run build
npm start</pre>
       <p>Ou, en developpement&nbsp;: <code>npm run dev</code> puis
       <a href="http://localhost:5173">http://localhost:5173</a>.</p></body>`,
    );
  });

  return app;
}

const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (entry && fileURLToPath(import.meta.url) === entry) {
  const app = await buildServer();
  app
    .listen({ port: config.port, host: config.host })
    .then(() => app.log.info(`AmateurScore API sur http://localhost:${config.port}`))
    .catch((error) => {
      app.log.error(error);
      process.exit(1);
    });
}
