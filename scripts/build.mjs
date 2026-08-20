import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter((name) => !process.env[name]);
if (missing.length) throw new Error(`Missing required environment variables: ${missing.join(', ')}`);

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const rootFiles = await readdir(root, { withFileTypes: true });
for (const entry of rootFiles) {
  if (!entry.isFile()) continue;
  if (entry.name.endsWith('.html') || entry.name.endsWith('.jpg') || entry.name === 'serve.json') {
    await cp(path.join(root, entry.name), path.join(dist, entry.name));
  }
}
await cp(path.join(root, 'assets'), path.join(dist, 'assets'), { recursive: true });

// Serve the full public site directly at the production root while retaining
// the original filename for backwards-compatible links in this prototype.
const home = await readFile(path.join(root, 'index (1).html'), 'utf8');
await writeFile(path.join(dist, 'index.html'), home, 'utf8');

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  siteUrl: process.env.SITE_URL || ''
};
await writeFile(
  path.join(dist, 'config.js'),
  `// Generated at build time. Public browser configuration only.\nwindow.BAA_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`,
  'utf8'
);

console.log('Built deployable static site in dist/.');
