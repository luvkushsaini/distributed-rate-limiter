/**
 * Run this once to create all tables in PostgreSQL
 * Usage: node src/db/migrate.js
 */
const fs = require('fs');
const path = require('path');
const { query, connectDB } = require('./index');
const logger = require('../utils/logger');

const migrate = async () => {
    await connectDB();

    const schema = fs.readFileSync(
        path.join(__dirname, 'schema.sql'),
        'utf8'
    );

    await query(schema);
    logger.info('Database migration completed successfully');
    process.exit(0);
};

migrate().catch((err) => {
    logger.error('Migration failed', { error: err.message });
    process.exit(1);
});