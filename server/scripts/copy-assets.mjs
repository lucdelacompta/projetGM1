// Copie les fichiers non-TypeScript necessaires a l execution (schema SQL, fixtures).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath et pas new URL().pathname : sous Windows ce dernier renvoie
// "/C:/Users/..." (barre de tete, caracteres encodes), que path.join casse.
const root = path.dirname(fileURLToPath(import.meta.url));
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
