@echo off
cd /d "%~dp0"
set PSQL="C:\Program Files\PostgreSQL\18\bin\psql.exe"
set PGPASSWORD=Gunslinger90+*/

echo Creating database yimmenu_auth...
%PSQL% -U postgres -c "CREATE DATABASE yimmenu_auth;"

echo Running SQL script...
%PSQL% -U postgres -d yimmenu_auth -f database.sql

echo Verifying tables...
%PSQL% -U postgres -d yimmenu_auth -c "\dt"

echo Done! Now run: npm start
pause
