import { writeFile } from 'node:fs/promises';

const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const missing = required.filter((name) => !process.env[name]);

if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
}

const config = {
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
  siteUrl: process.env.SITE_URL || ''
};

const output = `// Generated at build time. Contains public browser configuration only.\nwindow.BAA_CONFIG = Object.freeze(${JSON.stringify(config, null, 2)});\n`;
await writeFile(new URL('../config.js', import.meta.url), output, 'utf8');
console.log('Generated config.js from public environment variables.');

