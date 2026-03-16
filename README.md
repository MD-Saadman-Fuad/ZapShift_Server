# Zap Shift Server

Backend API for the Zap Shift parcel delivery platform. It handles user roles, rider workflows, parcel lifecycle updates, Stripe payments, Firebase token verification, and shipment tracking logs.

## Highlights

- REST API built with Express and MongoDB
- Firebase Admin authentication with role-based authorization
- Stripe Checkout integration for parcel payments
- Parcel tracking timeline with status log history
- Rider performance and delivery analytics endpoints
- Production-ready deployment on Render or Vercel

## Tech Stack

- Node.js
- Express.js
- MongoDB Node Driver
- Firebase Admin SDK
- Stripe API
- dotenv, cors, crypto

## Project Structure

```text
zap-shift-server/
├── index.js
├── package.json
├── vercel.json
├── .env (local only)
└── zap-shift-firebase-adminsdk.json (optional local fallback)
```

## Environment Variables

Create a local `.env` file with the following values:

| Variable | Required | Description |
| --- | --- | --- |
| `PORT` | No | API port (default: `3000`) |
| `URI` | Yes | MongoDB connection string |
| `STRIPE_SECRET` | Yes | Stripe secret key |
| `SITE_DOMAIN` | Yes | Frontend base URL for Stripe redirects |
| `ALLOWED_ORIGIN` | No | CORS origin allowlist entry (default: `https://zap-shift-web.vercel.app`) |
| `FB_SERVICE_KEY` | Yes* | Base64-encoded Firebase service account JSON |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Yes* | Raw Firebase service account JSON string |

`*` Provide one of `FB_SERVICE_KEY`, `FIREBASE_SERVICE_ACCOUNT_JSON`, or a local `zap-shift-firebase-adminsdk.json` file.

### Example

```env
PORT=3000
URI=your_mongodb_connection_string
STRIPE_SECRET=your_stripe_secret_key
SITE_DOMAIN=https://zap-shift-web.vercel.app
ALLOWED_ORIGIN=https://zap-shift-web.vercel.app
FB_SERVICE_KEY=base64_encoded_firebase_service_account_json
```

## Local Setup

1. Install dependencies

	 ```bash
	 npm install
	 ```

2. Configure environment variables in `.env`
3. Run the server

	 ```bash
	 node index.js
	 ```

4. Development mode (auto reload)

	 ```bash
	 npx nodemon index.js
	 ```

Base URL: `http://localhost:3000`

## Authentication and Authorization

Protected routes use Firebase ID tokens:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

Role middleware:

- `verifyFBToken`: validates Firebase token
- `verifyAdmin`: allows admin-only actions
- `verifyRider`: available for rider-only actions

## API Overview

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Health message |

### Users

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/users` | List users, optional search with `searchText` |
| `GET` | `/users/:id` | Get user by MongoDB id |
| `GET` | `/users/:email/role` | Get role by email |
| `POST` | `/users` | Create user (returns `409` if email exists) |
| `PATCH` | `/users/:id/role` | Update role (Firebase token + admin required) |

### Riders

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/riders` | Submit rider application |
| `PATCH` | `/riders/:id` | Approve/reject rider (Firebase token + admin required) |
| `GET` | `/riders` | Filter by `status`, `district`, `workStatus` |
| `GET` | `/riders/delivery-per-day` | Rider delivery stats by day (`email` query) |

### Parcels

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/parcels` | Parcel list, filter by `email`, `deliveryStatus` |
| `GET` | `/parcels/rider` | Rider parcel list by `riderEmail` and `deliveryStatus` |
| `GET` | `/parcels/:id` | Get parcel by id |
| `GET` | `/parcels/delivery-status/stats` | Aggregate delivery status counts |
| `POST` | `/parcels` | Create parcel and auto-generate `trackingId` |
| `PATCH` | `/parcels/:id` | Assign rider, set rider work status |
| `PATCH` | `/parcels/:id/status` | Update parcel status and tracking log |

### Payments

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/create-checkout-session` | Create Stripe Checkout session |
| `PATCH` | `/payment-success?session_id=...` | Verify successful Stripe payment |
| `GET` | `/payments?email=...` | Payment history for authenticated user |

### Tracking

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/trackings/:trackingId/logs` | Tracking timeline for a parcel |

## Payment Flow

1. Frontend calls `POST /create-checkout-session`
2. User completes Stripe Checkout
3. Frontend calls `PATCH /payment-success?session_id=...`
4. Backend updates parcel payment status and stores payment record
5. Backend writes `parcel_paid` to tracking logs

## Deployment

### Render

- Connect the repository and enable auto-deploy from `main`
- Add all required environment variables in Render dashboard
- Redeploy after any environment variable changes

### Vercel (Serverless)

- `vercel.json` is configured to route all methods to `index.js`
- Ensure the same environment variables are configured in Vercel project settings

## Troubleshooting

- `Error: Neither apiKey nor config.authenticator provided`
	- `STRIPE_SECRET` is missing in the hosting environment
- `Invalid FB_SERVICE_KEY`
	- Firebase credential value is not valid base64 JSON
- `POST /users 409`
	- User already exists by email (expected duplicate protection)
- Stripe success redirect 404 on frontend
	- Ensure `SITE_DOMAIN` matches your live frontend URL and route structure

## Security Notes

- Never commit real `.env` values or Firebase private keys
- Rotate credentials immediately if exposed
- Restrict MongoDB IP/network access and database user permissions

## License

ISC
