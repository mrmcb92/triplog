import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const app = express();
const PORT = process.env.HF_PORT ? parseInt(process.env.HF_PORT, 10) : 3000;

const LOCATIONIQ_KEY = process.env.LOCATIONIQ_KEY || process.env.LOCATIONIQ_TOKEN || "";
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || "";
const USER_AGENT = `TripLogApp/9.0 (contact:${CONTACT_EMAIL || "none"})`;
const NO_CACHE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-cache, no-store, must-revalidate",
  Pragma: "no-cache",
  Expires: "0",
};

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((o) => o.trim());

app.use(
  cors({
    origin: allowedOrigins.includes("*") ? "*" : allowedOrigins,
    methods: ["GET", "POST", "HEAD", "OPTIONS"],
    allowedHeaders: ["*"],
  })
);

app.use(express.json({ limit: "15mb" }));

// In-memory caches to replace SQLite cache
const geoCache = new Map<string, any>();
const routeCache = new Map<string, any>();

function kmRound(x: number): number {
  return Math.floor(x * 10 + 0.5) / 10;
}

const EXCEL_FORMULA_PREFIXES = ["=", "+", "-", "@"];
function sanitizeFormulaInjection(val: any): any {
  if (typeof val === "string" && EXCEL_FORMULA_PREFIXES.some((p) => val.startsWith(p))) {
    return "'" + val;
  }
  return val;
}

function cleanPdfText(text: any): string {
  if (text == null) return "";
  const str = String(text);
  return str
    .replace(/[șş]/g, "s")
    .replace(/[ȘŞ]/g, "S")
    .replace(/[țţ]/g, "t")
    .replace(/[ȚŢ]/g, "T")
    .replace(/[ă]/g, "a")
    .replace(/[Ă]/g, "A")
    .replace(/[â]/g, "a")
    .replace(/[Â]/g, "A")
    .replace(/[î]/g, "i")
    .replace(/[Î]/g, "I");
}

// ── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req: Request, res: Response) => {
  res.set(NO_CACHE_HEADERS).json({ status: "ok" });
});

app.head("/health", (req: Request, res: Response) => {
  res.set(NO_CACHE_HEADERS).status(200).end();
});

// ── Geocoding ────────────────────────────────────────────────────────────────
async function tryLocationIQ(q: string, limit: number) {
  if (!LOCATIONIQ_KEY) return null;
  try {
    const url = new URL("https://us1.locationiq.com/v1/search");
    url.searchParams.set("key", LOCATIONIQ_KEY);
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("normalizecity", "1");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("accept-language", "ro");

    const r = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const js = await r.json();
    if (Array.isArray(js)) {
      return js.map((it: any) => ({
        lat: parseFloat(it.lat),
        lon: parseFloat(it.lon),
        display: it.display_name || q,
      }));
    }
  } catch {
    return null;
  }
  return null;
}

async function tryNominatim(q: string, limit: number) {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", q);
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("accept-language", "ro");

    const r = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const js = await r.json();
    if (Array.isArray(js)) {
      return js.map((it: any) => ({
        lat: parseFloat(it.lat),
        lon: parseFloat(it.lon),
        display: it.display_name || q,
      }));
    }
  } catch {
    return null;
  }
  return null;
}

async function tryMapsCo(q: string, limit: number) {
  try {
    const url = new URL("https://geocode.maps.co/search");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));

    const r = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const js = await r.json();
    if (Array.isArray(js)) {
      const items = js
        .filter((it: any) => it.lat != null && it.lon != null)
        .map((it: any) => ({
          lat: parseFloat(it.lat),
          lon: parseFloat(it.lon),
          display: it.display_name || it.name || q,
        }));
      return items.length > 0 ? items : null;
    }
  } catch {
    return null;
  }
  return null;
}

