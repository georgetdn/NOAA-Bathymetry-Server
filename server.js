const express = require("express");
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");
const mysql = require("mysql2/promise");
const fs = require('fs')
const proj4 = require('proj4')
proj4.defs("EPSG:26918", "+proj=utm +zone=18 +datum=NAD83 +units=m +no_defs")
const WGS84 = 'EPSG:4326'
const UTM18 = 'EPSG:26918'
const ENC_ROOT = '/var/data/enc/'
const BLUE_ROOT = '/var/data/bluetopo'
const MAX_CONCURRENT = 8
const MAX_QUEUE = 100;     // Maximum requests waiting in the queue
let activeRequests = 0
const queue = []

// ================================
// ===== MariaDB configuration =====
// ================================
// Do NOT hard-code the MariaDB password here.
// Set DB_PASSWORD in systemd or in the shell before starting node.
const DB_HOST = process.env.DB_HOST || "localhost"
const DB_USER = process.env.DB_USER || "noaa_user"
const DB_PASSWORD = process.env.DB_PASSWORD || ""
const DB_NAME = process.env.DB_NAME || "NOAAServer"

// Default search radii. Change these in systemd/environment if needed.
const DEPTH_RADIUS_M = Number(process.env.DEPTH_RADIUS_M || 5);

// Used only after no exact 5-meter sounding is found.
// This is for candidate soundings that will later be checked against contours.
const ENC_CANDIDATE_RADIUS_M = Number(process.env.ENC_CANDIDATE_RADIUS_M || 500);

const DEPARE_RADIUS_M = Number(process.env.DEPARE_RADIUS_M || DEPTH_RADIUS_M);
const OBSTACLE_RADIUS_M = Number(process.env.OBSTACLE_RADIUS_M || 5);
const SHORELINE_RADIUS_M = Number(process.env.SHORELINE_RADIUS_M || 5);

// Route-corridor settings for GET /depth/path.
// widthMeters is the only supported corridor-size request parameter.
// The production width is 3.048 meters (10 feet), giving 1.524 meters
// of coverage on each side of the route centerline.
const PATH_WIDTH_M = Number(process.env.PATH_WIDTH_M || 3.048)
const PATH_WIDTH_TOLERANCE_M = Number(
    process.env.PATH_WIDTH_TOLERANCE_M || 0.002
)
const PATH_RADIUS_M = PATH_WIDTH_M / 2
const PATH_MAX_LENGTH_M = Number(process.env.PATH_MAX_LENGTH_M || 500)
const PATH_QUERY_TIMEOUT_MS = Number(process.env.PATH_QUERY_TIMEOUT_MS || 30000)
const PATH_MAX_LAYER_CANDIDATES = Math.max(
    100,
    Math.floor(Number(process.env.PATH_MAX_LAYER_CANDIDATES || 5000))
)

const dbPool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})


//console.log("Loading ENC index...")

setInterval(() => {
    const m = process.memoryUsage()
    //console.log(`MEM → ${(m.heapUsed/1024/1024).toFixed(0)} MB`)
}, 3000)

//  ===== load index =====
//const soundgIndex = JSON.parse(
//    fs.readFileSync(`${ENC_ROOT}/enc_soundg_index_clean.json`, 'utf-8')
//)

//console.log("ENC index loaded")
//console.log("Loading BlueTopo index...")

const app = express();
const helmet = require("helmet");
app.use(helmet());
app.use((req, res, next) => {
  req.setTimeout(15000); // 15 seconds - DB shoreline checks can take longer than file cache
  next();
});
app.disable("x-powered-by");

app.use(cors({
  origin: ["https://y219.com", "https://www.y219.com"],
  methods: ["GET", "POST"],
}));
app.use(express.json());   // 🔥 REQUIRED


app.use((req, res, next) => {
    //console.log("👉 Incoming request:", req.method, req.url);
    next();
});
const rawBlueTopo = JSON.parse(
    fs.readFileSync(`${BLUE_ROOT}/bluetopo_index.json`, 'utf-8')
)

const bluetopoTiles = rawBlueTopo
    .map(t => {

        const minLat = dmsToDecimal(t.minLat)
        const maxLat = dmsToDecimal(t.maxLat)
        const minLon = dmsToDecimal(t.minLon)
        const maxLon = dmsToDecimal(t.maxLon)

        // ✅ PROTECTION GOES RIGHT HERE
        if (
            minLat == null || maxLat == null ||
            minLon == null || maxLon == null
        ) {
            console.error("❌ Bad BlueTopo tile skipped:", t)
            return null
        }

        return {
            minLat,
            maxLat,
            minLon,
            maxLon,
            file: t.file
        }
    })
    .filter(Boolean) // remove bad tiles

//console.log("BlueTopo index loaded")


const rateLimit = require('express-rate-limit')
const EMAIL_API_KEY = process.env.EMAIL_API_KEY || "CHANGE_THIS_SECRET"
//  const app = express();
app.set('trust proxy', 1);

const depthLimiter = rateLimit({
    windowMs: 1000,
    max: 5
})
const pathLimiter = rateLimit({
    windowMs: 1000,
    max: 2
})
const emailLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 3
})


///////////////////////////
//  ===== QUEUE  ======
//////////////////////////
function processQueue() {
    if (activeRequests >= MAX_CONCURRENT) return
    if (queue.length === 0) 
       return

    const next = queue.shift()
    activeRequests++
//console.log(`***QUEUE*** → active=${activeRequests} waiting=${queue.length}`)

    next().finally(() => {
        activeRequests--
 //console.log(`****QUEUE DONE**** → active=${activeRequests} waiting=${queue.length}`)

        processQueue()
    })
}

