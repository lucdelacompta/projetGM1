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
  if (fs.existsSync(config.webDist)) {
    await app.register(fastifyStatic, { root: config.webDist });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'Route inconnue' });
      }
      return reply.sendFile('index.html');
    });
  }

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
