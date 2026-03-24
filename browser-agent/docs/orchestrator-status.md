# La Gaitana Orchestrator — Current Status

*Last updated: 2026-03-08*

## What It Does

Two-stage pipeline for processing La Gaitana PO (purchase order) PDFs into WebFlor ERP orders:

1. **Extraction** (`POST /extract`): PO PDF → Claude agent extracts structured order data → stores `.md` in Supabase proposal metadata
2. **Entry** (`POST /enter`): Reads `.md` from proposal → Claude agent enters order into WebFlor ERP via MCP tools

## Architecture

```
Email with PO PDF attachment
    ↓
Gmail webhook → Supabase intake_event INSERT
    ↓
Supabase Edge Function: process-intake-agent (v10)
    ↓ (if org = La Gaitana && ORCHESTRATOR_URL is set)
    ↓ routes to external orchestrator, skips Supabase agent entirely
    ↓
┌─────────────────────────────────────────────┐
│ Orchestrator (FastAPI)                      │
│ POST /extract { intake_event_id, user_id }  │
│                                             │
│ Returns { status: "queued" } immediately    │
│ Background task:                            │
│   1. Download PO PDF from Supabase storage  │
│   2. Login to WebFlor (login.py)            │
│   3. Run order_extraction_agent.py          │
│   4. Store .md in proposal metadata         │
│   5. Log to ai_analysis_logs                │
└─────────────────────────────────────────────┘
    ↓
User reviews extracted order in dashboard
User clicks "Create Order"
    ↓
┌─────────────────────────────────────────────┐
│ POST /enter { proposal_id, user_id }        │
│                                             │
│ Returns { status: "queued" } immediately    │
│ Background task:                            │
│   1. Fetch proposal + webflor_order_md      │
│   2. Login to WebFlor                       │
│   3. Run webflor_agent_sdk.py --file <md>   │
│   4. Update erp_sync_status = completed     │
│   5. Log to ai_analysis_logs + order_events │
└─────────────────────────────────────────────┘
```

## Key Files

| File | Purpose |
|------|---------|
| `browser-agent/orchestrator.py` | FastAPI server — `/extract`, `/enter`, `/health` endpoints |
| `browser-agent/order_extraction_agent.py` | Claude Agent SDK — extracts PO PDF → `.md` |
| `browser-agent/webflor_agent_sdk.py` | Claude Agent SDK — enters order from `.md` into WebFlor |
| `browser-agent/webflor_mcp_server.py` | MCP server exposing WebFlor APIs (used by entry agent) |
| `browser-agent/login.py` | Playwright-based WebFlor login (gets session cookies) |
| `browser-agent/Dockerfile` | Python 3.11 + Playwright/Chromium + uv |
| `browser-agent/fly.toml` | Fly.io config (app: `browser-agent-dawn-sun-188`, region: `ewr`) |
| `supabase/functions/process-intake-agent/index.ts` | Edge function (v10) — routes La Gaitana to orchestrator |

## Deployment Options

### Option A: Fly.io (deployed but needs memory scaling)

- **App**: `browser-agent-dawn-sun-188`
- **URL**: `https://browser-agent-dawn-sun-188.fly.dev`
- **Region**: `ewr` (Newark)
- **Current VM**: 1 shared CPU, 1GB RAM
- **Issue**: Playwright+Chromium needs ~2GB minimum. Run `fly scale vm shared-cpu-2x --memory 2048` to fix.
- **Auto-stop/start**: Enabled (scales to 0 when idle)
- **Secrets set**: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `WEBFLOR_USER`, `WEBFLOR_PASS`, `WEBFLOR_BASE_URL`, `ANTHROPIC_API_KEY`, `ORGANIZATION_ID`

### Option B: Local + ngrok (for development/testing)

Three terminals needed:

```bash
# Terminal 1: ngrok tunnel
ngrok http --url=palma-unwarbled-ying.ngrok-free.dev 8080

# Terminal 2: orchestrator
cd browser-agent
uv run uvicorn orchestrator:app --host 0.0.0.0 --port 8080

# Terminal 3: whatever else
```

Then set the Supabase secret to point at the ngrok URL:
```bash
supabase secrets set ORCHESTRATOR_URL=https://palma-unwarbled-ying.ngrok-free.dev --project-ref laxhubapvubwwoafrewk
```

