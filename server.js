const express = require("express");
const path = require("path");
const cors = require("cors");
const nodemailer = require("nodemailer");
const OpenAI = require("openai"); // ✅ Use OpenAI directly
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

console.log("Loading ENC index...")

setInterval(() => {
    const m = process.memoryUsage()
    console.log(`MEM → ${(m.heapUsed/1024/1024).toFixed(0)} MB`)
}, 3000)

//  ===== load index =====
const soundgIndex = JSON.parse(
    fs.readFileSync(`${ENC_ROOT}/enc_soundg_index_clean.json`, 'utf-8')
)

console.log("ENC index loaded")
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

require("dotenv").config();

const rateLimit = require('express-rate-limit')
//  const app = express();
app.set('trust proxy', 1);

const depthLimiter = rateLimit({
    windowMs: 1000,
    max: 5
})

app.use(cors());
app.use(express.json());
//  ===== QUEUE  ======
function processQueue() {
    if (activeRequests >= MAX_CONCURRENT) return
    if (queue.length === 0) return

    const next = queue.shift()
    activeRequests++
console.log(`***QUEUE*** → active=${activeRequests} waiting=${queue.length}`)

    next().finally(() => {
        activeRequests--
 console.log(`****QUEUE DONE**** → active=${activeRequests} waiting=${queue.length}`)

        processQueue()
    })
}


