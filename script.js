// ============================================================================
// 1. RUMUS KONVERSI KOORDINAT: UTM ZONA 48S (METER) -> WGS84 (LAT/LON)
// ============================================================================
function utm48sToLatLon(easting, northing) {
  let E = easting;
  let N = northing;
  if (E < 10000 && N < 10000) {
    E = 535100 + E;
    N = 9407300 + N;
  }

  const a = 6378137.0;
  const f = 1 / 298.257223563;
  const e2 = 2 * f - f * f;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const ep2 = e2 / (1 - e2);
  const k0 = 0.9996;

  const x = E - 500000.0;
  const y = N - 10000000.0;

  const M = y / k0;
  const mu =
    M /
    (a *
      (1 - e2 / 4 - (3 * Math.pow(e2, 2)) / 64 - (5 * Math.pow(e2, 3)) / 256));

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * Math.pow(e1, 3)) / 32) * Math.sin(2 * mu) +
    ((21 * Math.pow(e1, 2)) / 16 - (55 * Math.pow(e1, 4)) / 32) *
      Math.sin(4 * mu) +
    ((151 * Math.pow(e1, 3)) / 96) * Math.sin(6 * mu) +
    ((1097 * Math.pow(e1, 4)) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
  const T1 = tanPhi1 * tanPhi1;
  const C1 = ep2 * cosPhi1 * cosPhi1;
  const R1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
  const D = x / (N1 * k0);

  const latRad =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (Math.pow(D, 2) / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * Math.pow(D, 4)) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) *
          Math.pow(D, 6)) /
          720);

  const lonOriginRad = (105.0 * Math.PI) / 180.0;
  const lonRad =
    lonOriginRad +
    (D -
      ((1 + 2 * T1 + C1) * Math.pow(D, 3)) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) *
        Math.pow(D, 5)) /
        120) /
      cosPhi1;

  return [latRad * (180 / Math.PI), lonRad * (180 / Math.PI)];
}

// ============================================================================
// 2. INISIALISASI PETA & BASEMAP CITRA SATELIT TERBARU
// ============================================================================
const map = L.map("cadCanvas", {
  center: [-5.360968, 105.317727],
  zoom: 18,
  maxZoom: 22,
});

map.createPane("shapesPane");
map.getPane("shapesPane").style.zIndex = 400;
map.createPane("pointsPane");
map.getPane("pointsPane").style.zIndex = 650;

const googleSat = L.tileLayer(
  "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
  {
    maxZoom: 22,
    maxNativeZoom: 20,
    attribution: "© Google Satellite",
  },
).addTo(map);

const googleHybrid = L.tileLayer(
  "https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
  {
    maxZoom: 22,
    maxNativeZoom: 20,
    attribution: "© Google Hybrid",
  },
);

const esriSat = L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  {
    maxZoom: 22,
    maxNativeZoom: 19,
    attribution: "© Esri World Imagery",
  },
);

const cadDarkBlank = L.tileLayer("", {
  maxZoom: 22,
  attribution: "Mode Gelap CAD",
});

const contoursLayer = L.layerGroup().addTo(map);
const finishedShapesLayer = L.layerGroup().addTo(map);
const tempDrawLayer = L.layerGroup().addTo(map);
const pointsLayer = L.layerGroup().addTo(map);

L.control
  .layers(
    {
      "🛰️ Citra Satelit Terbaru (Google)": googleSat,
      "🗺️ Satelit + Label (Google Hybrid)": googleHybrid,
      "🌍 Citra Esri World Imagery": esriSat,
      "⬛ Kanvas Gelap CAD (Tanpa Citra)": cadDarkBlank,
    },
    {
      "📍 Tampilkan Titik PENZD": pointsLayer,
      "📐 Tampilkan Hasil Digitasi": finishedShapesLayer,
      "〰️ Tampilkan Garis Kontur": contoursLayer,
    },
    { collapsed: false },
  )
  .addTo(map);

