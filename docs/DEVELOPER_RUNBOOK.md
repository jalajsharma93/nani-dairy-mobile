# NANI Dairy Developer Runbook

Last updated: August 19, 2026.

## Repositories

- Mobile app: `/Users/jalajsharma/Projects/NaniDairy/nani-dairy-mobile`
- Backend API: `/Users/jalajsharma/Projects/NaniDairy/nani-dairy-backend`

## Local Backend

Start the backend:

```bash
cd /Users/jalajsharma/Projects/NaniDairy/nani-dairy-backend
./mvnw -q -DskipTests spring-boot:run
```

Default local API base URL:

```text
http://localhost:8080
```

Health check:

```text
http://localhost:8080/actuator/health
```

Run backend tests:

```bash
cd /Users/jalajsharma/Projects/NaniDairy/nani-dairy-backend
./mvnw test
```

## Local Mobile App

Install dependencies:

```bash
cd /Users/jalajsharma/Projects/NaniDairy/nani-dairy-mobile
npm install
```

Start Expo:

```bash
npx expo start
```

Run lint and typecheck:

```bash
npm run -s lint
npx tsc --noEmit
```

## API Base URL

The mobile app chooses its backend URL in `src/services/api.ts`:

- `EXPO_PUBLIC_API_BASE_URL` wins if set.
- Expo Go/dev tries to derive the Metro host IP for real devices.
- Android emulator defaults to `http://10.0.2.2:8080`.
- iOS simulator and web default to `http://localhost:8080`.

Example override:

```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.20:8080 npx expo start
```

## Phase 2 Verification Checklist

Use this after making changes to Phase 2 modules:

- Mobile lint passes.
- Mobile typecheck passes.
- Backend tests pass.
- Animal lifecycle/genealogy screens still load.
- QC override approval path still creates and consumes approvals.
- Delivery run closure still returns stock closure state.
- Employee monthly report still shows payout status and payslip export.
- Sync center still shows queued, failed, dead-letter, and conflict states.

## Production Readiness Notes

Before production deployment:

- Move dev JWT secret out of `application.yaml`.
- Disable verbose SQL logging unless needed for diagnostics.
- Review actuator exposure and security.
- Align Java runtime versions between `pom.xml`, local runtime, and Docker.
- Finish PostgreSQL migration and CI/CD pipeline.
- Add broader end-to-end regression tests for login, milk, QC, sales, delivery, payroll, and sync flows.

## Useful Docs

- `docs/PHASE_2_COMPLETION.md`
- `docs/FEATURE_STATUS.md`
- `docs/TASK_BACKLOG.md`
