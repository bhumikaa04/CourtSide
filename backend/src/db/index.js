import pkg from 'pg' ; 
const {Pool} = pkg ; 
import dotenv from 'dotenv' ; 

dotenv.config() ; 

const connectionString = process.env.POSTGRESQL_STRING || process.env.DATABASE_URL;
const needsSsl = connectionString && (
    connectionString.includes('neon.tech') ||
    connectionString.includes('sslmode=require')
);

//create a connection using DATABASE_URL 
const pool = new Pool({
    connectionString,
    ssl : needsSsl ? {
        rejectUnauthorized: false //required for neon thing
    } : false
}); 

//test connection 

pool.connect((err, client , release) => {
    if(err){
        console.log('Database connection error : ' , err.stack); 
    }else{
        console.log('Connection to Neon POSTGRE SQL Successfully!!'); 
        release() ; 
    }
}); 

export async function ensureDatabaseSchema() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            favorite_team TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS events (
            id BIGSERIAL PRIMARY KEY,
            type TEXT NOT NULL,
            match_id TEXT NOT NULL,
            team TEXT,
            player TEXT,
            bowler TEXT,
            description TEXT,
            over_text TEXT,
            runs INTEGER DEFAULT 0,
            balls INTEGER DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS bowler TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS over_text TEXT`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS runs INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS balls INTEGER DEFAULT 0`);
    await pool.query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()`);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
            id BIGSERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            match_id TEXT,
            event_type TEXT,
            team TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_match_id ON events(match_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON user_subscriptions(user_id)`);
}

export default pool ; 