// State Aplikasi
let surveyPoints = [];
let currentShapePointIds = [];
let digitizedShapes = [];

// Elemen DOM
const csvFileInput = document.getElementById("csvFileInput");
const btnLoadSample = document.getElementById("btnLoadSample");
const pointCountInfo = document.getElementById("pointCountInfo");
const digitizeMode = document.getElementById("digitizeMode");
const currentPointsCount = document.getElementById("currentPointsCount");
const btnFinishShape = document.getElementById("btnFinishShape");
const btnCancelShape = document.getElementById("btnCancelShape");
const shapeList = document.getElementById("shapeList");
const btnExportCAD = document.getElementById("btnExportCAD");

if (digitizeMode && !digitizeMode.querySelector('option[value="parking"]')) {
  const opt = document.createElement("option");
  opt.value = "parking";
  opt.textContent = "Area Parkiran / Perkerasan (Poligon)";
  digitizeMode.appendChild(opt);
}
if (btnLoadSample) {
  btnLoadSample.textContent = "Muat Otomatis data_pengukuran.csv";
}

function getPointColor(desc) {
  const d = String(desc).toUpperCase();
  if (d.startsWith("RA") || d.startsWith("POLUT") || d.includes("PATOK"))
    return "#22c55e";
  if (d.startsWith("BGN") || d.includes("GDG")) return "#ef4444";
  if (d.startsWith("JLN")) return "#eab308";
  if (d.startsWith("PRK")) return "#c084fc";
  if (d.startsWith("PARIT") || d.includes("SAL")) return "#06b6d4";
  return "#38bdf8";
}

function cleanNumber(val) {
  if (typeof val === "number") return val;
  if (!val) return NaN;
  return parseFloat(String(val).replace(/,/g, "").trim());
}

// ============================================================================
// 3. PARSER CSV (Mendukung Pemisah ';' dan ',')
// ============================================================================
function parseCSVTextToPoints(csvText) {
  const lines = csvText.split(/\r?\n/);
  const parsedPoints = [];

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    const cols = trimmed.includes(";")
      ? trimmed.split(";")
      : trimmed.split(",");
    if (cols.length < 4) return;

    const eVal = cleanNumber(cols[1]);
    const nVal = cleanNumber(cols[2]);
    const zVal = cleanNumber(cols[3]);

    if (isNaN(eVal) || isNaN(nVal) || isNaN(zVal)) return;

    const [lat, lon] = utm48sToLatLon(eVal, nVal);

    parsedPoints.push({
      P: String(cols[0]).trim(),
      E: eVal,
      N: nVal,
      Z: zVal,
      D: cols[4] ? String(cols[4]).trim() : "DTL",
      lat: lat,
      lon: lon,
    });
  });

  return parsedPoints;
}

// ============================================================================
// 4. PLOT TITIK KE ATAS CITRA SATELIT
// ============================================================================
function loadPENZDData(dataArray) {
  surveyPoints = dataArray;
  pointsLayer.clearLayers();
  tempDrawLayer.clearLayers();
  finishedShapesLayer.clearLayers();
  contoursLayer.clearLayers();
  currentShapePointIds = [];
  digitizedShapes = [];
  updateUI();

  const bounds = [];

  surveyPoints.forEach((pt) => {
    const latLng = [pt.lat, pt.lon];
    bounds.push(latLng);

    const isControlOrBgn = /^(RA|POLUT|BGN)/i.test(pt.D);

    const marker = L.circleMarker(latLng, {
      pane: "pointsPane",
      radius: isControlOrBgn ? 7 : 5,
      fillColor: getPointColor(pt.D),
      color: "#ffffff",
      weight: 1.5,
      fillOpacity: 1.0,
    }).addTo(pointsLayer);

    marker.bindTooltip(
      `<b>P${pt.P}</b> [${pt.D}]<br>E: ${pt.E.toFixed(2)} | N: ${pt.N.toFixed(2)}<br>Z: ${pt.Z.toFixed(3)}m`,
      {
        permanent: isControlOrBgn,
        direction: "right",
        offset: [7, 0],
        className: "point-label",
      },
    );

    marker.on("click", (e) => {
      L.DomEvent.stopPropagation(e);
      handlePointClick(pt);
    });
  });

  if (bounds.length > 0) {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 20 });
    pointCountInfo.innerHTML =
      `✅ <b>${surveyPoints.length} titik PENZD</b> berhasil di-plot!<br>` +
      `<span style="font-size:11px;color:#cbd5e1;">🟢RA/POLUT 🔴BGN 🟡JLN 🟣PRK 🔵KNTR</span>`;
    btnExportCAD.disabled = false;
  }
}