function dmsToDecimal(dms) {
    if (!dms) return null

    const clean = dms.replace(/\s+/g, '')
    const match = clean.match(/(\d+)d(\d+)'([\d.]+)"([NSEW])/)

    if (!match) {
        console.error("DMS parse failed:", dms)
        return null
    }

    let degrees = parseFloat(match[1])
    let minutes = parseFloat(match[2])
    let seconds = parseFloat(match[3])
    let direction = match[4]

    let decimal = degrees + minutes / 60 + seconds / 3600

    if (direction === 'S' || direction === 'W') decimal *= -1

    return decimal
}

function findBlueTopoTile(lat, lon) {

    for (const t of bluetopoTiles) {

        if (
            lat >= t.minLat && lat <= t.maxLat &&
            lon >= t.minLon && lon <= t.maxLon
        ) {
            return t.file
        }
    }
    return null
}

const GeoTIFF = require('geotiff')

const bluetopoCache = {}

async function loadBlueTopoTile(tilePath) {

    if (bluetopoCache[tilePath]) {
        return bluetopoCache[tilePath]
    }

    try {
        const tiff = await GeoTIFF.fromFile(tilePath)
        const image = await tiff.getImage()

        const fileDir = image.getFileDirectory()

        // 🔥 Extract CRS (EPSG code)
        let epsg = null

        if (fileDir.ProjectedCSTypeGeoKey) {
            epsg = "EPSG:" + fileDir.ProjectedCSTypeGeoKey
        }

        const data = {
            image,
            bbox: image.getBoundingBox(),
            width: image.getWidth(),
            height: image.getHeight(),
            epsg   // 👈 NEW
        }

        bluetopoCache[tilePath] = data
        return data

    } catch (err) {
        console.error("BlueTopo load error:", tilePath, err)
        return null
    }
}

async function getDepthFromBlueTopo(lat, lon) {

    const tilePath = findBlueTopoTile(lat, lon)
    if (!tilePath) return 1000

    const tile = await loadBlueTopoTile(tilePath)
    if (!tile) return 1000

    const { image, bbox, width, height } = tile

    // 🔥 convert lat/lon → UTM (EPSG:26918)

let xCoord, yCoord

try {

    if (!tile.epsg) {
        console.warn("Missing CRS, fallback used")
        ;[xCoord, yCoord] = proj4(WGS84, UTM18, [lon, lat])

    } else {

        try {
            ;[xCoord, yCoord] = proj4(WGS84, tile.epsg, [lon, lat])
        } catch {
            console.warn("CRS not supported, fallback used:", tile.epsg)
            ;[xCoord, yCoord] = proj4(WGS84, UTM18, [lon, lat])
        }
    }

} catch (err) {
    console.error("Projection error:", err)
    return 1000
}
    // quick bbox reject (projected coords)
    if (
        xCoord < bbox[0] || xCoord > bbox[2] ||
        yCoord < bbox[1] || yCoord > bbox[3]
    ) {
        //console.log("Outside tile bbox (projected)")
        return 1000
    }


    // 🔥 robust pixel transform (tiepoint OR fallback)
    let x, y

    const tiepoints = image.getTiePoints()

    if (tiepoints && tiepoints.length > 0) {

        const tiepoint = tiepoints[0]
        const scale = image.getFileDirectory().ModelPixelScale

        const originX = tiepoint.x
        const originY = tiepoint.y

        const resX = scale[0]
        const resY = scale[1]

        x = Math.round((xCoord - originX) / resX)
        y = Math.round((originY - yCoord) / resY)


    } else {


        x = Math.round((xCoord - bbox[0]) / (bbox[2] - bbox[0]) * width)
        y = Math.round((bbox[3] - yCoord) / (bbox[3] - bbox[1]) * height)
    }


    // 🔥 bounds check (critical)
    if (x < 0 || x >= width || y < 0 || y >= height) {
        return 1000
    }

    try {
        const raster = await image.readRasters({
            window: [x, y, x + 1, y + 1]
        })

        const depth = raster[0][0]


        // ❌ invalid / nodata
        if (depth == null || isNaN(depth) || depth < -1000 || depth > 10000) {
            return 1000
        }

        // 🔥 IMPORTANT: treat 0 as nodata (NOT land)
        if (depth === 0) {
            return 1000
        }

        //console.log("Found Blue Top depth:", depth)

        return depth

    } catch (err) {
        console.error("BlueTopo read error:", err)
        return 1000
    }
}
//  ===========================
//  ====== DEPART FUNCTION  ===
//  ===========================
function getDepthFromDEPARE(lat, lon) {
//console.log("🔥 DEPARE START", lat, lon)
    // --- Base tile keys ---
    const baseLat = Math.floor(lat)

    // 🔥 FIX: handle negative longitude correctly
    const baseLonFloor = Math.floor(lon)
    const baseLonCeil  = Math.ceil(lon)

    let minDepth = 1000

    // 👉 Try both longitude bases to avoid missing tiles near boundaries
    const lonBases = [baseLonFloor]
    if (baseLonCeil !== baseLonFloor) {
        lonBases.push(baseLonCeil)
    }

    // 🔁 check neighboring tiles
    for (let dLat = -2; dLat <= 2; dLat++) {

        for (const lonBase of lonBases) {

            for (let dLon = -2; dLon <= 2; dLon++) {

                const tileKey = (baseLat + dLat) + "_" + (lonBase + dLon)

                const polygons = loadDepareTile(tileKey)
                if (!polygons) continue

               for (const poly of polygons) {
    // 🔍 DEBUG (only once)
    if (!global.__bboxCheck) {
        //console.log("BBOX:", poly.minLat, poly.maxLat, poly.minLon, poly.maxLon)
        global.__bboxCheck = true
    }
                   if (
                          lat < poly.minLat - 0.5 || lat > poly.maxLat + 0.5 ||
                          lon < poly.minLon - 0.5 || lon > poly.maxLon + 0.5
                   ) continue
  
                   if (
                       lat < poly.minLat || lat > poly.maxLat ||
                       lon < poly.minLon || lon > poly.maxLon
                   ) continue

                   // 🔥 print only once
                   if (!global.__printedPolyShape) {
                       //console.log("Poly shape:", JSON.stringify(poly.poly).slice(0, 200))
                       //console.log("Point (lat,lon):", lat, lon)
                       //console.log("First poly point:", poly.poly[0])
                       global.__printedPolyShape = true
                   }

                   if (pointInPolygon( lat, lon, poly.poly)) {

                       if (poly.min < minDepth) {
                           minDepth = poly.min
                       }
                   }
               }
            }
        }
    }
//console.log("🔥 DEPARE RESULT:", minDepth)
    // 🔥 IMPORTANT: do NOT convert to 0
    if (minDepth === 1000) {
        return 1000   // means "no data"
    }

    return minDepth
}

function pointInPolygon(lat, lon, polygon) {

    const EPS = 1e-9

    // --- Helper: point on segment ---
    function pointOnSegment(px, py, x1, y1, x2, y2) {
        const cross = (py - y1) * (x2 - x1) - (px - x1) * (y2 - y1)
        if (Math.abs(cross) > EPS) return false

        const dot = (px - x1) * (px - x2) + (py - y1) * (py - y2)
        return dot <= EPS
    }

    let inside = false

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {

        const xi = polygon[i][0] // lon
        const yi = polygon[i][1] // lat
        const xj = polygon[j][0]
        const yj = polygon[j][1]

        // 🔥 1. Boundary check (VERY important)
        if (pointOnSegment(lon, lat, xi, yi, xj, yj)) {
            return true
        }

        // 🔥 2. Robust ray casting
        const intersects =
            ((yi > lat - EPS) !== (yj > lat - EPS)) &&
            (lon < (xj - xi) * (lat - yi) / (yj - yi + EPS) + xi + EPS)

        if (intersects) inside = !inside
    }

    return inside
}

let depareCache = {}
const MAX_DEPARE_CACHE = 50

function loadDepareTile(tileKey) {

    // ✅ cache hit (including null)
    if (tileKey in depareCache) {
        return depareCache[tileKey]
    }

    //console.log(`Loading DEPARE tile: ${tileKey}`)

    const tilePath = `${ENC_ROOT}/depare_tiles/${tileKey}.json`

    // 🔥 cache negative result
    if (!fs.existsSync(tilePath)) {
        depareCache[tileKey] = null
        return null
    }

    let data
    try {
        data = JSON.parse(fs.readFileSync(tilePath, 'utf-8'))
    } catch (err) {
        console.error("Bad DEPARE tile:", tilePath)
        depareCache[tileKey] = null
        return null
    }

    // 🔥 INSERT FIRST
    depareCache[tileKey] = data

    // 🔥 THEN enforce limit
    const keys = Object.keys(depareCache)
    if (keys.length > MAX_DEPARE_CACHE) {
        delete depareCache[keys[0]]
    }

    return data
}
// ================================
// ===== OBSTRUCTIONS FUNCTIONS ====
//  =================================
let objectCache = {}
const MAX_OBJECT_CACHE = 50

function loadObjectTile(tileKey) {

    // ? cache hit (including null)
    if (tileKey in objectCache) {
        return objectCache[tileKey]
    }

    const file = `${ENC_ROOT}/object_tiles/${tileKey}.json`

    // ?? cache negative result
    if (!fs.existsSync(file)) {
        objectCache[tileKey] = null
        return null
    }

    let data

    try {
        // ? FIX: handle NDJSON (one JSON per line)
        const lines = fs.readFileSync(file, 'utf-8')
            .split('\n')
            .filter(Boolean)

        data = lines.map(line => JSON.parse(line))

    } catch (err) {
        console.error("Bad OBJECT tile:", file)
        objectCache[tileKey] = null
        return null
    }

    // ?? INSERT FIRST
    objectCache[tileKey] = data

    // ?? THEN enforce limit
    const keys = Object.keys(objectCache)
    if (keys.length > MAX_OBJECT_CACHE) {
        delete objectCache[keys[0]]   // remove oldest
    }

    return data
}


// OPTIONAL: filter only "real" collision hazards
const HARD_HAZARDS = new Set([
  'UWTROC','WRECKS','OBSTRN',
  'PILPNT','MORFAC','SLCONS'
])


function checkObstacle(lat, lon) {

  // ? FIX: correct tile scale (matches your tiles)
  const baseLat = Math.floor(lat * 100)
  const baseLon = Math.floor(lon * 100)

  let closest = null
  let minDist = Infinity

  // check 3x3 tiles
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {

      const key = (baseLat + dLat) + "_" + (baseLon + dLon)
      const objects = loadObjectTile(key)
      if (!objects) continue

      for (const obj of objects) {

        const d = wdistMeters(lat, lon, obj.lat, obj.lon)
        //console.log("Candidate dist:", d, "Obj:", obj.type, obj.lat, obj.lon)

        // ?? OPTIONAL FILTER (enable if needed)
        // if (!HARD_HAZARDS.has(obj.type)) continue

        // ? FIX: more realistic detection radius
        if (d <= 7 && d < minDist) {
          minDist = d
          closest = obj
        }
      }
    }
  }

if (!closest) {
  //console.log("❌ No obstacle found near:", lat, lon)
  return null
}

//console.log("✅ Closest:", closest.type, "dist=", minDist)

  return {
    type: closest.type,
    distance: minDist,
    lat: closest.lat,
    lon: closest.lon,
    colour: closest.colour || null,
    shape: closest.shape || null,
    name: closest.name || null,
    depth: closest.depth || null,
    category: closest.category || null   // ? added (useful later)
  }
}

function wdistMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000 // meters

  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2)

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}
//////////////////////////////////////////////////
// ===== SOUNDINGS WITH DEPCNT FUNCTIONS =====
//////////////////////////////////////////////////
const EPS = 1e-7
const MAX_DISTANCE = 2000
const MAX_CANDIDATES = 15
const TILE_SCALE = 10   // 0.1° tiles

function tileKey(lat, lon) {
  const latKey = Math.floor(lat * TILE_SCALE)
  const lonKey = Math.floor(lon * TILE_SCALE)
  return `${latKey}_${lonKey}`
}
//console.log(tileKey(38.828, -77.032))

function getNearestSoundings(P, soundings) {
  //console.log("getNearestSoundings loaded")

  return soundings
    .map(s => ({ ...s, _dist: distance(P, s) }))
    .filter(s => s._dist <= MAX_DISTANCE)        // 🔥 limit radius
    .sort((a, b) => a._dist - b._dist)
    .slice(0, MAX_CANDIDATES)                   // 🔥 limit count
}

function distance(a, b) {
  const R = 6371000 // meters
  const dLat = (b.lat - a.lat) * Math.PI / 180
  const dLon = (b.lon - a.lon) * Math.PI / 180

  const lat1 = a.lat * Math.PI / 180
  const lat2 = b.lat * Math.PI / 180

  const x = dLon * Math.cos((lat1 + lat2) / 2)
  const y = dLat

  return Math.sqrt(x * x + y * y) * R
}

function getDepthAtPoint(P, soundings, contours) {
  //console.log(`\n📍 ENC DEPTH → lat=${P.lat}, lon=${P.lon}`)

  const candidates = getNearestSoundings(P, soundings)

  //console.log(`📊 Candidates: ${candidates.length}`)

  for (let i = 0; i < candidates.length; i++) {
    const S = candidates[i]
    const dist = distance(P, S)

    //console.log(`➡️ S#${i + 1}: depth=${S.depth}, dist=${dist.toFixed(1)}m`)

    const { count } = countContourCrossings([P, S], contours, S.depth)

    //console.log(`🧮 Crossings=${count}`)

    if (count  !== 0) {
      //console.log(`❌ Reject (odd)`)
      continue
    }

    //console.log(`✅ Accept → depth=${S.depth}`)
    return S.depth
  }

  //console.log(`❌ ENC failed`)
  if (candidates.length > 0) {
     //console.log(`⚠️ Fallback → nearest sounding`)
     return candidates[0].depth
   }  
   return 1000
}

function contourHasValidDepth(contour) {
  const d = Number(contour.depth);

  return (
    contour.depth !== null &&
    contour.depth !== undefined &&
    contour.depth !== "" &&
    Number.isFinite(d)
  );
}

function countContourCrossings(L, contours, soundingDepth) {
  let count = 0;

  for (const contour of contours) {
    // Ignore contours that do not have a usable depth.
    // A no-depth contour should not block selecting the closest sounding.
    if (!contourHasValidDepth(contour)) {
      continue;
    }

    if (!bboxIntersectsSegment(contour.bbox, L)) continue;

    let lastHitKey = null;

    for (let i = 0; i < contour.points.length - 1; i++) {
      const A = contour.points[i];
      const B = contour.points[i + 1];

      if (!segmentHits(L[0], L[1], A, B)) continue;

      // vertex detection
      let hitPoint = null;
      if (onSegment(L[0], L[1], A)) hitPoint = A;
      else if (onSegment(L[0], L[1], B)) hitPoint = B;
      else if (onSegment(A, B, L[0])) hitPoint = L[0];
      else if (onSegment(A, B, L[1])) hitPoint = L[1];

      const key = hitPoint
        ? `${hitPoint.lon.toFixed(7)},${hitPoint.lat.toFixed(7)}`
        : null;

      // dedup vertex
      if (hitPoint && key === lastHitKey) continue;
      if (hitPoint) lastHitKey = key;

      count++;

      // early exit: any valid-depth contour crossing blocks this sounding
      if (count > 0) return { count };
    }
  }

  return { count };
}

