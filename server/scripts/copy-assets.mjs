// Copie les fichiers non-TypeScript necessaires a l execution (schema SQL, fixtures).
import fs from 'node:fs';
import path from 'node:path';

const root = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(root, '..', 'src');
const dist = path.join(root, '..', 'dist');

const assets = ['db/schema.sql'];
for (const asset of assets) {
  const from = path.join(src, asset);
  const to = path.join(dist, asset);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
}

const fixtures = path.join(src, 'fff', 'fixtures');
if (fs.existsSync(fixtures)) {
  fs.cpSync(fixtures, path.join(dist, 'fff', 'fixtures'), { recursive: true });
}
console.log(`Assets copies vers ${dist}`);
