---
title: TripLog
emoji: 🚗
colorFrom: yellow
colorTo: red
sdk: docker
app_port: 7860
pinned: false
---

# TripLog 🚗

**Calcul automat km pentru foaia de parcurs**

[🇬🇧 English](#-english)

🔗 **Aplicație live**: [mrmcb92-triplog.hf.space](https://mrmcb92-triplog.hf.space)

> ⚠️ La prima accesare după o perioadă de inactivitate, aplicația poate dura câteva secunde să pornească (limitare a planului gratuit Hugging Face Spaces).

---

## ✨ Funcționalități

- Autocomplete pentru adrese cu sugestii din OpenStreetMap
- Calcul automat al distanțelor prin OSRM
- Toggle „dus-întors" și multiplicator (×) pe fiecare segment
- Închidere circuit — revenire la punctul de plecare
- Reordonare opriri prin drag-and-drop sau butoane sus/jos
- Buton „Locația mea" cu geocodare inversă
- **Hartă interactivă** Leaflet cu traseul calculat
- **Gestionare vehicule** — nume, nr. înmatriculare, consum, preț carburant, șofer
- **Calcul cost** per cursă în funcție de consumul vehiculului
- **Câmpuri odometru** km start / km final (stocate în istoric)
- **Scop cursă** per segment
- **Favorite** — salvare/încărcare trasee frecvente cu export/import JSON
- **Istoric curse** — toate traseele salvate, filtrare pe lună
- **Raport lunar Excel** direct din istoric
- **Partajare traseu** prin URL (link copiabil)
- **Buton Traseu nou** — resetare rapidă pentru o nouă cursă fără a reporni aplicația
- Export **Excel**, **CSV** și **PDF**
- Navigare în 5 tab-uri: Traseu · Hartă · Segmente · Export · Istoric
- Interfață mobile-first, dark/light mode, toggle limbă RO/EN
- **PWA** — instalabilă pe Android și iOS ca aplicație nativă

---

## 🛠️ Stack tehnic

| Component | Tehnologie |
|-----------|-----------|
| Backend | FastAPI (Python 3) + uvicorn |
| Frontend | React 18 (CDN, fără build step), Babel in-browser |
| Hartă | Leaflet.js 1.9 |
| Geocodare | LocationIQ → Nominatim → maps.co (fallback în cascadă) |
| Geocodare inversă | Nominatim `/reverse` |
| Rutare | OSRM (router.project-osrm.org) |
| Export Excel | pandas + openpyxl |
| Export PDF | reportlab |
| Cache server | SQLite via aiosqlite |
| Rate limiting | slowapi (60 req/min per IP) |
| Hosting | Hugging Face Spaces (Docker, plan gratuit) |

---

## 📁 Structura proiectului

```
triplog/
├── main.py              # Backend FastAPI
├── requirements.txt     # Dependențe Python
├── Dockerfile           # Imagine Docker (deploy Hugging Face Spaces)
├── README.md
└── static/
    ├── index.html       # Frontend React (single-file SPA)
    ├── manifest.json    # PWA manifest
    ├── sw.js            # Service worker
    ├── icon-192.png     # Iconiță PWA
    └── icon-512.png     # Iconiță PWA
```

---

## 🚀 Rulare locală

1. Clonează repo-ul:
   ```bash
   git clone https://github.com/mrmcb92/triplog.git
   cd triplog
   ```

2. Instalează dependențele:
   ```bash
   pip install -r requirements.txt
   ```

3. (Opțional) Setează variabilele de mediu:
   ```bash
   export LOCATIONIQ_KEY="cheia_ta_aici"
   export CONTACT_EMAIL="email@example.com"
   export ALLOWED_ORIGINS="https://domeniul-tau.com"
   ```
   Fără `LOCATIONIQ_KEY`, aplicația folosește Nominatim (gratuit, puțin mai lent).

4. Pornește serverul:
   ```bash
   uvicorn main:app --reload
   ```

5. Deschide [http://localhost:8000](http://localhost:8000) în browser.

---

## ☁️ Deployment pe Hugging Face Spaces

Repo-ul include un `Dockerfile`. Pași:

1. Creează un Space nou pe [huggingface.co/new-space](https://huggingface.co/new-space) cu **SDK: Docker**
2. Adaugă remote-ul și fă push:
   ```bash
   git remote add hf https://huggingface.co/spaces/<utilizator>/<space>
   git push hf main
   ```
   (la parolă folosești un Access Token cu rol *Write*)
3. HF construiește automat imaginea Docker (uvicorn pe portul `7860`)
4. (Opțional) În Settings → *Variables and secrets* adaugă:
   - `LOCATIONIQ_KEY` — cheie API LocationIQ pentru geocodare mai rapidă
   - `CONTACT_EMAIL` — email pentru header-ul User-Agent Nominatim
   - `ALLOWED_ORIGINS` — origini permise CORS (implicit `*`)

> Fonturile DejaVu (diacritice PDF) sunt instalate în container prin `fonts-dejavu-core` — nu sunt ținute ca binare în git, deoarece HF respinge fișierele binare.

---

## 📱 Instalare PWA

**Android (Chrome):** Deschizi aplicația → meniu trei puncte → „Adaugă pe ecranul principal"

**iPhone (Safari):** Deschizi aplicația în Safari → butonul Share → „Adaugă pe ecranul principal"

Aplicația se deschide fullscreen, fără bara browserului, ca o aplicație nativă.

---

## 🔌 API endpoints

| Endpoint | Metodă | Descriere |
|----------|--------|-----------|
| `/api/geocode?q={query}&limit={n}` | GET | Caută adrese, returnează lat/lon |
| `/api/reverse?lat={lat}&lon={lon}` | GET | Geocodare inversă (coordonate → adresă) |
| `/api/route` | POST | Calculează ruta între puncte `{"points": [[lat,lon], ...]}` |
| `/api/export/excel` | POST | Generează fișier XLSX |
| `/api/export/pdf` | POST | Generează fișier PDF |
| `/health` | GET/HEAD | Health check |

---

## 📝 Note

- Starea utilizatorului (vehicule, favorite, istoric) este stocată în `localStorage` — per dispozitiv. Folosește Export JSON pentru backup.
- Cache-ul de geocodare și rutare este stocat pe server în `cache.db` (SQLite) pentru a reduce apelurile externe.
- Serverul este stateless din perspectiva curselor — utilizatorii simultani nu se interferează.
- Pentru volum mare de trafic se recomandă un Space plătit (hardware upgrade) și o cheie LocationIQ dedicată.

---
---

# 🇬🇧 English

**Automatic km calculation for trip logs**

🔗 **Live app**: [mrmcb92-triplog.hf.space](https://mrmcb92-triplog.hf.space)

> ⚠️ On the free Hugging Face Spaces tier, the app may take a few seconds to wake up after inactivity.

---

## ✨ Features

- Address autocomplete with OpenStreetMap suggestions
- Automatic distance calculation via OSRM
- Round-trip toggle and multiplier (×) per segment
- Closed-loop option — return to starting point
- Stop reordering via drag-and-drop or up/down buttons
- "My location" button with reverse geocoding
- **Interactive map** (Leaflet) showing the calculated route
- **Vehicle management** — name, plate, fuel consumption, fuel price, driver
- **Cost calculation** per trip based on vehicle consumption
- **Odometer fields** km start / km end (stored in history)
- **Purpose field** per segment
- **Favorites** — save/load frequent routes with JSON export/import
- **Trip history** — all saved trips, filterable by month
- **Monthly Excel report** directly from history
- **Route sharing** via URL (copyable link)
- **New Route button** — quick reset for a new trip without restarting the PWA
- Export to **Excel**, **CSV**, and **PDF**
- 5-tab navigation: Route · Map · Segments · Export · History
- Mobile-first UI, dark/light mode, RO/EN language toggle
- **PWA** — installable on Android and iOS as a native-like app

---

## 🛠️ Tech stack

| Component | Technology |
|-----------|-----------|
| Backend | FastAPI (Python 3) + uvicorn |
| Frontend | React 18 (CDN, no build step), Babel in-browser |
| Map | Leaflet.js 1.9 |
| Geocoding | LocationIQ → Nominatim → maps.co (cascading fallback) |
| Reverse geocoding | Nominatim `/reverse` |
| Routing | OSRM (router.project-osrm.org) |
| Excel export | pandas + openpyxl |
| PDF export | reportlab |
| Server cache | SQLite via aiosqlite |
| Rate limiting | slowapi (60 req/min per IP) |
| Hosting | Hugging Face Spaces (Docker, free tier) |

---

## 📁 Project structure

```
triplog/
├── main.py              # FastAPI backend
├── requirements.txt     # Python dependencies
├── Dockerfile           # Docker image (Hugging Face Spaces deploy)
├── README.md
└── static/
    ├── index.html       # React frontend (single-file SPA)
    ├── manifest.json    # PWA manifest
    ├── sw.js            # Service worker
    ├── icon-192.png     # PWA icon
    └── icon-512.png     # PWA icon
```

---

## 🚀 Local development

1. Clone the repo:
   ```bash
   git clone https://github.com/mrmcb92/triplog.git
   cd triplog
   ```

2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. (Optional) Set environment variables:
   ```bash
   export LOCATIONIQ_KEY="your_key_here"
   export CONTACT_EMAIL="your@email.com"
   export ALLOWED_ORIGINS="https://your-domain.com"
   ```
   Without `LOCATIONIQ_KEY` the app falls back to Nominatim (free, slightly slower).

4. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

5. Open [http://localhost:8000](http://localhost:8000).

---

## ☁️ Deployment on Hugging Face Spaces

The repo includes a `Dockerfile`. Steps:

1. Create a new Space at [huggingface.co/new-space](https://huggingface.co/new-space) with **SDK: Docker**
2. Add the remote and push:
   ```bash
   git remote add hf https://huggingface.co/spaces/<user>/<space>
   git push hf main
   ```
   (use an Access Token with *Write* role as the password)
3. HF builds the Docker image automatically (uvicorn on port `7860`)
4. (Optional) In Settings → *Variables and secrets* add:
   - `LOCATIONIQ_KEY` — LocationIQ API key for faster geocoding
   - `CONTACT_EMAIL` — email for Nominatim User-Agent header
   - `ALLOWED_ORIGINS` — allowed CORS origins (default `*`)

> The DejaVu fonts (PDF diacritics) are installed in the container via `fonts-dejavu-core` — they are not kept as binaries in git, since HF rejects binary files.

---

## 📱 PWA installation

**Android (Chrome):** Open the app → three-dot menu → "Add to Home screen"

**iPhone (Safari):** Open the app in Safari → Share button → "Add to Home Screen"

---

## 🔌 API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/geocode?q={query}&limit={n}` | GET | Search addresses, returns lat/lon |
| `/api/reverse?lat={lat}&lon={lon}` | GET | Reverse geocode coordinates to address |
| `/api/route` | POST | Calculate route between points `{"points": [[lat,lon], ...]}` |
| `/api/export/excel` | POST | Generate XLSX file |
| `/api/export/pdf` | POST | Generate PDF file |
| `/health` | GET/HEAD | Health check |

---

## 📝 Notes

- User state (vehicles, favorites, history) is stored in `localStorage` — per device. Use JSON export for backup.
- Geocoding and routing results are cached server-side in `cache.db` (SQLite) to reduce external API calls.
- The server is stateless with respect to trips — simultaneous users do not interfere with each other.
- For high traffic, a paid Space (hardware upgrade) and a dedicated LocationIQ key are recommended.
