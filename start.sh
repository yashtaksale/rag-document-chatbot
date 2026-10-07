#!/usr/bin/env bash
# =============================================================================
# DocChat Production Startup Script (Linux / macOS / Cloud)
# =============================================================================

set -e

echo "============================================================"
echo " Starting DocChat Unified Application..."
echo "============================================================"

# Activate virtual environment if present
if [ -d "venv" ]; then
    echo "[*] Activating virtual environment (venv)..."
    source venv/bin/activate
fi

# Run pre-flight healthcheck
echo "[*] Running pre-flight system diagnostics..."
python -m backend.healthcheck || true

# Start FastAPI backend in background
echo "[*] Launching DocChat FastAPI Backend on port 8001..."
python -m uvicorn backend.api_server:app --host 0.0.0.0 --port 8001 &
BACKEND_PID=$!

trap "kill $BACKEND_PID 2>/dev/null || true" EXIT

# Start Next.js frontend
echo "[*] Launching DocChat Next.js Web Application on port 3001..."
npm run dev

