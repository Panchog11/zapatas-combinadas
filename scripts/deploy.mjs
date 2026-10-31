// Publica dist/ en la rama gh-pages (GitHub Pages) sin dependencias externas.
import { execSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

const run = (c, cwd = 'dist') => execSync(c, { cwd, stdio: 'inherit' });
const git = (c) => execSync(c).toString().trim();
const remote = git('git remote get-url origin');
const name = git('git config user.name'), email = git('git config user.email');
rmSync('dist/.git', { recursive: true, force: true }); // repositorio temporal de una publicación anterior
writeFileSync('dist/.nojekyll', '');
run('git init -q -b gh-pages');
run('git add -A');
run(`git -c user.name="${name}" -c user.email="${email}" commit -q -m "Publicar aplicación"`);
run(`git push -f ${remote} gh-pages`);
console.log('Publicado en la rama gh-pages.');
