# Acad Assist — Frontend

React + Vite frontend that connects **exactly** to your study planning RAG backend.  
Every API call maps 1-to-1 with a real router endpoint. Nothing fabricated.

---

## Project Structure

```
acad-assist-frontend/
├── src/
│   ├── api/
│   │   └── index.js              # Every real backend endpoint + SSE helpers
│   ├── context/
│   │   └── AuthContext.jsx       # Google OAuth login, token storage, auto-refresh
│   ├── components/
│   │   └── Layout.jsx            # Sidebar + topbar shell
│   ├── pages/
│   │   ├── LoginPage.jsx         # POST /auth/google via Google GSI
│   │   ├── DashboardPage.jsx     # GET /schedules + GET /schedules/{id}/plan/sessions
│   │   ├── SchedulesPage.jsx     # Full CRUD: POST/GET/PATCH/DELETE /schedules
│   │   ├── ScheduleDetailPage.jsx # POST/GET/DELETE documents + ingest-status polling
│   │   ├── PlanPage.jsx          # generate-async → operation stream → revise → confirm → sync-calendar
│   │   ├── SessionPage.jsx       # start → briefing stream → session chat → complete → sidebar
│   │   └── ScheduleChatPage.jsx  # POST /schedules/{id}/chat SSE + history + clear
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.example
├── index.html
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

---

## Quick Start

```bash
cd acad-assist-frontend
npm install
cp .env.example .env.local
# Edit .env.local with your values
npm run dev
# → http://localhost:3000
```

---

## Environment Variables

```env
VITE_API_URL=http://localhost:8000          # FastAPI backend
VITE_GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
```

---

## Required: FastAPI CORS

Your backend **must** allow the frontend origin with credentials (for the refresh-token cookie):

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],   # add prod domain too
    allow_credentials=True,                    # required for cookie
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Endpoint Map — every call in the frontend

### AUTH
| Method | Path | Used in |
|--------|------|---------|
| POST | `/auth/google` | LoginPage |
| POST | `/auth/refresh` | api/index.js (auto on 401) |
| POST | `/auth/logout` | Layout → logout button |

### SCHEDULES
| Method | Path | Used in |
|--------|------|---------|
| GET | `/schedules` | DashboardPage, SchedulesPage |
| POST | `/schedules` | SchedulesPage → Create modal |
| GET | `/schedules/{id}` | ScheduleDetailPage, PlanPage |
| PATCH | `/schedules/{id}` | SchedulesPage → inline rename |
| DELETE | `/schedules/{id}` | SchedulesPage → delete card |

### DOCUMENTS
| Method | Path | Used in |
|--------|------|---------|
| POST | `/schedules/{id}/documents` | ScheduleDetailPage → upload zone |
| GET | `/schedules/{id}/documents` | ScheduleDetailPage |
| DELETE | `/schedules/{id}/documents/{doc_id}` | ScheduleDetailPage |
| GET | `/schedules/{id}/documents/{doc_id}/ingest-status` | ScheduleDetailPage — polled every 3s |

### PLAN
| Method | Path | Used in |
|--------|------|---------|
| POST | `/schedules/{id}/plan/generate-async` | PlanPage → Generate button |
| GET | `/schedules/{id}/plan/sessions` | PlanPage, DashboardPage |
| PATCH | `/schedules/{id}/plan` | PlanPage → Revise input |
| POST | `/schedules/{id}/plan/confirm` | PlanPage → Confirm button |
| POST | `/schedules/{id}/plan/sync-calendar` | PlanPage → Sync Calendar button |
| DELETE | `/schedules/{id}/plan` | PlanPage → Delete Plans button |

### OPERATIONS (SSE)
| Method | Path | Used in |
|--------|------|---------|
| GET (SSE) | `/operations/{id}/stream` | PlanPage → streams generation logs |

### SCHEDULE CHAT
| Method | Path | Used in |
|--------|------|---------|
| POST (SSE) | `/schedules/{id}/chat` | ScheduleChatPage |
| GET | `/schedules/{id}/chat/history` | ScheduleChatPage |
| DELETE | `/schedules/{id}/chat/history` | ScheduleChatPage → Clear button |

### SESSIONS
| Method | Path | Used in |
|--------|------|---------|
| POST | `/sessions/{id}/start` | SessionPage → on mount |
| GET (SSE) | `/sessions/{id}/briefing/stream` | SessionPage → briefing card |
| POST (SSE) | `/sessions/{id}/chat` | SessionPage → chat input |
| GET | `/sessions/{id}/chat/history` | SessionPage → on mount |
| POST | `/sessions/{id}/complete` | SessionPage → Complete button |
| GET | `/sessions/{id}/sidebar` | SessionPage → sidebar panel |

---

## User Flow (mirrors backend exactly)

```
POST /auth/google
  ↓
GET /schedules                    (Dashboard)
  ↓
POST /schedules                   (Create schedule)
  ↓
POST /schedules/{id}/documents    (Upload documents)
GET  /schedules/{id}/documents/{doc_id}/ingest-status  ← polls every 3s
  ↓  (all docs = "completed")
POST /schedules/{id}/plan/generate-async
GET  /operations/{id}/stream      ← live logs
  ↓  (operation done)
GET  /schedules/{id}/plan/sessions   (review)
PATCH /schedules/{id}/plan           (optional revise)
POST /schedules/{id}/plan/confirm    (create sessions)
POST /schedules/{id}/plan/sync-calendar  (optional)
  ↓
POST /sessions/{id}/start
GET  /sessions/{id}/briefing/stream  ← SSE briefing
POST /sessions/{id}/chat             ← SSE RAG chat
POST /sessions/{id}/complete
  ↓
POST /schedules/{id}/chat  (global RAG chat anytime)
```

---

## SSE Handling

Two patterns are used, matching how your backend exposes each endpoint:

**EventSource (GET)** — briefing stream, operation logs  
Token passed as `?token=...` query param since `EventSource` can't set headers.

**fetch + ReadableStream (POST)** — chat endpoints  
Used because `EventSource` only supports GET. The stream reads `data: {...}\n\n` lines.

Expected event shapes from your backend:
```json
{ "type": "delta",   "content": "..." }
{ "type": "sources", "sources": [...] }
{ "type": "done" }
{ "message": "...", "level": "info" }   // operation logs
{ "delta": "..." }                       // briefing
```

---

## Tech Stack

| Tool | Version |
|------|---------|
| React | 18 |
| React Router | v6 |
| Vite | 5 |
| Tailwind CSS | 3 |
| Lucide React | 0.383 |
| DM Sans + DM Mono | Google Fonts |
