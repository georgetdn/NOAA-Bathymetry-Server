/*
  import_depare_only.js

  Imports DEPARE point records from:
    /var/data/enc/depare_tiles/*.json

  Expected DEPARE file format: NDJSON
    {"lat":7.130384415384617,"lon":171.1819887230769,"minDepth":0,"maxDepth":5.5}
    {"lat":7.137865892307693,"lon":171.18165451538465,"minDepth":0,"maxDepth":5.5}

  Imports into:
    NOAAServer.depare_areas

  Table expected:
    depare_areas (
      id,
      drval1,
      drval2,
      min_lat,
      max_lat,
      min_lon,
      max_lon,
      geom
    )

  Usage:
    node import_depare_only.js
    node import_depare_only.js --truncate

  Environment:
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
const DEPARE_DIR = path.join(ENC_ROOT, "depare_tiles");

const DB_HOST = process.env.DB_HOST || "localhost";
const DB_USER = process.env.DB_USER || "root";
const DB_PASSWORD = process.env.DB_PASSWORD || "";
const DB_NAME = process.env.DB_NAME || "NOAAServer";

const DO_TRUNCATE = process.argv.includes("--truncate");

const BATCH_SIZE = 1000;

function isNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function getJsonFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`❌ DEPARE directory not found: ${dir}`);
    process.exit(1);
  }

  return fs.readdirSync(dir)
    .filter(f => f.endsWith(".json"))
    .map(f => path.join(dir, f));
}

function readDepareNdjsonFile(file) {
  const rows = [];

  try {
    const raw = fs.readFileSync(file, "utf8");

    for (const line of raw.split("\n")) {
      const clean = line.trim();
      if (!clean) continue;

      try {
        const obj = JSON.parse(clean);
        rows.push(obj);
      } catch (err) {
        console.error(`❌ Bad DEPARE JSON line in ${file}: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`❌ Cannot read DEPARE file ${file}: ${err.message}`);
  }

  return rows;
}

async function insertBatch(db, rows) {
  if (rows.length === 0) return 0;

  const sql = `
    INSERT INTO depare_areas
      (drval1, drval2, min_lat, max_lat, min_lon, max_lon, geom)
    VALUES
      ${rows.map(() => "(?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326))").join(",")}
  `;

  const flat = rows.flat();

  await db.execute(sql, flat);

  return rows.length;
}

async function main() {
  console.log("=====================================");
  console.log("DEPARE-only MariaDB import starting");
  console.log("=====================================");
  console.log("DEPARE_DIR:", DEPARE_DIR);
  console.log("DB_HOST:", DB_HOST);
  console.log("DB_NAME:", DB_NAME);
  console.log("DB_USER:", DB_USER);
  console.log("TRUNCATE:", DO_TRUNCATE);
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
      console.log("⚠️ Truncating depare_areas...");
      await db.query("TRUNCATE TABLE depare_areas");
    }

    const files = getJsonFiles(DEPARE_DIR);

    console.log(`Found DEPARE files: ${files.length}`);

    let totalImported = 0;
    let totalSkipped = 0;

    for (const file of files) {
      const records = readDepareNdjsonFile(file);

      let batch = [];
      let fileImported = 0;
      let fileSkipped = 0;

      for (const p of records) {
        const lat = Number(p.lat);
        const lon = Number(p.lon);

        const drval1Raw =
          p.drval1 ??
          p.DRVAL1 ??
          p.minDepth ??
          p.min ??
          p.depth ??
          null;

        const drval2Raw =
          p.drval2 ??
          p.DRVAL2 ??
          p.maxDepth ??
          p.max ??
          null;

        const drval1 = drval1Raw == null ? null : Number(drval1Raw);
        const drval2 = drval2Raw == null ? null : Number(drval2Raw);

        if (!isNumber(lat) || !isNumber(lon)) {
          fileSkipped++;
          totalSkipped++;
          continue;
        }

        batch.push([
          isNumber(drval1) ? drval1 : null,
          isNumber(drval2) ? drval2 : null,

          // DEPARE files are point-based, so bbox is the point itself
          lat,
          lat,
          lon,
          lon,

          // Always longitude first, latitude second
          `POINT(${lon} ${lat})`,
        ]);

        if (batch.length >= BATCH_SIZE) {
          const inserted = await insertBatch(db, batch);
          fileImported += inserted;
          totalImported += inserted;
          batch = [];
        }
      }

      if (batch.length > 0) {
        const inserted = await insertBatch(db, batch);
        fileImported += inserted;
        totalImported += inserted;
      }

      console.log(
        `DEPARE ${path.basename(file)} -> imported=${fileImported}, skipped=${fileSkipped}`
      );
    }

    console.log("=====================================");
    console.log("✅ DEPARE import complete");
    console.log("Imported:", totalImported);
    console.log("Skipped:", totalSkipped);
    console.log("=====================================");
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error("🚨 DEPARE import failed:", err);
  process.exit(1);
});
