// Copies the static web client (HTML/CSS/JS) into dist so the compiled server
// can serve /console from a packaged build. tsc only emits .js from .ts sources.
const fs = require('fs');
const path = require('path');

const src = path.join(__dirname, '..', 'src', 'infrastructure', 'web');
const dest = path.join(__dirname, '..', 'dist', 'infrastructure', 'web');

if (!fs.existsSync(src)) {
  console.warn('[copy-web-assets] source web dir not found, skipping:', src);
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });

for (const file of fs.readdirSync(src)) {
  const from = path.join(src, file);
  if (!fs.statSync(from).isFile()) {
    continue;
  }
  fs.copyFileSync(from, path.join(dest, file));
}

console.log(`[copy-web-assets] copied ${fs.readdirSync(src).length} file(s) -> ${dest}`);