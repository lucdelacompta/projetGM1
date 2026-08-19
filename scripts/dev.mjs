/**
 * Lance l API et l interface en parallele.
 *
 * `npm run dev --workspaces` execute les scripts l un apres l autre : le serveur
 * ne rendant jamais la main, l interface ne demarrait pas. Ce lanceur ouvre les
 * deux processus en meme temps et arrete l ensemble des qu un seul s arrete.
 */
import { spawn } from 'node:child_process';

const tasks = [
  { name: 'api', args: ['run', 'dev', '-w', 'server'] },
  { name: 'web', args: ['run', 'dev', '-w', 'web'] },
];

let stopping = false;

// shell: true est necessaire sous Windows, ou npm est un .cmd.
const children = tasks.map(({ name, args }) => {
  const child = spawn('npm', args, { stdio: 'inherit', shell: true });
  child.on('exit', (code, signal) => {
    if (!stopping) {
      console.log(`\n[${name}] arrete (${signal ?? `code ${code}`}) — arret de l ensemble.`);
      stop(code ?? 1);
    }
  });
  return child;
});

function stop(code) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exitCode = code;
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => stop(0));
}
