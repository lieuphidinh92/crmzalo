import pg from 'pg';
export interface Queryable { query(sql: string, values?: any[]): Promise<{ rows: any[]; rowCount?: number | null }> }
export interface Store extends Queryable { transaction<T>(fn: (q: Queryable) => Promise<T>): Promise<T> }
export function postgresStore(pool: pg.Pool): Store {
  // DATE is a calendar day, not a local-midnight JS Date. Override per query,
  // never pg's global parser (the legacy Prisma adapter has its own contract).
  const query=(client:pg.Pool|pg.PoolClient,sql:string,values?:any[])=>client.query({text:sql,values,
    types:{getTypeParser:(oid:number,format?:'text'|'binary')=>oid===1082?(value:string)=>value:pg.types.getTypeParser(oid,format)},
  });
  return {
    query: (sql, values) => query(pool,sql,values),
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
        await client.query("SET LOCAL lock_timeout = '5s'");
        const result = await fn({query:(sql,values)=>query(client,sql,values)});
        await client.query('COMMIT');
        return result;
      } catch (error: any) {
        await client.query('ROLLBACK');
        if (['40001', '40P01', '55P03'].includes(error.code)) {
          throw Object.assign(new Error('Tồn kho vừa thay đổi. Tải lại phiếu và kiểm tra trước khi xác nhận.'), { statusCode: 409 });
        }
        throw error;
      } finally { client.release(); }
    },
  };
}
