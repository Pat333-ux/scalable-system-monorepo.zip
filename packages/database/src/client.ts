import { Pool, PoolConfig } from 'pg';

// Database configuration targeting environment connection strings (e.g., PgBouncer / Cloud SQL Proxy)
const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/scalable_db',
  max: 20, // Maximum number of clients in the connection pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle before being closed
  connectionTimeoutMillis: 2000, // Max wait time for a connection from the pool before timing out
};

export const dbPool = new Pool(poolConfig);

dbPool.on('error', (err) => {
  console.error('Unexpected error on idle database client:', err);
});

/**
 * Executes a database query using a connection from the pool.
 * @param text SQL query string
 * @param params Query parameters
 */
export async function query<T = any>(text: string, params?: any[]) {
  const start = Date.now();
  const res = await dbPool.query<T>(text, params);
  const duration = Date.now() - start;
  
  if (process.env.NODE_ENV === 'development') {
    console.log('[DB Query]', { text, duration, rows: res.rowCount });
  }
  
  return res;
}

/**
 * Transaction wrapper to safely execute atomic operations within a pooled connection.
 */
export async function executeTransaction<T>(
  callback: (client: any) => Promise<T>
): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
