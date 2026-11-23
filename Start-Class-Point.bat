@echo off
setlocal
cd /d "%~dp0"

if not exist ".env" (
  echo Missing .env. Copy .env.example to .env and set DATABASE_URL and JWT secrets first.
  pause
  exit /b 1
)

if not exist "node_modules\@nestjs\core\package.json" (
  echo Installing backend dependencies...
  call npm.cmd ci
  if errorlevel 1 goto :failed
)

if not exist "frontend\node_modules\vite\package.json" (
  echo Installing frontend dependencies...
  call npm.cmd ci --prefix frontend
  if errorlevel 1 goto :failed
)

echo Generating Prisma client...
call npm.cmd run prisma:generate
if errorlevel 1 goto :failed

echo Building backend...
call npm.cmd run build
if errorlevel 1 goto :failed

echo Building app interface...
set "VITE_API_URL=/api"
call npm.cmd run build --prefix frontend
if errorlevel 1 goto :failed

if not exist "public" mkdir "public"
robocopy "frontend\dist" "public" /E /NFL /NDL /NJH /NJS /NC /NS /NP >nul
if errorlevel 8 goto :failed

set "NODE_ENV=production"
set "SERVE_FRONTEND=true"
set "HOST=127.0.0.1"
set "PORT=3000"

echo Starting the local CLASS POINT server...
start "" /B node "dist\main.js"

for /L %%i in (1,1,30) do (
  powershell -NoProfile -Command "try { $response = Invoke-WebRequest -Uri 'http://127.0.0.1:3000/api/auth/google/config' -TimeoutSec 2; if ($response.StatusCode -eq 200) { exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto :ready
  timeout /t 1 /nobreak >nul
)

echo CLASS POINT did not start. Check the error messages above and your database connection.
pause
exit /b 1

:ready
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3000
) else if exist "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe" --app=http://127.0.0.1:3000
) else (
  start "" http://127.0.0.1:3000
)

echo CLASS POINT is running locally. Keep this window open while using the app.
echo Press Ctrl+C in this window to stop the local server.
:keep_running
timeout /t 3600 /nobreak >nul
goto :keep_running

:failed
echo A setup or build step failed. Review the message above.
pause
exit /b 1
