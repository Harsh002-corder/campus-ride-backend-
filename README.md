# Campus Rider Backend (Express + Mongoose + MongoDB + Socket.io)

This backend connects Student, Driver, and Admin flows with strict ride lifecycle management:

`requested -> accepted -> ongoing -> completed/cancelled`

It uses existing MongoDB collections in `campus_rider`:

- `users`
- `rides`
- `settings`
- `signupotps`
- `ratelimitbuckets`

## 1) Setup

```bash
cd backend
cp .env.example .env
npm install
npm run dev
```

Server default: `http://localhost:4000`

Mongoose connects to `MONGODB_URI` (example: `mongodb://127.0.0.1:27017/campus_rider`) and starts the server only after successful DB connection.

## 2) Environment variables

- `PORT`
- `NODE_ENV`
- `MONGODB_URI`
- `MONGODB_DB_NAME` (default: `campus_rider`)
- `JWT_SECRET`
- `JWT_EXPIRES_IN`
- `CLIENT_ORIGIN`
- `ALLOWED_ORIGINS` (alias of `CLIENT_ORIGIN`)
- `ALLOWED_ORIGIN_PATTERNS` (optional wildcard host patterns like `*.example.com`)
- `ALLOW_LAN_ORIGINS` (`false` by default; set `true` only for non-production LAN/device testing)
- `EMAIL_USER` (gmail sender)
- `EMAIL_PASS` (gmail app password)
- `EMAIL_FROM` (optional from address)
- `OTP_RETURN_IN_RESPONSE` (optional, `true` only for local debugging)
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `OTP_TTL_MINUTES`
- `MONGO_RECONNECT_MS`

## 3) API base

All routes are under `/api`.

### Auth

- `POST /api/auth/request-signup-otp`
- `POST /api/auth/verify-signup-otp`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`
- `POST /api/auth/login`
- `GET /api/auth/me`

### Rides

- `POST /api/rides` (student)
- `GET /api/rides/my`
- `GET /api/rides/available` (driver)
- `GET /api/rides/:rideId`
- `POST /api/rides/:rideId/accept` (driver)
- `POST /api/rides/:rideId/reject` (driver)
- `POST /api/rides/:rideId/verify` (driver, 2-digit code)
- `POST /api/rides/:rideId/complete` (driver)
- `POST /api/rides/:rideId/cancel`
- `POST /api/rides/:rideId/location` (driver live tracking)

### Users / Drivers

- `GET /api/users/me`
- `PATCH /api/users/me`
- `GET /api/users` (admin)
- `PATCH /api/users/:userId` (admin)
- `GET /api/drivers/online`
- `PATCH /api/drivers/me/online`

### Admin / Settings

- `GET /api/admin/analytics`
- `GET /api/settings`
- `PUT /api/settings` (admin)

### Stops (Typeahead)

- `GET /api/stops/suggest?q=law&limit=8`

### Health

- `GET /api/health`

### DB Test Routes (non-production only)

- `POST /api/test-db/users` (create test user)
- `GET /api/test-db/rides?limit=20` (fetch latest rides)

## 4) Socket.io events

Client authenticates with JWT in `auth.token`.

Server emits:

- `ride:requested` (drivers/admin)
- `ride:updated` (student/driver/ride room)
- `admin:ride-requested`
- `admin:ride-updated`

Client room controls:

- `ride:join` with `rideId`
- `ride:leave` with `rideId`

## 5) Security and correctness

- JWT auth + role-based route guards
- DB-backed API rate limiting (`ratelimitbuckets`)
- Centralized validation via Zod
- Centralized error handling
- Atomic ride acceptance transition (`requested` only) prevents auto-accept race bugs
- Verification code persists until final state (`completed` or `cancelled`)

## 6) Frontend integration

Set frontend env:

```bash
VITE_API_URL=https://campusride-backend.onrender.com
```

Frontend client is in `src/lib/apiClient.ts` and auth screens are wired to backend.

For backend-powered location suggestions in the dashboard typeahead, set:

```bash
VITE_USE_REMOTE_STOP_SUGGEST=true
```