// ============================================================================
// 5. LOGIKA DIGITASI (AUTO-WARNA DARI TITIK & ANTI-TIMPA)
// ============================================================================
function detectModeFromPointDesc(desc) {
  const d = String(desc).toUpperCase();
  if (d.startsWith("BGN") || d.includes("GDG")) return "building";
  if (d.startsWith("PRK")) return "parking";
  if (d.startsWith("JLN") || d.startsWith("PARIT") || d.includes("SAL"))
    return "polyline";
  if (
    d.startsWith("RA") ||
    d.startsWith("POLUT") ||
    d.includes("PATOK") ||
    d.includes("BATAS")
  )
    return "boundary";
  return digitizeMode.value;
}

function handlePointClick(pt) {
  if (currentShapePointIds[currentShapePointIds.length - 1] === pt.P) return;

  if (currentShapePointIds.length === 0) {
    const autoMode = detectModeFromPointDesc(pt.D);
    if (digitizeMode.querySelector(`option[value="${autoMode}"]`)) {
      digitizeMode.value = autoMode;
    }
  }

  currentShapePointIds.push(pt.P);
  redrawTempShape();
  updateUI();
}

digitizeMode.addEventListener("change", () => {
  redrawTempShape();
});

function getActiveShapeColor(pointIds, fallbackType) {
  if (pointIds && pointIds.length > 0) {
    const firstPt = surveyPoints.find((item) => item.P === pointIds[0]);
    if (firstPt) return getPointColor(firstPt.D);
  }
  if (fallbackType === "boundary") return "#22c55e";
  if (fallbackType === "building") return "#ef4444";
  if (fallbackType === "parking") return "#c084fc";
  return "#eab308";
}

function redrawTempShape() {
  tempDrawLayer.clearLayers();
  if (currentShapePointIds.length < 2) return;

  const latLngs = currentShapePointIds.map((id) => {
    const p = surveyPoints.find((item) => item.P === id);
    return [p.lat, p.lon];
  });

  const mode = digitizeMode.value;
  const color = getActiveShapeColor(currentShapePointIds, mode);

  if (mode === "boundary" || mode === "building" || mode === "parking") {
    L.polygon(latLngs, {
      pane: "shapesPane",
      interactive: false,
      color: color,
      fillColor: color,
      dashArray: "6, 6",
      weight: 2.5,
      fillOpacity: 0.25,
    }).addTo(tempDrawLayer);
  } else {
    L.polyline(latLngs, {
      pane: "shapesPane",
      interactive: false,
      color: color,
      dashArray: "6, 6",
      weight: 3,
    }).addTo(tempDrawLayer);
  }
}

btnFinishShape.addEventListener("click", () => {
  const mode = digitizeMode.value;
  const minPts = mode === "polyline" ? 2 : 3;

  if (currentShapePointIds.length < minPts) {
    alert(`Minimal butuh ${minPts} titik untuk menyimpan objek ini!`);
    return;
  }

  const shapeColor = getActiveShapeColor(currentShapePointIds, mode);
  const firstPt = surveyPoints.find(
    (item) => item.P === currentShapePointIds[0],
  );
  const prefixCode = firstPt
    ? firstPt.D.split(" ")[0].toUpperCase()
    : mode.toUpperCase();

  digitizedShapes.push({
    id: Date.now(),
    type: mode,
    color: shapeColor,
    code: prefixCode,
    points: [...currentShapePointIds],
  });

  currentShapePointIds = [];
  tempDrawLayer.clearLayers();
  redrawFinishedShapes();
  updateUI();
});

