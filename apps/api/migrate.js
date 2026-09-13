import { readFile } from 'node:fs/promises';
import { pool } from './src/db.js';
try {
  await pool.query(await readFile(new URL('./migrations/001_initial.sql', import.meta.url), 'utf8'));
  console.log('Database schema ready.');
} finally { await pool.end(); }