function segmentHits(P, S, A, B) {
  if (collinearOverlap(P, S, A, B)) return true

  let d1 = orient(P, S, A)
  let d2 = orient(P, S, B)
  let d3 = orient(A, B, P)
  let d4 = orient(A, B, S)

  if (Math.abs(d1) < EPS) d1 = 0
  if (Math.abs(d2) < EPS) d2 = 0
  if (Math.abs(d3) < EPS) d3 = 0
  if (Math.abs(d4) < EPS) d4 = 0

  if (d1 * d2 < 0 && d3 * d4 < 0) return true

  if (
    (d1 === 0 && onSegment(P, S, A)) ||
    (d2 === 0 && onSegment(P, S, B)) ||
    (d3 === 0 && onSegment(A, B, P)) ||
    (d4 === 0 && onSegment(A, B, S))
  ) return true

  return false
}

function orient(A, B, C) {
  return (B.lon - A.lon) * (C.lat - A.lat) -
         (B.lat - A.lat) * (C.lon - A.lon)
}
function onSegment(A, B, C) {
  return (
    C.lon >= Math.min(A.lon, B.lon) - EPS &&
    C.lon <= Math.max(A.lon, B.lon) + EPS &&
    C.lat >= Math.min(A.lat, B.lat) - EPS &&
    C.lat <= Math.max(A.lat, B.lat) + EPS
  )
}

function collinearOverlap(P, S, A, B) {
  const o1 = orient(P, S, A)
  const o2 = orient(P, S, B)

  // Not collinear → no overlap
  if (Math.abs(o1) > EPS || Math.abs(o2) > EPS) return false

  // 1D projection overlap
  const minPSx = Math.min(P.lon, S.lon)
  const maxPSx = Math.max(P.lon, S.lon)
  const minPSy = Math.min(P.lat, S.lat)
  const maxPSy = Math.max(P.lat, S.lat)

  const minABx = Math.min(A.lon, B.lon)
  const maxABx = Math.max(A.lon, B.lon)
  const minABy = Math.min(A.lat, B.lat)
  const maxABy = Math.max(A.lat, B.lat)

  const overlapX = maxPSx >= minABx && maxABx >= minPSx
  const overlapY = maxPSy >= minABy && maxABy >= minPSy

  return overlapX && overlapY
}

function bboxIntersectsSegment(bbox, L) {
  const [P, S] = L

  return !(
    Math.max(P.lon, S.lon) < bbox.minLon ||
    Math.min(P.lon, S.lon) > bbox.maxLon ||
    Math.max(P.lat, S.lat) < bbox.minLat ||
    Math.min(P.lat, S.lat) > bbox.maxLat
  )
}

///////////////////////////
// ===== SHORELINE ====
//////////////////////////
let shorelineCache = {}
const MAX_SHORELINE_CACHE = 50

function loadShorelineTile(tileKey) {
    //console.log(`🌊 [SHORELINE] Request tileKey=${tileKey}`)

    // ✅ cache hit (including null)
    if (tileKey in shorelineCache) {
        //console.log(`⚡ [CACHE HIT] tileKey=${tileKey} value=${shorelineCache[tileKey] ? 'DATA' : 'NULL'}`)
        return shorelineCache[tileKey]
    }

    const file = `${ENC_ROOT}/shoreline_tiles/${tileKey}.json`
    //console.log(`📁 [FILE PATH] ${file}`)

    // 🔥 cache negative result
    if (!fs.existsSync(file)) {
        console.warn(`❌ [FILE NOT FOUND] ${file}`)
        shorelineCache[tileKey] = null
        return null
    }

    // 📊 file stats
    try {
        const stats = fs.statSync(file)
        //console.log(`📦 [FILE SIZE] ${stats.size} bytes`)
    } catch (err) {
        console.error(`⚠️ [STAT ERROR] ${file}`, err.message)
    }

    let raw
    let data

    try {
        raw = fs.readFileSync(file, 'utf-8')

        if (!raw || raw.trim().length === 0) {
            console.error(`🚨 [EMPTY FILE] ${file}`)
            shorelineCache[tileKey] = null
            return null
        }

        data = JSON.parse(raw)
    } catch (err) {
        console.error(`🚨 [JSON ERROR] ${file}`, err.message)
        shorelineCache[tileKey] = null
        return null
    }

    // 🔍 Inspect structure
    //console.log(`🧪 [DATA KEYS]`, Object.keys(data))

    if (data.land) {
        //console.log(`🏝️ [LAND COUNT] ${data.land.length}`)
    } else {
        console.warn(`⚠️ [NO LAND FIELD]`)
    }

    if (data.coast) {
        //console.log(`🌊 [COAST COUNT] ${data.coast.length}`)
    } else {
        console.warn(`⚠️ [NO COAST FIELD]`)
    }

    // 🔍 sample geometry (first feature)
    if (data.coast && data.coast.length > 0) {
        const sample = data.coast[0]
        // console.log(
        //     `🔹 [COAST SAMPLE] points=${sample.points?.length} bbox=`,
        //     sample.minLat, sample.maxLat, sample.minLon, sample.maxLon
        // )

    }

    if (data.land && data.land.length > 0) {
        const sample = data.land[0]
        // console.log(
        //     `🔹 [LAND SAMPLE] points=${sample.points?.length} bbox=`,
        //     sample.minLat, sample.maxLat, sample.minLon, sample.maxLon
        // )
    }

    // 🔥 INSERT FIRST
    shorelineCache[tileKey] = data
    //console.log(`💾 [CACHE STORE] tileKey=${tileKey}`)

    // 🔥 THEN enforce limit
    const keys = Object.keys(shorelineCache)
    if (keys.length > MAX_SHORELINE_CACHE) {
        const removed = keys[0]
        delete shorelineCache[removed]
        //console.log(`🧹 [CACHE EVICT] removed=${removed}`)
    }

    //console.log(`✅ [DONE] tileKey=${tileKey}`)
    return data
}

function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {

    //console.log(`📏 [DIST] Input P=(${lat},${lon}) A=(${lat1},${lon1}) B=(${lat2},${lon2})`)

    // 🚨 validate inputs early
    const inputs = [lat, lon, lat1, lon1, lat2, lon2]
    if (inputs.some(v => v === null || v === undefined || isNaN(v))) {
        console.error(`🚨 [DIST ERROR] Invalid input detected`, inputs)
        return Infinity
    }

    const R = 6371000

    // convert to radians
    const φ = lat * Math.PI / 180
    const λ = lon * Math.PI / 180

    const φ1 = lat1 * Math.PI / 180
    const λ1 = lon1 * Math.PI / 180

    const φ2 = lat2 * Math.PI / 180
    const λ2 = lon2 * Math.PI / 180

    // project to local flat space (small distance approximation)
    const x = (λ - λ1) * Math.cos((φ + φ1) / 2)
    const y = (φ - φ1)

    const x2 = (λ2 - λ1) * Math.cos((φ2 + φ1) / 2)
    const y2 = (φ2 - φ1)

    const denom = (x2 * x2 + y2 * y2)

    if (denom < 1e-12) {
        console.warn(`⚠️ [DEGENERATE SEGMENT] A≈B → treating as point`)
        const dx = x
        const dy = y
        const dist = Math.sqrt(dx * dx + dy * dy) * R
        //console.log(`📏 [POINT DIST] ${dist.toFixed(2)} m`)
        return dist
    }

    let tRaw = (x * x2 + y * y2) / denom
    let t = Math.max(0, Math.min(1, tRaw))

    if (tRaw !== t) {
        //console.log(`🔧 [CLAMP] tRaw=${tRaw.toFixed(3)} → t=${t.toFixed(3)}`)
    }

    const projX = t * x2
    const projY = t * y2

    const dx = x - projX
    const dy = y - projY

    const dist = Math.sqrt(dx * dx + dy * dy) * R

    // 🔍 sanity checks
    if (!isFinite(dist)) {
        console.error(`🚨 [DIST ERROR] Non-finite result`, { dx, dy, dist })
        return Infinity
    }

    if (dist > 50000) {
        console.warn(`⚠️ [LARGE DIST] ${dist.toFixed(1)} m`)
    }

    //console.log(`📏 [DIST RESULT] ${dist.toFixed(2)} m`)
    return dist
}

function checkShoreline(lat, lon) {

    //console.log(`🌍 [CHECK] lat=${lat}, lon=${lon}`)

    const baseLat = Math.floor(lat)
    const baseLon = Math.floor(lon)

    //console.log(`🧭 [BASE TILE] ${baseLat}_${baseLon}`)

    let tilesChecked = 0
    let landChecks = 0
    let coastChecks = 0
    let segmentsTested = 0

    // 🔁 check 3x3 tiles
    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {

            const key = (baseLat + dLat) + "_" + (baseLon + dLon)
            //console.log(`📦 [TILE] Checking ${key}`)

            const tile = loadShorelineTile(key)
            tilesChecked++

            if (!tile) {
                //console.log(`⛔ [TILE EMPTY] ${key}`)
                continue
            }

            if (!tile.land || !tile.coast) {
                console.warn(`⚠️ [BAD TILE FORMAT] ${key}`, Object.keys(tile))
                continue
            }

            //console.log(`📊 [TILE DATA] land=${tile.land.length}, coast=${tile.coast.length}`)

            // ===== 1️⃣ LAND POLYGONS =====
            for (const poly of tile.land) {
                landChecks++

                if (
                    lat < poly.minLat || lat > poly.maxLat ||
                    lon < poly.minLon || lon > poly.maxLon
                ) {
                    continue
                }

                //console.log(`🏝️ [LAND BBOX HIT]`)

                if (!poly.poly) {
                    console.warn(`⚠️ [BAD POLY FORMAT] missing poly field`)
                    continue
                }

                if (pointInPolygon(lat, lon, poly.poly)) {
                    //console.log(`✅ [LAND HIT]`)
                    return 1
                }
            }

            // ===== 2️⃣ COASTLINE DISTANCE =====
            for (const coast of tile.coast) {
                coastChecks++

                // 🔹 coarse bbox reject
                if (
                    lat < coast.minLat || lat > coast.maxLat ||
                    lon < coast.minLon || lon > coast.maxLon
                ) continue

                //console.log(`🌊 [COAST BBOX HIT]`)

                const pts = coast.points

                if (!pts || pts.length < 2) {
                    console.warn(`⚠️ [BAD COAST GEOMETRY] points missing/too short`)
                    continue
                }

                for (let i = 0; i < pts.length - 1; i++) {

                    const [lon1, lat1] = pts[i]
                    const [lon2, lat2] = pts[i + 1]

                    // 🔥 segment-level reject
                    if (
                        lat < Math.min(lat1, lat2) - 0.0001 ||
                        lat > Math.max(lat1, lat2) + 0.0001 ||
                        lon < Math.min(lon1, lon2) - 0.0001 ||
                        lon > Math.max(lon1, lon2) + 0.0001
                    ) continue

                    segmentsTested++

                    //console.log(`🔍 [SEGMENT TEST] (${lat1},${lon1}) → (${lat2},${lon2})`)

                    const d = pointToSegmentDistance(
                        lat, lon,
                        lat1, lon1,
                        lat2, lon2
                    )

                    if (d <= 6) {
                        //console.log(`✅ [COAST HIT] distance=${d.toFixed(2)}m`)
                        return 1
                    }
                }
            }
        }
    }

    //console.log(`❌ [NO HIT] tiles=${tilesChecked}, landChecks=${landChecks}, coastChecks=${coastChecks}, segments=${segmentsTested}`)
    return 0
}

