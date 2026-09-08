# Travel Animation

[Русская версия](README.ru.md) · **Live demo: https://topmonroe9.github.io/travel-animation/**

Animate a road trip on a **real map** along a **real road route** and export it to MP4.
A free, self-hosted alternative to travelboast / mult.dev: no API keys, no subscriptions, no backend.
One static page that runs in Chrome.

![Preview](docs/preview.png)

## Run locally

```bash
git clone https://github.com/topmonroe9/travel-animation.git
cd travel-animation
npm start            # python3 serve.py 8765 — static files with caching disabled
open http://127.0.0.1:8765
```

Use `127.0.0.1` rather than `localhost` (Chrome tries IPv6 first, the dev server listens on IPv4).
Chrome / Edge / Arc are required: export relies on WebCodecs. Internet access is needed for map tiles,
geocoding and routing; libraries are loaded from CDNs and cached by the browser.

The interface follows the browser language (Russian or English) and can be switched in the top-left corner.

## Usage

1. **Waypoints** — one per line. The first and last are start and finish; the rest are stops the route
   passes through:
   ```
   Munich
   Innsbruck #fuel
   Verona #sleep ~3
   Cabin @ 46.49, 11.33 #rest
   Venice
   ```
   - `#type` — stop marker: `fuel`, `rest`, `food`, `sleep`, `photo`, `place` (Russian keywords work too).
   - `~seconds` — how long the car waits at this stop (otherwise the global "Pause at stops" applies).
   - `@ lat, lng` — exact coordinates instead of geocoding (the order Google/Yandex Maps use).
2. **Build route** — Nominatim geocodes the points, OSRM routes along roads. The result is cached in
   localStorage. A sample route (Munich → Innsbruck → Venice, `routes/sample.json`) ships with the app
   and loads without the network.
3. **Captions, timing, camera, map** — every control updates the preview instantly. Space or a click on
   the frame plays the animation.
4. **Export MP4** — frame-by-frame rendering inside this tab; the file lands in Downloads.
   Keep the tab visible: browsers stop rendering background tabs.

In the frame: title and subtitle, a running kilometre counter, a progress bar with stop ticks, a dashed
line for the road ahead, the travelled path with a glow, stop flags (a pole on the point with a label
showing the emoji and the name) that pop up next to the car as it arrives, the car itself as a flat
top-down SVG icon, a low-poly 3D model rendered with three.js (hatchback with roof rails and a roof box)
or your own PNG, hillshade and 3D terrain with adjustable exaggeration, and a sky at the horizon when
the camera is pitched.

## Architecture

```
Waypoints (text) ──▶ Nominatim (geocoding) ──▶ OSRM demo (road route, GeoJSON)
                                                        │
                                                        ▼
                                  Polyline: cumulative km, point/bearing at d, slice 0…d
                                                        │
 Timeline t ──▶ intro → drive (trapezoid speed profile + holds at stops) → outro
                                                        │
                                                        ▼
                     Camera: centre shifted ahead, zoom, smoothed bearing, pitch
                                                        │
                                                        ▼
        MapLibre GL ── OpenFreeMap (vector tiles, localized labels) + AWS Terrain (DEM)
        layers: hillshade / terrain / sky · route ahead · travelled (glow+casing+line)
               · stop flags · car (SVG symbol | three.js custom layer)
                                                        │
                                   HUD (canvas 2D): captions, km, progress, attribution
                                                        │
   export: for t in frames → jumpTo/setData → wait for idle → composite(map+hud) → VideoFrame
           → VideoEncoder (H.264, WebCodecs) → mp4-muxer → Blob → download .mp4
```

The key principle is **determinism**: the whole frame state is a function of time `t`. Preview and export
call the same `render(t)`, so the video matches what you see on screen, and tiles and glyphs are always
loaded because the exporter waits for the map's `idle` event before grabbing a frame.

