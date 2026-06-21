🌊 NOAA Server – How to Use It
(Contact developer at info@y219.com to get access)

NOAA server is a marine safety API that provides:

Depth at a location
Obstacle detection
Shoreline proximity

👉 Designed for real-time navigation (your Android app)

🔗 1. API Endpoint
Base endpoint
GET /depth?lat=<latitude>&lon=<longitude>
Example
https://y219.com/depth?lat=38.845&lon=-77.045
📦 2. Response Format

The server returns JSON:

{
  "depth": 12.5,
  "obstacle": {
    "type": "rock",
    "lat": 38.8451,
    "lon": -77.0452,
    "distance": 4.2
  },
  "shoreline": 0
}
📊 3. Field Meaning
🔵 depth
Depth in meters or feet (depending on your app conversion)
Special values:
0 → LAND
1000 → no data
⚠️ obstacle
Closest hazard within ~5–7 meters
May include:
rock
wreck
buoy
beacon
structure

If none:

"obstacle": null
🟫 shoreline
1 → near land (within ~5 meters)
0 → safe water
🧠 4. How Depth Is Calculated

The server uses a multi-layer fallback system:

🥇 Priority 1 — BlueTopo (raster)
High-resolution NOAA bathymetry
GeoTIFF-based
Most accurate
🥈 Priority 2 — ENC SOUNDG + DEPCNT
SOUNDG → measured depth points
DEPCNT → contour lines

👉 Logic:

Use nearest sounding ONLY if line-of-sight is not blocked by contour

🥉 Priority 3 — DEPARE polygons
Safe depth areas
Uses DRVAL1 (minimum safe depth)
🚫 Fallback
depth = 1000

👉 Means: no reliable data

🧭 5. Shoreline Detection

Uses:

LNDARE (land polygons)
COALNE (coastline lines)
Rule:
shoreline = 1 if:
- inside land polygon OR
- within 5 meters of coastline
⚠️ 6. Obstacle Detection

From ENC layers:

UWTROC (rocks)
WRECKS
OBSTRN
BOYLAT / BOYSPP (buoys)
BCNLAT / BCNSPP (beacons)
LIGHTS
PILPNT, MORFAC, etc.
Behavior:
Finds nearest object ahead
Returns if within safety radius (~5–7 m)
🗺️ 7. Tile System

Your server uses:

tile key = floor(lat * 100) + "_" + floor(lon * 100)

👉 ~0.01° tiles

Stored data:
soundg_tiles/
depcnt_tiles/
depare_tiles/
object_tiles/
shoreline_tiles/
⚡ 8. Performance Model
Single request queue:
MAX_CONCURRENT = 1
Caching:
shoreline cache
object cache
depare cache
📱 9. How Your Android App Uses It

From your app:

DepthUtils.getDepth(lat, lon)
UI rules:
Value	Display
0	LAND
1000	--
valid	depth
🚨 10. Intended Use (Critical)

This server is optimized for:

✔ Forward projection
boat heading
shallow water ahead detection
✔ Collision avoidance
obstacles ahead
✔ Real-time alarms
⚠️ Not designed for
full chart rendering
large area queries
bulk data downloads
🔧 11. Example curl usage
curl "https://y219.com/depth?lat=38.845&lon=-77.045"
🧠 12. Key Design Philosophy

The system is:

FAST > PERFECT
REAL-TIME > COMPLETE
minimal disk reads
tile-based lookup
fast fallback chain
✅ Final summary

NOAA server:

✔ Combines multiple NOAA datasets
✔ Uses intelligent fallback logic
✔ Returns depth + hazards + shoreline
✔ Designed for real-time navigation safety


