@echo off
REM ===================================================================
REM  Publica el asistente de IA para que Vercel (y quien tenga el enlace)
REM  pueda usarlo.
REM
REM  Abre DOS ventanas y las deja corriendo:
REM    1. El candado  - exige token y bloquea las rutas peligrosas de Ollama
REM    2. El tunel    - expone ese candado a Internet con ngrok
REM
REM  Uso: doble clic en este archivo, o desde una terminal:
REM       scripts\tunel-ia.cmd
REM
REM  Para APAGARLO: cierra las dos ventanas. Con eso tu GPU vuelve a ser
REM  inalcanzable desde fuera.
REM
REM  El token NO vive aqui (este repositorio es publico): se lee de la
REM  variable de usuario NEXUS_PROXY_TOKEN de Windows.
REM ===================================================================

cd /d "%~dp0.."

if "%NEXUS_PROXY_TOKEN%"=="" (
  echo.
  echo  ERROR: falta la variable NEXUS_PROXY_TOKEN.
  echo.
  echo  Configurala una sola vez con:
  echo      setx NEXUS_PROXY_TOKEN "tu-token-largo"
  echo  y vuelve a abrir la terminal para que tome efecto.
  echo.
  pause
  exit /b 1
)

echo Abriendo el candado y el tunel...
start "NexusForge - candado de IA" cmd /k "cd /d %~dp0.. && node scripts\ollama-proxy.mjs"

REM Pausa breve: si ngrok arranca antes que el candado, reporta el puerto caido.
timeout /t 3 /nobreak >nul

start "NexusForge - tunel ngrok" cmd /k "ngrok http 11435"

echo.
echo  Listo. Se abrieron dos ventanas:
echo    - "candado de IA"  : deja constancia de quien toca la puerta
echo    - "tunel ngrok"    : ahi sale la URL publica (Forwarding)
echo.
echo  Copia esa URL y ponla en Vercel como OLLAMA_BASE_URL, luego Redeploy.
echo  Si tienes dominio fijo de ngrok, la URL no cambia y no hay que tocar nada.
echo.
pause