| Module | Responsibility |
| --- | --- |
| `src/geo.js` | haversine, bearing, destination, Mercator, `Polyline` with binary search by distance, camera bearing smoothing |
| `src/route.js` | waypoint parser, Nominatim, OSRM, cache, stop types |
| `src/timeline.js` | phases, speed profile, holds, camera for a given state |
| `src/scene.js` | MapLibre: style, label language, terrain, route/stop/car layers, waiting for `idle` |
| `src/car3d.js` | three.js custom layer; the hatchback is built from extruded side profiles (`buildCar`), roof box and rails included |
| `src/hud.js` | 2D canvas overlay |
| `src/exporter.js` | WebCodecs + mp4-muxer |
| `src/i18n.js` | Russian / English dictionaries and DOM translation |
| `src/app.js` | UI, state, preview loop, export |

## Why this stack

| Option | Verdict |
| --- | --- |
| **MapLibre + WebCodecs in the browser** (chosen) | zero dependencies and servers, deterministic frame-by-frame rendering, hardware H.264 |
| Puppeteer + ffmpeg | more robust for 4K and very long clips, but needs a Node script and headless Chrome. The page is ready for it: `window.__app.setTime(t)` plus `scene.idle()` produce a frame, screenshot it into `ffmpeg -f image2pipe` |
| MediaRecorder / screen capture | real time, drops frames, depends on machine speed |
| Remotion | React video framework, nice but an extra layer and a company licence |
| Python (cartopy / folium + matplotlib) | static tiles, no smooth camera or terrain |
| Mapbox GL | prettier sky and terrain, but tokens and billing; MapLibre is the free fork |

## Free services and their limits

- **OpenFreeMap** — OpenStreetMap vector tiles, no key, styles liberty / bright / positron / fiord / dark.
- **OSRM demo** (`router.project-osrm.org`) — road routing without a key but without guarantees.
  If it goes down, self-host in ~20 minutes with a Geofabrik extract of your region:
  ```bash
  wget https://download.geofabrik.de/europe/austria-latest.osm.pbf
  docker run -t -v $PWD:/data ghcr.io/project-osrm/osrm-backend osrm-extract -p /opt/car.lua /data/austria-latest.osm.pbf
  docker run -t -v $PWD:/data ghcr.io/project-osrm/osrm-backend osrm-partition /data/austria-latest.osrm
  docker run -t -v $PWD:/data ghcr.io/project-osrm/osrm-backend osrm-customize /data/austria-latest.osrm
  docker run -t -i -p 5000:5000 -v $PWD:/data ghcr.io/project-osrm/osrm-backend osrm-routed --algorithm mld /data/austria-latest.osrm
  ```
  then point the `OSRM` constant in `src/route.js` at `http://127.0.0.1:5000/route/v1/driving/`.
- **Nominatim** — geocoding, at most 1 request per second; responses are cached in localStorage.
- **AWS Terrain Tiles** (Mapzen terrarium) — open elevation data for hillshade and 3D terrain.
- **Google Fonts** (Inter, JetBrains Mono) — captions; falls back to system fonts offline.
- Map data © OpenStreetMap contributors (ODbL): the attribution is drawn into the frame, keep it.

## Export performance

Every frame waits for all tiles to load, so speed depends on network and GPU. On a laptop with a GPU a
1080p frame takes 50–150 ms; a 36-second clip at 30 fps takes 2–4 minutes. 4K at 60 fps is proportionally
slower and deserves a 40–60 Mbit/s bitrate. The file is assembled in memory: export very long 4K clips in parts.

## Ideas

- Photos at stops (cards in the HUD), multi-day trips with dates.
- Manual camera keyframes (linger on a mountain pass).
- Flight / train segments drawn as arcs instead of roads.
- Load a glTF car with `GLTFLoader` instead of the procedural one (replace `buildCar` in `src/car3d.js`).
- Puppeteer renderer for 4K.

## License

MIT. Map data © OpenStreetMap contributors, ODbL.
