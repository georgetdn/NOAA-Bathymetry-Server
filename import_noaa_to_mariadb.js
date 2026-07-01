/*
  import_noaa_to_mariadb.js

  Imports current NOAA JSON/NDJSON tile files into MariaDB.

  Expected folders:
    /var/data/enc/soundg_tiles/
    /var/data/enc/depcnt_tiles/
    /var/data/enc/depare_tiles/
    /var/data/enc/object_tiles/
    /var/data/enc/shoreline_tiles/

  Database:
    NOAAServer

  Tables expected:
    enc_soundings
    enc_contours
    depare_areas
    obstacles
    shoreline_land
    shoreline_coast

  Usage examples:
    node import_noaa_to_mariadb.js
    node import_noaa_to_mariadb.js --truncate
    node import_noaa_to_mariadb.js --only depare --truncate
    node import_noaa_to_mariadb.js --only shoreline --truncate
    node import_noaa_to_mariadb.js --only depare,shoreline --truncate
    node import_noaa_to_mariadb.js --only shoreline_land --truncate
    node import_noaa_to_mariadb.js --only shoreline_coast --truncate

  Environment variables:
    DB_HOST
    DB_USER
    DB_PASSWORD
    DB_NAME
    ENC_ROOT
*/

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const ENC_ROOT = process.env.ENC_ROOT || "/var/data/enc";
const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "NOAAServer";

const DO_TRUNCATE = process.argv.includes("--truncate");

/*
  --only support

  Examples:
    --only depare
    --only shoreline
    --only depare,shoreline
    --only shoreline_land
    --only shoreline_coast

  Accepted names:
    soundings
    contours
    depare
    obstacles
    shoreline
    shoreline_land
    shoreline_coast
*/
const onlyArgIndex = process.argv.indexOf("--only");

let ONLY = null;

if (onlyArgIndex !== -1 && process.argv[onlyArgIndex + 1]) {
  ONLY = new Set(
    process.argv[onlyArgIndex + 1]
      .split(",")
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function shouldImport(name) {
  if (!ONLY) return true;

  if (ONLY.has(name)) return true;

  // "shoreline" means both shoreline_land and shoreline_coast
  if (ONLY.has("shoreline") && name.startsWith("shoreline_")) {
    return true;
  }

  return false;
}

const BATCH_SIZE = 500;

const DIRS = {
  soundings: path.join(ENC_ROOT, "soundg_tiles"),
  contours: path.join(ENC_ROOT, "depcnt_tiles"),
  depare: path.join(ENC_ROOT, "depare_tiles"),
  objects: path.join(ENC_ROOT, "object_tiles"),
  shoreline: path.join(ENC_ROOT, "shoreline_tiles"),
};

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function getJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.warn(`⚠️ Directory not found: ${dir}`);
    return [];
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => path.join(dir, f));
}

function readJsonArrayFile(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return [];

    const parsed = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.warn(`⚠️ Expected JSON array, got non-array: ${file}`);
      return [];
    }

    return parsed;
  } catch (err) {
    console.error(`❌ Bad JSON file: ${file}`, err.message);
    return [];
  }
}

function readNdjsonFile(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) return [];

    const rows = [];

    for (const line of raw.split("\n")) {
      const clean = line.trim();
      if (!clean) continue;

      try {
        rows.push(JSON.parse(clean));
      } catch (err) {
        console.error(`❌ Bad NDJSON line in ${file}:`, err.message);
      }
    }

    return rows;
  } catch (err) {
    console.error(`❌ Cannot read file: ${file}`, err.message);
    return [];
  }
}

function pointsToLineStringWkt(points) {
  if (!Array.isArray(points) || points.length < 2) return null;

  const coords = [];

  for (const p of points) {
    let lon;
    let lat;

    // Expected format from your current files:
    // [lon, lat]
    if (Array.isArray(p)) {
      lon = Number(p[0]);
      lat = Number(p[1]);
    } else {
      // fallback if any file uses {lon, lat}
      lon = Number(p.lon);
      lat = Number(p.lat);
    }

    if (!isNumber(lon) || !isNumber(lat)) continue;

    coords.push(`${lon} ${lat}`);
  }

  if (coords.length < 2) return null;

  return `LINESTRING(${coords.join(",")})`;
}

