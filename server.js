const express = require("express");
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");
const fs = require('fs')
const proj4 = require('proj4')
proj4.defs("EPSG:26918", "+proj=utm +zone=18 +datum=NAD83 +units=m +no_defs")
const WGS84 = 'EPSG:4326'
const UTM18 = 'EPSG:26918'
const ENC_ROOT = '/home/georged/NOAAserver/ENC_ROOT'
const BLUE_ROOT = '/home/georged/NOAAserver/BLUE_TOP'
const MAX_CONCURRENT = 1
let activeRequests = 0
const queue = []

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
console.log("Loading BlueTopo index...")

const app = express();

app.use(cors());
app.use(express.json());   // 🔥 REQUIRED

app.use((req, res, next) => {
    console.log("👉 Incoming request:", req.method, req.url);
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

console.log("BlueTopo index loaded")


const rateLimit = require('express-rate-limit')
//  const app = express();
app.set('trust proxy', 1);

const depthLimiter = rateLimit({
    windowMs: 1000,
    max: 5
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
console.log(`***QUEUE*** → active=${activeRequests} waiting=${queue.length}`)

    next().finally(() => {
        activeRequests--
 console.log(`****QUEUE DONE**** → active=${activeRequests} waiting=${queue.length}`)

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
        console.log("Outside tile bbox (projected)")
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

        console.log("Found Blue Top depth:", depth)

        return depth

    } catch (err) {
        console.error("BlueTopo read error:", err)
        return 1000
    }
}

//  ====== DEPART FUNCTION  ===

function getDepthFromDEPARE(lat, lon) {
console.log("🔥 DEPARE START", lat, lon)
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
        console.log("BBOX:", poly.minLat, poly.maxLat, poly.minLon, poly.maxLon)
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
                       console.log("Poly shape:", JSON.stringify(poly.poly).slice(0, 200))
                       console.log("Point (lat,lon):", lat, lon)
                       console.log("First poly point:", poly.poly[0])
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
console.log("🔥 DEPARE RESULT:", minDepth)
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

    console.log(`Loading DEPARE tile: ${tileKey}`)

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

// ===== OBSTRUCTIONS FUNCTIONS ====
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
        console.log("Candidate dist:", d, "Obj:", obj.type, obj.lat, obj.lon)

        // ?? OPTIONAL FILTER (enable if needed)
        // if (!HARD_HAZARDS.has(obj.type)) continue

        // ? FIX: more realistic detection radius
        if (d <= 120 && d < minDist) {
          minDist = d
          closest = obj
        }
      }
    }
  }

if (!closest) {
  console.log("❌ No obstacle found near:", lat, lon)
  return null
}

console.log("✅ Closest:", closest.type, "dist=", minDist)

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
console.log(tileKey(38.828, -77.032))

function getNearestSoundings(P, soundings) {
  console.log("getNearestSoundings loaded")

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
  console.log(`\n📍 ENC DEPTH → lat=${P.lat}, lon=${P.lon}`)

  const candidates = getNearestSoundings(P, soundings)

  console.log(`📊 Candidates: ${candidates.length}`)

  for (let i = 0; i < candidates.length; i++) {
    const S = candidates[i]
    const dist = distance(P, S)

    console.log(`➡️ S#${i + 1}: depth=${S.depth}, dist=${dist.toFixed(1)}m`)

    const { count } = countContourCrossings([P, S], contours, S.depth)

    console.log(`🧮 Crossings=${count}`)

    if (count  !== 0) {
      console.log(`❌ Reject (odd)`)
      continue
    }

    console.log(`✅ Accept → depth=${S.depth}`)
    return S.depth
  }

  console.log(`❌ ENC failed`)
  if (candidates.length > 0) {
     console.log(`⚠️ Fallback → nearest sounding`)
     return candidates[0].depth
   }  
   return 1000
}

function countContourCrossings(L, contours, soundingDepth) {
  let count = 0

  for (const contour of contours) {
    
    if (!bboxIntersectsSegment(contour.bbox, L)) continue

    let lastHitKey = null

    for (let i = 0; i < contour.points.length - 1; i++) {
      const A = contour.points[i]
      const B = contour.points[i + 1]

      if (!segmentHits(L[0], L[1], A, B)) continue

      // vertex detection
      let hitPoint = null
      if (onSegment(L[0], L[1], A)) hitPoint = A
      else if (onSegment(L[0], L[1], B)) hitPoint = B
      else if (onSegment(A, B, L[0])) hitPoint = L[0]
      else if (onSegment(A, B, L[1])) hitPoint = L[1]

      const key = hitPoint
        ? `${hitPoint.lon.toFixed(7)},${hitPoint.lat.toFixed(7)}`
        : null

      // dedup vertex
      if (hitPoint && key === lastHitKey) continue
      if (hitPoint) lastHitKey = key

      count++

      // ⚡ early exit
      if (count > 0) return { count }   // early exit: any crossing blocks
    }
  }

  return { count }
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
    console.log(`🌊 [SHORELINE] Request tileKey=${tileKey}`)

    // ✅ cache hit (including null)
    if (tileKey in shorelineCache) {
        console.log(`⚡ [CACHE HIT] tileKey=${tileKey} value=${shorelineCache[tileKey] ? 'DATA' : 'NULL'}`)
        return shorelineCache[tileKey]
    }

    const file = `${ENC_ROOT}/shoreline_tiles/${tileKey}.json`
    console.log(`📁 [FILE PATH] ${file}`)

    // 🔥 cache negative result
    if (!fs.existsSync(file)) {
        console.warn(`❌ [FILE NOT FOUND] ${file}`)
        shorelineCache[tileKey] = null
        return null
    }

    // 📊 file stats
    try {
        const stats = fs.statSync(file)
        console.log(`📦 [FILE SIZE] ${stats.size} bytes`)
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
    console.log(`🧪 [DATA KEYS]`, Object.keys(data))

    if (data.land) {
        console.log(`🏝️ [LAND COUNT] ${data.land.length}`)
    } else {
        console.warn(`⚠️ [NO LAND FIELD]`)
    }

    if (data.coast) {
        console.log(`🌊 [COAST COUNT] ${data.coast.length}`)
    } else {
        console.warn(`⚠️ [NO COAST FIELD]`)
    }

    // 🔍 sample geometry (first feature)
    if (data.coast && data.coast.length > 0) {
        const sample = data.coast[0]
        console.log(`🔹 [COAST SAMPLE] points=${sample.points?.length} bbox=`,
            sample.minLat, sample.maxLat, sample.minLon, sample.maxLon
        )
    }

    if (data.land && data.land.length > 0) {
        const sample = data.land[0]
        console.log(`🔹 [LAND SAMPLE] points=${sample.points?.length} bbox=`,
            sample.minLat, sample.maxLat, sample.minLon, sample.maxLon
        )
    }

    // 🔥 INSERT FIRST
    shorelineCache[tileKey] = data
    console.log(`💾 [CACHE STORE] tileKey=${tileKey}`)

    // 🔥 THEN enforce limit
    const keys = Object.keys(shorelineCache)
    if (keys.length > MAX_SHORELINE_CACHE) {
        const removed = keys[0]
        delete shorelineCache[removed]
        console.log(`🧹 [CACHE EVICT] removed=${removed}`)
    }

    console.log(`✅ [DONE] tileKey=${tileKey}`)
    return data
}

function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {

    console.log(`📏 [DIST] Input P=(${lat},${lon}) A=(${lat1},${lon1}) B=(${lat2},${lon2})`)

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
        console.log(`📏 [POINT DIST] ${dist.toFixed(2)} m`)
        return dist
    }

    let tRaw = (x * x2 + y * y2) / denom
    let t = Math.max(0, Math.min(1, tRaw))

    if (tRaw !== t) {
        console.log(`🔧 [CLAMP] tRaw=${tRaw.toFixed(3)} → t=${t.toFixed(3)}`)
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

    console.log(`📏 [DIST RESULT] ${dist.toFixed(2)} m`)
    return dist
}

function checkShoreline(lat, lon) {

    console.log(`🌍 [CHECK] lat=${lat}, lon=${lon}`)

    const baseLat = Math.floor(lat)
    const baseLon = Math.floor(lon)

    console.log(`🧭 [BASE TILE] ${baseLat}_${baseLon}`)

    let tilesChecked = 0
    let landChecks = 0
    let coastChecks = 0
    let segmentsTested = 0

    // 🔁 check 3x3 tiles
    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {

            const key = (baseLat + dLat) + "_" + (baseLon + dLon)
            console.log(`📦 [TILE] Checking ${key}`)

            const tile = loadShorelineTile(key)
            tilesChecked++

            if (!tile) {
                console.log(`⛔ [TILE EMPTY] ${key}`)
                continue
            }

            if (!tile.land || !tile.coast) {
                console.warn(`⚠️ [BAD TILE FORMAT] ${key}`, Object.keys(tile))
                continue
            }

            console.log(`📊 [TILE DATA] land=${tile.land.length}, coast=${tile.coast.length}`)

            // ===== 1️⃣ LAND POLYGONS =====
            for (const poly of tile.land) {
                landChecks++

                if (
                    lat < poly.minLat || lat > poly.maxLat ||
                    lon < poly.minLon || lon > poly.maxLon
                ) {
                    continue
                }

                console.log(`🏝️ [LAND BBOX HIT]`)

                if (!poly.poly) {
                    console.warn(`⚠️ [BAD POLY FORMAT] missing poly field`)
                    continue
                }

                if (pointInPolygon(lat, lon, poly.poly)) {
                    console.log(`✅ [LAND HIT]`)
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

                console.log(`🌊 [COAST BBOX HIT]`)

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

                    console.log(`🔍 [SEGMENT TEST] (${lat1},${lon1}) → (${lat2},${lon2})`)

                    const d = pointToSegmentDistance(
                        lat, lon,
                        lat1, lon1,
                        lat2, lon2
                    )

                    if (d <= 6) {
                        console.log(`✅ [COAST HIT] distance=${d.toFixed(2)}m`)
                        return 1
                    }
                }
            }
        }
    }

    console.log(`❌ [NO HIT] tiles=${tilesChecked}, landChecks=${landChecks}, coastChecks=${coastChecks}, segments=${segmentsTested}`)
    return 0
}
////////////////////////////////////
// ===== NOAA SERVER ENDS ====
/////////////////////////////////
// ✅ Correct way to initialize OpenAI
app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
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

  const file = `/home/georged/NOAAserver/ENC_ROOT/soundg_tiles/${key}.json`

  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8"))

    soundingCache[key] = data
    console.log(`📦 Soundings loaded: ${key}, count=${data.length}`)

    return data
  } catch (err) {
    console.log(`❌ No sounding tile: ${key}`)
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

  const file = `/home/georged/NOAAserver/ENC_ROOT/depcnt_tiles/${key}.json`

  try {
    const raw = fs.readFileSync(file, "utf-8")

    const data = raw
      .trim()
      .split("\n")
      .map(line => JSON.parse(line))

    contourCache[key] = data

    console.log(`📦 Contours loaded: ${key}, count=${data.length}`)

    return data

  } catch (err) {
    console.log(`❌ No contour tile: ${key}`)
    contourCache[key] = []
    return []
  }
}
//////////////////////////////////////////////////
app.get("/depth", depthLimiter, (req, res) => {

  queue.push(async () => {

    try {
      const lat = parseFloat(req.query.lat)
      const lon = parseFloat(req.query.lon)

      if (isNaN(lat) || isNaN(lon)) {
        res.status(400).json({ error: "Invalid lat/lon" })
        return
      }

      let depth = 1000

      // ✅ 1. ENC (your main algorithm)
      depth = getDepthAtPoint(
        { lat, lon },
        getSoundings(lat, lon),   // your function
        getContours(lat, lon),    // your function
        null                      // BlueTopo handled outside
      )

      // ✅ 2. BlueTopo fallback
      if (depth === 1000) {
        const bt = await getDepthFromBlueTopo(lat, lon)

        if (bt != null) {
          depth = Math.abs(bt)   // normalize if needed
        }
      }

      // (DEPARE later if you want)

      const obstacle = checkObstacle(lat, lon)
      const shoreline = checkShoreline(lat, lon)

      res.json({ depth, obstacle, shoreline })

    } catch (err) {
      console.error(err)
      res.status(500).json({ error: "Server error" })
    }
  })

  processQueue()
})

// ✅ Email sending route
app.post("/send-email", async (req, res) => {
    const { name, email, message } = req.body;

    console.log("Received email request:", { name, email, message });
let transporter = nodemailer.createTransport({
    host: "localhost",
    port: 25,
    secure: false,
    ignoreTLS: true   // ✅ THIS FIXES IT
});

console.log("🔥 CONTACT ROUTE VERSION: PORT 25");
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
        console.log("Emails sent successfully");
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
