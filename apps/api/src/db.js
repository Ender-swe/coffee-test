import pg from 'pg';
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://orlast:orlast_local_only@127.0.0.1:5433/orlast',
  connectionTimeoutMillis: 5000,
  max: 10,
});
pool.on('error', error => console.error('Database connection error:', error.code));
