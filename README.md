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
| Backend | Node.js (TypeScript) + Express |
| Frontend | React 18 (CDN, fără build step), Babel in-browser |
| Hartă | Leaflet.js 1.9 |
| Geocodare | LocationIQ → Nominatim → Photon → maps.co (fallback în cascadă) |
| Geocodare inversă | LocationIQ → Nominatim `/reverse` |
| Rutare | OSRM (router.project-osrm.org) |
| Export Excel | ExcelJS (XLSX) |
| Export PDF | jsPDF + jspdf-autotable |
| Hosting | Hugging Face Spaces (Docker, port 7860) |
| CI/CD | GitHub Actions (deploy automat pe Hugging Face Hub) |

---

## 📁 Structura proiectului

```
triplog/
├── .github/workflows/
│   └── sync-to-hf.yml   # Deploy automat pe Hugging Face la git push
├── server.ts            # Backend Express / TypeScript
├── package.json         # Dependențe Node.js & scripturi de build
├── Dockerfile           # Imagine Docker optimizată pentru Hugging Face Spaces (port 7860)
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
   npm install
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
   npm run dev
   ```

5. Deschide [http://localhost:3000](http://localhost:3000) în browser.

---

## ☁️ Deployment pe Hugging Face Spaces

Repo-ul este configurat pentru **deploy automat** și **deploy manual** pe Hugging Face Spaces cu **SDK: Docker**.

### 1. Deploy automat (GitHub Actions)
La fiecare `git push` în branch-ul `main` (sau `master`), workflow-ul `.github/workflows/sync-to-hf.yml` trimite automat codul către Space-ul tău Hugging Face.

**Configurare unică în GitHub:**
1. Mergi în repo-ul tău GitHub → **Settings** → **Secrets and variables** → **Actions**.
2. Apasă **New repository secret**.
3. Creează secretul:
   - **Name**: `HF_TOKEN`
   - **Value**: Token-ul tău de la [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) (cu permisiune **Write**).
4. (Opțional) Dacă numele de utilizator sau Space-ul diferă de `mrmcb92/triplog`, poți seta și secretele:
   - `HF_USERNAME` (implicit `mrmcb92`)
   - `HF_SPACE` (implicit `triplog`)

### 2. Deploy manual prin Git
Dacă preferi să faci push direct din linia de comandă:
```bash
git remote add hf https://huggingface.co/spaces/mrmcb92/triplog
git push --force hf main
```
(la autentificare folosești username-ul tău HF și un Access Token cu rol *Write*).

HF construiește automat containerul Node.js folosind `Dockerfile` (pe portul `7860`).

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
| Backend | Node.js (TypeScript) + Express |
| Frontend | React 18 (CDN, no build step), Babel in-browser |
| Map | Leaflet.js 1.9 |
| Geocoding | LocationIQ → Nominatim → Photon → maps.co (cascading fallback) |
| Reverse geocoding | LocationIQ → Nominatim `/reverse` |
| Routing | OSRM (router.project-osrm.org) |
| Excel export | ExcelJS (XLSX) |
| PDF export | jsPDF + jspdf-autotable |
| Hosting | Hugging Face Spaces (Docker, port 7860) |
| CI/CD | GitHub Actions (automatic deploy to Hugging Face Hub) |

---

## 📁 Project structure

```
triplog/
├── .github/workflows/
│   └── sync-to-hf.yml   # Automatic deployment to Hugging Face on push
├── server.ts            # Express / TypeScript backend
├── package.json         # Node.js dependencies & build scripts
├── Dockerfile           # Docker image optimized for Hugging Face Spaces (port 7860)
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
   npm install
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
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000).

---

## ☁️ Deployment on Hugging Face Spaces

The repo is configured for both **automatic deployment** and **manual deployment** to Hugging Face Spaces with **SDK: Docker**.

### 1. Automatic Deployment (GitHub Actions)
On every `git push` to the `main` (or `master`) branch, the `.github/workflows/sync-to-hf.yml` workflow automatically syncs your code to your Hugging Face Space.

**One-time setup on GitHub:**
1. Navigate to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**.
2. Click **New repository secret**.
3. Create the secret:
   - **Name**: `HF_TOKEN`
   - **Value**: Your Hugging Face access token from [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) (must have **Write** permission).
4. (Optional) If your username or Space name differs from `mrmcb92/triplog`:
   - `HF_USERNAME` (defaults to `mrmcb92`)
   - `HF_SPACE` (defaults to `triplog`)

### 2. Manual Git Push
To push directly from your terminal:
```bash
git remote add hf https://huggingface.co/spaces/mrmcb92/triplog
git push --force hf main
```
(authenticate using your Hugging Face username and a token with *Write* permission).

HF automatically builds the Node.js container from `Dockerfile` listening on port `7860`.

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
