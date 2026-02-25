/**
 * Script de Inicialización de Base de Datos
 * Crea las tablas necesarias para el sistema de autenticación
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function initializeDatabase() {
    console.log('🔧 Iniciando script de base de datos...\n');

    // Verificar DATABASE_URL
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.error('❌ Error: DATABASE_URL no está configurada en .env');
        console.log('📝 Copia .env.example a .env y configura tu conexión');
        process.exit(1);
    }

    const pool = new Pool({
        connectionString: databaseUrl,
        ssl: process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false
    });

    try {
        // Verificar conexión
        console.log('📡 Conectando a la base de datos...');
        const client = await pool.connect();
        console.log('✅ Conectado exitosamente\n');

        // Leer archivo SQL
        const sqlPath = path.join(__dirname, '..', 'database.sql');
        if (!fs.existsSync(sqlPath)) {
            console.error('❌ Error: database.sql no encontrado');
            process.exit(1);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');

        // Ejecutar script SQL
        console.log('📄 Ejecutando database.sql...');
        await client.query(sql);
        console.log('✅ Tablas creadas exitosamente\n');

        // Verificar tablas creadas
        const { rows } = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            ORDER BY table_name
        `);

        console.log('📊 Tablas en la base de datos:');
        rows.forEach(row => {
            console.log(`   - ${row.table_name}`);
        });

        client.release();

        console.log('\n✅ ¡Base de datos inicializada correctamente!');
        console.log('\n📝 Siguientes pasos:');
        console.log('   1. Ejecuta: npm run dev');
        console.log('   2. Abre: http://localhost:3000/health');
        console.log('   3. Genera keys: http://localhost:3000/api/generate-keys?count=10&privilege=2');

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

// Ejecutar
initializeDatabase();
