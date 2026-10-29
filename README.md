# CyberGuard AI

A cybersecurity analysis workspace built with React, FastAPI, and SQLite. Import security logs, correlate suspicious activity across files, investigate evidence, record decisions, retrieve defensive guidance, and export incident reports.

For a numbered public deployment guide covering GitHub, Render, the required persistent SQLite disk, environment variables, the deployed URL, and post-deploy checks, see [DEPLOY.md](DEPLOY.md). The feature and API roadmap is in [ADD.md](ADD.md).

## Quick start

Requires Node.js 22 and Python 3.11 or newer.

```powershell
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Without a backend, the app opens a labeled browser demo with sample events and localStorage persistence. It includes working local detection, imports, investigations, reports, and reference retrieval. Demo data stays separate from the connected database.

To enable the backend, run these commands in a second terminal from the repository root:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

On Linux/macOS, use `python3` and `.venv/bin/python`. In the dashboard, open **Settings → Reconnect**. The connected database starts empty; **Analyze logs → Use sample logs** demonstrates every detection family. API documentation is at http://127.0.0.1:8000/docs.

For a single-process local deployment, first run `npm run build`, then start FastAPI without `--reload`. FastAPI serves the built dashboard at http://127.0.0.1:8000 as well as the API.

## What is implemented

- Dashboard with evidence-based activity charts, severity counts, and incident status summaries.
- Threat explorer with text search, severity/status filters, risk sorting, and pagination. `Ctrl+K` / `Cmd+K` focuses search.
- Drag-and-drop JSON, JSON Lines, and CSV imports, with validation previews and actionable errors.
- Correlation across imports; SHA-256-based fingerprints skip identical normalized events.
- Source- and asset-aware detection, including repeated episodes and successful logins following failures.
- Investigation notes, rule-specific recommendations, and timestamped status/evidence history.
- Import history showing submitted, new, duplicate, and newly detected counts.
- Markdown reports with full evidence/history, structured JSON reports, and spreadsheet-safe CSV summaries.
- Workspace JSON export containing retained events and investigation records.
- Shared rule/reference catalog, local retrieval with explicit abstention for unrelated questions, and optional generative AI.
- Keyboard-accessible dialogs with focus trapping, focus restoration, Escape dismissal, a skip link, and responsive layouts.

## Log format

Each event requires:

| Field | Type | Meaning |
| --- | --- | --- |
| `timestamp` | string | ISO 8601 with timezone, at or after 1970-01-01 UTC |
| `source_ip` | string | Valid IPv4 or IPv6 address |
| `event` | string | Event type; recognized types below |
| `asset` | optional string | Destination/affected asset; use consistent names for correlation |
| `username` | optional string | Required for account correlation and password spray detection |
| `bytes` | optional integer | Non-negative transfer size in bytes |

```json
{"timestamp":"2026-10-26T10:00:00Z","source_ip":"192.0.2.1","event":"login_failed","asset":"auth-01","username":"alice"}
```

JSON arrays, individual JSON objects, and JSON Lines are accepted. CSV needs a header row:

```csv
timestamp,source_ip,event,asset,username,bytes
2026-10-26T10:00:00Z,192.0.2.1,login_failed,auth-01,alice,0
```

Maximum 2 MB and 10,000 events per import; maximum 20,000 unique retained events per workspace. Unknown event types are retained as context and do not trigger a rule. All-time scope is selected after imports so historical findings remain visible. Relative ranges use the current clock and exclude future timestamps.

Timestamps normalize to UTC milliseconds; source IPs normalize to canonical form. Event types are trimmed/lowercased; asset and username matching remains case sensitive. Extra non-reserved fields are retained as evidence. Field order and equivalent timezones do not create duplicates. Fields beginning with `_` are reserved and removed.

Include an `event_id` field when your source provides one, so distinct events with otherwise identical normalized fields remain distinguishable. Without it, fully identical records are treated as duplicates, including identical repeated records within one upload.

## Detection rules

Rules correlate by source IP **and asset** across all retained events. The authentication-success rule also requires the same username.

| Rule | Trigger | Severity / triage weight |
| --- | --- | --- |
| AUTH-001 | At least 5 failed logins in 10 minutes | High / 75 |
| AUTH-002 | Failed logins to at least 5 distinct usernames in 10 minutes | High / 75 |
| AUTH-003 | Successful login after at least 5 failures for the same account in 10 minutes | High / 75 |
| ACCESS-001 | At least 3 access denials in 10 minutes | Medium / 45 |
| PRIV-001 | Explicit `privilege_escalation` event | Critical / 95 |
| DATA-001 | `large_transfer` event of at least 100,000,000 bytes | High / 75 |

Risk weights are preliminary triage priorities, **not probabilities of compromise**. Legitimate activity can trigger these rules. Rules use bounded, non-overlapping detection windows; complex campaigns can yield multiple related findings. Late-arriving overlapping evidence preserves an existing incident identity when it can be matched. New evidence is recorded without automatically reopening resolved cases; analysts should review updated findings.

The catalog lives in `shared/catalog.json`; both engines read the same rule metadata and references. Changing a catalog threshold requires restarting/rebuilding the application. Rules are not dynamically editable in the UI.

## AI and reference retrieval

Set environment variables before starting FastAPI. `.env.example` documents them; `.env` files are **not automatically loaded**.

```powershell
$env:LLM_API_KEY = 'your-provider-key'
$env:LLM_BASE_URL = 'https://api.openai.com/v1'
$env:LLM_MODEL = 'gpt-4.1-mini'
```

The provider must support `/chat/completions`, `messages`, and `max_completion_tokens`. The configured model must be available in your account. The server limits AI generation to two concurrent requests, uses a timeout, and displays provider failures explicitly.

The API sends the entered question, minimal finding summary, and retrieved reference summaries. It does not send raw event evidence, analyst notes, source IPs, or asset names automatically. Questions are transmitted as entered, so avoid including secrets. Keys stay on the server. AI responses are labeled and require analyst review.

Without a key, the assistant returns **reference guidance, not generated AI**. Retrieval ranks three bundled summaries using keyword/tag relevance, includes source links, and abstains on unrelated questions. This is a compact local RAG foundation; it does not perform live document ingestion, vector search, or current threat intelligence lookups.

References:

- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)
- [NIST SP 800-61 Rev. 3](https://csrc.nist.gov/pubs/sp/800/61/r3/final)
- [OpenAI Chat Completions API](https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create)

## Access and data handling

Default binding is loopback for personal local use. To require a shared workspace token:

```powershell
$env:CYBERGUARD_TOKEN = 'a-long-random-private-value'
```

Enter it under **Settings → Workspace access token**. The browser retains it in sessionStorage and sends it in `X-Workspace-Token`. This is a shared-token control, not multi-user identity or role-based authorization. The API health route remains public; data and assistant routes require the configured token. Origin checking restricts state-changing browser requests; configure `CYBERGUARD_ALLOWED_ORIGINS` for an intentional frontend origin change.

SQLite defaults to `backend/cyberguard.sqlite3`; override with `CYBERGUARD_DB`. Transactions serialize imports and investigation edits. The server bounds request bodies to 4 MB, including chunked uploads. It redacts common credential field names recursively (`password`, `token`, `api_key`, `authorization`, cookies, etc.) before storing evidence. **Free-text messages, unusual secret field names, and analyst notes are not automatically sanitized.** Review sensitive content before import or sharing exports.

Browser storage failures produce a visible warning; in-memory work remains exportable. Workspace exports contain security evidence and should be handled privately. Automatic restore from a workspace export is not implemented; the normalized `events` array can be extracted and reimported within the normal import limits.

Before exposing the application beyond loopback, supply HTTPS, managed authentication/authorization, deployment-level rate limiting, secret management, and a retention/backup policy. The application does not ingest live agents, block traffic, or execute remediation actions.

## Docker

```powershell
docker build -t cyberguard-ai .
docker run --rm -p 127.0.0.1:8000:8000 -v cyberguard-data:/data --env-file .env cyberguard-ai
```

Create `.env` from the documented example before using `--env-file`, or omit that argument for local reference-only mode. The container runs as an unprivileged user and serves the dashboard/API on port 8000. Docker execution has not been verified in the current restricted environment.

## Checks

```powershell
npm test
npm run check:render
npm run build
py -m unittest backend.test_engine backend.test_store backend.test_api
```

JavaScript tests cover detection boundaries, normalization, credential redaction, CSV parsing, cross-import correlation, duplicate skipping, late evidence, investigation preservation, retrieval abstention, report safety, and SHA-256 correctness. The render smoke check verifies the dashboard can render; it does not replace browser layout/interaction testing. Backend tests cover detection, SQLite transactions, API validation, access tokens, and provider failure handling. GitHub Actions runs the frontend checks and backend tests on Python 3.11/3.13.

Current local verification: frontend tests, render smoke check, and production build pass. Both installed Python launchers return **Access is denied**, so backend tests remain unexecuted here. Browser visual verification was unavailable following an app-access approval timeout. Live provider responses require a configured key and have not been tested.

## Repository structure

```text
src/App.jsx                  Dashboard and workspace navigation
src/components/              Investigation, imports, rules, chart, connection UI
src/lib/engine.js            Browser validation, normalization, detection, retrieval
src/lib/workspace.js         Browser ingestion and investigation persistence model
src/lib/useWorkspace.js      Connected/demo state and API orchestration
src/lib/reports.js           Report generation and CSV safety
backend/engine.py            Python validation, detection, and retrieval
backend/store.py             SQLite transactions and investigation records
backend/main.py              FastAPI endpoints and optional AI provider
backend/middleware.py        Bounded request-body handling
shared/catalog.json          Shared rules and source references
tests/                       JavaScript regression tests
```

CyberGuard AI supports human investigation. It does not establish that an attack occurred and cannot detect every attack.
