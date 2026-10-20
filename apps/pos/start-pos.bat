@echo off
REM Double-click to start FitSecret POS on this PC. Add a shortcut to shell:startup to launch on boot.
cd /d "%~dp0"
start "" http://localhost:4321
node server\index.js
