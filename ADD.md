# What to Add to CyberGuard AI

This is a practical roadmap for turning the current demo into a useful, connected security monitoring tool. Start with the first section; later items depend on it.

For a complete, step-by-step hosting procedure for this project, follow [DEPLOY.md](DEPLOY.md). It covers GitHub, Render, the public URL, environment variables, SQLite persistence, and deployment checks.

## 1. Connect an AI provider

The project already supports a server-side, OpenAI-compatible Chat Completions endpoint. To try it, you need an API key from a provider that supports that endpoint and an available model name.

1. Create an API key with your chosen provider.
2. Set these variables in the **FastAPI server environment** before starting the backend:

   ```text
   LLM_API_KEY=your-provider-key
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_MODEL=gpt-4.1-mini
   ```

3. Restart FastAPI and refresh the dashboard. The Settings page should show whether AI is configured.
4. Ask the assistant to explain a finding, and review its answer and references before using its suggestions.

The endpoint and model must support `POST /chat/completions` and `max_completion_tokens`. For another provider, use its documented API base URL and compatible model. Do not paste a provider key into React, browser storage, a log file, or a public repository. `.env.example` is a template, not an automatically loaded secrets file. For local development, place real values in a private, ignored `.env` file only if you also add server-side `.env` loading; otherwise export them in the shell before starting FastAPI.

**Provider choices:**

- A hosted OpenAI-compatible API: easiest path with the current integration. Check your account's model access and current pricing with the provider.
- A local model server: keeps prompts on your machine if configured locally; requires enough memory and a compatible chat endpoint.
- Another provider: add a small provider adapter if its request format, authentication, or response format differs.

The assistant sends the question, a minimal incident summary, and retrieved security references. It does not send raw evidence automatically. Questions are sent as entered, so avoid including secrets or personal data.

## 2. Add tests for the backend

Run the existing backend checks after installing `backend/requirements.txt`:

```powershell
py -m unittest backend.test_engine backend.test_store backend.test_api
```

If the Python launcher is unavailable, install Python 3.11 or newer and create a virtual environment. Add the backend tests to CI whenever Python becomes available in your build environment.

## 3. Connect real log sources

The dashboard currently analyzes files and pasted text; it does not collect live traffic. Add one ingestion method at a time:

- **Syslog:** receive events from a controlled collector; restrict the listener to trusted networks and authenticate or encrypt transport.
- **Wazuh:** read alerts from a Wazuh indexer/API using a read-only service account.
- **Suricata or Zeek:** ingest their JSON event streams and map source IP, destination IP, event, timestamp, and asset into the event schema.
- **Cloud identity/audit logs:** start with one provider and use a read-only role scoped to the specific log source.

For each connector, record a source name, event ID, ingestion time, and checkpoint. Use event IDs to prevent duplicate ingestion. Put credentials in the backend environment or a secret manager, never in the browser. Add backoff, connection health, and clear connector status before enabling scheduled collection.

## 4. Add carefully controlled threat-intelligence lookups

Possible enrichment services include **AbuseIPDB**, **AlienVault OTX**, or an organization-run **MISP** instance. Look up an indicator only when an analyst requests enrichment, or implement explicit opt-in and caching. Show the provider, time of lookup, and source links next to each result.

Before sending an IP or domain to an external service, make it clear in the UI that the indicator will leave the workspace. Internal addresses, customer indicators, and incident details can be sensitive. Never upload raw logs or files to an intelligence provider by default. Validate results and expiration dates; reputation scores are context, not proof of malicious activity.

## 5. Improve detection and investigation

- Add event-specific parsers for each selected log source instead of treating every vendor's events as interchangeable.
- Add detection tests and document each rule's fields, window, threshold, expected false positives, and response guidance.
- Add analyst-configurable rule thresholds with validation, version history, and a restore-defaults option.
- Add allowlists for known scanners and service accounts, scoped by rule and asset, with an expiry date and audit history.
- Add correlated indicators such as repeated MFA denials, unusual login locations, impossible travel, new admin accounts, and activity outside an asset's normal schedule.
- Add a severity override and false-positive disposition that records who made the decision and why.
- Preserve source event IDs so analysts can trace each finding back to the original record.

Treat risk scores as prioritization aids. Tune new rules against representative benign and suspicious logs before relying on them.

## 6. Add user accounts and access controls

Before hosting this for multiple people, add organizational sign-in (OIDC), roles such as viewer/analyst/admin, per-user audit records, session expiry, and secret rotation. The optional shared `CYBERGUARD_TOKEN` is only a simple single-workspace gate; it is not multi-user authentication or role-based access.

## 7. Scale storage and reporting when needed

- Keep SQLite for a single-user local installation.
- Consider PostgreSQL when multiple users or ingestion workers need concurrent access.
- Add data retention controls, encrypted backups, database migration tooling, and a tested restore process before production use.
- Add scheduled report generation and CSV/JSON integrations after report permissions and sharing rules are in place.

## Recommended order

1. Configure the AI key and verify the assistant against a sample incident.
2. Run backend tests on a machine with Python installed.
3. Select one real log source and implement a read-only ingestion connector.
4. Validate event mapping, deduplication, and detection results with test fixtures.
5. Add analyst tuning and investigation controls.
6. Add threat-intelligence lookups only after defining what indicators may leave the workspace.
7. Add identity, roles, database backups, and retention before inviting a team.

## Information to decide for the next development step

- Which AI provider and model will you use? Will it be hosted or local?
- Which log source should come first (for example, Wazuh, Suricata, cloud audit logs, or uploaded exports)?
- Is this for a personal local demo or a team deployment?
- What operating system will run the Python backend?

Until a provider key and real log source are configured, the sample workspace is for demonstration. The application supports human review; it does not block activity or establish that an attack occurred.
