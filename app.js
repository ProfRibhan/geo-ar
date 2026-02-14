const hudStatus = document.getElementById("status");
const hudNav = document.getElementById("nav");
const btnCompass = document.getElementById("btnCompass");
const targetSelect = document.getElementById("targetSelect");
const layer = document.getElementById("layer");

// ====== SETTING ======
const ALTITUDE_OFFSET = 1.5; // meter: objek "melayang"
const SCALE = 4;             // ukuran marker
// =====================

let features = [];           // [{lat, lon, label}]
let selectedIndex = -1;      // -1 = auto (terdekat)
let userPos = null;          // {lat, lon}
let headingDeg = null;       // 0..360

function setStatus(msg){ hudStatus.textContent = msg; }

// ---------- Geo utils ----------
function toRad(d){ return d * Math.PI / 180; }
function toDeg(r){ return r * 180 / Math.PI; }

function haversine(lat1, lon1, lat2, lon2){
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function bearing(lat1, lon1, lat2, lon2){
  const φ1 = toRad(lat1), φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function normAngle(a){
  // -180..+180
  let x = ((a + 180) % 360) - 180;
  if (x < -180) x += 360;
  return x;
}

function centroidOfPolygon(coords){
  // coords: ring luar [[lon,lat],...]
  let x = 0, y = 0, n = coords.length;
  for (const p of coords){ x += p[0]; y += p[1]; }
  return [x/n, y/n];
}

// ---------- AR marker ----------
function addMarker(lat, lon, labelText=""){
  const el = document.createElement("a-cylinder");
  el.setAttribute("gps-entity-place", `latitude: ${lat}; longitude: ${lon};`);
  el.setAttribute("radius", "0.6");
  el.setAttribute("height", "2.5");
  el.setAttribute("material", "color: lime; opacity: 0.75;");
  el.setAttribute("position", `0 ${ALTITUDE_OFFSET} 0`);
  el.setAttribute("scale", `${SCALE} ${SCALE} ${SCALE}`);

  if (labelText){
    const text = document.createElement("a-text");
    text.setAttribute("value", labelText);
    text.setAttribute("align", "center");
    text.setAttribute("position", "0 1.8 0");
    text.setAttribute("scale", "8 8 8");
    text.setAttribute("color", "white");
    el.appendChild(text);
  }

  layer.appendChild(el);
}

// ---------- Dropdown ----------
function populateDropdown(){
  targetSelect.innerHTML = `<option value="">(Auto: terdekat)</option>`;
  features.forEach((f, i) => {
    const opt = document.createElement("option");
    const name = f.label && f.label.trim() ? f.label : `Target ${i+1}`;
    opt.value = String(i);
    opt.textContent = name;
    targetSelect.appendChild(opt);
  });
}

targetSelect.addEventListener("change", () => {
  const v = targetSelect.value;
  selectedIndex = (v === "" ? -1 : parseInt(v, 10));
  updateNav();
});

// ---------- Target picking ----------
function pickNearestTarget(){
  if (!userPos || features.length === 0) return null;

  let best = null;
  let bestD = Infinity;

  for (const f of features){
    const d = haversine(userPos.lat, userPos.lon, f.lat, f.lon);
    if (d < bestD){
      bestD = d;
      best = {...f, distance: d};
    }
  }
  return best;
}

function pickTarget(){
  if (selectedIndex >= 0 && selectedIndex < features.length){
    const f = features[selectedIndex];
    const d = userPos ? haversine(userPos.lat, userPos.lon, f.lat, f.lon) : null;
    return {...f, distance: d};
  }
  return pickNearestTarget();
}

// ---------- Navigation HUD ----------
function updateNav(){
  if (!userPos){
    hudNav.textContent = "Menunggu GPS…";
    return;
  }

  const target = pickTarget();
  if (!target){
    hudNav.textContent = "Tidak ada target.";
    return;
  }

  const brg = bearing(userPos.lat, userPos.lon, target.lat, target.lon);
  const dist = target.distance;
  const distText = (dist === null || dist === undefined) ? "-" : dist.toFixed(1);

  if (headingDeg === null){
    hudNav.textContent =
      `Target: ${target.label || "?"}\n` +
      `Jarak: ${distText} m\n` +
      `Arah(target): ${brg.toFixed(0)}°\n` +
      `Kompas belum aktif (klik "Aktifkan Kompas")`;
    return;
  }

  const turn = normAngle(brg - headingDeg); // (-) kiri, (+) kanan
  const arrow = turn > 10 ? "➡️" : turn < -10 ? "⬅️" : "⬆️";

  const turnText =
    Math.abs(turn) <= 10 ? "Lurus" :
    (turn > 0 ? `Kanan ${Math.abs(turn).toFixed(0)}°` : `Kiri ${Math.abs(turn).toFixed(0)}°`);

  hudNav.textContent =
    `Target: ${target.label || "?"}\n` +
    `Jarak: ${distText} m\n` +
    `Arah: ${arrow} (${turnText})\n` +
    `Heading: ${headingDeg.toFixed(0)}° | Bearing: ${brg.toFixed(0)}°`;
}

// ---------- GPS ----------
function startGPS(){
  if (!navigator.geolocation){
    setStatus("Geolocation tidak didukung.");
    return;
  }

  navigator.geolocation.watchPosition(
    (pos) => {
      userPos = {lat: pos.coords.latitude, lon: pos.coords.longitude};
      setStatus("OK. GPS aktif. Aktifkan Kompas jika perlu.");
      updateNav();
    },
    (err) => setStatus("GPS error: " + err.message),
    { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
  );
}

// ---------- Compass / Heading ----------
async function requestCompass(){
  try{
    // iOS Safari butuh permission via klik
    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function"){
      const res = await DeviceOrientationEvent.requestPermission();
      if (res !== "granted"){
        setStatus("Izin kompas ditolak.");
        return;
      }
    }

    window.addEventListener("deviceorientationabsolute", onOrient, true);
    window.addEventListener("deviceorientation", onOrient, true);
    setStatus("Kompas aktif.");
  } catch (e){
    setStatus("Kompas error: " + e.message);
  }
}

function onOrient(e){
  // iOS: webkitCompassHeading (0=utara)
  // Android: alpha (kadang perlu dibalik)
  let hdg = null;

  if (typeof e.webkitCompassHeading === "number"){
    hdg = e.webkitCompassHeading;
  } else if (typeof e.alpha === "number"){
    hdg = (360 - e.alpha) % 360;
  }

  if (hdg !== null){
    headingDeg = hdg;
    updateNav();
  }
}

btnCompass.addEventListener("click", requestCompass);

// ---------- Load GeoJSON + create markers ----------
async function main(){
  try{
    setStatus("Mengambil GeoJSON…");
    const res = await fetch("data_ar.geojson");
    if (!res.ok) throw new Error("Gagal fetch data_ar.geojson");
    const geo = await res.json();

    features = [];
    let count = 0;

    for (const f of geo.features || []){
      const geom = f.geometry;
      if (!geom) continue;

      const props = f.properties || {};
      const label = String(props.nib || props.id || props.nama || props.name || "");

      let lat = null, lon = null;

      if (geom.type === "Point"){
        [lon, lat] = geom.coordinates;
      } else if (geom.type === "Polygon"){
        const ring = geom.coordinates?.[0];
        if (!ring || ring.length < 3) continue;
        const c = centroidOfPolygon(ring);
        lon = c[0]; lat = c[1];
      } else if (geom.type === "MultiPolygon"){
        const ring = geom.coordinates?.[0]?.[0];
        if (!ring || ring.length < 3) continue;
        const c = centroidOfPolygon(ring);
        lon = c[0]; lat = c[1];
      } else {
        continue;
      }

      // simpan target + buat marker AR
      features.push({lat, lon, label});
      addMarker(lat, lon, label);
      count++;
    }

    setStatus(`OK. Marker dibuat: ${count}. Sekarang izinkan Camera + Location.`);
    populateDropdown();
    startGPS();
    updateNav();

  } catch (e){
    setStatus("Error: " + e.message);
    console.error(e);
  }
}

main();
