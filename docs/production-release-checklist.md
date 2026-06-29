# Production Release Checklist

This checklist covers the two moving parts that ship together for OpenWaggle:

- the GreatX backend in the sibling repo at `../greatx-backend`
- the OpenWaggle Electron desktop app in this repo

Use it as a release runbook, not as a substitute for CI. The canonical OpenWaggle release/versioning reference remains `docs/release-and-versioning.md`.

## 1. Preflight

- Confirm scope: backend changes, Electron app changes, or both.
- Confirm the target version and release notes for user-visible changes.
- Confirm production secrets are available and not stored in gittracked files.
- Confirm Google auth credentials are production credentials, not local dev/test credentials.
- Confirm the backend URL the Electron app will target in production.
- Confirm platform distribution expectations:
  - macOS DMG + ZIP
  - Windows NSIS installer
  - Linux AppImage

## 2. Backend Release

Repository:

```bash
cd /Users/shashankv/Projects/greatx-backend
```

### 2.1 Required Production Config

Set these before starting the production backend:

- `NODE_ENV=production`
- `PORT`
- `FRONTEND_URL`
- database config:
  - preferred: `DATABASE_URL`
  - or explicit Postgres fields: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
  - optional SSL toggle: `DB_SSL=true`
  - optional schema sync override: `DB_SYNCHRONIZE=false`
- auth/session config:
  - `JWT_REFRESH_TTL`
  - `OTP_PEPPER`
  - `REFRESH_TOKEN_PEPPER`
  - `OTP_TTL_MS`
  - `ALLOW_DEV_OTP=false`
- Google auth config:
  - preferred: `GOOGLE_CLIENT_IDS=<desktop-client-id>,<web-client-id>`
  - fallback legacy key: `GOOGLE_CLIENT_ID=<single-client-id>`

Important Google auth note:

- The backend now validates Google ID tokens against multiple audiences.
- Production should keep `GOOGLE_CLIENT_IDS` populated with both:
  - the desktop OAuth client ID used by the Electron app
  - the web OAuth client ID if any browser/web flows still exist

### 2.2 Backend Validation

Run the standard backend checks before deploy:

```bash
pnpm install
pnpm exec tsc -p tsconfig.json --noEmit
pnpm test
pnpm build
```

Optional but recommended:

- Smoke-test `POST /auth/google`
- Smoke-test `POST /auth/email`
- Smoke-test `POST /auth/refresh`
- Smoke-test one representative streaming/chat route

### 2.3 Backend Start Command

Build and run production:

```bash
pnpm build
NODE_ENV=production pnpm start:prod
```

### 2.4 Backend Release Checks

- `GET /health` returns `200`
- CORS allows only the intended production frontend origin via `FRONTEND_URL`
- DB connection works against the production database
- Auth session creation and refresh work
- Google sign-in works against production Google credentials
- No dev OTP behavior is exposed in production

## 3. Electron Release

Repository:

```bash
cd /Users/shashankv/Projects/OpenWaggleMain
```

### 3.1 Required Production Config

Set production Electron environment in a non-committed env file or CI secret store:

- `OPENWAGGLE_APP_AUTH_GOOGLE_DESKTOP_CLIENT_ID`
- `OPENWAGGLE_APP_AUTH_GOOGLE_DESKTOP_CLIENT_SECRET`
- `OPENWAGGLE_LOG_LEVEL=info` or `warn`

Notes:

- The Electron main process now loads `.env`, `.env.local`, `.env.production`, and `.env.production.local`.
- Do not commit production secrets.
- `ELECTRON_RENDERER_URL` is a dev override and should not be used for packaged production builds.

### 3.2 OpenWaggle Validation

Run the standard OpenWaggle release checks:

```bash
pnpm install
pnpm check
pnpm test
pnpm build
```

If release confidence needs an installer-level pass, also run:

```bash
pnpm build:mac
pnpm build:win
pnpm build:linux
```

Platform notes:

- On Apple silicon, validate the arm64 build, not only Rosetta/x64 output.
- macOS release artifacts should include both DMG and ZIP.
- The repo currently publishes unsigned artifacts by default; production trust still requires macOS notarization and Windows signing work.

### 3.3 Required Functional QA

Before tagging/publishing, verify in a packaged or release-like app build:

- first launch succeeds
- existing session data opens correctly
- new chat/session creation works
- provider/model auth still works
- desktop Google sign-in works end-to-end
- updater metadata/artifacts are present for the target platform
- external links open in the system browser
- packaged runtime can still locate native deps and required resources

### 3.4 Packaging Commands

Core build:

```bash
pnpm build
```

Platform installers:

```bash
pnpm build:mac
pnpm build:mac:all
pnpm build:win
pnpm build:linux
```

### 3.5 Electron Release Checks

- app launches from packaged artifact
- auth screen works, including desktop Google login
- backend base URL is the intended production backend
- no dev-only env or local URLs leak into the packaged app
- auto-updater feed and GitHub release assets are present
- macOS ZIP artifact exists alongside DMG

## 4. Coordinated Release Order

Recommended order:

1. Deploy backend first.
2. Verify backend health and auth routes in production.
3. Build and validate Electron installers against the production backend.
4. Publish Electron release artifacts.
5. Run post-publish smoke tests on a clean machine or clean user-data directory.

Why this order:

- the Electron app depends on backend auth/session behavior
- desktop Google auth requires both sides to have matching production Google config

## 5. Post-Release Smoke Test

Run this after both backend and Electron are live:

- install the released Electron build on a clean machine or clean profile
- launch the app
- sign in with Google
- confirm session/token refresh works after app restart
- create a chat/session and send a message
- confirm one backend-dependent feature works beyond auth
- confirm no console/runtime crash on startup

## 6. Release Notes Minimum

For each production release, capture:

- shipped version
- backend revision/commit
- Electron revision/commit
- user-visible changes
- config or migration requirements
- validation evidence
- known follow-up items

## 7. Current Auth-Specific Production Reminder

After the recent desktop Google auth implementation:

- the Electron app uses a desktop OAuth client ID and secret in the main process
- the backend should keep `GOOGLE_CLIENT_IDS` configured to accept the desktop client ID
- if a web client remains in use anywhere, include that client ID too
- rotate any Google client secret that was exposed during debugging before final production release
