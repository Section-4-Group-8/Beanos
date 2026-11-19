const { Pool } = require('pg');
function createStore(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('Set DATABASE_URL before starting Ganderson Part. See ganderson/README.md.');
  const url = new URL(connectionString);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Force certificate verification for remote DBs; URL SSL flags cannot weaken it.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const pool = new Pool({ connectionString: url.toString(), max: 3, connectionTimeoutMillis: 8000,
    idleTimeoutMillis: 10000, ssl: local ? false : { rejectUnauthorized: true,
      ...(process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT.replace(/\\n/g, '\n') } : {}) } });
  pool.on('error', () => console.error('Ganderson database connection interrupted.'));
  const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
  const safeUser = 'user_id, user_name, user_email, created_at';
  return {
    close: () => pool.end(), query,
    findUser: async email => (await query('select * from ganderson.users where user_email=$1', [email]))[0],
    listUsers: () => query(`select ${safeUser} from ganderson.users order by user_id`),
    createUser: async (name, email, hash) => (await query(`insert into ganderson.users(user_name,user_email,password_hash) values($1,$2,$3) returning ${safeUser}`, [name,email,hash]))[0],
    updateUser: async (id, name, email, hash) => {
      const client = await pool.connect();
      try {
        await client.query('begin');
        const { rows } = await client.query(`update ganderson.users set user_name=$2,user_email=$3,password_hash=coalesce($4,password_hash) where user_id=$1 returning ${safeUser}`, [id,name,email,hash]);
        if (hash) await client.query('delete from ganderson.sessions where user_id=$1', [id]);
        await client.query('commit');
        return rows[0];
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    },
    deleteUser: async id => (await query('delete from ganderson.users where user_id=$1 returning user_id', [id]))[0],
    listRecords: () => query('select * from ganderson.records order by record_id'),
    createRecord: async values => (await query('insert into ganderson.records(title,description,lesson_topic,difficulty,estimated_minutes) values($1,$2,$3,$4,$5) returning *', values))[0],
    updateRecord: async (id, values) => (await query('update ganderson.records set title=$2,description=$3,lesson_topic=$4,difficulty=$5,estimated_minutes=$6 where record_id=$1 returning *', [id,...values]))[0],
    deleteRecord: async id => (await query('delete from ganderson.records where record_id=$1 returning record_id', [id]))[0],
    getSession: async hash => (await query(`select u.${safeUser.split(', ').join(', u.')} from ganderson.sessions s join ganderson.users u using(user_id) where s.token_hash=$1 and s.expires_at>now()`, [hash]))[0],
    createSession: async (hash,id) => {
      await query('delete from ganderson.sessions where expires_at<=now()');
      await query("insert into ganderson.sessions values($1,$2,now()+interval '8 hours')", [hash,id]);
    },
    deleteSession: hash => query('delete from ganderson.sessions where token_hash=$1', [hash]),
    allowLogin: async bucket => {
      await query('delete from ganderson.login_limits where expires_at<=now()');
      const [row] = await query(`insert into ganderson.login_limits values($1,1,now()+interval '15 minutes')
        on conflict(bucket) do update set attempts=ganderson.login_limits.attempts+1 returning attempts`, [bucket]);
      return row.attempts <= 12;
    }
  };
}
module.exports = { createStore };