// ================================
// ===== MariaDB NOAA functions ====
// ================================
function metersToLatDelta(meters) {
    return meters / 111320.0
}

function metersToLonDelta(meters, lat) {
    const cosLat = Math.cos(lat * Math.PI / 180)
    if (Math.abs(cosLat) < 0.000001) {
        return meters / 111320.0
    }
    return meters / (111320.0 * cosLat)
}

function makePointWkt(lat, lon) {
    // WKT order is longitude latitude, not latitude longitude.
    return `POINT(${lon} ${lat})`
}

function parseLineStringWkt(wkt) {
    if (!wkt || !wkt.startsWith("LINESTRING(")) return []

    const body = wkt
        .replace("LINESTRING(", "")
        .replace(")", "")

    return body
        .split(",")
        .map(pair => {
            const [lon, lat] = pair.trim().split(/\s+/).map(Number)
            return { lat, lon }
        })
        .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lon))
}

function pointToSegmentDistanceQuiet(lat, lon, lat1, lon1, lat2, lon2) {
    const inputs = [lat, lon, lat1, lon1, lat2, lon2]
    if (inputs.some(v => v === null || v === undefined || isNaN(v))) {
        return Infinity
    }

    const R = 6371000

    const phi = lat * Math.PI / 180
    const lambda = lon * Math.PI / 180
    const phi1 = lat1 * Math.PI / 180
    const lambda1 = lon1 * Math.PI / 180
    const phi2 = lat2 * Math.PI / 180
    const lambda2 = lon2 * Math.PI / 180

    const x = (lambda - lambda1) * Math.cos((phi + phi1) / 2)
    const y = phi - phi1
    const x2 = (lambda2 - lambda1) * Math.cos((phi2 + phi1) / 2)
    const y2 = phi2 - phi1

    const denom = x2 * x2 + y2 * y2

    if (denom < 1e-12) {
        return Math.sqrt(x * x + y * y) * R
    }

    const t = Math.max(0, Math.min(1, (x * x2 + y * y2) / denom))
    const projX = t * x2
    const projY = t * y2
    const dx = x - projX
    const dy = y - projY
    const dist = Math.sqrt(dx * dx + dy * dy) * R

    return Number.isFinite(dist) ? dist : Infinity
}

async function getDepthFromDb(lat, lon, reqId = "noid") {
  const pointWkt = makePointWkt(lat, lon);

  //console.log( `🧭 [${reqId}] DB DEPTH START lat=${lat} lon=${lon} ` +  `DEPTH_RADIUS_M=${DEPTH_RADIUS_M}m ` +   `ENC_CANDIDATE_RADIUS_M=${ENC_CANDIDATE_RADIUS_M}m ` +     `DEPARE_RADIUS_M=${DEPARE_RADIUS_M}m`   );

  // ==================================================
  // 1. Exact ENC sounding search within DEPTH_RADIUS_M
  // ==================================================
  const exactLatDelta = metersToLatDelta(DEPTH_RADIUS_M);
  const exactLonDelta = metersToLonDelta(DEPTH_RADIUS_M, lat);

  let exactRows = [];

  try {
    //console.log(`🧭 [${reqId}] DB exact ENC query start radius=${DEPTH_RADIUS_M}m`);
    const [rows] = await dbPool.execute(
      `
      SELECT
        id,
        depth,
        lat,
        lon,
        ST_AsText(geom) AS geom_text,
        ST_DISTANCE_SPHERE(
          geom,
          ST_GeomFromText(?, 4326)
        ) AS distance_m
      FROM enc_soundings
      WHERE lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
        AND ST_DISTANCE_SPHERE(
          geom,
          ST_GeomFromText(?, 4326)
        ) <= ?
      ORDER BY distance_m ASC
      LIMIT 10
      `,
      [
        pointWkt,

        lat - exactLatDelta,
        lat + exactLatDelta,
        lon - exactLonDelta,
        lon + exactLonDelta,

        pointWkt,
        DEPTH_RADIUS_M
      ]
    );

    exactRows = rows;
  } catch (err) {
    console.error("🚨 DB exact ENC sounding query error:", err);
  }

  //console.log(`🧭 [${reqId}] DB exact ENC candidates=${exactRows.length}`);
  for (const row of exactRows) {
    //console.log( `   EXACT ENC id=${row.id} depth=${row.depth} ` + `lat=${row.lat} lon=${row.lon} ` + `dist=${Number(row.distance_m).toFixed(2)}m`  );
	
  }

  if (exactRows.length > 0) {
    const row = exactRows[0];

    //console.log( `🧭 [${reqId}] DB DEPTH SELECTED source=exact_enc_sounding ` +  `id=${row.id} depth=${row.depth} ` +  `distance=${Number(row.distance_m).toFixed(2)}m ` + `lat=${row.lat} lon=${row.lon}`);

    return Number(row.depth);
   }
  // ==================================================
  // 2. Candidate ENC sounding search
  //    Used only when no 5-meter sounding exists.
  //    Later: add DEPCNT contour-crossing rejection here.
  // ==================================================
  //console.log( `⚠️ No ENC sounding within ${DEPTH_RADIUS_M}m. ` + `Searching candidate soundings within ${ENC_CANDIDATE_RADIUS_M}m...`  );

  const candLatDelta = metersToLatDelta(ENC_CANDIDATE_RADIUS_M);
  const candLonDelta = metersToLonDelta(ENC_CANDIDATE_RADIUS_M, lat);

  let candidateRows = [];

  try {
    //console.log(`🧭 [${reqId}] DB candidate ENC query start radius=${ENC_CANDIDATE_RADIUS_M}m`);
    const [rows] = await dbPool.execute(
      `
      SELECT
        id,
        depth,
        lat,
        lon,
        ST_AsText(geom) AS geom_text,
        ST_DISTANCE_SPHERE(
          geom,
          ST_GeomFromText(?, 4326)
        ) AS distance_m
      FROM enc_soundings
      WHERE lat BETWEEN ? AND ?
        AND lon BETWEEN ? AND ?
        AND ST_DISTANCE_SPHERE(
          geom,
          ST_GeomFromText(?, 4326)
        ) <= ?
      ORDER BY distance_m ASC
      LIMIT 20
      `,
      [
        pointWkt,

        lat - candLatDelta,
        lat + candLatDelta,
        lon - candLonDelta,
        lon + candLonDelta,

        pointWkt,
        ENC_CANDIDATE_RADIUS_M
      ]
    );

    candidateRows = rows;
  } catch (err) {
    console.error("🚨 DB candidate ENC sounding query error:", err);
  }

  //console.log(`🧭 [${reqId}] DB candidate ENC candidates=${candidateRows.length}`);
  for (const row of candidateRows) {
    // console.log(
    //   `   CANDIDATE ENC id=${row.id} depth=${row.depth} ` +
    //   `lat=${row.lat} lon=${row.lon} ` +
    //   `dist=${Number(row.distance_m).toFixed(2)}m`
    // );
	
  }

let closestRejectedCandidate = null;

if (candidateRows.length > 0) {
  closestRejectedCandidate = candidateRows[0];

  const P = {
    lat: Number(lat),
    lon: Number(lon)
  };

  const contours = getContours(lat, lon);
const usableContours = contours.filter(contourHasValidDepth);
const ignoredContours = contours.length - usableContours.length;


//console.log( `🧭 [${reqId}] DB DEPCNT contour check start ` + `contours=${contours.length} usable=${usableContours.length} ` + `ignored_no_depth=${ignoredContours} tile=${tileKey(lat, lon)}`);

  for (let i = 0; i < candidateRows.length; i++) {
    const row = candidateRows[i];

    const S = {
      lat: Number(row.lat),
      lon: Number(row.lon),
      depth: Number(row.depth)
    };

    const { count } = countContourCrossings([P, S], usableContours, S.depth);
    
	//console.log( `🧭 [${reqId}] DB CONTOUR CHECK candidate#${i + 1} ` + `id=${row.id} depth=${row.depth} ` + `distance=${Number(row.distance_m).toFixed(2)}m ` +  `crossings=${count}`);

    if (count !== 0) {
      //console.log( `🧭 [${reqId}] DB CANDIDATE REJECTED contour_crossing ` + `id=${row.id} depth=${row.depth}`  );
	  
      continue;
    }

    //console.log( `🧭 [${reqId}] DB DEPTH SELECTED source=candidate_enc_sounding_contour_checked ` + `id=${row.id} depth=${row.depth} ` + `distance=${Number(row.distance_m).toFixed(2)}m ` + `lat=${row.lat} lon=${row.lon}`);

    return Number(row.depth);
  }

//  console.log( `🧭 [${reqId}] DB all candidate ENC soundings rejected by contour check. Trying DEPARE...` );

}
  // ==================================================
  // 3. DEPARE fallback
  // ==================================================
  //console.log("⚠️ No ENC candidate found. Trying DEPARE...");

  const depareLatDelta = metersToLatDelta(DEPARE_RADIUS_M);
  const depareLonDelta = metersToLonDelta(DEPARE_RADIUS_M, lat);

  let depareRows = [];

  try {
    //console.log(`🧭 [${reqId}] DB DEPARE query start radius=${DEPARE_RADIUS_M}m`);
    const [rows] = await dbPool.execute(
      `
      SELECT
        id,
        drval1,
        drval2,
        min_lat AS lat,
        min_lon AS lon,
        ST_AsText(geom) AS geom_text,
        ST_DISTANCE_SPHERE(
          geom,
          ST_GeomFromText(?, 4326)
        ) AS distance_m
      FROM depare_areas
      WHERE min_lat BETWEEN ? AND ?
        AND min_lon BETWEEN ? AND ?
        AND ST_DISTANCE_SPHERE(
          geom,
          ST_GeomFromText(?, 4326)
        ) <= ?
      ORDER BY distance_m ASC
      LIMIT 20
      `,
      [
        pointWkt,

        lat - depareLatDelta,
        lat + depareLatDelta,
        lon - depareLonDelta,
        lon + depareLonDelta,

        pointWkt,
        DEPARE_RADIUS_M
      ]
    );

    depareRows = rows;
  } catch (err) {
    console.error("🚨 DB DEPARE query error:", err);
  }

  //console.log(`🧭 [${reqId}] DB DEPARE candidates=${depareRows.length}`);
  for (const row of depareRows) {
        //console.log( `   DEPARE id=${row.id} drval1=${row.drval1} drval2=${row.drval2} ` + `lat=${row.lat} lon=${row.lon} ` +  `dist=${Number(row.distance_m).toFixed(2)}m` );
	
  }

  if (depareRows.length > 0 && depareRows[0].drval1 != null) {
    const row = depareRows[0];

//    console.log(    `🧭 [${reqId}] DB DEPTH SELECTED source=depare ` + `id=${row.id} depth=${row.drval1} drval2=${row.drval2} ` + `distance=${Number(row.distance_m).toFixed(2)}m ` +`lat=${row.lat} lon=${row.lon} );
	

    return Number(row.drval1);
  }
if (closestRejectedCandidate) {
  //console.log(  `🧭 [${reqId}] DB DEPTH FALLBACK source=nearest_enc_sounding_after_all_contours_rejected ` +  `id=${closestRejectedCandidate.id} depth=${closestRejectedCandidate.depth} ` +`distance=${Number(closestRejectedCandidate.distance_m).toFixed(2)}m ` +  `lat=${closestRejectedCandidate.lat} lon=${closestRejectedCandidate.lon}`);
  

  return Number(closestRejectedCandidate.depth);
}

//console.log(`🧭 [${reqId}] DB depth not found. Returning 1000.`);
return 1000;
}
async function getObstacleFromDb(lat, lon) {
    const pointWkt = makePointWkt(lat, lon)
    const latDelta = metersToLatDelta(OBSTACLE_RADIUS_M)
    const lonDelta = metersToLonDelta(OBSTACLE_RADIUS_M, lat)

    //console.log(`🚧 DB OBSTACLE START lat=${lat} lon=${lon} radius=${OBSTACLE_RADIUS_M}m`)

    const [rows] = await dbPool.execute(
        `
        SELECT
            obj_type,
            lat,
            lon,
            depth,
            colour,
            shape,
            category,
            name,
            ST_DISTANCE_SPHERE(geom, ST_GeomFromText(?, 4326)) AS distance_m
        FROM obstacles
        WHERE lat BETWEEN ? AND ?
          AND lon BETWEEN ? AND ?
          AND ST_DISTANCE_SPHERE(geom, ST_GeomFromText(?, 4326)) <= ?
        ORDER BY distance_m ASC
        LIMIT 1
        `,
        [
            pointWkt,
            lat - latDelta,
            lat + latDelta,
            lon - lonDelta,
            lon + lonDelta,
            pointWkt,
            OBSTACLE_RADIUS_M
        ]
    )

    if (rows.length === 0) {
        //console.log("❌ DB obstacle not found")
        return null
    }

    const row = rows[0]
    //console.log(`✅ DB obstacle=${row.obj_type} dist=${Number(row.distance_m).toFixed(2)}m`)

    return {
        type: row.obj_type,
        distance: Number(row.distance_m),
        lat: Number(row.lat),
        lon: Number(row.lon),
        colour: row.colour || null,
        shape: row.shape || null,
        name: row.name || null,
        depth: row.depth == null ? null : Number(row.depth),
        category: row.category || null
    }
}