**Note**: The edge function includes `ngrok-skip-browser-warning: true` header to bypass ngrok's free-tier interstitial page.

## Supabase Edge Function Routing

In `process-intake-agent/index.ts` (deployed as v10):

- **La Gaitana org ID**: `81cf0716-45ee-4fe8-895f-d9af962f5fab`
- If `ORCHESTRATOR_URL` env var is set AND the intake event belongs to La Gaitana → forwards to `ORCHESTRATOR_URL/extract`
- If `ORCHESTRATOR_URL` is NOT set → falls through to the normal Supabase-based agent (la-gaitana-farms.ts)
- All other orgs are unaffected

## Environment Variables

### Orchestrator (.env / Fly secrets)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | `https://laxhubapvubwwoafrewk.supabase.co` |
| `SUPABASE_SECRET_KEY` | Service role key (has full DB access) |
| `ANTHROPIC_API_KEY` | For Claude Agent SDK calls |
| `WEBFLOR_BASE_URL` | `http://190.146.143.55:5522` |
| `WEBFLOR_USER` | WebFlor login username |
| `WEBFLOR_PASS` | WebFlor login password |
| `ORGANIZATION_ID` | `81cf0716-45ee-4fe8-895f-d9af962f5fab` |

### Supabase Edge Function Secrets

| Variable | Description |
|----------|-------------|
| `ORCHESTRATOR_URL` | URL of the orchestrator (Fly.io URL or ngrok URL). Unset = no routing, La Gaitana uses Supabase agent. |

## Status Tracking

All status is stored in `order_change_proposals.tags` (JSONB):

| Field | Values |
|-------|--------|
| `erp_sync_status` | `pending` → `in_progress` → `completed` / `failed` |
| `erp_started_at` | ISO timestamp |
| `erp_completed_at` | ISO timestamp |
| `erp_error` | Error message (if failed) |
| `webflor_order_id` | WebFlor order ID (if completed) |

Extraction output (`.md`) is stored in `order_change_proposals.metadata.webflor_order_md`.

## What's Working

- [x] Orchestrator code (`orchestrator.py`) — complete and tested
- [x] Dockerfile — builds and runs
- [x] Fly.io deployment — app exists, secrets set, health endpoint responds
- [x] Edge function routing — deployed as v10, La Gaitana routes to orchestrator
- [x] ngrok setup — static URL configured

## What's NOT Working / TODO

- [ ] **Fly.io memory**: Current 1GB VM is too small for Playwright. Need `fly scale vm shared-cpu-2x --memory 2048`
- [ ] **End-to-end test**: Haven't completed a full flow (email → extract → dashboard → enter → WebFlor order)
- [ ] **ORCHESTRATOR_URL secret**: Need to set in Supabase to either the Fly.io URL or ngrok URL depending on which mode you're using
- [ ] **Dashboard "Create Order" button**: Needs to call `POST /enter` (may need frontend changes in `DashboardGaitana.tsx`)
- [ ] **resolve-proposal edge function**: May need modifications to trigger `/enter` when user approves a La Gaitana proposal

## Quick Commands

```bash
# Kill stale process on port 8080
lsof -ti:8080 | xargs kill

# Start orchestrator locally
cd browser-agent && uv run uvicorn orchestrator:app --host 0.0.0.0 --port 8080

# Set Supabase secret for local dev
supabase secrets set ORCHESTRATOR_URL=https://palma-unwarbled-ying.ngrok-free.dev --project-ref laxhubapvubwwoafrewk

# Set Supabase secret for Fly.io production
supabase secrets set ORCHESTRATOR_URL=https://browser-agent-dawn-sun-188.fly.dev --project-ref laxhubapvubwwoafrewk

# Unset (disable routing, fall back to Supabase agent)
supabase secrets unset ORCHESTRATOR_URL --project-ref laxhubapvubwwoafrewk

# Scale Fly.io VM
fly scale vm shared-cpu-2x --memory 2048 -a browser-agent-dawn-sun-188

# Deploy to Fly.io
cd browser-agent && fly deploy

# Check Fly.io logs
fly logs -a browser-agent-dawn-sun-188

# Test health endpoint
curl https://browser-agent-dawn-sun-188.fly.dev/health

# Test extract endpoint locally
curl -X POST http://localhost:8080/extract \
  -H "Content-Type: application/json" \
  -d '{"intake_event_id": "<ID>", "user_id": "<ID>"}'
```
