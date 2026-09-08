# SafeRoute AI — Cloud Deployment Guide

This guide walks through deploying **SafeRoute AI** across production clouds:
- **Backend:** [Render](https://render.com) (Python Flask Web Service + Gunicorn)
- **Frontend:** [Vercel](https://vercel.com) (React + Vite + MapLibre GL Dashboard)

---

## Part 1: Deploy Backend on Render

Render hosts the Python pathfinding engine, graph loader, and SQLite corroboration service.

### Method A: Blueprint (Recommended - One Click)
1. Log in to your [Render Dashboard](https://dashboard.render.com/).
2. Click **New +** and select **Blueprint**.
3. Connect your GitHub repository: `rohitgaikwad6156/Safe-Route`.
4. Render will automatically detect [`render.yaml`](../render.yaml) at the repository root and configure:
   - **Service Name:** `saferoute-ai-backend`
   - **Environment:** `Python`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120 backend.api.server:app`
   - **Health Check Path:** `/health`
5. Click **Apply**.
6. Once deployed, copy your backend URL (e.g., `https://saferoute-ai-backend.onrender.com`).

### Method B: Manual Web Service Setup
If not using Blueprints:
1. Click **New +** → **Web Service**.
2. Connect `https://github.com/rohitgaikwad6156/Safe-Route`.
3. Configure settings:
   - **Name:** `saferoute-ai-backend`
   - **Runtime:** `Python 3`
   - **Region:** Singapore / Frankfurt / Oregon (nearest to user)
   - **Branch:** `main`
   - **Root Directory:** *(leave blank for repository root)*
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 4 --timeout 120 backend.api.server:app`
   - **Plan:** Free or Starter
4. Under **Advanced** → **Health Check Path**: enter `/health`.
5. Under **Environment Variables**:
   - `PYTHON_VERSION`: `3.11.9`
   - `PORT`: `8000`
6. Click **Create Web Service**.

> [!TIP]
> Why `--workers 1 --threads 4`?
> Pune's 381,045-edge graph is stored once in module-level memory (`PuneGraphManager`). Single-process multi-threading allows all concurrent requests to share the in-memory graph without duplicating memory footprint across workers.

---

## Part 2: Deploy Frontend on Vercel

Vercel provides edge hosting and CDN delivery for the React + MapLibre GL UI.

### Step-by-Step Vercel Setup
1. Log in to your [Vercel Dashboard](https://vercel.com/dashboard).
2. Click **Add New...** → **Project**.
3. Import the GitHub repository: `rohitgaikwad6156/Safe-Route`.
4. Configure Project Settings:
   - **Framework Preset:** `Vite`
   - **Root Directory:** Click `Edit` and select `frontend` (or leave as root with the included `vercel.json`).
   - If `frontend` is selected:
     - **Build Command:** `npm run build`
     - **Output Directory:** `dist`
     - **Install Command:** `npm install`
5. **Environment Variables:**
   - Expand the **Environment Variables** section.
   - Add:
     - **Key:** `VITE_API_BASE_URL`
     - **Value:** `https://saferoute-ai-backend.onrender.com` *(replace with your actual Render URL from Part 1)*
6. Click **Deploy**.

---

## Part 3: Verification & Live Connection

1. **Verify Backend Health:**
   Open in your browser:
   ```text
   https://your-backend.onrender.com/health
   ```
   Expected response:
   ```json
   {
     "is_ready": true,
     "status": "ready",
     "total_nodes": 163829,
     "total_edges": 381045,
     "coverage_percentage": 99.91
   }
   ```

2. **Verify Frontend Live Status:**
   - Visit your Vercel deployment URL (e.g., `https://safe-route.vercel.app`).
   - Look at the top navigation bar:
     - When connected to Render, the green badge displays:
       `LIVE ENGINE READY (163,829 NODES)`.
     - If Render is still waking up from spin-down (cold start), SafeRoute AI gracefully shows:
       `OFFLINE LANDMARK REGISTRY` and preserves route rendering via offline heuristics.