async function getShorelineFromDb(lat, lon) {
  const pointWkt = makePointWkt(lat, lon);

  //console.log(    `🌊 DB SHORELINE START lat=${lat} lon=${lon} radius=${SHORELINE_RADIUS_M}m`  );
  

  // ==================================================
  // 1. Check if point is inside land polygon
  // ==================================================
  try {
    const [landRows] = await dbPool.execute(
      `
      SELECT id
      FROM shoreline_land
      WHERE ? BETWEEN min_lat AND max_lat
        AND ? BETWEEN min_lon AND max_lon
        AND ST_CONTAINS(
          geom,
          ST_GeomFromText(?, 4326)
        )
      LIMIT 1
      `,
      [
        lat,
        lon,
        pointWkt
      ]
    );

    if (landRows.length > 0) {
      //console.log("✅ DB shoreline land hit");
      return 1;
    }
  } catch (err) {
    console.error("🚨 DB shoreline land query error:", err);
    // Do not crash the whole request. Continue to coast check.
  }

  // ==================================================
  // 2. Check distance to coastline using SPATIAL INDEX
  // ==================================================
  const latDelta = metersToLatDelta(SHORELINE_RADIUS_M);
  const lonDelta = metersToLonDelta(SHORELINE_RADIUS_M, lat);

  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;
  const minLon = lon - lonDelta;
  const maxLon = lon + lonDelta;

  // IMPORTANT: WKT uses lon lat, not lat lon.
  const bboxWkt =
    `POLYGON((` +
    `${minLon} ${minLat},` +
    `${maxLon} ${minLat},` +
    `${maxLon} ${maxLat},` +
    `${minLon} ${maxLat},` +
    `${minLon} ${minLat}` +
    `))`;

  //console.log("🌊 DB shoreline bbox:", bboxWkt);

  let coastRows = [];

  try {
    const [rows] = await dbPool.execute(
      `
      SELECT
        id,
        ST_AsText(geom) AS wkt
      FROM shoreline_coast FORCE INDEX (idx_shoreline_coast_geom)
      WHERE MBRIntersects(
        geom,
        ST_GeomFromText(?, 4326)
      )
      LIMIT 1000
      `,
      [bboxWkt]
    );

    coastRows = rows;
  } catch (err) {
    console.error("🚨 DB shoreline coast query error:", err);
    return 0;
  }

  //console.log(`🌊 DB shoreline coast candidates=${coastRows.length}`);

  let closestDistance = Infinity;

  for (const row of coastRows) {
    const points = parseLineStringWkt(row.wkt);

    if (!points || points.length < 2) {
      continue;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];

      const d = pointToSegmentDistanceQuiet(
        lat,
        lon,
        a.lat,
        a.lon,
        b.lat,
        b.lon
      );
      if (d < closestDistance) {
        closestDistance = d;
      }

      if (d <= SHORELINE_RADIUS_M) {
        //console.log(`✅ DB shoreline coast hit dist=${d.toFixed(2)}m`);
        return 1;
      }
    }
  }

//console.log( `❌ DB shoreline not found. candidates=${coastRows?.length ?? 0} closest=${ Number.isFinite(closestDistance) ? `${closestDistance.toFixed(2)}m` : "none"}`);

  return 0;
}

// =============================================================
// ===== Continuous route-corridor geometry and DB functions ====
// =============================================================
class PathSearchError extends Error {
    constructor(message, statusCode = 500, code = "PATH_SEARCH_ERROR") {
        super(message)
        this.name = "PathSearchError"
        this.statusCode = statusCode
        this.code = code
    }
}

function clamp01(value) {
    return Math.max(0, Math.min(1, value))
}

function makeRouteMetric(startLat, startLon, endLat, endLon) {
    const earthRadius = 6371000
    const originLat = (startLat + endLat) / 2
    const originLon = startLon
    const originLatRad = originLat * Math.PI / 180
    const cosOriginLat = Math.cos(originLatRad)

    if (Math.abs(cosOriginLat) < 0.000001) {
        throw new PathSearchError(
            "Route-corridor searches are not supported this close to a pole.",
            400,
            "UNSUPPORTED_ROUTE_LATITUDE"
        )
    }

    function toLocal(lat, lon) {
        return {
            x: (lon - originLon) * Math.PI / 180 * earthRadius * cosOriginLat,
            y: (lat - originLat) * Math.PI / 180 * earthRadius
        }
    }

    function toLatLon(point) {
        return {
            lat: originLat + point.y / earthRadius * 180 / Math.PI,
            lon: originLon + point.x / (earthRadius * cosOriginLat) * 180 / Math.PI
        }
    }

    const start = toLocal(startLat, startLon)
    const end = toLocal(endLat, endLon)
    const dx = end.x - start.x
    const dy = end.y - start.y
    const lengthMeters = Math.sqrt(dx * dx + dy * dy)

    return {
        start,
        end,
        dx,
        dy,
        lengthMeters,
        toLocal,
        toLatLon
    }
}

function makeCorridorBboxWkt(startLat, startLon, endLat, endLon, radiusMeters) {
    const minRouteLat = Math.min(startLat, endLat)
    const maxRouteLat = Math.max(startLat, endLat)
    const minRouteLon = Math.min(startLon, endLon)
    const maxRouteLon = Math.max(startLon, endLon)

    const latDelta = metersToLatDelta(radiusMeters + 0.05)
    const lonDelta = Math.max(
        metersToLonDelta(radiusMeters + 0.05, startLat),
        metersToLonDelta(radiusMeters + 0.05, endLat),
        metersToLonDelta(radiusMeters + 0.05, (startLat + endLat) / 2)
    )

    const minLat = minRouteLat - latDelta
    const maxLat = maxRouteLat + latDelta
    const minLon = minRouteLon - lonDelta
    const maxLon = maxRouteLon + lonDelta

    return (
        `POLYGON((` +
        `${minLon} ${minLat},` +
        `${maxLon} ${minLat},` +
        `${maxLon} ${maxLat},` +
        `${minLon} ${maxLat},` +
        `${minLon} ${minLat}` +
        `))`
    )
}

function parseGeoJsonGeometry(value) {
    if (!value) return null

    try {
        if (Buffer.isBuffer(value)) {
            return JSON.parse(value.toString("utf8"))
        }

        if (typeof value === "string") {
            return JSON.parse(value)
        }

        if (typeof value === "object") {
            return value
        }
    } catch (err) {
        console.error("Bad GeoJSON geometry returned by MariaDB:", err.message)
    }

    return null
}

function localPointOnRoute(route, t) {
    return {
        x: route.start.x + route.dx * t,
        y: route.start.y + route.dy * t
    }
}

function squaredDistanceLocal(a, b) {
    const dx = a.x - b.x
    const dy = a.y - b.y
    return dx * dx + dy * dy
}

