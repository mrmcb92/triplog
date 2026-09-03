import express, { Request, Response } from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const app = express();
const PORT = 3000;

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
    if (raw.length && (coords.length === 0 || coords[coords.length - 1] !== raw[raw.length - 1])) {
      coords.push(raw[raw.length - 1]);
    }

    const result = { legs_km, legs_min, coords };
    routeCache.set(cacheKey, result);
    return res.set(NO_CACHE_HEADERS).json(result);
  } catch (e: any) {
    return res.status(503).set(NO_CACHE_HEADERS).json({ detail: `Eroare rețea OSRM: ${e?.message || e}` });
  }
});

// ── Export Excel ─────────────────────────────────────────────────────────────
app.post("/api/export/excel", async (req: Request, res: Response) => {
  const { rows, total, date_str, total_col_label = "Total KM" } = req.body || {};
  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Nicio înregistrare de exportat." });
  }
  if (rows.length > 10000) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Prea multe rânduri (max 10000)." });
  }

  try {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "TripLog";
    const sheet = workbook.addWorksheet("Foaie de parcurs", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    const cols = Object.keys(rows[0]);
    const allCols = [...cols, total_col_label];

    // Header row
    const headerRow = sheet.addRow(allCols);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF6366F1" },
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
      "Content-Disposition": `attachment; filename=foaie_parcurs_${date_str}.xlsx`,
    });
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    return res.status(500).set(NO_CACHE_HEADERS).json({ detail: err?.message || "Export error" });
  }
});

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
  } = req.body || {};

  if (!Array.isArray(rows) || !rows.length) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Nicio înregistrare de exportat." });
  }
  if (rows.length > 10000) {
    return res.status(400).set(NO_CACHE_HEADERS).json({ detail: "Prea multe rânduri (max 10000)." });
  }

  try {
    const doc = new jsPDF({
      orientation: "landscape",
      unit: "pt",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(67, 56, 202); // #4338CA
    doc.text(title, pageWidth / 2, 40, { align: "center" });

    // Meta line (vehicle, driver)
    const metaParts = [];
    if (vehicle) metaParts.push(`Vehicul: ${vehicle}`);
    if (driver) metaParts.push(`Șofer: ${driver}`);
    if (metaParts.length) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(100, 116, 139); // #64748B
      doc.text(metaParts.join(" | "), pageWidth / 2, 56, { align: "center" });
    }

    const cols = Object.keys(rows[0]);
    const headers = [...cols, total_col_label];

    const bodyData = rows.map((row: any, i: number) => {
      const rowVals = cols.map((c) => String(row[c] ?? ""));
      rowVals.push(i === 0 ? (typeof total === "number" ? total.toFixed(1) : String(total)) : "");
      return rowVals;
    });

    const autoTableFn: any =
      typeof autoTable === "function" ? autoTable : (autoTable as any)?.default;
    autoTableFn(doc, {
      startY: metaParts.length ? 68 : 52,
      head: [headers],
      body: bodyData,
      theme: "grid",
      headStyles: {
        fillColor: [99, 102, 241], // #6366F1
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
        lineColor: [226, 232, 240], // #E2E8F0
        lineWidth: 0.5,
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252], // #F8FAFC
      },
      margin: { left: 40, right: 40 },
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.set({
      ...NO_CACHE_HEADERS,
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=foaie_parcurs_${date_str}.pdf`,
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
