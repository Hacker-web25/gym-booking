import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from './db';

async function run() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`Running migration ${f}...`);
    await pool.query(sql);
  }
  console.log('Migrations complete.');
  await pool.end();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
