@echo off
REM Wrapper para ejecutar run-sync.ps1 desde CMD/doble-click
REM Procesa "ayer" por defecto, o acepta fecha como argumento

powershell.exe -ExecutionPolicy Bypass -File "%~dp0run-sync.ps1" %*
pause
