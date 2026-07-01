const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const CONFIG = {
    host: 'localhost',
    user: 'NOAAServer',
    password: 'W3Se$Xdr%noaa', // <-- CHANGE THIS
    database: 'NOAAServer',
    basePath: '/var/data/enc'
};

async function run() {
    const pool = mysql.createPool({
        host: CONFIG.host,
        user: CONFIG.user,
        password: CONFIG.password,
        database: CONFIG.database,
        connectionLimit: 10
    });

    console.log("🚀 Starting Data Import...");

    try {
        // 1. Import Soundings (Points)
        await importPoints(pool, 'soundg_tiles', 'soundings', (item) => {
            return [item.depth, `POINT(${item.lon} ${item.lat})` ];
        }, ['depth', 'geom']);

        // 2. Import Obstacles (Points)
        await importNDJSON(pool, 'object_tiles', 'obstacles', (item) => {
            return [item.type, item.name || '', `POINT(${item.lon} ${item.lat})` ];
        }, ['type', 'name', 'geom']);

        // 3. Import Depth Areas (Polygons)
        await importPolygons(pool, 'depare_tiles', 'depth_areas', (item) => {
            const wkt = coordsToPolygonWKT(item.poly);
            return [item.min, item.max, wkt];
        }, ['min_depth', 'max_depth', 'geom']);

        // 4. Import Shoreline (Mixed)
        await importShoreline(pool);

        console.log("\n✅ ALL IMPORTS FINISHED!");
    } catch (err) {
        console.error("❌ Fatal Error:", err);
    } finally {
        await pool.end();
    }
}

// --- HELPER FUNCTIONS ---

async function importPoints(pool, folder, table, mapper, cols) {
    const dir = path.join(CONFIG.basePath, folder);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    console.log(`\n📦 Processing ${folder} (${files.length} files)...`);

    for (const file of files) {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const data = JSON.parse(raw);
        if (data.length === 0) continue;

        const values = data.map(mapper);
        const placeholders = cols.map(c => c === 'geom' ? 'ST_GeomFromText(?)' : '?').join(',');
        const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`;

        for (const val of values) {
            await pool.execute(sql, val);
        }
        process.stdout.write(".");
    }
}

async function importNDJSON(pool, folder, table, mapper, cols) {
    const dir = path.join(CONFIG.basePath, folder);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    console.log(`\n📦 Processing NDJSON ${folder}...`);

    for (const file of files) {
        const lines = fs.readFileSync(path.join(dir, file), 'utf-8').split('\n').filter(Boolean);
        for (const line of lines) {
            const item = JSON.parse(line);
            const val = mapper(item);
            const placeholders = cols.map(c => c === 'geom' ? 'ST_GeomFromText(?)' : '?').join(',');
            await pool.execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, val);
        }
    }
}

async function importPolygons(pool, folder, table, mapper, cols) {
    const dir = path.join(CONFIG.basePath, folder);
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    console.log(`\n📦 Processing Polygons ${folder}...`);

    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        for (const item of data) {
            try {
                const val = mapper(item);
                const placeholders = cols.map(c => c === 'geom' ? 'ST_GeomFromText(?)' : '?').join(',');
                await pool.execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, val);
            } catch (e) { /* skip invalid geo */ }
        }
        process.stdout.write("P");
    }
}

async function importShoreline(pool) {
    const dir = path.join(CONFIG.basePath, 'shoreline_tiles');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    console.log(`\n🌊 Processing Shoreline...`);

    for (const file of files) {
        const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
        // Land Polygons
        if (data.land) {
            for (const l of data.land) {
                const wkt = coordsToPolygonWKT(l.poly);
                await pool.execute(`INSERT INTO shoreline (is_land, geom) VALUES (1, ST_GeomFromText(?))`, [wkt]);
            }
        }
        // Coast Lines
        if (data.coast) {
            for (const c of data.coast) {
                const wkt = `LINESTRING(${c.points.map(p => `${p[0]} ${p[1]}`).join(',')})`;
                await pool.execute(`INSERT INTO shoreline (is_land, geom) VALUES (0, ST_GeomFromText(?))`, [wkt]);
            }
        }
    }
}

function coordsToPolygonWKT(poly) {
    if (!poly || poly.length < 3) return null;
    // GIS standard: Polygon must be closed (first point == last point)
    const first = poly[0];
    const last = poly[poly.length -1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
        poly.push(first);
    }
    const ring = poly.map(p => `${p[0]} ${p[1]}`).join(',');
    return `POLYGON((${ring}))`;
}

run();