function pointsToPolygonWkt(points) {
  if (!Array.isArray(points) || points.length < 3) return null;

  const coords = [];

  for (const p of points) {
    let lon;
    let lat;

    // Expected format:
    // [lon, lat]
    if (Array.isArray(p)) {
      lon = Number(p[0]);
      lat = Number(p[1]);
    } else {
      lon = Number(p.lon);
      lat = Number(p.lat);
    }

    if (!isNumber(lon) || !isNumber(lat)) continue;

    coords.push([lon, lat]);
  }

  if (coords.length < 3) return null;

  const first = coords[0];
  const last = coords[coords.length - 1];

  // Close polygon if needed
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push(first);
  }

  const text = coords.map(p => `${p[0]} ${p[1]}`).join(",");

  return `POLYGON((${text}))`;
}

function lineSegmentWkt(p1, p2) {
  if (!Array.isArray(p1) || !Array.isArray(p2)) return null;

  const lon1 = Number(p1[0]);
  const lat1 = Number(p1[1]);
  const lon2 = Number(p2[0]);
  const lat2 = Number(p2[1]);

  if (
    !isNumber(lon1) || !isNumber(lat1) ||
    !isNumber(lon2) || !isNumber(lat2)
  ) {
    return null;
  }

  return {
    wkt: `LINESTRING(${lon1} ${lat1},${lon2} ${lat2})`,
    minLat: Math.min(lat1, lat2),
    maxLat: Math.max(lat1, lat2),
    minLon: Math.min(lon1, lon2),
    maxLon: Math.max(lon1, lon2),
  };
}

async function truncateTables(db) {
  console.log("⚠️ Truncating selected tables...");

  await db.query("SET FOREIGN_KEY_CHECKS = 0");

  const tableMap = [
    { name: "soundings", table: "enc_soundings" },
    { name: "contours", table: "enc_contours" },
    { name: "depare", table: "depare_areas" },
    { name: "obstacles", table: "obstacles" },
    { name: "shoreline_land", table: "shoreline_land" },
    { name: "shoreline_coast", table: "shoreline_coast" },
  ];

  for (const item of tableMap) {
    if (shouldImport(item.name)) {
      console.log(`TRUNCATE TABLE ${item.table}`);
      await db.query(`TRUNCATE TABLE ${item.table}`);
    } else {
      console.log(`Skipping truncate: ${item.table}`);
    }
  }

  await db.query("SET FOREIGN_KEY_CHECKS = 1");
}

async function importSoundings(db) {
  console.log("\n=== Importing SOUNDG soundings ===");

  const files = getJsonFiles(DIRS.soundings);
  let total = 0;

  for (const file of files) {
    const arr = readJsonArrayFile(file);
    const rows = [];

    for (const s of arr) {
      const lat = Number(s.lat);
      const lon = Number(s.lon);
      const depth = Number(s.depth);

      if (!isNumber(lat) || !isNumber(lon) || !isNumber(depth)) continue;

      rows.push([
        depth,
        lat,
        lon,
        `POINT(${lon} ${lat})`,
      ]);
    }

    if (rows.length > 0) {
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const chunk = rows.slice(i, i + BATCH_SIZE);
        const flat = chunk.flat();

        const chunkSql = `
          INSERT INTO enc_soundings
            (depth, lat, lon, geom)
          VALUES ${chunk.map(() => "(?, ?, ?, ST_GeomFromText(?, 4326))").join(",")}
        `;

        await db.execute(chunkSql, flat);
        total += chunk.length;
      }
    }

    console.log(`SOUNDG ${path.basename(file)} -> ${rows.length}`);
  }

  console.log(`✅ SOUNDG total imported: ${total}`);
}

async function importContours(db) {
  console.log("\n=== Importing DEPCNT contours ===");

  const files = getJsonFiles(DIRS.contours);
  let total = 0;

  for (const file of files) {
    const arr = readNdjsonFile(file);
    let fileCount = 0;

    for (const c of arr) {
      const depth = c.depth == null ? null : Number(c.depth);

      const minLat = Number(c.bbox?.minLat ?? c.minLat);
      const maxLat = Number(c.bbox?.maxLat ?? c.maxLat);
      const minLon = Number(c.bbox?.minLon ?? c.minLon);
      const maxLon = Number(c.bbox?.maxLon ?? c.maxLon);

      const wkt = pointsToLineStringWkt(c.points);

      if (
        !wkt ||
        !isNumber(minLat) || !isNumber(maxLat) ||
        !isNumber(minLon) || !isNumber(maxLon)
      ) {
        continue;
      }

      try {
        await db.execute(
          `
          INSERT INTO enc_contours
            (depth, min_lat, max_lat, min_lon, max_lon, geom)
          VALUES
            (?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))
          `,
          [
            isNumber(depth) ? depth : null,
            minLat,
            maxLat,
            minLon,
            maxLon,
            wkt,
          ]
        );

        fileCount++;
        total++;
      } catch (err) {
        console.error(`❌ Contour insert failed in ${path.basename(file)}:`, err.message);
      }
    }

    console.log(`DEPCNT ${path.basename(file)} -> ${fileCount}`);
  }

  console.log(`✅ DEPCNT total imported: ${total}`);
}