function closestPointOnLocalSegment(point, a, b) {
    const vx = b.x - a.x
    const vy = b.y - a.y
    const lengthSquared = vx * vx + vy * vy

    if (lengthSquared < 1e-18) {
        return {
            point: { x: a.x, y: a.y },
            t: 0,
            distanceMeters: Math.sqrt(squaredDistanceLocal(point, a))
        }
    }

    const t = clamp01(
        ((point.x - a.x) * vx + (point.y - a.y) * vy) / lengthSquared
    )

    const closest = {
        x: a.x + vx * t,
        y: a.y + vy * t
    }

    return {
        point: closest,
        t,
        distanceMeters: Math.sqrt(squaredDistanceLocal(point, closest))
    }
}

function cross2d(ax, ay, bx, by) {
    return ax * by - ay * bx
}

function localSegmentsIntersection(a, b, c, d) {
    const rx = b.x - a.x
    const ry = b.y - a.y
    const sx = d.x - c.x
    const sy = d.y - c.y
    const qpx = c.x - a.x
    const qpy = c.y - a.y
    const denominator = cross2d(rx, ry, sx, sy)
    const epsilon = 1e-10

    if (Math.abs(denominator) > epsilon) {
        const t = cross2d(qpx, qpy, sx, sy) / denominator
        const u = cross2d(qpx, qpy, rx, ry) / denominator

        if (t >= -epsilon && t <= 1 + epsilon && u >= -epsilon && u <= 1 + epsilon) {
            const clampedT = clamp01(t)
            const clampedU = clamp01(u)

            return {
                intersects: true,
                routeT: clampedT,
                obstacleT: clampedU,
                point: {
                    x: a.x + rx * clampedT,
                    y: a.y + ry * clampedT
                }
            }
        }

        return { intersects: false }
    }

    // Parallel but not collinear.
    if (Math.abs(cross2d(qpx, qpy, rx, ry)) > epsilon) {
        return { intersects: false }
    }

    const routeLengthSquared = rx * rx + ry * ry
    if (routeLengthSquared < 1e-18) {
        const projected = closestPointOnLocalSegment(a, c, d)
        if (projected.distanceMeters <= 1e-8) {
            return {
                intersects: true,
                routeT: 0,
                obstacleT: projected.t,
                point: { x: a.x, y: a.y }
            }
        }
        return { intersects: false }
    }

    const t0 = ((c.x - a.x) * rx + (c.y - a.y) * ry) / routeLengthSquared
    const t1 = ((d.x - a.x) * rx + (d.y - a.y) * ry) / routeLengthSquared
    const overlapStart = Math.max(0, Math.min(t0, t1))
    const overlapEnd = Math.min(1, Math.max(t0, t1))

    if (overlapStart <= overlapEnd + epsilon) {
        const routeT = clamp01(overlapStart)
        const point = {
            x: a.x + rx * routeT,
            y: a.y + ry * routeT
        }
        const obstacleProjection = closestPointOnLocalSegment(point, c, d)

        return {
            intersects: true,
            routeT,
            obstacleT: obstacleProjection.t,
            point
        }
    }

    return { intersects: false }
}

function closestRouteToObstacleSegment(route, obstacleA, obstacleB) {
    const intersection = localSegmentsIntersection(
        route.start,
        route.end,
        obstacleA,
        obstacleB
    )

    if (intersection.intersects) {
        return {
            distanceMeters: 0,
            routeT: intersection.routeT,
            routePoint: intersection.point,
            obstaclePoint: intersection.point
        }
    }

    const candidates = []

    // Obstacle endpoints projected onto the route.
    for (const obstaclePoint of [obstacleA, obstacleB]) {
        const projection = closestPointOnLocalSegment(
            obstaclePoint,
            route.start,
            route.end
        )
        candidates.push({
            distanceMeters: projection.distanceMeters,
            routeT: projection.t,
            routePoint: projection.point,
            obstaclePoint: { x: obstaclePoint.x, y: obstaclePoint.y }
        })
    }

    // Route endpoints projected onto the obstacle segment.
    const routeEndpoints = [
        { point: route.start, routeT: 0 },
        { point: route.end, routeT: 1 }
    ]

    for (const endpoint of routeEndpoints) {
        const projection = closestPointOnLocalSegment(
            endpoint.point,
            obstacleA,
            obstacleB
        )
        candidates.push({
            distanceMeters: projection.distanceMeters,
            routeT: endpoint.routeT,
            routePoint: { x: endpoint.point.x, y: endpoint.point.y },
            obstaclePoint: projection.point
        })
    }

    candidates.sort((left, right) => {
        const distanceDifference = left.distanceMeters - right.distanceMeters
        if (Math.abs(distanceDifference) > 1e-9) return distanceDifference
        return left.routeT - right.routeT
    })

    return candidates[0]
}

function distanceFromRoutePointToObstacleSegment(route, routeT, obstacleA, obstacleB) {
    const routePoint = localPointOnRoute(route, routeT)
    return closestPointOnLocalSegment(routePoint, obstacleA, obstacleB)
}

function measureObstacleSegmentAgainstRoute(route, obstacleA, obstacleB, radiusMeters) {
    const closest = closestRouteToObstacleSegment(route, obstacleA, obstacleB)

    if (!closest || closest.distanceMeters > radiusMeters + 1e-7) {
        return null
    }

    let encounterT = 0
    const startDistance = distanceFromRoutePointToObstacleSegment(
        route,
        0,
        obstacleA,
        obstacleB
    ).distanceMeters

    if (startDistance > radiusMeters) {
        let low = 0
        let high = clamp01(closest.routeT)

        // Distance to a line segment is convex along the route. Since "high"
        // is at a closest point, bisection finds the first corridor contact.
        for (let i = 0; i < 50; i++) {
            const middle = (low + high) / 2
            const middleDistance = distanceFromRoutePointToObstacleSegment(
                route,
                middle,
                obstacleA,
                obstacleB
            ).distanceMeters

            if (middleDistance <= radiusMeters) {
                high = middle
            } else {
                low = middle
            }
        }

        encounterT = high
    }

    const encounter = distanceFromRoutePointToObstacleSegment(
        route,
        encounterT,
        obstacleA,
        obstacleB
    )

    return {
        encounterT,
        encounterDistanceFromStartMeters: encounterT * route.lengthMeters,
        closestRouteT: closest.routeT,
        closestApproachDistanceFromStartMeters: closest.routeT * route.lengthMeters,
        distanceToRouteMeters: closest.distanceMeters,
        obstaclePoint: encounter.point
    }
}

function pointInLocalRing(point, ring, route) {
    if (!Array.isArray(ring) || ring.length < 3) return false

    let inside = false

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const current = route.toLocal(Number(ring[i][1]), Number(ring[i][0]))
        const previous = route.toLocal(Number(ring[j][1]), Number(ring[j][0]))

        const onEdge = closestPointOnLocalSegment(point, previous, current)
        if (onEdge.distanceMeters <= 1e-7) return true

        const intersects =
            ((current.y > point.y) !== (previous.y > point.y)) &&
            (
                point.x <
                (previous.x - current.x) *
                    (point.y - current.y) /
                    (previous.y - current.y) +
                current.x
            )

        if (intersects) inside = !inside
    }

    return inside
}

function pointInGeoJsonPolygonLocal(point, polygonCoordinates, route) {
    if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
        return false
    }

    if (!pointInLocalRing(point, polygonCoordinates[0], route)) {
        return false
    }

    for (let i = 1; i < polygonCoordinates.length; i++) {
        if (pointInLocalRing(point, polygonCoordinates[i], route)) {
            return false
        }
    }

    return true
}

function chooseEarlierCorridorHit(current, candidate) {
    if (!candidate) return current
    if (!current) return candidate

    const encounterDifference =
        candidate.encounterDistanceFromStartMeters -
        current.encounterDistanceFromStartMeters

    if (Math.abs(encounterDifference) > 1e-6) {
        return encounterDifference < 0 ? candidate : current
    }

    const closestDifference =
        candidate.closestApproachDistanceFromStartMeters -
        current.closestApproachDistanceFromStartMeters

    if (Math.abs(closestDifference) > 1e-6) {
        return closestDifference < 0 ? candidate : current
    }

    return candidate.distanceToRouteMeters < current.distanceToRouteMeters
        ? candidate
        : current
}

function measureCoordinatePoint(route, coordinate, radiusMeters) {
    if (!Array.isArray(coordinate) || coordinate.length < 2) return null

    const lon = Number(coordinate[0])
    const lat = Number(coordinate[1])
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null

    const local = route.toLocal(lat, lon)
    return measureObstacleSegmentAgainstRoute(route, local, local, radiusMeters)
}

function measureCoordinateLine(route, coordinates, radiusMeters) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) return null

    if (coordinates.length === 1) {
        return measureCoordinatePoint(route, coordinates[0], radiusMeters)
    }

    let best = null

    for (let i = 0; i < coordinates.length - 1; i++) {
        const first = coordinates[i]
        const second = coordinates[i + 1]

        if (
            !Array.isArray(first) || first.length < 2 ||
            !Array.isArray(second) || second.length < 2
        ) {
            continue
        }

        const a = route.toLocal(Number(first[1]), Number(first[0]))
        const b = route.toLocal(Number(second[1]), Number(second[0]))

        if (
            !Number.isFinite(a.x) || !Number.isFinite(a.y) ||
            !Number.isFinite(b.x) || !Number.isFinite(b.y)
        ) {
            continue
        }

        best = chooseEarlierCorridorHit(
            best,
            measureObstacleSegmentAgainstRoute(route, a, b, radiusMeters)
        )
    }

    return best
}

function measurePolygonCoordinates(route, polygonCoordinates, radiusMeters) {
    if (!Array.isArray(polygonCoordinates) || polygonCoordinates.length === 0) {
        return null
    }

    // If the route starts in the polygon area, the danger is immediate.
    if (pointInGeoJsonPolygonLocal(route.start, polygonCoordinates, route)) {
        return {
            encounterT: 0,
            encounterDistanceFromStartMeters: 0,
            closestRouteT: 0,
            closestApproachDistanceFromStartMeters: 0,
            distanceToRouteMeters: 0,
            obstaclePoint: { x: route.start.x, y: route.start.y }
        }
    }

    let best = null
    for (const ring of polygonCoordinates) {
        best = chooseEarlierCorridorHit(
            best,
            measureCoordinateLine(route, ring, radiusMeters)
        )
    }

    return best
}

