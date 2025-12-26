# Teacher Duty Scheduler

A desktop application for automating teacher duty scheduling using AI (OCR) and Constraint Programming (Google OR-Tools).

## Architecture

- **Frontend**: Electron + React + TypeScript
- **Backend**: Python + FastAPI + OR-Tools
- **Database**: SQLite (local)

## Getting Started

1. Install Node.js (18+) and Python (3.11+)
2. Install dependencies:
   ```bash
   npm install
   cd apps/backend && pip install -r requirements.txt
   ```
3. Run development mode:
   ```bash
   npm run dev
   ```
