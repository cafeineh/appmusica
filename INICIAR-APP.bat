@echo off
setlocal
cd /d "%~dp0"

echo Iniciando App Musica...
where java >nul 2>nul || (echo Java 17 ou superior nao encontrado. Instale o JDK e tente novamente.& pause & exit /b 1)
where mvn >nul 2>nul || (echo Maven nao encontrado. Instale o Maven e tente novamente.& pause & exit /b 1)
where python >nul 2>nul || (echo Python nao encontrado. Instale o Python e tente novamente.& pause & exit /b 1)

start "App Musica - Backend" cmd /k "cd /d "%~dp0backend" && set APP_JWT_SECRET=local-only-change-before-production-123456789 && set APP_CORS_ORIGINS=http://localhost:5500,http://127.0.0.1:5500 && mvn spring-boot:run"
start "App Musica - Frontend" cmd /k "cd /d "%~dp0" && python -m http.server 5500 --directory frontend"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5500/login.html"
echo App iniciado em http://localhost:5500/login.html
echo Feche as duas janelas de terminal para parar o App Musica.
endlocal
