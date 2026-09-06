@echo off
setlocal
cd /d "%~dp0"

echo Iniciando App Musica...
where java >nul 2>nul || (echo Java 17 ou superior nao encontrado. Instale o JDK e tente novamente.& pause & exit /b 1)
start "App Musica - Frontend" /D "%~dp0" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0serve-frontend.ps1" -Port 5501

where mvn >nul 2>nul
if %errorlevel%==0 (
	start "App Musica - Backend" /D "%~dp0backend" cmd /k "set APP_JWT_SECRET=local-only-change-before-production-123456789&& set APP_CORS_ORIGINS=http://localhost:5501,http://127.0.0.1:5501&& mvn spring-boot:run"
) else if exist "%~dp0backend\target\app-musica-backend-0.0.1-SNAPSHOT.jar" (
	start "App Musica - Backend" /D "%~dp0backend" cmd /k "set APP_JWT_SECRET=local-only-change-before-production-123456789&& set APP_CORS_ORIGINS=http://localhost:5501,http://127.0.0.1:5501&& java -jar target\app-musica-backend-0.0.1-SNAPSHOT.jar"
) else (
	echo Maven nao encontrado e o JAR do backend nao existe.
	echo O frontend sera aberto, mas login e upload precisarao do backend.
	echo Instale Maven ou baixe o JAR compilado para backend\target\.
)

timeout /t 3 /nobreak >nul
start "" "http://localhost:5501/login.html"
echo App iniciado em http://localhost:5501/login.html
echo Feche as duas janelas de terminal para parar o App Musica.
endlocal
