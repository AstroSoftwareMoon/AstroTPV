// Copia los archivos de la app web a dist/ (para GitHub Pages o cualquier hosting estático)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');
const include = ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons', 'docs/screenshots'];
fs.rmSync(dist, { recursive: true, force: true });
for (const item of include) {
  const src = path.join(root, item);
  if (!fs.existsSync(src)) throw new Error('Falta ' + item);
  fs.cpSync(src, path.join(dist, item), { recursive: true });
}
fs.writeFileSync(path.join(dist, '.nojekyll'), '');
console.log('Web lista en dist/');
