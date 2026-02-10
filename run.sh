#!/bin/bash

# Hatchly Flask App Startup Script

echo "🦐 Starting Hatchly Flask Application..."
echo ""

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Virtual environment not found!"
    echo "Creating virtual environment..."
    python3 -m venv venv
    echo "✅ Virtual environment created"
    echo ""
fi

# Activate virtual environment
echo "🔄 Activating virtual environment..."
source venv/bin/activate

# Install dependencies if needed
if [ ! -f "venv/installed" ]; then
    echo "📦 Installing dependencies..."
    pip install -r requirements.txt
    touch venv/installed
    echo "✅ Dependencies installed"
    echo ""
fi

# Check if MySQL is running
echo "🔍 Checking MySQL connection..."
if ! command -v mysql &> /dev/null; then
    echo "⚠️  MySQL client not found. Please install MySQL."
else
    echo "✅ MySQL client found"
fi

echo ""
echo "🚀 Starting Flask application..."
echo "📍 App will be available at: http://localhost:5000"
echo "Press Ctrl+C to stop the server"
echo ""

# Run the Flask app
python app.py
