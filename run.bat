@echo off
REM Hatchly Flask App Startup Script for Windows

echo ========================================
echo    Hatchly Flask Application
echo ========================================
echo.

REM Check if virtual environment exists
if not exist "venv" (
    echo Creating virtual environment...
    python -m venv venv
    echo Virtual environment created!
    echo.
)

REM Activate virtual environment
echo Activating virtual environment...
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing dependencies...
pip install -r requirements.txt
echo.

REM Check MySQL
echo Checking system...
echo Make sure MySQL is running!
echo.

REM Run the app
echo Starting Flask application...
echo App will be available at: http://localhost:5000
echo Press Ctrl+C to stop the server
echo.

python app.py

pause
