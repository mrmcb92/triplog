# TripLog 🚗

**Automatic km calculation for trip logs**

[🇷🇴 Română](#-română)

🔗 **Live app**: [triplog-05n6.onrender.com](https://triplog-05n6.onrender.com)

> ⚠️ On the free Render tier, the app may take 30–50 seconds to wake up after a period of inactivity.

---

## ✨ Features

- Address autocomplete with suggestions from OpenStreetMap
- Automatic distance calculation between addresses via OSRM
- Round trip toggle and multiplier per segment
- Return-to-start (closed loop) option
- Reorder stops
- Favorites saved locally in the browser, with JSON export/import
- Export to **Excel** and **CSV** with total km included
- Mobile-first UI with bottom tab navigation
- Dark / light mode toggle, persisted across sessions
- English / Romanian language toggle
- PWA — installable on Android and iOS as a native-like app

---

## 🛠️ Tech stack

- **Backend**: FastAPI (Python 3)
- **Frontend**: React (no build step, served by FastAPI)
- **Geocoding**: LocationIQ (with fallback to Nominatim and maps.co)
- **Routing**: OSRM (router.project-osrm.org)
- **Hosting**: Render (free tier)
- **Uptime monitoring**: UptimeRobot

---

## 📁 Project structure

```
triplog/
├── main.py              # FastAPI backend (geocoding, routing, Excel export)
├── requirements.txt     # Python dependencies
├── render.yaml          # Render deployment config
├── README.md
└── static/
    ├── index.html       # React frontend (single-file)
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
   ```
   Without these, the app falls back to Nominatim (free, slightly slower).

4. Start the server:
   ```bash
   uvicorn main:app --reload
   ```

5. Open [http://localhost:8000](http://localhost:8000) in your browser.

---

## ☁️ Deployment on Render

The repo includes `render.yaml`. To deploy:

1. Create an account at [render.com](https://render.com)
2. New → Web Service → connect this repo
3. Settings:
   - Language: `Python 3`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. (Optional) Add in Environment Variables:
   - `LOCATIONIQ_KEY` — LocationIQ API key
   - `CONTACT_EMAIL` — email for Nominatim User-Agent header

---

## 📱 PWA installation

**Android (Chrome):** Open the app → tap the three-dot menu → "Add to Home screen"

**iPhone (Safari):** Open the app → tap the Share button → "Add to Home Screen"

The app opens fullscreen without the browser bar, just like a native app.

---

## 🔌 API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/geocode?q={query}` | GET | Search addresses, returns lat/lon |
| `/api/route` | POST | Calculate route between points (`{points: [[lat, lon], ...]}`) |
| `/api/export/excel` | POST | Generate XLSX file |
| `/health` | GET / HEAD | Health check for uptime monitoring |

---

## 📝 Notes

- The app respects the usage limits of free geocoding providers (Nominatim: 1 req/sec).
- Favorites are stored in the browser's `localStorage` — they are per-device. Use JSON export for backup.
- For high-volume commercial use, a paid LocationIQ plan and a paid Render instance are recommended.
- All user state lives in the browser. The server is stateless — multiple simultaneous users do not interfere with each other.

---
---

# 🇷🇴 Română

**Calcul automat km pentru foaia de parcurs**

🔗 **Aplicație live**: [triplog-05n6.onrender.com](https://triplog-05n6.onrender.com)

> ⚠️ La prima accesare după o perioadă de inactivitate, aplicația poate dura 30–50 de secunde să pornească (limitare a planului gratuit Render).

---

## ✨ Funcționalități

- Autocomplete pentru adrese cu sugestii din OpenStreetMap
- Calcul automat al distanțelor dintre adrese prin OSRM
- Bifare „dus-întors" și multiplicare pe fiecare segment
- Închidere circuit (revenire la punctul de plecare)
- Reordonare opriri
- Favorite salvate local în browser, cu export/import JSON
- Export în **Excel** și **CSV** cu total km inclus
- Interfață mobile-first cu navigare în tab-uri
- Toggle dark / light mode, reținut între sesiuni
- Toggle limbă engleză / română
- PWA — instalabilă pe Android și iOS ca aplicație nativă

---

## 🛠️ Stack tehnic

- **Backend**: FastAPI (Python 3)
- **Frontend**: React (fără build step, servit de FastAPI)
- **Geocodare**: LocationIQ (cu fallback pe Nominatim și maps.co)
- **Rutare**: OSRM (router.project-osrm.org)
- **Hosting**: Render (plan gratuit)
- **Monitorizare uptime**: UptimeRobot

---

## 📁 Structura proiectului

```
triplog/
├── main.py              # Backend FastAPI (geocodare, rutare, export Excel)
├── requirements.txt     # Dependențe Python
├── render.yaml          # Configurare deployment Render
├── README.md
└── static/
    ├── index.html       # Frontend React (single-file)
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
   ```

4. Pornește serverul:
   ```bash
   uvicorn main:app --reload
   ```

5. Deschide [http://localhost:8000](http://localhost:8000) în browser.

---

## ☁️ Deployment pe Render

1. Creează un cont pe [render.com](https://render.com)
2. New → Web Service → conectează acest repo
3. Setări:
   - Language: `Python 3`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. (Opțional) Adaugă în Environment Variables:
   - `LOCATIONIQ_KEY` — cheia API LocationIQ
   - `CONTACT_EMAIL` — email pentru User-Agent Nominatim

---

## 📱 Instalare PWA

**Android (Chrome):** Deschizi aplicația → meniu trei puncte → „Adaugă pe ecranul principal"

**iPhone (Safari):** Deschizi aplicația în Safari → butonul Share → „Adaugă pe ecranul principal"

---

## 🔌 API endpoints

| Endpoint | Metodă | Descriere |
|----------|--------|-----------|
| `/api/geocode?q={query}` | GET | Caută adrese, returnează lat/lon |
| `/api/route` | POST | Calculează ruta între puncte |
| `/api/export/excel` | POST | Generează fișier XLSX |
| `/health` | GET / HEAD | Health check pentru monitorizare uptime |

---

## 📝 Note

- Aplicația respectă limitele de utilizare ale providerilor de geocodare gratuită.
- Favoritele sunt stocate în `localStorage` — sunt per-dispozitiv. Folosește Export JSON pentru backup.
- Serverul este stateless — utilizatorii simultani nu se interferează.
