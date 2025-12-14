const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const initDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Referral codes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS referral_codes (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        used_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        is_used BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        used_at TIMESTAMP
      )
    `);

    // Groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        invite_code VARCHAR(50) UNIQUE NOT NULL,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Group members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        id SERIAL PRIMARY KEY,
        group_id INTEGER REFERENCES groups(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(group_id, user_id)
      )
    `);

    // Pins table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pins (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        title VARCHAR(200) NOT NULL,
        description TEXT,
        latitude DECIMAL(10, 8) NOT NULL,
        longitude DECIMAL(11, 8) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Pin images table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pin_images (
        id SERIAL PRIMARY KEY,
        pin_id INTEGER REFERENCES pins(id) ON DELETE CASCADE,
        filename VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pins_user ON pins(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_group_members_group ON group_members(group_id)`);

    // Create admin referral code if provided
    if (process.env.ADMIN_REFERRAL_CODE) {
      await client.query(`
        INSERT INTO referral_codes (code, created_by)
        VALUES ($1, NULL)
        ON CONFLICT (code) DO NOTHING
      `, [process.env.ADMIN_REFERRAL_CODE]);
    }

    await client.query('COMMIT');
    console.log('Database initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = { pool, initDatabase };
