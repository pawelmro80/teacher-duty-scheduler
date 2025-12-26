#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "========================================"
echo "   URUCHAMIANIE PLANERA DYŻURÓW"
echo "========================================"

# 1. Sprzątanie
echo "🧹 Sprzątanie poprzednich procesów..."
pkill -f "uvicorn" 2>/dev/null
pkill -f "electron" 2>/dev/null
# Nie zabijamy wszystkich node, bo może coś innego działać, ale spróbujemy te z projektu
pkill -f "vite" 2>/dev/null

sleep 2

# 2. Start Backend
echo "🚀 Startowanie Serwera (Backend)..."
cd apps/backend
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
    python3 -m uvicorn main:app --host 127.0.0.1 --port 8765 > ../../backend.log 2>&1 &
    BACKEND_PID=$!
    echo "   ✅ Backend działa (PID: $BACKEND_PID)"
else
    echo "   ❌ BŁĄD: Nie znaleziono środowiska Python (venv)!"
    read -p "Naciśnij Enter aby zamknąć..."
    exit 1
fi

# 3. Start Frontend
echo "🖥️  Startowanie Aplikacji (Frontend)..."
cd ../../apps/electron
npm run dev > ../../frontend.log 2>&1 &
FRONTEND_PID=$!
echo "   ✅ Frontend uruchomiony"

echo "========================================"
echo "✅ Aplikacja gotowa! Okno powinno się pojawić."
echo "⚠️  NIE ZAMYKAJ TEGO OKNA, dopóki używasz programu."
echo "========================================"
echo "Naciśnij dowolny klawisz, aby ZAKOŃCZYĆ prac programu..."
read -n 1 -s

# Sprzątanie przy wyjściu
echo "Zamykanie..."
kill $BACKEND_PID 2>/dev/null
kill $FRONTEND_PID 2>/dev/null
pkill -P $$ 2>/dev/null
exit 0
