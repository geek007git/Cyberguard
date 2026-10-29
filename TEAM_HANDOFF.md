# CyberGuard AI — Team Handoff

**Purpose:** Give the receiving team enough context to continue development, verify the current implementation, and decide how to deploy it.

## Project at a glance

CyberGuard AI is a cybersecurity decision-support application. It analyzes uploaded security logs, correlates suspicious events, explains findings, supports analyst investigation, and generates reports. The intended audience is a security analyst reviewing preliminary findings. The product does not currently monitor devices continuously, block traffic, or prove that an attack occurred.

## Current state

The repository contains a working React/Vite dashboard, a FastAPI backend, SQLite persistence, a shared detection/reference catalog, a Docker image, CI configuration, and local deployment instructions.

Implemented workflows include JSON, JSON Lines, and CSV log imports; cross-import deduplication and correlation; six documented rule families; incident status changes and analyst notes; import history; severity/search/risk filters; workspace export; Markdown, JSON, and CSV reports; keyword-based retrieval over bundled OWASP and NIST reference summaries; and an optional, server-side OpenAI-compatible Chat Completions connection.

The dashboard works in a browser demo without the backend. The connected workspace requires the FastAPI service. The frontend dev server was started during development at `http://127.0.0.1:5173`; confirm whether it is still running before relying on it.

## Verification status to share with the team

The recorded frontend checks passed: 22 JavaScript tests, a server-render smoke check, and a production Vite build. A 10,000-event local-browser analysis benchmark completed successfully.

Python could not be executed in the development environment because both installed Python launchers returned “Access is denied.” The FastAPI, SQLite, and Python engine tests therefore remain unrun here. Docker image creation, a live Render deployment, browser interaction/layout testing, and a live LLM response also remain unverified. The Docker startup command was recently adjusted to honor the platform-provided `PORT`; include it in the receiving team's Docker and deployment review.

Do not describe the backend or public deployment as fully verified until those checks pass in an environment that can run Python and Docker.

## Recommended next steps

1. **Review the code and current working tree.** Confirm the Dockerfile, `PORT` handling, CORS/origin settings, SQLite path, private-repository configuration, CI workflow, and secret exclusions. Keep `.env`, database files, tokens, provider keys, and real security logs out of Git.
2. **Set up Python 3.11 or newer locally or in CI.** Create a virtual environment, install `backend/requirements.txt`, and run:

   ```powershell
   py -m unittest backend.test_engine backend.test_store backend.test_api
   ```

   Review and fix any failures before putting the API online.
3. **Test the whole application locally.** Start FastAPI on `127.0.0.1:8000`, start Vite on `127.0.0.1:5173`, connect the dashboard to the API, import a non-sensitive test fixture, verify deduplication and status/note persistence, and export a report. Use demo mode for sample logs; keep synthetic sample findings out of a production incident database.
4. **Choose the first real data source.** This version only processes uploaded or pasted logs. If adding Wazuh, Suricata/Zeek, cloud audit logs, or syslog, implement one read-only connector first, normalize its fields, preserve source event IDs, and test duplicate handling. Make external indicator sharing opt-in.
5. **Choose an AI provider only if needed.** No provider key is included in this repository. If the team enables AI, add the key as a backend/hosting secret; set and verify the provider URL/model; test error handling and data boundaries. Questions are sent to the provider as entered. The assistant receives a minimal incident summary and retrieved references, not raw event evidence automatically.
6. **Decide whether the deployment is a demo or a team service.** The optional `CYBERGUARD_TOKEN` is a shared token, not individual sign-in or role-based access. A team deployment needs organizational authentication, user roles, a defined retention period, and a tested backup/restore plan before wider use.
7. **Deploy only after the previous review.** Follow [DEPLOY.md](DEPLOY.md) for the suggested Render Docker deployment. SQLite must be on a persistent disk at `/data`; a diskless/free web service can lose the database on restart or redeploy. Set a private workspace token and the exact deployed origin. Verify the health endpoint, connected UI, authenticated export, restart/redeploy persistence, and private backup procedure.

## Local run commands

Frontend, from the project root:

```powershell
npm ci
npm run dev
```

Backend, from a second terminal:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

If the Python launcher is blocked on the current machine, use a workstation or CI runner with Python 3.11 or newer. API documentation is available locally at `http://127.0.0.1:8000/docs` when FastAPI is running.

## Key design and operational constraints

- **Detection:** The thresholds and event descriptions live in `shared/catalog.json`. Rules are preliminary heuristics; legitimate behavior may trigger findings. Threshold changes need a code change and rebuild.
- **Event identity:** Exact normalized duplicate events are deduplicated. Provide a stable, unique `event_id` where the source supplies one, especially when otherwise-identical events can be distinct.
- **Data privacy:** Common credential field names are redacted. Free-text messages and analyst notes are not automatically sanitized; review logs before import and exports before sharing.
- **Retrieval:** The current assistant ranks three bundled reference summaries using keyword/tag matching. It is not a live documentation crawler, vector database, comprehensive RAG corpus, or threat-intelligence feed.
- **Storage:** SQLite supports this single-instance deployment shape. Render persistent disks attach to one instance; this setup is not horizontal multi-instance storage. JSON workspace exports contain security evidence and should be protected.
- **Access:** The optional shared access token does not establish individual identity or separate analyst permissions. Never treat it as an enterprise identity system.
- **Response:** The software provides decision support; it does not automatically block, isolate, revoke, or remediate anything.

## Repository guide

| Path | Purpose |
| --- | --- |
| `src/App.jsx` | Dashboard and incident workflows |
| `src/components/` | Chart, imports, rules, connection, and investigation UI |
| `src/lib/engine.js` | Browser log validation, normalization, detection, and retrieval |
| `src/lib/workspace.js` | Browser demo persistence and import model |
| `src/lib/useWorkspace.js` | API connection and workspace state |
| `backend/engine.py` | Python log validation, detection, and reference retrieval |
| `backend/store.py` | SQLite storage, deduplication, and investigation updates |
| `backend/main.py` | FastAPI endpoints and optional LLM requests |
| `backend/middleware.py` | Request-size limit |
| `shared/catalog.json` | Detection rules and reference summaries shared by both implementations |
| `tests/` | JavaScript detection and workspace tests |
| `backend/test_*.py` | Python engine, SQLite, and API tests |
| `.github/workflows/ci.yml` | Frontend and Python CI checks |
| `Dockerfile` | Multi-stage frontend build and FastAPI runtime |
| `ADD.md` | Feature/API roadmap |
| `DEPLOY.md` | Numbered deployment guide |

## Handoff decision

Before accepting a production launch, the project team should report which Python tests pass, whether the container builds and starts on a dynamic `PORT`, whether a browser can connect with the configured token and allowed origin, whether records survive a persistent-disk redeploy, and where backups are stored. Document the chosen hosting account, AI provider, first log source, and named owner for credentials and retention policy outside this repository.
