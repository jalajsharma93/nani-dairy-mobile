# NANI Dairy Mobile

Expo/React Native mobile app for NANI Dairy operations.

The app covers milk collection, QC, animals, breeding, health, treatments, feed, stock, customers, sales, delivery operations, employees, tasks, notifications, integrations, governance, sync, and release readiness.

## Docs

- `docs/PHASE_2_COMPLETION.md`: Phase 2 completion scope, acceptance checks, and remaining work.
- `docs/FEATURE_STATUS.md`: Current module-by-module implementation status.
- `docs/TASK_BACKLOG.md`: Completed Phase 2 items plus Phase 3/deferred backlog.
- `docs/DEVELOPER_RUNBOOK.md`: Local setup, verification commands, and production-readiness notes.
- `docs/VACCINATION_GUIDANCE.md`: Cattle/buffalo vaccination list guidance, including combo and 6-in-1 products.

## Local Setup

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npx expo start
```

Run checks:

```bash
npm run -s lint
npx tsc --noEmit
```

## Backend

Expected backend workspace:

```text
/Users/jalajsharma/Projects/NaniDairy/nani-dairy-backend
```

Default local backend URL:

```text
http://localhost:8080
```

The app can be pointed at another backend with:

```bash
EXPO_PUBLIC_API_BASE_URL=http://HOST:8080 npx expo start
```

See `docs/DEVELOPER_RUNBOOK.md` for the full local workflow.