async function tryPhoton(q: string, limit: number) {
  try {
    const url = new URL("https://photon.komoot.io/api/");
    url.searchParams.set("q", q);
    url.searchParams.set("limit", String(limit));

    const r = await fetch(url.toString(), {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (!r.ok) return null;
    const js = await r.json();
    if (Array.isArray(js?.features)) {
      const items = js.features
        .filter((f: any) => f?.geometry?.coordinates?.length >= 2)
        .map((f: any) => {
          const [lon, lat] = f.geometry.coordinates;
          const p = f.properties || {};
          const parts = [p.name, p.street, p.district, p.city, p.state, p.country].filter(Boolean);
          return {
            lat: parseFloat(lat),
            lon: parseFloat(lon),
            display: parts.length > 0 ? Array.from(new Set(parts)).join(", ") : q,
          };
        });
      return items.length > 0 ? items : null;
    }
  } catch {
    return null;
  }
  return null;
}

app.get("/api/geocode", async (req: Request, res: Response) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Math.max(parseInt(req.query.limit as string, 10) || 6, 1), 10);

  if (q.length < 3) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Query must be at least 3 characters" });
  }

  const cacheKey = `${q}|${limit}`;
  if (geoCache.has(cacheKey)) {
    return res.set(NO_CACHE_HEADERS).json({ results: geoCache.get(cacheKey) });
  }

  const results =
    (await tryLocationIQ(q, limit)) ||
    (await tryNominatim(q, limit)) ||
    (await tryPhoton(q, limit)) ||
    (await tryMapsCo(q, limit)) ||
    [];

  geoCache.set(cacheKey, results);
  return res.set(NO_CACHE_HEADERS).json({ results });
});