function measureGeoJsonGeometryAgainstRoute(route, geometry, radiusMeters) {
    if (!geometry || typeof geometry !== "object") return null

    switch (geometry.type) {
        case "Point":
            return measureCoordinatePoint(route, geometry.coordinates, radiusMeters)

        case "MultiPoint": {
            let best = null
            for (const coordinate of geometry.coordinates || []) {
                best = chooseEarlierCorridorHit(
                    best,
                    measureCoordinatePoint(route, coordinate, radiusMeters)
                )
            }
            return best
        }

        case "LineString":
            return measureCoordinateLine(route, geometry.coordinates, radiusMeters)

        case "MultiLineString": {
            let best = null
            for (const line of geometry.coordinates || []) {
                best = chooseEarlierCorridorHit(
                    best,
                    measureCoordinateLine(route, line, radiusMeters)
                )
            }
            return best
        }

        case "Polygon":
            return measurePolygonCoordinates(route, geometry.coordinates, radiusMeters)

        case "MultiPolygon": {
            let best = null
            for (const polygon of geometry.coordinates || []) {
                best = chooseEarlierCorridorHit(
                    best,
                    measurePolygonCoordinates(route, polygon, radiusMeters)
                )
            }
            return best
        }

        case "GeometryCollection": {
            let best = null
            for (const child of geometry.geometries || []) {
                best = chooseEarlierCorridorHit(
                    best,
                    measureGeoJsonGeometryAgainstRoute(route, child, radiusMeters)
                )
            }
            return best
        }

        default:
            return null
    }
}

function ensureCandidateLimit(rows, layerName) {
    if (rows.length > PATH_MAX_LAYER_CANDIDATES) {
        throw new PathSearchError(
            `The ${layerName} corridor search returned too many candidates to complete safely.`,
            503,
            "PATH_CANDIDATE_LIMIT"
        )
    }
}

function isValidCorridorDepth(value) {
    const depth = Number(value)
    return (
        Number.isFinite(depth) &&
        depth !== 1000 &&
        depth !== -1
    )
}

async function getPathObstacleFromDb(route, bboxWkt, radiusMeters) {
    const rowLimit = PATH_MAX_LAYER_CANDIDATES + 1

    const [rows] = await dbPool.execute(
        `
        SELECT
            id,
            obj_type,
            lat,
            lon,
            depth,
            colour,
            shape,
            category,
            name,
            ST_AsGeoJSON(geom) AS geom_json
        FROM obstacles
        WHERE MBRIntersects(
            geom,
            ST_GeomFromText(?, 4326)
        )
        LIMIT ${rowLimit}
        `,
        [bboxWkt]
    )

    ensureCandidateLimit(rows, "obstacle")

    let best = null

    for (const row of rows) {
        let geometry = parseGeoJsonGeometry(row.geom_json)

        // Backward-compatible fallback for databases that currently store
        // only obstacle center coordinates.
        if (!geometry && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
            geometry = {
                type: "Point",
                coordinates: [Number(row.lon), Number(row.lat)]
            }
        }

        const hit = measureGeoJsonGeometryAgainstRoute(route, geometry, radiusMeters)
        if (!hit) continue

        const contact = route.toLatLon(hit.obstaclePoint)
        const candidate = {
            hit,
            row,
            contact
        }

        if (!best) {
            best = candidate
            continue
        }

        const earlier = chooseEarlierCorridorHit(best.hit, candidate.hit)
        if (earlier === candidate.hit) {
            best = candidate
        }
    }

    if (!best) {
        return {
            obstacle: null,
            encounterDistanceFromStartMeters: Infinity
        }
    }

    const row = best.row
    const hit = best.hit
    const latitude = Number(best.contact.lat)
    const longitude = Number(best.contact.lon)

    return {
        obstacle: {
            // Same fields and names returned by the existing GET /depth route.
            type: row.obj_type,
            distance: Number(hit.encounterDistanceFromStartMeters),
            lat: latitude,
            lon: longitude,
            colour: row.colour || null,
            shape: row.shape || null,
            name: row.name || null,
            depth: row.depth == null ? null : Number(row.depth),
            category: row.category || null
        },
        encounterDistanceFromStartMeters: hit.encounterDistanceFromStartMeters
    }
}

async function getPathShorelineFromDb(route, bboxWkt, radiusMeters) {
    const rowLimit = PATH_MAX_LAYER_CANDIDATES + 1

    const [landResult, coastResult] = await Promise.all([
        dbPool.execute(
            `
            SELECT
                id,
                ST_AsGeoJSON(geom) AS geom_json
            FROM shoreline_land
            WHERE MBRIntersects(
                geom,
                ST_GeomFromText(?, 4326)
            )
            LIMIT ${rowLimit}
            `,
            [bboxWkt]
        ),
        dbPool.execute(
            `
            SELECT
                id,
                ST_AsGeoJSON(geom) AS geom_json
            FROM shoreline_coast
            WHERE MBRIntersects(
                geom,
                ST_GeomFromText(?, 4326)
            )
            LIMIT ${rowLimit}
            `,
            [bboxWkt]
        )
    ])

    const landRows = landResult[0]
    const coastRows = coastResult[0]

    ensureCandidateLimit(landRows, "land")
    ensureCandidateLimit(coastRows, "shoreline")

    let best = null

    for (const row of landRows) {
        const hit = measureGeoJsonGeometryAgainstRoute(
            route,
            parseGeoJsonGeometry(row.geom_json),
            radiusMeters
        )

        if (!hit) continue

        const candidate = { ...hit, dangerKind: "land" }
        best = chooseEarlierCorridorHit(best, candidate)
        if (best === candidate) best.dangerKind = "land"
    }

    for (const row of coastRows) {
        const hit = measureGeoJsonGeometryAgainstRoute(
            route,
            parseGeoJsonGeometry(row.geom_json),
            radiusMeters
        )

        if (!hit) continue

        const candidate = { ...hit, dangerKind: "shoreline" }
        best = chooseEarlierCorridorHit(best, candidate)
        if (best === candidate) best.dangerKind = "shoreline"
    }

    if (!best) {
        return {
            shoreline: 0,
            dangerKind: null,
            encounterDistanceFromStartMeters: Infinity,
            latitude: null,
            longitude: null
        }
    }

    const contact = route.toLatLon(best.obstaclePoint)

    return {
        shoreline: 1,
        dangerKind: best.dangerKind || "shoreline",
        encounterDistanceFromStartMeters: best.encounterDistanceFromStartMeters,
        latitude: Number(contact.lat),
        longitude: Number(contact.lon)
    }
}

async function getPathDepthFromDb(route, bboxWkt, radiusMeters) {
    const rowLimit = PATH_MAX_LAYER_CANDIDATES + 1

    const [soundingResult, depareResult] = await Promise.all([
        dbPool.execute(
            `
            SELECT
                id,
                depth,
                lat,
                lon,
                ST_AsGeoJSON(geom) AS geom_json
            FROM enc_soundings
            WHERE MBRIntersects(
                geom,
                ST_GeomFromText(?, 4326)
            )
            LIMIT ${rowLimit}
            `,
            [bboxWkt]
        ),
        dbPool.execute(
            `
            SELECT
                id,
                drval1,
                drval2,
                ST_AsGeoJSON(geom) AS geom_json
            FROM depare_areas
            WHERE MBRIntersects(
                geom,
                ST_GeomFromText(?, 4326)
            )
            LIMIT ${rowLimit}
            `,
            [bboxWkt]
        )
    ])

    const soundingRows = soundingResult[0]
    const depareRows = depareResult[0]

    ensureCandidateLimit(soundingRows, "depth sounding")
    ensureCandidateLimit(depareRows, "depth area")

    let bestDepth = null

    function considerDepth(value, source, rowId, hit) {
        if (!hit || !isValidCorridorDepth(value)) return

        const depth = Number(value)
        const candidate = {
            depth,
            source,
            rowId,
            encounterDistanceFromStartMeters: hit.encounterDistanceFromStartMeters,
            closestApproachDistanceFromStartMeters:
                hit.closestApproachDistanceFromStartMeters
        }

        if (!bestDepth) {
            bestDepth = candidate
            return
        }

        if (depth < bestDepth.depth) {
            bestDepth = candidate
            return
        }

        if (
            depth === bestDepth.depth &&
            candidate.encounterDistanceFromStartMeters <
                bestDepth.encounterDistanceFromStartMeters
        ) {
            bestDepth = candidate
        }
    }

    for (const row of soundingRows) {
        let geometry = parseGeoJsonGeometry(row.geom_json)
        if (!geometry && Number.isFinite(Number(row.lat)) && Number.isFinite(Number(row.lon))) {
            geometry = {
                type: "Point",
                coordinates: [Number(row.lon), Number(row.lat)]
            }
        }

        const hit = measureGeoJsonGeometryAgainstRoute(route, geometry, radiusMeters)
        considerDepth(row.depth, "enc_sounding", row.id, hit)
    }

    for (const row of depareRows) {
        const geometry = parseGeoJsonGeometry(row.geom_json)
        const hit = measureGeoJsonGeometryAgainstRoute(route, geometry, radiusMeters)
        considerDepth(row.drval1, "depare", row.id, hit)
    }

    if (!bestDepth) {
        return {
            depth: 1000,
            source: null,
            distanceFromStartMeters: null
        }
    }

    return {
        depth: bestDepth.depth,
        source: bestDepth.source,
        distanceFromStartMeters: bestDepth.encounterDistanceFromStartMeters,
        closestApproachDistanceFromStartMeters:
            bestDepth.closestApproachDistanceFromStartMeters
    }
}

function parseRequiredQueryNumber(req, name) {
    const raw = req.query[name]

    if (raw === undefined || raw === null || String(raw).trim() === "") {
        throw new PathSearchError(
            `Missing required parameter: ${name}`,
            400,
            "MISSING_PARAMETER"
        )
    }

    const value = Number(raw)
    if (!Number.isFinite(value)) {
        throw new PathSearchError(
            `Invalid numeric parameter: ${name}`,
            400,
            "INVALID_PARAMETER"
        )
    }

    return value
}

function parseOptionalQueryNumber(req, name) {
    const raw = req.query[name]

    if (raw === undefined || raw === null || String(raw).trim() === "") {
        return null
    }

    const value = Number(raw)
    if (!Number.isFinite(value)) {
        throw new PathSearchError(
            `Invalid numeric parameter: ${name}`,
            400,
            "INVALID_PARAMETER"
        )
    }

    return value
}

