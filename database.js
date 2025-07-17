// database.js
const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path =require('path')
const dotenv = require('dotenv');

const envConfig = dotenv.config({ path: path.resolve(__dirname, 'variables.env') });
// --- Configuration ---
const PG_URL =process.env.DATABASE_URL;
const SQLITE_PATH = './school.db';

// --- SQL Schema Definitions ---
// Schemas are defined here to be database-agnostic.
// PostgreSQL uses SERIAL for auto-increment, SQLite uses AUTOINCREMENT.
const SCHEMAS = {
  postgres: [
    `CREATE TABLE IF NOT EXISTS settings (
      id SERIAL PRIMARY KEY,
      setting_name TEXT UNIQUE NOT NULL,
      setting_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS carousel_images (
      id SERIAL PRIMARY KEY,
      image_url TEXT NOT NULL,
      link_url TEXT,
      alt_text TEXT,
      file_name TEXT,
      display_order INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`
  ],
  sqlite: [
    `CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      setting_name TEXT UNIQUE NOT NULL,
      setting_value TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS carousel_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_url TEXT NOT NULL,
      link_url TEXT,
      alt_text TEXT,
      file_name TEXT,
      display_order INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL
    )`
  ]
};

// --- The Database Manager ---
const dbManager = {
  mode: null, // 'postgres' or 'sqlite'
  pgPool: null,
  sqliteDb: null,

  /**
   * Initializes the database connection.
   * Tries PostgreSQL first, falls back to SQLite on failure.
   */
  async initialize() {
    console.log(PG_URL);
    if (PG_URL) {
      try {
        console.log('Attempting to connect to PostgreSQL...');
        this.pgPool = new Pool({
          connectionString: PG_URL,
          ssl: {
            require: true, 
            rejectUnauthorized: false // Required for Render DB connections from outside Render
          }
        });
        // Test the connection
        await this.pgPool.query('SELECT NOW()');
        this.mode = 'postgres';
        console.log('✅ Successfully connected to PostgreSQL.');
        await this.syncSchema();
        return;
      } catch (err) {
        console.warn(`⚠️ PostgreSQL connection failed: ${err.message}.`);
        console.warn('Falling back to SQLite database.');
        if (this.pgPool) {
          await this.pgPool.end();
          this.pgPool = null;
        }
      }
    } else {
      console.log('DATABASE_URL not set. Defaulting to SQLite.');
    }

    // --- Fallback to SQLite ---
    this.mode = 'sqlite';
    await new Promise((resolve, reject) => {
      this.sqliteDb = new sqlite3.Database(SQLITE_PATH, (err) => {
        if (err) {
          console.error("Fatal error connecting to SQLite:", err.message);
          return reject(err);
        }
        console.log('✅ Connected to the school SQLite database (fallback).');
        resolve();
      });
    });
    await this.syncSchema();
  },

  /**
   * Ensures all necessary tables exist in the current database.
   */
  async syncSchema() {
    console.log(`Syncing schema for ${this.mode} database...`);
    const schemaQueries = SCHEMAS[this.mode];
    for (const query of schemaQueries) {
      try {
        await this.run(query);
      } catch (err) {
        console.error(`Error executing schema query in ${this.mode}:`, err.message);
        // If schema sync fails, it's a critical error
        process.exit(1);
      }
    }
    console.log('Schema sync complete.');
  },

  /**
   * Helper to convert SQLite (?) placeholders to PostgreSQL ($1, $2)
   */
  _prepareQuery(sql, params = []) {
    if (this.mode === 'sqlite') {
      // SQLite-specific syntax fixes can go here if needed
      return { sql, params };
    }
    // Convert for PostgreSQL
    let paramIndex = 1;
    const preparedSql = sql.replace(/\?/g, () => `$${paramIndex++}`);
    // Handle standard SQL functions
    const finalSql = preparedSql.replace(/IFNULL/gi, 'COALESCE');
    return { sql: finalSql, params };
  },

  /**
   * Executes a query that doesn't expect rows back (INSERT, UPDATE, DELETE).
   * For INSERT, it returns an object with lastID.
   */
  async run(sql, params = []) {
    const { sql: preparedSql, params: preparedParams } = this._prepareQuery(sql, params);

    if (this.mode === 'postgres') {
      // For INSERTs, we want the ID back
      let query = preparedSql;
      const isInsert = query.trim().toUpperCase().startsWith('INSERT');
      if (isInsert && !query.toUpperCase().includes('RETURNING')) {
         query += ' RETURNING id';
      }

      const result = await this.pgPool.query(query, preparedParams);
      return {
        changes: result.rowCount,
        lastID: isInsert && result.rows[0] ? result.rows[0].id : null,
      };
    } else { // sqlite
      return new Promise((resolve, reject) => {
        this.sqliteDb.run(preparedSql, preparedParams, function (err) {
          if (err) return reject(err);
          resolve({ changes: this.changes, lastID: this.lastID });
        });
      });
    }
  },

  /**
   * Executes a query and returns the first matching row.
   */
  async get(sql, params = []) {
    const { sql: preparedSql, params: preparedParams } = this._prepareQuery(sql, params);

    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(preparedSql, preparedParams);
      return result.rows[0]; // Returns the first row or undefined
    } else { // sqlite
      return new Promise((resolve, reject) => {
        this.sqliteDb.get(preparedSql, preparedParams, (err, row) => {
          if (err) return reject(err);
          resolve(row);
        });
      });
    }
  },

  /**
   * Executes a query and returns all matching rows.
   */
  async all(sql, params = []) {
    const { sql: preparedSql, params: preparedParams } = this._prepareQuery(sql, params);

    if (this.mode === 'postgres') {
      const result = await this.pgPool.query(preparedSql, preparedParams);
      return result.rows; // Returns an array of rows
    } else { // sqlite
      return new Promise((resolve, reject) => {
        this.sqliteDb.all(preparedSql, preparedParams, (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        });
      });
    }
  },

  /**
   * Closes the database connection gracefully.
   */
  async close() {
    if (this.mode === 'postgres' && this.pgPool) {
      await this.pgPool.end();
      console.log('PostgreSQL connection pool closed.');
    } else if (this.mode === 'sqlite' && this.sqliteDb) {
      return new Promise((resolve, reject) => {
        this.sqliteDb.close((err) => {
          if (err) return reject(err);
          console.log('SQLite database connection closed.');
          resolve();
        });
      });
    }
  }
};

module.exports = dbManager;