async function importDepare(db) {
  console.log("\n=== Importing DEPARE areas ===");

  const files = getJsonFiles(DIRS.depare);
  let total = 0;

  for (const file of files) {
    const arr = readJsonArrayFile(file);
    let fileCount = 0;

    for (const p of arr) {
      const drval1Raw = p.drval1 ?? p.DRVAL1 ?? p.min ?? null;
      const drval2Raw = p.drval2 ?? p.DRVAL2 ?? p.max ?? null;

      const drval1 = drval1Raw == null ? null : Number(drval1Raw);
      const drval2 = drval2Raw == null ? null : Number(drval2Raw);

      const minLat = Number(p.minLat);
      const maxLat = Number(p.maxLat);
      const minLon = Number(p.minLon);
      const maxLon = Number(p.maxLon);

      const points = p.poly ?? p.points;
      const wkt = pointsToPolygonWkt(points);

      if (
        !wkt ||
        !isNumber(minLat) || !isNumber(maxLat) ||
        !isNumber(minLon) || !isNumber(maxLon)
      ) {
        continue;
      }

      try {
        await db.execute(
          `
          INSERT INTO depare_areas
            (drval1, drval2, min_lat, max_lat, min_lon, max_lon, geom)
          VALUES
            (?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))
          `,
          [
            isNumber(drval1) ? drval1 : null,
            isNumber(drval2) ? drval2 : null,
            minLat,
            maxLat,
            minLon,
            maxLon,
            wkt,
          ]
        );

        fileCount++;
        total++;
      } catch (err) {
        console.error(`❌ DEPARE insert failed in ${path.basename(file)}:`, err.message);
      }
    }

    console.log(`DEPARE ${path.basename(file)} -> ${fileCount}`);
  }

  console.log(`✅ DEPARE total imported: ${total}`);
}

async function importObstacles(db) {
  console.log("\n=== Importing obstacles ===");

  const files = getJsonFiles(DIRS.objects);
  let total = 0;

  for (const file of files) {
    const arr = readNdjsonFile(file);
    let fileCount = 0;

    for (const obj of arr) {
      const lat = Number(obj.lat);
      const lon = Number(obj.lon);

      if (!isNumber(lat) || !isNumber(lon) || !obj.type) continue;

      const colour = Array.isArray(obj.colour)
        ? obj.colour.join(",")
        : (obj.colour ?? null);

      try {
        await db.execute(
          `
          INSERT INTO obstacles
            (obj_type, lat, lon, depth, colour, shape, category, name, geom)
          VALUES
            (?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))
          `,
          [
            obj.type,
            lat,
            lon,
            obj.depth == null ? null : Number(obj.depth),
            colour,
            obj.shape == null ? null : Number(obj.shape),
            obj.category ?? null,
            obj.name ?? null,
            `POINT(${lon} ${lat})`,
          ]
        );

        fileCount++;
        total++;
      } catch (err) {
        console.error(`❌ Obstacle insert failed in ${path.basename(file)}:`, err.message);
      }
    }

    console.log(`OBJECT ${path.basename(file)} -> ${fileCount}`);
  }

  console.log(`✅ Obstacles total imported: ${total}`);
}