//  ======blue top funcdtions ===

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

    const baseLat = Math.floor(lat)
    const baseLon = Math.floor(lon)

    let minDepth = 1000

    // 🔁 check 3x3 neighboring tiles
    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {

            const tileKey = (baseLat + dLat) + "_" + (baseLon + dLon)

            const polygons = loadDepareTile(tileKey)
            if (!polygons) continue

            for (const poly of polygons) {

                if (!poly.poly || poly.min == null) continue

                // ⚡ FAST bounding box reject
                if (
                    lat < poly.minLat || lat > poly.maxLat ||
                    lon < poly.minLon || lon > poly.maxLon
                ) continue

                // 🔍 precise polygon check
                if (pointInPolygon(lat, lon, poly.poly)) {

                    // ✅ DRVAL1 only (poly.min)
                    if (poly.min < minDepth) {
                        minDepth = poly.min
                    }
                }
            }
        }
    }
    if (minDepth < 0) return 0

    return minDepth
}
function pointInPolygon(lat, lon, polygon) {

    let inside = false

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {

        const xi = polygon[i][0] // lon
        const yi = polygon[i][1] // lat

        const xj = polygon[j][0]
        const yj = polygon[j][1]

        const intersect =
            ((yi > lat) !== (yj > lat)) &&
            (lon < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi)

        if (intersect) inside = !inside
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

    // ✅ cache hit (including null)
    if (tileKey in objectCache) {
        return objectCache[tileKey]
    }

    const file = `${ENC_ROOT}/object_tiles/${tileKey}.json`

    // 🔥 cache negative result
    if (!fs.existsSync(file)) {
        objectCache[tileKey] = null
        return null
    }

    let data
    try {
        data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch (err) {
        console.error("Bad OBJECT tile:", file)
        objectCache[tileKey] = null
        return null
    }

    // 🔥 INSERT FIRST
    objectCache[tileKey] = data

    // 🔥 THEN enforce limit
    const keys = Object.keys(objectCache)
    if (keys.length > MAX_OBJECT_CACHE) {
        delete objectCache[keys[0]]   // remove oldest
    }

    return data
}


function checkObstacle(lat, lon) {

  const baseLat = Math.floor(lat)
  const baseLon = Math.floor(lon)

  let closest = null
  let minDist = Infinity

  // check 3x3 tiles (same pattern as DEPARE)
  for (let dLat = -1; dLat <= 1; dLat++) {
    for (let dLon = -1; dLon <= 1; dLon++) {

      const key = (baseLat + dLat) + "_" + (baseLon + dLon)
      const objects = loadObjectTile(key)
      if (!objects) continue

      for (const obj of objects) {

        const d = distMeters(lat, lon, obj.lat, obj.lon)

        // 👉 ONLY consider within 7 meters
        if (d <= 7 && d < minDist) {
          minDist = d
          closest = obj
        }
      }
    }
  }

  if (!closest) return null

  return {
    type: closest.type,
    distance: minDist,
    lat: closest.lat,
    lon: closest.lon,
    colour: closest.colour,
    shape: closest.shape,
    name: closest.name || null,
    depth: closest.depth || null
  }
}




// ===== ENC FUNCTIONS =====

function distMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLon = (lon2 - lon1) * Math.PI / 180

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2

    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function getDepthFromENC(lat, lon) {

    console.log(`🔍 ENC lookup start → lat=${lat}, lon=${lon}`)

    const step = 0.00001   // ~1.1 m
    const maxRadius = 20   // ~20 m search max
    const targetPoints = 6 // how many points we want

    const candidates = []

    for (let r = 0; r <= maxRadius; r++) {

        for (let dLat = -r; dLat <= r; dLat++) {
            for (let dLon = -r; dLon <= r; dLon++) {

                // only scan ring edge (fast)
                if (Math.abs(dLat) !== r && Math.abs(dLon) !== r) continue

                const k =
                    (Math.round(lat * 100000) + dLat) + "_" +
                    (Math.round(lon * 100000) + dLon)

                const bucket = soundgIndex[k]
                if (!bucket) continue

                console.log(`📦 Bucket hit at radius=${r}, key=${k}, points=${bucket.length}`)

                for (const p of bucket) {

                    const d = distMeters(lat, lon, p.lat, p.lon)

                    // ignore far points
                    if (d > 100) continue

                    candidates.push({
                        depth: p.depth,
                        dist: d
                    })
                }
            }
        }

        // stop early when enough points collected
        if (candidates.length >= targetPoints) {
            console.log(`🟢 Early stop at radius=${r}, candidates=${candidates.length}`)
            break
        }
    }

    console.log(`📊 Total candidates found: ${candidates.length}`)

    // sort by distance
    candidates.sort((a, b) => a.dist - b.dist)

    if (candidates.length > 0) {
        console.log(`📍 Closest point → depth=${candidates[0].depth}, dist=${candidates[0].dist.toFixed(2)}m`)
    }

    // no usable data
    if (candidates.length === 0 || candidates[0].dist > 100) {
        console.log("❌ ENC: no usable data (no candidates or too far)")
        return 1000
    }

    // take best N points
    const used = candidates.slice(0, targetPoints)

    console.log(`🧮 Using top ${used.length} points for interpolation`)

    // weighted interpolation
    let num = 0
    let den = 0

    for (const c of used) {
        const w = 1 / (c.dist + 0.5)   // smooth weighting
        num += c.depth * w
        den += w

        console.log(`   • depth=${c.depth}, dist=${c.dist.toFixed(2)}, weight=${w.toFixed(4)}`)
    }

    if (den === 0) {
        console.log("❌ ENC: denominator is zero")
        return 1000
    }

    const depth = num / den

    console.log(`📏 Interpolated ENC depth = ${depth.toFixed(2)}`)

    // land / invalid protection
    if (depth <= 0) {
        console.log("⚠️ ENC indicates land or invalid (depth <= 0)")
        return 0
    }

    console.log(`✅ ENC final depth = ${depth.toFixed(2)}`)

    return depth
}

// ===== SHORELINE ====
let shorelineCache = {}
const MAX_SHORELINE_CACHE = 50

function loadShorelineTile(tileKey) {

    // ✅ cache hit (including null)
    if (tileKey in shorelineCache) {
        return shorelineCache[tileKey]
    }

    const file = `${ENC_ROOT}/shoreline_tiles/${tileKey}.json`

    // 🔥 cache negative result
    if (!fs.existsSync(file)) {
        shorelineCache[tileKey] = null
        return null
    }

    let data
    try {
        data = JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch (err) {
        console.error("Bad shoreline tile:", file)
        shorelineCache[tileKey] = null
        return null
    }

    // 🔥 INSERT FIRST
    shorelineCache[tileKey] = data

    // 🔥 THEN enforce limit (single check)
    const keys = Object.keys(shorelineCache)
    if (keys.length > MAX_SHORELINE_CACHE) {
        delete shorelineCache[keys[0]]   // remove oldest
    }

    return data
}

function pointToSegmentDistance(lat, lon, lat1, lon1, lat2, lon2) {

    const R = 6371000

    // convert to radians
    const φ = lat * Math.PI/180
    const λ = lon * Math.PI/180

    const φ1 = lat1 * Math.PI/180
    const λ1 = lon1 * Math.PI/180

    const φ2 = lat2 * Math.PI/180
    const λ2 = lon2 * Math.PI/180

    // project to local flat space (small distance approximation)
    const x = (λ - λ1) * Math.cos((φ + φ1)/2)
    const y = (φ - φ1)

    const x2 = (λ2 - λ1) * Math.cos((φ2 + φ1)/2)
    const y2 = (φ2 - φ1)

    const t = Math.max(0, Math.min(1, (x*x2 + y*y2) / (x2*x2 + y2*y2 + 1e-12)))

    const projX = t * x2
    const projY = t * y2

    const dx = x - projX
    const dy = y - projY

    return Math.sqrt(dx*dx + dy*dy) * R
}

function checkShoreline(lat, lon) {

    const baseLat = Math.floor(lat)
    const baseLon = Math.floor(lon)

    // 🔁 check 3x3 tiles (same pattern as DEPARE)
    for (let dLat = -1; dLat <= 1; dLat++) {
        for (let dLon = -1; dLon <= 1; dLon++) {

            const key = (baseLat + dLat) + "_" + (baseLon + dLon)

            const tile = loadShorelineTile(key)
            if (!tile) continue

            // ===== 1️⃣ LAND POLYGONS =====
            for (const poly of tile.land) {

                if (
                    lat < poly.minLat || lat > poly.maxLat ||
                    lon < poly.minLon || lon > poly.maxLon
                ) continue

                if (pointInPolygon(lat, lon, poly.poly)) {
                    return 1
                }
            }

            // ===== 2️⃣ COASTLINE DISTANCE =====
            for (const coast of tile.coast) {

                // 🔹 coarse bbox reject (feature level)
                if (
                    lat < coast.minLat || lat > coast.maxLat ||
                    lon < coast.minLon || lon > coast.maxLon
                   ) continue

                const pts = coast.points

                for (let i = 0; i < pts.length - 1; i++) {

                    const [lon1, lat1] = pts[i]
                    const [lon2, lat2] = pts[i + 1]

                    // 🔥 NEW: segment-level fast reject (~90% skip)
                    if (
                        lat < Math.min(lat1, lat2) - 0.0001 ||
                        lat > Math.max(lat1, lat2) + 0.0001 ||
                        lon < Math.min(lon1, lon2) - 0.0001 ||
                        lon > Math.max(lon1, lon2) + 0.0001
                       ) continue

                    // 🔹 precise distance check (only for nearby segments)
                    const d = pointToSegmentDistance(
                        lat, lon,
                        lat1, lon1,
                        lat2, lon2
                    )

                    if (d <= 6) {
                        return 1
                    }
                }
            }
        }
    }

    return 0
}

// ===== NOAA SERVER ENDS ====
// ✅ Correct way to initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
// API endpoint for ChatGPT responses
app.post("/api/chat", async (req, res) => {
    try {
        const { message } = req.body;

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [{ role: "user", content: message }],
        });

        res.json({ reply: response.choices[0].message.content });
    } catch (error) {
        console.error("ChatGPT API Error:", error);
        res.status(500).json({ error: "Failed to get a response from ChatGPT" });
    }
});

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

// ✅ API route (MUST be BEFORE serving React)
app.get("/api", (req, res) => {
    res.json({ message: "Hello from Express API!" });
});

app.get("/depth", depthLimiter, (req, res) => {

    queue.push(async () => {   // ✅ THIS must be async

        try {
            const lat = parseFloat(req.query.lat)
            const lon = parseFloat(req.query.lon)

            if (isNaN(lat) || isNaN(lon)) {
                res.status(400).json({ error: "Invalid lat/lon" })
                return
            }

            let depth = 1000

            // ✅ await is OK here
            depth = await getDepthFromBlueTopo(lat, lon)

            if (depth < 0) depth = Math.abs(depth)

            if (depth === 1000) {
                depth = getDepthFromENC(lat, lon)
            }

            if (depth === 1000) {
                depth = getDepthFromDEPARE(lat, lon)
            }

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
