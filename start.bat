@echo off
title DocChat Unified Launcher
echo ============================================================
echo  Starting DocChat Unified Application (Claude/ChatGPT UI + RAG)
echo ============================================================

:: Check if virtual environment exists
if exist "venv\Scripts\activate.bat" (
    echo [*] Activating Python virtual environment [venv]...
    call venv\Scripts\activate.bat
) else (
    echo [!] No venv found, using system Python.
)

:: Run pre-flight healthcheck
echo [*] Running pre-flight system diagnostics...
python -m backend.healthcheck
if %ERRORLEVEL% neq 0 (
    echo [!] Pre-flight check encountered warnings, continuing launch...
)

:: Launch Python RAG FastAPI Backend in background
echo [*] Launching DocChat RAG API Backend on http://127.0.0.1:8001 ...
start "DocChat Backend (FastAPI)" /min cmd /c "if exist venv\Scripts\activate.bat (call venv\Scripts\activate.bat) && python -m uvicorn backend.api_server:app --host 127.0.0.1 --port 8001"

:: Launch Next.js Claude/ChatGPT Frontend
echo [*] Launching DocChat Web Application on http://localhost:3001 ...
start http://localhost:3001
npm run dev
pause

