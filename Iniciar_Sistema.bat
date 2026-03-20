@echo off
title Sistema de Tesoreria - Servidor
echo ==========================================
echo    INICIANDO SISTEMA DE TESORERIA
echo ==========================================
echo.
cd /d "C:\Users\jsanz\Desktop\Antigravity\SIistema de Tesoreria"

:: Usamos cmd /k para que la ventana se quede abierta si hay un error
echo Iniciando servidor en una ventana separada...
start "Servidor Local - Iciz Market" cmd /k "npm run dev"

echo Esperando a que el servidor arranque (8 segundos)...
timeout /t 8 /nobreak > nul

echo Abriendo el navegador...
start http://localhost:3001

echo.
echo ==========================================
echo    SISTEMA INICIADO CORRECTAMENTE
echo ==========================================
echo La ventana negra que se abrio contiene el servidor (dejala abierta/minimizada).
echo Esta ventana se cerrara automaticamente en 5 segundos.
timeout /t 5 > nul
exit
