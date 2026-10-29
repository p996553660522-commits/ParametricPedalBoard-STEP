@echo off
setlocal
cd /d "%~dp0"
if not exist ".venv-step\Scripts\python.exe" (
  echo Install Python 3.12 first if py -3.12 is unavailable.
  py -3.12 -m venv .venv-step
  if errorlevel 1 goto failed
)
.venv-step\Scripts\python.exe -c "import cadquery" >nul 2>&1
if errorlevel 1 (
  .venv-step\Scripts\python.exe -m pip install -r step\requirements.txt
  if errorlevel 1 goto failed
)
echo Open http://127.0.0.1:8123/?lang=en
.venv-step\Scripts\python.exe step\server.py
goto :eof
:failed
echo STEP setup failed. See STEP.md for manual installation.
pause