function resolvePathCorridorSize(req) {
    if (req.query.radiusMeters !== undefined) {
        throw new PathSearchError(
            "radiusMeters is not supported. Use widthMeters.",
            400,
            "UNSUPPORTED_PARAMETER"
        )
    }

    const widthMeters = parseOptionalQueryNumber(req, "widthMeters")

    if (widthMeters === null) {
        throw new PathSearchError(
            "Missing required parameter: widthMeters",
            400,
            "MISSING_PARAMETER"
        )
    }

    if (widthMeters <= 0) {
        throw new PathSearchError(
            "widthMeters must be greater than zero.",
            400,
            "INVALID_WIDTH"
        )
    }

    if (Math.abs(widthMeters - PATH_WIDTH_M) > PATH_WIDTH_TOLERANCE_M) {
        throw new PathSearchError(
            `Unsupported widthMeters. The supported production width is ${PATH_WIDTH_M} meters.`,
            400,
            "UNSUPPORTED_WIDTH"
        )
    }

    return {
        widthMeters,
        radiusMeters: widthMeters / 2
    }
}

function validatePathRequest(startLat, startLon, endLat, endLon) {
    for (const [name, value] of [
        ["startLat", startLat],
        ["endLat", endLat]
    ]) {
        if (value < -90 || value > 90) {
            throw new PathSearchError(
                `${name} must be between -90 and 90.`,
                400,
                "INVALID_LATITUDE"
            )
        }
    }

    for (const [name, value] of [
        ["startLon", startLon],
        ["endLon", endLon]
    ]) {
        if (value < -180 || value > 180) {
            throw new PathSearchError(
                `${name} must be between -180 and 180.`,
                400,
                "INVALID_LONGITUDE"
            )
        }
    }

    const routeLengthMeters = wdistMeters(startLat, startLon, endLat, endLon)

    if (!Number.isFinite(routeLengthMeters) || routeLengthMeters <= 0.01) {
        throw new PathSearchError(
            "The route must have a non-zero length.",
            400,
            "ZERO_LENGTH_ROUTE"
        )
    }

    if (routeLengthMeters > PATH_MAX_LENGTH_M) {
        throw new PathSearchError(
            `The route is too long. Maximum supported length is ${PATH_MAX_LENGTH_M} meters.`,
            400,
            "ROUTE_TOO_LONG"
        )
    }

    return routeLengthMeters
}

////////////////////////////////////
// ===== NOAA SERVER ENDS ====
/////////////////////////////////
// ✅ Correct way to initialize OpenAI
app.use((req, res, next) => {
    //console.log(`${req.method} ${req.url}`);
    next();
});

// ✅ API route (MUST be BEFORE serving React)
app.get("/api", (req, res) => {
    res.json({ message: "Hello from Express API!" });
});


const soundingCache = {}

function getSoundings(lat, lon) {
  const key = tileKey(lat, lon)

  if (soundingCache[key]) {
    return soundingCache[key]
  }

  const file = `${ENC_ROOT}/soundg_tiles/${key}.json`

  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"))

    soundingCache[key] = data
    //console.log(`📦 Soundings loaded: ${key}, count=${data.length}`)

    return data
  } catch (err) {
    //console.log(`❌ No sounding tile: ${key}`)
    soundingCache[key] = []
    return []
  }
}

const contourCache = {}

function getTileKey(lat, lon) {
  const latKey = Math.floor(lat * 100)
  const lonKey = Math.floor(lon * 100)

  return `${latKey}_${lonKey}`
}

function getContours(lat, lon) {
  const key = tileKey(lat, lon)

  if (contourCache[key]) {
    return contourCache[key]
  }

const file = `${ENC_ROOT}/depcnt_tiles/${key}.json`
  try {
    const raw = fs.readFileSync(file, "utf-8")

    const data = raw
      .trim()
      .split("\n")
      .map(line => JSON.parse(line))

    contourCache[key] = data

    //console.log(`📦 Contours loaded: ${key}, count=${data.length}`)

    return data

  } catch (err) {
    //console.log(`❌ No contour tile: ${key}`)
    contourCache[key] = []
    return []
  }
}
//////////////////////////////////////////////////
// Continuous route corridor. Existing GET /depth remains unchanged.
app.get("/depth/path", pathLimiter, (req, res) => {
    if (queue.length >= MAX_QUEUE) {
        return res.status(503).json({
            error: "Server busy, please try again shortly.",
            code: "SERVER_BUSY"
        })
    }

    req.setTimeout(PATH_QUERY_TIMEOUT_MS)
    res.setTimeout(PATH_QUERY_TIMEOUT_MS, () => {
        if (!res.headersSent && !res.writableEnded) {
            res.status(504).json({
                error: "The route-corridor search timed out.",
                code: "PATH_TIMEOUT"
            })
        }
    })

    queue.push(async () => {
        try {
            const startLat = parseRequiredQueryNumber(req, "startLat")
            const startLon = parseRequiredQueryNumber(req, "startLon")
            const endLat = parseRequiredQueryNumber(req, "endLat")
            const endLon = parseRequiredQueryNumber(req, "endLon")
            const { widthMeters, radiusMeters } = resolvePathCorridorSize(req)

            const validatedLengthMeters = validatePathRequest(
                startLat,
                startLon,
                endLat,
                endLon
            )

            const route = makeRouteMetric(startLat, startLon, endLat, endLon)

            // Haversine is used for validation/reporting; the local route model
            // is used for exact short-route corridor calculations.
            route.lengthMeters = validatedLengthMeters

            const bboxWkt = makeCorridorBboxWkt(
                startLat,
                startLon,
                endLat,
                endLon,
                radiusMeters
            )

            const [depthResult, obstacleResult, shorelineResult] = await Promise.all([
                getPathDepthFromDb(route, bboxWkt, radiusMeters),
                getPathObstacleFromDb(route, bboxWkt, radiusMeters),
                getPathShorelineFromDb(route, bboxWkt, radiusMeters)
            ])

            // Keep the successful response identical to GET /depth so the
            // existing Android DepthResult parser can read either endpoint.
            const response = {
                depth: depthResult.depth,
                obstacle: obstacleResult.obstacle,
                shoreline: shorelineResult.shoreline
            }

            if (!res.headersSent && !res.writableEnded) {
                res.json(response)
            }
        } catch (err) {
            console.error("🚨 DB /depth/path error:", err)

            if (res.headersSent || res.writableEnded) {
                return
            }

            const statusCode = err instanceof PathSearchError
                ? err.statusCode
                : 500

            res.status(statusCode).json({
                error: err instanceof PathSearchError
                    ? err.message
                    : "The route-corridor search could not be completed.",
                code: err instanceof PathSearchError
                    ? err.code
                    : "PATH_SEARCH_ERROR"
            })
        }
    })

    processQueue()
})

  app.get("/depth", depthLimiter, (req, res) => {
    if (queue.length >= MAX_QUEUE) {
        return res.status(503).json({
            error: "Server busy, please try again shortly."
        });
    }
  queue.push(async () => {

    try {
      const lat = parseFloat(req.query.lat)
      const lon = parseFloat(req.query.lon)


      if (
        isNaN(lat) || isNaN(lon) ||
        lat < -90 || lat > 90 ||
        lon < -180 || lon > 180
      ) {
        return res.status(400).json({ error: "Invalid lat/lon" })
      }
      const reqId = Math.random().toString(36).slice(2, 8);
      //console.log(`🧭 [${reqId}] DEPTH REQUEST lat=${lat} lon=${lon}`);

      //console.log(`\n==============================`);
      //console.log(`📡 DB /depth request lat=${lat} lon=${lon}`);
      //console.log(`DEPTH_RADIUS_M=${DEPTH_RADIUS_M}`);
      //console.log(`ENC_CANDIDATE_RADIUS_M=${ENC_CANDIDATE_RADIUS_M}`);
      //console.log(`DEPARE_RADIUS_M=${DEPARE_RADIUS_M}`);
      //console.log(`OBSTACLE_RADIUS_M=${OBSTACLE_RADIUS_M}`);
      //console.log(`SHORELINE_RADIUS_M=${SHORELINE_RADIUS_M}`);
      //console.log(`==============================`);

	  const [depth, obstacle, shoreline] = await Promise.all([
	 	 getDepthFromDb(lat, lon, reqId),
	 	 getObstacleFromDb(lat, lon),
	 	 getShorelineFromDb(lat, lon)
	  ]);
	  
      const response = { depth, obstacle, shoreline }
      //console.log(`🧭 [${reqId}] ✅ DB RESPONSE`, response);
      res.json(response)

    } catch (err) {
      console.error("🚨 DB /depth error:", err)
      res.status(500).json({ error: "Server error" })
    }
  })

  processQueue()
})

function checkApiKey(req, res, next) {
    const key = req.headers['x-api-key']

    if (!key || key !== process.env.EMAIL_API_KEY) {
        return res.status(403).json({ error: "Forbidden" })
    }

    next()
}
function checkOrigin(req, res, next) {
    const allowed = [
      "https://y219.com",
      "https://www.y219.com",
      "http://localhost:5173"
    ]
    const origin = req.headers.origin

    if (!origin || !allowed.includes(origin)) {
        //console.log("Blocked origin:", origin)
        return res.status(403).json({ error: "Forbidden" })
    }

    next()
}
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60
});

app.use(globalLimiter);
// ================================
// ==== ✅ Email sending route ====
// ================================
app.post("/send-email", emailLimiter, checkOrigin, async (req, res) => {
    const { name, email, message } = req.body;
if (!name || !email || !message) {
    return res.status(400).json({ error: "Missing fields" })
}

if (!email.includes("@")) {
    return res.status(400).json({ error: "Invalid email" })
}

if (message.length > 1000) {
    return res.status(400).json({ error: "Message too long" })
}

let transporter = nodemailer.createTransport({
    host: "localhost",
    port: 25,
    secure: false,
    ignoreTLS: true   // ✅ THIS FIXES IT
});

//console.log("🔥 CONTACT ROUTE VERSION: PORT 25");
    const mailOptions = {
        from: "info@y219.com",
        to: "info@y219.com",
        subject: `Contact form submission from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
    };

    const confirmationMailOptions = {
        from: "info@y219.com",
        to: email,
        subject: "We have received your message",
        text: `Dear ${name},\n\nThank you for reaching out to us. We have received your message and will get back to you shortly.\n\nBest regards,\nY219.com Team\n`,
    };

    try {
        await transporter.sendMail(mailOptions);
        await transporter.sendMail(confirmationMailOptions);
        //console.log("Emails sent successfully");
        res.status(200).json({ message: "Emails sent successfully" });
    } catch (error) {
        console.error("Error sending emails:", error);
        res.status(500).json({ message: "Error sending emails" });
    }
});

// ✅ Serve React frontend
const clientBuildPath = path.join(__dirname, "client", "dist");
app.use(express.static(clientBuildPath));

// ✅ Catch-all: Send `index.html` for all non-API routes
app.get("*", (req, res) => {
    res.sendFile(path.join(clientBuildPath, "index.html"), (err) => {
        if (err) {
            res.status(500).send("Error loading frontend");
        }
    });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));