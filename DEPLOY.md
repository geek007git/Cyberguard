# Deploy CyberGuard AI

This guide deploys the React dashboard and FastAPI backend together as **one Docker web service on Render**, connected to a **private GitHub repository**. It matches the current Dockerfile and keeps the SQLite database on a persistent disk.

## What you will need

- This project folder on your computer.
- A [GitHub account](https://github.com/) and Git installed.
- A [Render account](https://render.com/), connected to GitHub.
- About 20 minutes.
- Optionally, an AI provider API key. You can deploy without one; reference-based guidance still works.

Render's current lowest paid web service is about **US$6/month**, and a 1 GB persistent disk is about **US$0.25/month**: roughly **US$6.25/month**, before taxes, bandwidth overages, or changes to Render's pricing. Check the live dashboard total before creating the paid service. Render's free web service has an ephemeral filesystem and cannot attach the persistent disk this SQLite deployment needs. [Render pricing](https://render.com/pricing), [free service limits](https://render.com/docs/free), [persistent disks](https://render.com/docs/disks)

## Step 1: Check the project before publishing it

Open **PowerShell** and go to your project folder:

```powershell
Set-Location "E:\SANCHI-proj'"
```

Run the frontend checks and build:

```powershell
npm ci
npm test
npm run check:render
npm run build
```

Python is required only for the local backend tests. The Docker build will install the backend requirements on Render.

## Step 2: Create a private GitHub repository

1. On GitHub, create a **new private repository** named `cyberguard-ai`.
2. Leave the README, license, and `.gitignore` options unchecked; those files already exist here.
3. Keep your API key, workspace token, real security logs, `.env` files, and database files out of Git. The project `.gitignore` excludes `.env`, databases, dependencies, and build outputs; check each file before publishing anyway.

GitHub's instructions for [publishing a local repository](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github) recommend creating the empty destination repository first.

## Step 3: Push this project to GitHub

In PowerShell, from the project folder, run:

```powershell
git init
git add .
git status --short
```

**Check the `git status` output.** It should list project code, tests, and documentation. It must not list `.env`, private logs, keys, tokens, `node_modules`, or SQLite databases. If any appear, stop and fix `.gitignore` before continuing.

Commit and connect the private repository. Replace `<YOUR_GITHUB_USERNAME>` with your GitHub account name:

```powershell
git commit -m "Prepare CyberGuard AI deployment"
git branch -M main
git remote add origin https://github.com/<YOUR_GITHUB_USERNAME>/cyberguard-ai.git
git push -u origin main
```

GitHub may open its normal browser sign-in flow. After it completes, refresh the GitHub repository page and confirm the project files appear.

## Step 4: Create the Render web service

1. Sign in at [Render](https://dashboard.render.com/).
2. Choose **New → Web Service**.
3. Connect GitHub if asked, then select your private `cyberguard-ai` repository.
4. Use these settings:

   | Setting | Value |
   | --- | --- |
   | Name | `cyberguard-ai-<your-name>`; choose a name Render accepts |
   | Branch | `main` |
   | Language / Runtime | **Docker** |
   | Dockerfile path | `./Dockerfile` |
   | Docker context | Repository root, `.` |
   | Region | Nearest to you and your users |
   | Health check path | `/api/health` |
   | Instance type | Lowest **paid** web service plan |

   Do not fill in separate npm/Python build commands. Render builds the Dockerfile, which builds the frontend and installs the backend dependencies. Render's Docker runtime reads the Dockerfile and runs its `CMD`; the app now listens on Render's `PORT`. [Render Docker deploys](https://render.com/docs/docker), [web services](https://render.com/docs/web-services)

## Step 5: Add the persistent SQLite disk

During service creation, open **Advanced** and add a persistent disk:

| Disk setting | Value |
| --- | --- |
| Mount path | `/data` |
| Size | `1 GB` |

The Docker image already configures SQLite to store the database at `/data/cyberguard.sqlite3`. The disk must be mounted at `/data` for the database to persist through restarts and new deployments. Persistent disks require a paid service. A disk-backed SQLite service runs as a single instance and has brief downtime during deploys; that fits this single-instance project. [Render disk setup and limits](https://render.com/docs/disks)

## Step 6: Configure server environment variables

In the web service's environment variable section, add:

| Key | Value |
| --- | --- |
| `CYBERGUARD_DB` | `/data/cyberguard.sqlite3` |
| `CYBERGUARD_TOKEN` | A private random access token you generate |

Generate a token locally with Python:

```powershell
py -c "import secrets; print(secrets.token_urlsafe(32))"
```

Copy the generated value directly into Render's `CYBERGUARD_TOKEN` field. Save it in your password manager so you can enter the same value into the dashboard later. **Do not paste the token into this chat, the source code, GitHub, or a public document.**

Leave the AI provider variables unset if you do not want generative AI yet. Reference guidance works without an AI key.

## Step 7: Deploy and find your public URL

1. Click **Create Web Service**.
2. Wait for the first build and deploy to finish successfully in Render's **Events** or **Deploys** view. The Docker build can take a few minutes.
3. Copy the HTTPS service URL displayed in Render, for example `https://cyberguard-ai-yourname.onrender.com`.
4. Visit that URL. The page should load over HTTPS.

## Step 8: Allow your deployed URL for browser write requests

The app checks the page's origin before it accepts uploads or incident updates. Add one more Render environment variable:

| Key | Value |
| --- | --- |
| `CYBERGUARD_ALLOWED_ORIGINS` | Your exact Render URL, for example `https://cyberguard-ai-yourname.onrender.com` |

Use the URL only: **no trailing slash, path, or spaces**. Keep the token and database variables from Step 6. Save the change and let Render finish the automatic redeploy.

The UI may show an access-token prompt before this redeploy completes. That is expected: the backend is checking for your token.

## Step 9: Connect the dashboard to the backend

1. Open the deployed site and choose **Settings** from the left navigation.
2. Paste the same private value you set for `CYBERGUARD_TOKEN` into **Workspace access token**.
3. Click **Save & connect**.
4. Confirm that the top bar reports **API connected** and the settings page shows the FastAPI connection.

After this, the **Analyze logs** action imports into the connected SQLite database on `/data`. The browser demo remains separate.

## Step 10: Verify persistence and future updates

1. Confirm `/api/health` responds at `https://YOUR-SERVICE.onrender.com/api/health` with a status of `ok`.
2. Use the Settings page to download a workspace export. This checks the authenticated workspace connection.
3. Store the private workspace export somewhere safe; it contains incident evidence.
4. On a later release, push a commit to GitHub's `main` branch. Render automatically rebuilds and deploys the service.
5. After that deploy completes, reconnect in the dashboard if needed and confirm the workspace records remain. They live on `/data`.

For routine backup, download the workspace JSON export after important investigations and store it privately. Render's disk is live storage, not a substitute for a backup you control.

## Optional: turn on AI explanations

Add these **server-side** variables to Render only if you have chosen an API provider and are ready for the assistant to send user-entered questions and minimal incident summaries to it:

```text
LLM_API_KEY=<your-private-provider-key>
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4.1-mini
```

Save them as Render environment variables or secrets; never put a real key into this file or GitHub. Change the base URL and model only to values supported by your provider. Save the variables and wait for redeployment; the dashboard should then show that the AI provider is configured. The question and minimal incident summary are sent to that provider; raw event evidence, asset names, source IPs, and analyst notes are not sent automatically.

## Common problems

| Problem | What to check |
| --- | --- |
| Docker build fails at `npm ci` | Confirm `package-lock.json` is committed with `package.json`. |
| Deploy fails with a port error | Confirm the deployed repository includes the current Dockerfile. The service reads `$PORT` and binds to `0.0.0.0`. |
| Dashboard says origin not allowed | Set `CYBERGUARD_ALLOWED_ORIGINS` to the exact HTTPS Render URL, save, and wait for redeployment. |
| Dashboard asks for a token repeatedly | Compare the token saved in Settings with `CYBERGUARD_TOKEN` in Render. Save and redeploy if you changed the server value. |
| Data disappears after deployment | Confirm the web service has a disk at `/data` and `CYBERGUARD_DB=/data/cyberguard.sqlite3`. A filesystem outside the mounted directory is temporary. |
| AI is not configured | AI is optional. If enabled, check `LLM_API_KEY`, base URL, model name, provider account access, and service logs. |
| Service has unexpectedly high costs | Review the current [Render billing page](https://dashboard.render.com/billing) for compute, persistent storage, and bandwidth. |

## What this deploy does not provide

This publishes the current single-workspace decision-support app. `CYBERGUARD_TOKEN` is a shared access token, not team accounts or role-based access. The application does not collect logs from devices by itself; upload exported log files. It does not block traffic or perform automatic response actions. For multi-user or production security operations, add organizational sign-in, user roles, a retention policy, and tested database backups before onboarding a team.
