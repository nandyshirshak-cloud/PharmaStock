# PharmaStock Startup Upgrade

Replace:
- backend/server.js
- frontend/src/App.jsx
- frontend/src/App.css

Do NOT delete `backend/pharmacy.db`.

The backend upgrade adds:
- inventory_history table + APIs
- automatic stock movement logging
- smart reorder recommendations
- purchase totalCost response
- sale stock-history logging

The frontend upgrade adds:
- startup-style dashboard
- Smart Reorder panel
- sales recording/history
- purchase recording/history
- inventory filters/search
- stock history
- Excel import
- medicine CRUD
