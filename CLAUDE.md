# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Factory Inventory Management System Demo with GitHub integration - Full-stack application with Vue 3 frontend, Python FastAPI backend, and in-memory mock data (no database).

## Critical Tool Usage Rules

### Subagents
Use the Task tool with these specialized subagents for appropriate tasks:

- **vue-expert**: Use for Vue 3 frontend features, UI components, styling, and client-side functionality
  - Examples: Creating components, fixing reactivity issues, performance optimization, complex state management
  - **MANDATORY RULE: ANY time you need to create or significantly modify a .vue file, you MUST delegate to vue-expert**
- **code-reviewer**: Use after writing significant code to review quality and best practices
- **Explore**: Use for understanding codebase structure, searching for patterns, or answering questions about how components work
- **general-purpose**: Use for complex multi-step tasks or when other agents don't fit

### Skills
- **backend-api-test** skill: Use when writing or modifying tests in `tests/backend` directory with pytest and FastAPI TestClient

### MCP Tools
- **ALWAYS use GitHub MCP tools** (`mcp__github__*`) for ALL GitHub operations
  - Exception: Local branches only - use `git checkout -b` instead of `mcp__github__create_branch`
- **ALWAYS use Playwright MCP tools** (`mcp__playwright__*`) for browser testing
  - Test against: `http://localhost:3000` (frontend), `http://localhost:8001` (API)

## Stack
- **Frontend**: Vue 3 + Composition API + Vite (port 3000)
- **Backend**: Python FastAPI (port 8001)
- **Data**: JSON files in `server/data/` loaded via `server/mock_data.py`

## Commands

### Backend
```bash
cd server
uv run python main.py          # Start dev server
```

### Frontend
```bash
cd client
npm install && npm run dev     # Start dev server
npm run build                  # Production build → client/dist/
```

### Tests (backend only — no frontend unit tests)
```bash
cd tests
uv run pytest -v                                    # All 51 tests
uv run pytest backend/test_inventory.py -v         # Single file
uv run pytest backend/test_orders.py::test_name -v # Single test
uv run pytest --cov=../server --cov-report=html    # With coverage
```

## Architecture

### Filter System
4 global filters (Time Period, Warehouse, Category, Order Status) live in `client/src/composables/useFilters.js` as a singleton. All views read from this via `getCurrentFilters()`, pass values to `api.js`, which appends them as query params (skipping `'all'` values). FastAPI's `apply_filters()` and `filter_by_month()` handle server-side filtering.

**Important**: Inventory endpoints don't support month/time-period filter (no time dimension in inventory data).

### Data Flow
Vue view → `useFilters` composable → `api.js` (Axios, base URL `http://localhost:8001/api`) → FastAPI → in-memory JSON → Pydantic validation → computed properties in component

### Frontend Composables
- `useFilters.js` — singleton filter state; maps `selectedLocation` → `warehouse`, `selectedPeriod` → `month` for API calls
- `useI18n.js` — English/Japanese localization stored in localStorage; auto-switches currency (USD for `en`, JPY for `ja` at 1:150 rate)
- `useAuth.js` — mock auth, always authenticated; user profile and tasks adapt to locale

### Backend Structure
- `server/mock_data.py` — loads all JSON files into module-level variables at startup; changes don't persist across restarts
- `server/main.py` — all endpoints, Pydantic models, CORS middleware (allow all origins), and filter utilities
- Quarter notation `Q1-2025` and direct month `2025-01` both work in time-period filters

## API Endpoints
- `GET /api/inventory` — Filters: warehouse, category
- `GET /api/orders` — Filters: warehouse, category, status, month
- `GET /api/dashboard/summary` — All filters; computes total_inventory_value, low_stock_items, pending_orders, total_orders_value
- `GET /api/demand`, `/api/backlog` — No filters; backlog adds `has_purchase_order` flag dynamically
- `GET /api/spending/*` — summary, monthly, categories, transactions
- `GET /api/reports/quarterly`, `/api/reports/monthly-trends` — No filters
- `GET/POST/DELETE/PATCH /api/tasks` — Mock task management
- `POST /api/purchase-orders` — Create purchase order linked to backlog item

## Common Issues
1. Use unique keys in v-for (not `index`) — use `sku`, `month`, etc.
2. Validate dates before `.getMonth()` calls
3. Update Pydantic models when changing JSON data structure
4. Inventory filters don't support month (no time dimension)
5. Revenue goals: $800K/month single warehouse, $9.6M YTD all months

## File Locations
- Views: `client/src/views/*.vue`
- Composables: `client/src/composables/` (useFilters, useI18n, useAuth)
- API Client: `client/src/api.js`
- Backend: `server/main.py`, `server/mock_data.py`
- Data: `server/data/*.json`
- Tests: `tests/backend/`
- Styles/layout: `client/src/App.vue`

## Design System
- Colors: Slate/gray (#0f172a, #64748b, #e2e8f0)
- Status: green/blue/yellow/red
- Charts: Custom SVG, CSS Grid for layouts
- No emojis in UI

## Code Style
- Always document non-obvious logic changes with comments