// ── Reverse Geocoding ────────────────────────────────────────────────────────
app.get("/api/reverse", async (req: Request, res: Response) => {
  const lat = parseFloat(req.query.lat as string);
  const lon = parseFloat(req.query.lon as string);

  if (isNaN(lat) || !isFinite(lat) || lat < -90 || lat > 90) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Latitudine invalidă." });
  }
  if (isNaN(lon) || !isFinite(lon) || lon < -180 || lon > 180) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Longitudine invalidă." });
  }

  const cacheKey = `rev|${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (geoCache.has(cacheKey)) {
    return res.set(NO_CACHE_HEADERS).json(geoCache.get(cacheKey));
  }

  let display: string | null = null;

  if (LOCATIONIQ_KEY) {
    try {
      const url = new URL("https://us1.locationiq.com/v1/reverse");
      url.searchParams.set("key", LOCATIONIQ_KEY);
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("format", "json");
      url.searchParams.set("accept-language", "ro");

      const r = await fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        display = d.display_name || null;
      }
    } catch {}
  }

  if (!display) {
    try {
      const url = new URL("https://nominatim.openstreetmap.org/reverse");
      url.searchParams.set("format", "json");
      url.searchParams.set("lat", String(lat));
      url.searchParams.set("lon", String(lon));
      url.searchParams.set("accept-language", "ro");

      const r = await fetch(url.toString(), {
        headers: { "User-Agent": USER_AGENT },
        signal: AbortSignal.timeout(10000),
      });
      if (r.ok) {
        const d = await r.json();
        display = d.display_name || null;
      }
    } catch {}
  }

  const result = {
    display: display || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
    lat,
    lon,
  };

  if (display) {
    geoCache.set(cacheKey, result);
  }

  return res.set(NO_CACHE_HEADERS).json(result);
});

// ── Routing ──────────────────────────────────────────────────────────────────
app.post("/api/route", async (req: Request, res: Response) => {
  const points: [number, number][] = req.body?.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 50) {
    return res.status(422).set(NO_CACHE_HEADERS).json({
      detail: "Numărul de puncte trebuie să fie între 2 și 50.",
    });
  }

  for (const p of points) {
    if (!Array.isArray(p) || p.length < 2 || typeof p[0] !== "number" || typeof p[1] !== "number") {
      return res.status(422).set(NO_CACHE_HEADERS).json({ detail: "Coordonate invalide." });
    }
    const [la, lo] = p;
    if (!isFinite(la) || !isFinite(lo) || la < -90 || la > 90 || lo < -180 || lo > 180) {
      return res.status(422).set(NO_CACHE_HEADERS).json({ detail: "Coordonate în afara intervalului." });
    }
  }

  const cacheKey = "v2|" + points.map(([la, lo]) => `${la.toFixed(5)},${lo.toFixed(5)}`).join("|");
  if (routeCache.has(cacheKey)) {
    return res.set(NO_CACHE_HEADERS).json(routeCache.get(cacheKey));
  }

  const coordStr = points.map(([la, lo]) => `${lo},${la}`).join(";");
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&alternatives=false&steps=false&geometries=geojson`;

  try {
    const r = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });

    if (r.status === 400) {
      const errData = await r.json().catch(() => ({}));
      return res.status(400).set(NO_CACHE_HEADERS).json({ detail: errData.message || "Nu s-a găsit rută." });
    }

    if (!r.ok) {
      return res.status(503).set(NO_CACHE_HEADERS).json({ detail: `Eroare rețea OSRM: HTTP ${r.status}` });
    }

    const data = await r.json();
    const routes = data.routes || [];
    if (!routes.length) {
      return res.status(404).set(NO_CACHE_HEADERS).json({ detail: "Nicio rută găsită." });
    }

    const legs = routes[0].legs || [];
    const legs_km = legs.map((leg: any) => kmRound(leg.distance / 1000));
    const legs_min = legs.map((leg: any) => Math.round(((leg.duration || 0) / 60) * 10) / 10);
    const geom = routes[0].geometry || {};
    const raw = geom.type === "LineString" && Array.isArray(geom.coordinates) ? geom.coordinates : [];

    const coords: [number, number][] = [];
    for (let i = 0; i < raw.length; i += 3) {
      coords.push(raw[i]);
    }
    if (raw.length > 0) {
      const lastRaw = raw[raw.length - 1];
      const lastCoord = coords[coords.length - 1];
      if (!lastCoord || lastCoord[0] !== lastRaw[0] || lastCoord[1] !== lastRaw[1]) {
        coords.push(lastRaw);
      }
    }

    const result = { legs_km, legs_min, coords };
    routeCache.set(cacheKey, result);
    return res.set(NO_CACHE_HEADERS).json(result);
  } catch (e: any) {
    return res.status(503).set(NO_CACHE_HEADERS).json({ detail: `Eroare rețea OSRM: ${e?.message || e}` });
  }
});

function haversineDistKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ── Route Optimization (TSP 2-Opt) ───────────────────────────────────────────
app.post("/api/route/optimize", async (req: Request, res: Response) => {
  const { start, stops, returnToStart = false } = req.body || {};

  if (!Array.isArray(start) || start.length < 2 || typeof start[0] !== "number" || typeof start[1] !== "number") {
    return res.status(422).set(NO_CACHE_HEADERS).json({ detail: "Punctul de plecare este invalid." });
  }

  if (!Array.isArray(stops) || stops.length < 2) {
    return res.status(422).set(NO_CACHE_HEADERS).json({ detail: "Sunt necesare cel puțin 2 opriri pentru optimizare." });
  }

  for (const s of stops) {
    if (s.lat == null || s.lon == null || !isFinite(s.lat) || !isFinite(s.lon)) {
      return res.status(422).set(NO_CACHE_HEADERS).json({ detail: `Oprirea „${s.text || s.display}” nu are coordonate valide.` });
    }
  }

  // Calculate tour distance given an ordering of stops
  const calcTourDist = (tour: typeof stops): number => {
    let d = haversineDistKm(start[0], start[1], tour[0].lat, tour[0].lon);
    for (let i = 0; i < tour.length - 1; i++) {
      d += haversineDistKm(tour[i].lat, tour[i].lon, tour[i + 1].lat, tour[i + 1].lon);
    }
    if (returnToStart) {
      d += haversineDistKm(tour[tour.length - 1].lat, tour[tour.length - 1].lon, start[0], start[1]);
    }
    return d;
  };

  const originalKm = kmRound(calcTourDist(stops));

  // 1. Nearest Neighbor construction
  let currentLat = start[0];
  let currentLon = start[1];
  const unvisited = [...stops];
  const tour: typeof stops = [];

  while (unvisited.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < unvisited.length; i++) {
      const dist = haversineDistKm(currentLat, currentLon, unvisited[i].lat, unvisited[i].lon);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }
    const [nextStop] = unvisited.splice(bestIdx, 1);
    tour.push(nextStop);
    currentLat = nextStop.lat;
    currentLon = nextStop.lon;
  }

  // 2. 2-Opt refinement iterations
  let improved = true;
  let iterations = 0;
  while (improved && iterations < 60) {
    improved = false;
    iterations++;
    for (let i = 0; i < tour.length - 1; i++) {
      for (let j = i + 1; j < tour.length; j++) {
        const candidate = [
          ...tour.slice(0, i),
          ...tour.slice(i, j + 1).reverse(),
          ...tour.slice(j + 1),
        ];
        if (calcTourDist(candidate) < calcTourDist(tour) - 0.001) {
          tour.splice(0, tour.length, ...candidate);
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
  }

  const optimizedKm = kmRound(calcTourDist(tour));
  const savedKm = Math.max(0, kmRound(originalKm - optimizedKm));
  const savedPercent = originalKm > 0 ? Math.round((savedKm / originalKm) * 100) : 0;

  return res.set(NO_CACHE_HEADERS).json({
    orderedStops: tour,
    originalKm,
    optimizedKm,
    savedKm,
    savedPercent,
  });
});

// ── Export Excel ─────────────────────────────────────────────────────────────
app.post("/api/export/excel", async (req: Request, res: Response) => {
  const {
    rows,
    total,
    date_str,
    total_col_label = "Total KM",
    company = null,
    vehicle = "",
    driver = "",
    odo_start = "",
    odo_end = "",
  } = req.body || {};

  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Nicio înregistrare de exportat." });
  }
  if (rows.length > 10000) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Prea multe rânduri (max 10000)." });
  }

  const safeDateStr = (typeof date_str === "string" ? date_str : "export").replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TripLog";
    const sheet = workbook.addWorksheet("Foaie de parcurs", {
      views: [{ state: "frozen", ySplit: company ? 6 : 1 }],
    });

    const cols = Object.keys(rows[0]);
    const allCols = [...cols, total_col_label];

    if (company && (company.name || company.cui)) {
      // Company header rows
      const r1 = sheet.addRow([cleanPdfText(company.name || "FOAIE DE PARCURS")]);
      r1.font = { bold: true, size: 14, color: { argb: "FF312E81" } };

      const details = [];
      if (company.cui) details.push(`CUI/CIF: ${company.cui}`);
      if (company.regCom) details.push(`Reg. Com.: ${company.regCom}`);
      if (company.address) details.push(`Sediu: ${company.address}`);
      const r2 = sheet.addRow([cleanPdfText(details.join(" | "))]);
      r2.font = { size: 9, color: { argb: "FF4B5563" } };

      const metaRow = [];
      if (company.docSeries || company.docNumber) {
        metaRow.push(`Serie: ${company.docSeries || ""} Nr: ${company.docNumber || ""}`);
      }
      if (vehicle) metaRow.push(`Vehicul: ${vehicle}`);
      if (driver) metaRow.push(`Șofer: ${driver}`);
      if (odo_start || odo_end) metaRow.push(`Km Odometru: ${odo_start || "—"} → ${odo_end || "—"}`);
      const r3 = sheet.addRow([cleanPdfText(metaRow.join(" | "))]);
      r3.font = { bold: true, size: 9.5, color: { argb: "FF374151" } };

      sheet.addRow([]); // Blank spacer
    }

    // Header row
    const headerRow = sheet.addRow(allCols);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF4F46E5" }, // Indigo 600
      };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    // Data rows
    for (let i = 0; i < rows.length; i++) {
      const rowData = rows[i];
      const cells = cols.map((colKey) => sanitizeFormulaInjection(rowData[colKey] ?? ""));
      cells.push(i === 0 ? parseFloat(total) || 0 : "");
      const addedRow = sheet.addRow(cells);

      if (i === 0) {
        const totalCell = addedRow.getCell(allCols.length);
        totalCell.font = { bold: true, size: 12, color: { argb: "FF4338CA" } };
        totalCell.numFmt = "0.0";
        totalCell.alignment = { horizontal: "center", vertical: "middle" };
      }
    }

    // Signatures footer row if company info provided
    if (company) {
      sheet.addRow([]);
      const sigRow = sheet.addRow([
        `Conducător auto: ${driver || "................"}`,
        "",
        "",
        `Verificat / Aprobat: ${company.approver || "................"}`,
      ]);
      sigRow.font = { italic: true, size: 10, color: { argb: "FF4B5563" } };
    }

    // Auto-fit column widths
    sheet.columns.forEach((column) => {
      let maxLen = 10;
      column.eachCell?.({ includeEmpty: true }, (cell) => {
        const len = cell.value ? String(cell.value).length : 0;
        if (len > maxLen) maxLen = len;
      });
      column.width = Math.min(Math.max(maxLen + 4, 10), 55);
    });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      ...NO_CACHE_HEADERS,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=foaie_parcurs_${safeDateStr}.xlsx`,
    });
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    return res.status(500).set(NO_CACHE_HEADERS).json({ detail: err?.message || "Export error" });
  }
});

// ── Export Fuel Logs to Excel ────────────────────────────────────────────────
app.post("/api/export/fuel", async (req: Request, res: Response) => {
  const { fuel_logs = [] } = req.body || {};
  if (!Array.isArray(fuel_logs) || !fuel_logs.length) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Nicio alimentare de exportat." });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Alimentări carburant");

    const headers = ["Data", "Vehicul", "Nr. Înmatriculare", "Nr. Bon", "Stație / Furnizor", "Tip Carburant", "Cantitate (L/kWh)", "Preț Unitar (RON)", "Valoare Totală (RON)", "Km Bord"];
    const headerRow = sheet.addRow(headers);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10.5 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF059669" } }; // Emerald 600
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    let totalVal = 0;
    let totalLiters = 0;
    for (const log of fuel_logs) {
      const val = parseFloat(log.totalRon) || (parseFloat(log.liters) * parseFloat(log.pricePerLiter)) || 0;
      const lit = parseFloat(log.liters) || 0;
      totalVal += val;
      totalLiters += lit;

      sheet.addRow([
        log.date || "",
        log.vehicleName || "",
        log.plate || "",
        log.receiptNumber || "",
        log.station || "",
        log.fuelType || "",
        lit ? lit.toFixed(2) : "",
        log.pricePerLiter ? parseFloat(log.pricePerLiter).toFixed(2) : "",
        val ? val.toFixed(2) : "",
        log.odometer || "",
      ]);
    }

    const totalRow = sheet.addRow(["TOTAL", "", "", "", "", "", totalLiters.toFixed(2), "", totalVal.toFixed(2), ""]);
    totalRow.font = { bold: true };

    sheet.columns.forEach((col) => { col.width = 16; });

    const buffer = await workbook.xlsx.writeBuffer();
    res.set({
      ...NO_CACHE_HEADERS,
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename=alimentari_${today().replace(/-/g, "")}.xlsx`,
    });
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    return res.status(500).set(NO_CACHE_HEADERS).json({ detail: err?.message || "Export error" });
  }
});

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Export PDF ───────────────────────────────────────────────────────────────
app.post("/api/export/pdf", async (req: Request, res: Response) => {
  const {
    rows,
    total,
    date_str,
    title = "Foaie de parcurs",
    vehicle = "",
    driver = "",
    total_col_label = "Total KM",
    company = null,
    fuel_records = [],
    odo_start = "",
    odo_end = "",
  } = req.body || {};

  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Nicio înregistrare de exportat." });
  }
  if (rows.length > 10000) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Prea multe rânduri (max 10000)." });
  }

  const safeDateStr = (typeof date_str === "string" ? date_str : "export").replace(/[^a-zA-Z0-9_-]/g, "_");

  try {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    let curY = 32;

    // ── Official Company Header (ANAF compliance) ──
    if (company && (company.name || company.cui)) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59); // Slate 800
      doc.text(cleanPdfText(company.name || "COMPANIE"), 40, curY);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139); // Slate 500
      const compDetails = [];
      if (company.cui) compDetails.push(`CUI/CIF: ${company.cui}`);
      if (company.regCom) compDetails.push(`Reg. Com.: ${company.regCom}`);
      if (company.address) compDetails.push(`Sediu: ${company.address}`);
      if (compDetails.length) {
        doc.text(cleanPdfText(compDetails.join(" | ")), 40, curY + 14);
      }

      // Doc Series & Number on the right
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(79, 70, 229); // Indigo 600
      const docNumStr = `SERIE: ${company.docSeries || "FP"} NR: ${company.docNumber || "001"}`;
      doc.text(cleanPdfText(docNumStr), pageWidth - 40, curY, { align: "right" });

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(100, 116, 139);
      doc.text(cleanPdfText(`Conform Art. 298 Codul Fiscal`), pageWidth - 40, curY + 14, { align: "right" });

      curY += 34;
    }

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(49, 46, 129); // Indigo 900
    doc.text(cleanPdfText(title), pageWidth / 2, curY, { align: "center" });
    curY += 16;

    // Meta line (vehicle, driver, odometer)
    const metaParts = [];
    if (vehicle) metaParts.push(`Vehicul: ${vehicle}`);
    if (driver) metaParts.push(`Conducător auto: ${driver}`);
    if (odo_start || odo_end) metaParts.push(`Km Odometru: ${odo_start || "—"} → ${odo_end || "—"}`);
    if (metaParts.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(71, 85, 105);
      doc.text(cleanPdfText(metaParts.join(" | ")), pageWidth / 2, curY, { align: "center" });
      curY += 14;
    }

    const cols = Object.keys(rows[0]);
    const headers = [...cols, total_col_label].map((h) => cleanPdfText(h));

    const bodyData = rows.map((row: any, i: number) => {
      const rowVals = cols.map((c) => cleanPdfText(row[c] ?? ""));
      rowVals.push(i === 0 ? (typeof total === "number" ? total.toFixed(1) : cleanPdfText(String(total))) : "");
      return rowVals;
    });

    const autoTableFn: any =
      typeof (doc as any).autoTable === "function"
        ? (opts: any) => (doc as any).autoTable(opts)
        : typeof autoTable === "function"
        ? (opts: any) => (autoTable as any)(doc, opts)
        : (autoTable as any)?.default
        ? (opts: any) => (autoTable as any).default(doc, opts)
        : null;

    if (!autoTableFn) {
      throw new Error("PDF table generator unavailable");
    }

    autoTableFn({
      startY: curY,
      head: [headers],
      body: bodyData,
      theme: "grid",
      headStyles: {
        fillColor: [79, 70, 229], // #4F46E5
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
        valign: "middle",
      },
      styles: {
        fontSize: 7.5,
        halign: "center",
        valign: "middle",
        cellPadding: 4,
        textColor: [15, 23, 42],
        lineColor: [226, 232, 240],
        lineWidth: 0.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      margin: { left: 40, right: 40 },
    });

    let finalY = (doc as any).lastAutoTable?.finalY || 450;

    // Optional fuel summary table if fuel records provided
    if (Array.isArray(fuel_records) && fuel_records.length > 0 && finalY < 480) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(5, 150, 105);
      doc.text(cleanPdfText("Alimentări și Bonuri Carburant Înregistrate:"), 40, finalY + 16);

      const fuelHeaders = ["Data", "Stație / Furnizor", "Nr. Bon", "Carburant", "Litri/kWh", "Preț/U", "Total (RON)"];
      const fuelBody = fuel_records.map((f: any) => [
        cleanPdfText(f.date || ""),
        cleanPdfText(f.station || ""),
        cleanPdfText(f.receiptNumber || ""),
        cleanPdfText(f.fuelType || ""),
        cleanPdfText(String(f.liters || "")),
        cleanPdfText(String(f.pricePerLiter || "")),
        cleanPdfText(String(f.totalRon || "")),
      ]);

      autoTableFn({
        startY: finalY + 22,
        head: [fuelHeaders],
        body: fuelBody,
        theme: "grid",
        headStyles: {
          fillColor: [5, 150, 105],
          textColor: [255, 255, 255],
          fontSize: 7,
          fontStyle: "bold",
        },
        styles: { fontSize: 7, cellPadding: 3, halign: "center" },
        margin: { left: 40, right: 40 },
      });

      finalY = (doc as any).lastAutoTable?.finalY || finalY + 60;
    }

    // Official signature section
    const sigY = Math.min(finalY + 30, doc.internal.pageSize.getHeight() - 45);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text(cleanPdfText(`Conducător auto: ${driver || "................"} (Semnătură: _____________)`), 45, sigY);

    const approverText = company?.approver ? `Verificat / Aprobat: ${company.approver}` : "Verificat și Aprobat (Semnătură / Ștampilă): _____________";
    doc.text(cleanPdfText(approverText), pageWidth - 45, sigY, { align: "right" });

    doc.setFont("helvetica", "italic");
    doc.setFontSize(7.5);
    doc.setTextColor(148, 163, 184);
    doc.text(
      cleanPdfText("Document justificativ fiscal conform OMFP 2634/2015 și Codului Fiscal pentru deductibilitatea cheltuielilor cu vehiculele."),
      pageWidth / 2,
      sigY + 16,
      { align: "center" }
    );

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.set({
      ...NO_CACHE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=foaie_parcurs_${safeDateStr}.pdf`,
    });
    return res.send(pdfBuffer);
  } catch (err: any) {
    return res.status(500).set(NO_CACHE_HEADERS).json({ detail: err?.message || "PDF error" });
  }
});

// ── Service Worker & Static Assets ───────────────────────────────────────────
const staticDir = path.join(process.cwd(), "static");
const indexPath = path.join(staticDir, "index.html");

app.get("/static/sw.js", (req: Request, res: Response) => {
  const swPath = path.join(staticDir, "sw.js");
  if (fs.existsSync(swPath)) {
    res.set({
      ...NO_CACHE_HEADERS,
      "Content-Type": "application/javascript",
      "Service-Worker-Allowed": "/",
    });
    return res.sendFile(swPath);
  }
  return res.status(404).end();
});

app.use("/static", express.static(staticDir));

app.get("/", (req: Request, res: Response) => {
  res.set(NO_CACHE_HEADERS).sendFile(indexPath);
});

// SPA fallback for any non-API route
app.get("*", (req: Request, res: Response) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).set(NO_CACHE_HEADERS).json({ error: "Not found" });
  }
  res.set(NO_CACHE_HEADERS).sendFile(indexPath);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`TripLog server running on http://0.0.0.0:${PORT}`);
});