async function importShoreline(db) {
  console.log("\n=== Importing shoreline land/coast ===");

  const files = getJsonFiles(DIRS.shoreline);

  let totalLand = 0;
  let totalCoastSegments = 0;

  const importLand = shouldImport("shoreline_land");
  const importCoast = shouldImport("shoreline_coast");

  console.log("Shoreline import land:", importLand);
  console.log("Shoreline import coast:", importCoast);

  for (const file of files) {
    const raw = fs.readFileSync(file, "utf8");
    if (!raw.trim()) continue;

    let data;

    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.error(`❌ Bad shoreline JSON: ${file}`, err.message);
      continue;
    }

    let fileLand = 0;
    let fileCoast = 0;

    const land = Array.isArray(data.land) ? data.land : [];
    const coast = Array.isArray(data.coast) ? data.coast : [];

    // Import land polygons only if requested
    if (importLand) {
      for (const poly of land) {
        const minLat = Number(poly.minLat);
        const maxLat = Number(poly.maxLat);
        const minLon = Number(poly.minLon);
        const maxLon = Number(poly.maxLon);

        const points = poly.poly ?? poly.points;
        const wkt = pointsToPolygonWkt(points);

        if (
          !wkt ||
          !isNumber(minLat) || !isNumber(maxLat) ||
          !isNumber(minLon) || !isNumber(maxLon)
        ) {
          continue;
        }

        try {
          await db.execute(
            `
            INSERT INTO shoreline_land
              (min_lat, max_lat, min_lon, max_lon, geom)
            VALUES
              (?, ?, ?, ?, ST_GeomFromText(?, 4326))
            `,
            [
              minLat,
              maxLat,
              minLon,
              maxLon,
              wkt,
            ]
          );

          fileLand++;
          totalLand++;
        } catch (err) {
          console.error(`❌ Shoreline land insert failed in ${path.basename(file)}:`, err.message);
        }
      }
    }

    // Import coast as individual short line segments only if requested
    if (importCoast) {
      for (const c of coast) {
        const points = c.points;

        if (!Array.isArray(points) || points.length < 2) continue;

        for (let i = 0; i < points.length - 1; i++) {
          const segment = lineSegmentWkt(points[i], points[i + 1]);
          if (!segment) continue;

          try {
            await db.execute(
              `
              INSERT INTO shoreline_coast
                (min_lat, max_lat, min_lon, max_lon, geom)
              VALUES
                (?, ?, ?, ?, ST_GeomFromText(?, 4326))
              `,
              [
                segment.minLat,
                segment.maxLat,
                segment.minLon,
                segment.maxLon,
                segment.wkt,
              ]
            );

            fileCoast++;
            totalCoastSegments++;
          } catch (err) {
            console.error(`❌ Shoreline coast insert failed in ${path.basename(file)}:`, err.message);
          }
        }
      }
    }

    console.log(`SHORELINE ${path.basename(file)} -> land=${fileLand}, coastSegments=${fileCoast}`);
  }

  console.log(`✅ Shoreline land total imported: ${totalLand}`);
  console.log(`✅ Shoreline coast segment total imported: ${totalCoastSegments}`);
}

async function main() {
  console.log("=====================================");
  console.log("NOAA MariaDB import starting");
  console.log("=====================================");
  console.log("ENC_ROOT:", ENC_ROOT);
  console.log("DB_HOST:", DB_HOST);
  console.log("DB_NAME:", DB_NAME);
  console.log("DB_USER:", DB_USER);
  console.log("TRUNCATE:", DO_TRUNCATE);
  console.log("ONLY:", ONLY ? Array.from(ONLY).join(",") : "all");
  console.log("=====================================");

  const db = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    multipleStatements: false,
  });

  try {
    await db.query("SELECT 1");

    if (DO_TRUNCATE) {
      await truncateTables(db);
    }

    if (shouldImport("soundings")) {
      await importSoundings(db);
    } else {
      console.log("⏭️ Skipping SOUNDG soundings");
    }

    if (shouldImport("contours")) {
      await importContours(db);
    } else {
      console.log("⏭️ Skipping DEPCNT contours");
    }

    if (shouldImport("depare")) {
      await importDepare(db);
    } else {
      console.log("⏭️ Skipping DEPARE areas");
    }

    if (shouldImport("obstacles")) {
      await importObstacles(db);
    } else {
      console.log("⏭️ Skipping obstacles");
    }

    if (
      shouldImport("shoreline_land") ||
      shouldImport("shoreline_coast")
    ) {
      await importShoreline(db);
    } else {
      console.log("⏭️ Skipping shoreline");
    }

    console.log("\n=====================================");
    console.log("✅ NOAA MariaDB import complete");
    console.log("=====================================");
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error("🚨 Import failed:", err);
  process.exit(1);
});
