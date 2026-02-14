const hud = document.getElementById("hud");
const layer = document.getElementById("layer");

// ubah ini kalau ingin objek “melayang” (meter)
const ALTITUDE_OFFSET = 1.5; // 1.5m di atas tanah
const SCALE = 4;            // ukuran marker

function setHud(msg) { hud.textContent = msg; }

function centroidOfPolygon(coords) {
  // coords: [ [lon,lat], [lon,lat], ... ] ring luar
  // centroid sederhana (cukup untuk tampilan)
  let x = 0, y = 0, n = coords.length;
  for (const p of coords) { x += p[0]; y += p[1]; }
  return [x / n, y / n];
}

function addMarker(lat, lon, labelText = "") {
  const el = document.createElement("a-cylinder");
  el.setAttribute("gps-entity-place", `latitude: ${lat}; longitude: ${lon};`);
  el.setAttribute("radius", "0.6");
  el.setAttribute("height", "2.5");
  el.setAttribute("material", "color: lime; opacity: 0.75;");
  el.setAttribute("position", `0 ${ALTITUDE_OFFSET} 0`);
  el.setAttribute("scale", `${SCALE} ${SCALE} ${SCALE}`);

  if (labelText) {
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

async function main() {
  try {
    setHud("Mengambil GeoJSON…");
    const res = await fetch("data_ar.geojson");
    if (!res.ok) throw new Error("Gagal fetch data_ar.geojson");
    const geo = await res.json();

    let count = 0;

    for (const f of geo.features) {
      const geom = f.geometry;
      if (!geom) continue;

      // label opsional dari attribute (ganti sesuai field kamu)
      const props = f.properties || {};
      const label = props.nib || props.id || "";

      if (geom.type === "Point") {
        const [lon, lat] = geom.coordinates;
        addMarker(lat, lon, String(label));
        count++;
      }

      if (geom.type === "Polygon") {
        const ring = geom.coordinates?.[0]; // ring luar
        if (!ring || ring.length < 3) continue;
        const [clon, clat] = centroidOfPolygon(ring);
        addMarker(clat, clon, String(label));
        count++;
      }

      if (geom.type === "MultiPolygon") {
        // ambil polygon pertama sebagai representasi
        const ring = geom.coordinates?.[0]?.[0];
        if (!ring || ring.length < 3) continue;
        const [clon, clat] = centroidOfPolygon(ring);
        addMarker(clat, clon, String(label));
        count++;
      }
    }

    setHud(`OK. Marker dibuat: ${count}. Sekarang izinkan Camera + Location.`);
  } catch (e) {
    setHud("Error: " + e.message);
    console.error(e);
  }
}

main();