btnCancelShape.addEventListener("click", () => {
  currentShapePointIds = [];
  tempDrawLayer.clearLayers();
  updateUI();
});

function redrawFinishedShapes() {
  finishedShapesLayer.clearLayers();

  digitizedShapes.forEach((shape) => {
    const latLngs = shape.points.map((id) => {
      const p = surveyPoints.find((item) => item.P === id);
      return [p.lat, p.lon];
    });

    const color = shape.color || getActiveShapeColor(shape.points, shape.type);

    if (
      shape.type === "boundary" ||
      shape.type === "building" ||
      shape.type === "parking"
    ) {
      L.polygon(latLngs, {
        pane: "shapesPane",
        interactive: false,
        color: color,
        fillColor: color,
        weight: 2.5,
        fillOpacity: shape.type === "boundary" ? 0.12 : 0.35,
      }).addTo(finishedShapesLayer);
    } else {
      L.polyline(latLngs, {
        pane: "shapesPane",
        interactive: false,
        color: color,
        weight: 3.5,
      }).addTo(finishedShapesLayer);
    }
  });
}

function updateUI() {
  currentPointsCount.textContent = currentShapePointIds.length;
  btnFinishShape.disabled = currentShapePointIds.length < 2;
  btnCancelShape.disabled = currentShapePointIds.length === 0;

  shapeList.innerHTML = "";
  if (digitizedShapes.length === 0) {
    shapeList.innerHTML =
      '<li class="empty-msg">Belum ada objek yang disambungkan.</li>';
    return;
  }

  const labelMap = {
    boundary: "Batas Area",
    building: "Bangunan",
    parking: "Parkiran",
    polyline: "Garis/Jalan/Parit",
  };

  digitizedShapes.forEach((shape, idx) => {
    const badgeColor =
      shape.color || getActiveShapeColor(shape.points, shape.type);
    const li = document.createElement("li");
    li.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;">
        <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${badgeColor};"></span>
        <b>${labelMap[shape.type] || shape.type}</b> [${shape.code || ""}] (${shape.points.length} ttk)
      </span>
      <button class="btn-danger" style="padding:2px 6px;font-size:10px;" onclick="deleteShape(${idx})">✕</button>
    `;
    shapeList.appendChild(li);
  });
}

window.deleteShape = function (index) {
  digitizedShapes.splice(index, 1);
  redrawFinishedShapes();
  updateUI();
};

// ============================================================================
// 6. EVENT UPLOAD FILE CSV & AUTO-LOAD data_pengukuran.csv
// ============================================================================
csvFileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (evt) {
    const text = evt.target.result;
    const pts = parseCSVTextToPoints(text);
    loadPENZDData(pts);
  };
  reader.readAsText(file);
});

btnLoadSample.addEventListener("click", async () => {
  try {
    const res = await fetch("data_pengukuran.csv");
    if (!res.ok) throw new Error("File belum ada");
    const text = await res.text();
    const pts = parseCSVTextToPoints(text);
    loadPENZDData(pts);
  } catch (e) {
    csvFileInput.click();
  }
});

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("data_pengukuran.csv");
    if (res.ok) {
      const text = await res.text();
      const pts = parseCSVTextToPoints(text);
      if (pts.length > 0) loadPENZDData(pts);
    }
  } catch (e) {}
});

// ============================================================================
// 7. ENGINE KONTUR (TIN DELAUNAY + CLIPPING) & AUTO-DOWNLOAD CAD (.DXF)
// ============================================================================
function buildDelaunayTIN(pts) {
  const n = pts.length;
  if (n < 3) return [];

  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  pts.forEach((p) => {
    if (p.E < minX) minX = p.E;
    if (p.N < minY) minY = p.N;
    if (p.E > maxX) maxX = p.E;
    if (p.N > maxY) maxY = p.N;
  });

  const deltaMax = Math.max(maxX - minX, maxY - minY) || 100;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const allPts = pts.map((p) => ({ x: p.E, y: p.N, z: p.Z }));
  allPts.push(
    { x: midX - 20 * deltaMax, y: midY - deltaMax, z: 0 },
    { x: midX, y: midY + 20 * deltaMax, z: 0 },
    { x: midX + 20 * deltaMax, y: midY - deltaMax, z: 0 },
  );

  function makeTri(i, j, k) {
    const a = allPts[i],
      b = allPts[j],
      c = allPts[k];
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-12) return null;
    const ux =
      ((a.x * a.x + a.y * a.y) * (b.y - c.y) +
        (b.x * b.x + b.y * b.y) * (c.y - a.y) +
        (c.x * c.x + c.y * c.y) * (a.y - b.y)) /
      d;
    const uy =
      ((a.x * a.x + a.y * a.y) * (c.x - b.x) +
        (b.x * b.x + b.y * b.y) * (a.x - c.x) +
        (c.x * c.x + c.y * c.y) * (b.x - a.x)) /
      d;
    const r2 = (ux - a.x) ** 2 + (uy - a.y) ** 2;
    return { i, j, k, ux, uy, r2 };
  }

  let triangles = [makeTri(n, n + 1, n + 2)].filter(Boolean);

  for (let idx = 0; idx < n; idx++) {
    const px = allPts[idx].x,
      py = allPts[idx].y;
    const badTris = [];
    const goodTris = [];

    for (const t of triangles) {
      if ((px - t.ux) ** 2 + (py - t.uy) ** 2 <= t.r2) {
        badTris.push(t);
      } else {
        goodTris.push(t);
      }
    }

    const edgeCounts = new Map();
    for (const t of badTris) {
      const edges = [
        [t.i, t.j],
        [t.j, t.k],
        [t.k, t.i],
      ];
      for (const [u, v] of edges) {
        const key = u < v ? `${u}_${v}` : `${v}_${u}`;
        edgeCounts.set(key, (edgeCounts.get(key) || 0) + 1);
      }
    }

    triangles = goodTris;
    for (const [key, count] of edgeCounts.entries()) {
      if (count === 1) {
        const [u, v] = key.split("_").map(Number);
        const nt = makeTri(u, v, idx);
        if (nt) triangles.push(nt);
      }
    }
  }

  return triangles.filter((t) => t.i < n && t.j < n && t.k < n);
}

function isPointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0],
      yi = poly[i][1];
    const xj = poly[j][0],
      yj = poly[j][1];
    if (
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-15) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function clipSegmentWithPoly(seg, poly, keepInside) {
  const [x1, y1, x2, y2] = seg;
  const dx = x2 - x1,
    dy = y2 - y1;
  const ts = [0.0, 1.0];

  for (let i = 0; i < poly.length; i++) {
    const [x3, y3] = poly[i];
    const [x4, y4] = poly[(i + 1) % poly.length];
    const ex = x4 - x3,
      ey = y4 - y3;
    const denom = dx * ey - dy * ex;
    if (Math.abs(denom) > 1e-12) {
      const t = ((x3 - x1) * ey - (y3 - y1) * ex) / denom;
      const u = ((x3 - x1) * dy - (y3 - y1) * dx) / denom;
      if (t > 0.0 && t < 1.0 && u >= 0.0 && u <= 1.0) {
        ts.push(t);
      }
    }
  }

  ts.sort((a, b) => a - b);
  const out = [];
  for (let k = 0; k < ts.length - 1; k++) {
    const tA = ts[k],
      tB = ts[k + 1];
    if (tB - tA < 1e-6) continue;
    const midT = 0.5 * (tA + tB);
    const mx = x1 + midT * dx,
      my = y1 + midT * dy;
    if (isPointInPoly(mx, my, poly) === keepInside) {
      out.push([x1 + tA * dx, y1 + tA * dy, x1 + tB * dx, y1 + tB * dy]);
    }
  }
  return out;
}

// ============================================================================
// 7. ENGINE KONTUR & EXPORT DXF BER-LAYOUT LANGSUNG DI BROWSER (TANPA PYTHON)
// ============================================================================
// ============================================================================
// TOMBOL EXPORT CAD & KONTUR (MURNI JAVASCRIPT DI BROWSER)
// ============================================================================
btnExportCAD.addEventListener("click", () => {
  if (surveyPoints.length < 3) {
    alert("Minimal butuh 3 titik PENZD untuk memproses kontur dan CAD!");
    return;
  }

  const intervalMinor =
    parseFloat(document.getElementById("intervalMinor").value) || 0.5;
  const intervalMajor =
    parseFloat(document.getElementById("intervalMajor").value) || 2.5;

  const ptMap = new Map(surveyPoints.map((p) => [String(p.P), p]));
  const boundaryPolys = [];
  const buildingPolys = [];

  digitizedShapes.forEach((shape) => {
    const coords = shape.points
      .map((id) => ptMap.get(String(id)))
      .filter(Boolean)
      .map((p) => [p.E, p.N]);
    if (coords.length >= 3) {
      if (shape.type === "boundary") boundaryPolys.push(coords);
      if (shape.type === "building") buildingPolys.push(coords);
    }
  });

  const triangles = buildDelaunayTIN(surveyPoints);
  let minZ = Infinity,
    maxZ = -Infinity;
  surveyPoints.forEach((p) => {
    if (p.Z < minZ) minZ = p.Z;
    if (p.Z > maxZ) maxZ = p.Z;
  });

  const startZ = Math.floor(minZ / intervalMinor) * intervalMinor;
  const endZ = Math.ceil(maxZ / intervalMinor) * intervalMinor;
  const contourSegments = [];

  for (let elev = startZ; elev <= endZ + 1e-6; elev += intervalMinor) {
    const rem = Math.abs(elev % intervalMajor);
    const isMajor = rem < 1e-3 || Math.abs(rem - intervalMajor) < 1e-3;

    for (const t of triangles) {
      const verts = [surveyPoints[t.i], surveyPoints[t.j], surveyPoints[t.k]];
      const hits = [];
      for (let eIdx = 0; eIdx < 3; eIdx++) {
        const v1 = verts[eIdx],
          v2 = verts[(eIdx + 1) % 3];
        if ((v1.Z <= elev && elev <= v2.Z) || (v2.Z <= elev && elev <= v1.Z)) {
          const dz = v2.Z - v1.Z;
          if (Math.abs(dz) < 1e-9) continue;
          const frac = (elev - v1.Z) / dz;
          hits.push([v1.E + frac * (v2.E - v1.E), v1.N + frac * (v2.N - v1.N)]);
        }
      }

      if (hits.length >= 2) {
        let activeSegs = [[hits[0][0], hits[0][1], hits[1][0], hits[1][1]]];

        if (boundaryPolys.length > 0) {
          let insideBoundary = [];
          for (const s of activeSegs) {
            for (const bPoly of boundaryPolys) {
              insideBoundary.push(...clipSegmentWithPoly(s, bPoly, true));
            }
          }
          activeSegs = insideBoundary;
        }

        for (const bldgPoly of buildingPolys) {
          let outsideBldg = [];
          for (const s of activeSegs) {
            outsideBldg.push(...clipSegmentWithPoly(s, bldgPoly, false));
          }
          activeSegs = outsideBldg;
        }

        for (const [x1, y1, x2, y2] of activeSegs) {
          contourSegments.push({ x1, y1, x2, y2, elev, isMajor });
        }
      }
    }
  }

  const dxf = [];
  const pushDXF = (...lines) => dxf.push(...lines);

  pushDXF(
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1009",
    "0",
    "ENDSEC",
  );
  pushDXF(
    "0",
    "SECTION",
    "2",
    "TABLES",
    "0",
    "TABLE",
    "2",
    "LAYER",
    "70",
    "10",
  );

  const cadLayers = [
    ["TITIK_UKUR", 4],
    ["DIGITASI_BATAS", 3],
    ["DIGITASI_BANGUNAN", 1],
    ["DIGITASI_PARKIRAN", 6],
    ["DIGITASI_JALAN_PARIT", 2],
    ["KONTUR_MINOR", 8],
    ["KONTUR_MAYOR", 30],
    ["LABEL_KONTUR", 2],
    ["KOP_PETA", 7],
  ];

  cadLayers.forEach(([name, color]) => {
    pushDXF(
      "0",
      "LAYER",
      "2",
      name,
      "70",
      "0",
      "62",
      String(color),
      "6",
      "CONTINUOUS",
    );
  });
  pushDXF("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

  surveyPoints.forEach((p) => {
    pushDXF(
      "0",
      "POINT",
      "8",
      "TITIK_UKUR",
      "10",
      p.E.toFixed(3),
      "20",
      p.N.toFixed(3),
      "30",
      p.Z.toFixed(3),
    );
  });

  const layerByType = {
    boundary: "DIGITASI_BATAS",
    building: "DIGITASI_BANGUNAN",
    parking: "DIGITASI_PARKIRAN",
    polyline: "DIGITASI_JALAN_PARIT",
  };

  digitizedShapes.forEach((shape) => {
    const pts = shape.points.map((id) => ptMap.get(String(id))).filter(Boolean);
    if (pts.length < 2) return;
    const layerName = layerByType[shape.type] || "DIGITASI_JALAN_PARIT";
    const isClosed =
      shape.type === "boundary" ||
      shape.type === "building" ||
      shape.type === "parking";

    pushDXF(
      "0",
      "POLYLINE",
      "8",
      layerName,
      "66",
      "1",
      "70",
      isClosed ? "9" : "8",
    );
    pts.forEach((p) => {
      pushDXF(
        "0",
        "VERTEX",
        "8",
        layerName,
        "10",
        p.E.toFixed(3),
        "20",
        p.N.toFixed(3),
        "30",
        p.Z.toFixed(3),
        "70",
        "32",
      );
    });
    pushDXF("0", "SEQEND", "8", layerName);
  });

  contourSegments.forEach((seg, idx) => {
    const lyr = seg.isMajor ? "KONTUR_MAYOR" : "KONTUR_MINOR";
    pushDXF(
      "0",
      "LINE",
      "8",
      lyr,
      "10",
      seg.x1.toFixed(3),
      "20",
      seg.y1.toFixed(3),
      "30",
      seg.elev.toFixed(3),
      "11",
      seg.x2.toFixed(3),
      "21",
      seg.y2.toFixed(3),
      "31",
      seg.elev.toFixed(3),
    );

    const dx = seg.x2 - seg.x1;
    const dy = seg.y2 - seg.y1;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (seg.isMajor && length > 10.0 && idx % 8 === 0) {
      const mx = 0.5 * (seg.x1 + seg.x2);
      const my = 0.5 * (seg.y1 + seg.y2);
      pushDXF(
        "0",
        "TEXT",
        "8",
        "LABEL_KONTUR",
        "10",
        mx.toFixed(3),
        "20",
        my.toFixed(3),
        "30",
        seg.elev.toFixed(3),
        "40",
        "0.55",
        "1",
        `${seg.elev.toFixed(1)}`,
      );
    }
  });

  pushDXF("0", "ENDSEC", "0", "EOF");

  const dxfBlob = new Blob([dxf.join("\n")], { type: "application/dxf" });
  const downloadUrl = URL.createObjectURL(dxfBlob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "Hasil_Layout_Bersih.dxf";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
});
