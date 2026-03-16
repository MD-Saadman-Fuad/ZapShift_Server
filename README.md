# Zap Shift Server

A production-ready Node.js/Express backend for the **Zap Shift** parcel delivery platform. This service handles user management, rider onboarding, parcel lifecycle operations, payment processing with Stripe, and shipment tracking logs.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Getting Started](#getting-started)
- [Authentication & Authorization](#authentication--authorization)
- [API Reference](#api-reference)
- [Parcel Tracking Flow](#parcel-tracking-flow)
- [Deployment Notes](#deployment-notes)
- [License](#license)

## Features

- User creation and role management (`user`, `rider`, `admin`)
- Rider application and approval workflow
- Parcel creation, assignment, and delivery status updates
- Stripe Checkout integration for parcel payments
- Firebase Admin token verification for protected routes
- Tracking log history per parcel with generated tracking IDs
- Analytics endpoints for delivery status and rider delivery counts

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (official Node driver)
- **Authentication:** Firebase Admin SDK (ID token verification)
- **Payments:** Stripe Checkout API
- **Utilities:** `dotenv`, `cors`, `crypto`

## Project Structure

```text
zap-shift-server/
├── index.js
├── package.json
├── package-lock.json
├── .env
└── zap-shift-firebase-adminsdk.json
```

## Environment Variables

Create a `.env` file in the project root and define:

| Variable        | Required | Description                                      |
| --------------- | -------- | ------------------------------------------------ |
| `PORT`          | No       | Server port (defaults to `3000`)                 |
| `URI`           | Yes      | MongoDB connection string                        |
| `STRIPE_SECRET` | Yes      | Stripe secret key                                |
| `SITE_DOMOAIN`  | Yes      | Frontend URL for Stripe success/cancel redirects |

> Note: `SITE_DOMOAIN` is intentionally spelled to match the current server code.

### Firebase Admin Credentials

Place your Firebase service account file at:

- `./zap-shift-firebase-adminsdk.json`

Do **not** expose this file publicly.

## Getting Started

### 1) Install dependencies

```bash
npm install
```

### 2) Configure environment

- Add all required `.env` variables
- Ensure `zap-shift-firebase-adminsdk.json` exists in root

### 3) Run the server

```bash
node index.js
```

For development with auto-reload:

```bash
npx nodemon index.js
```

Server base URL (local):

```text
http://localhost:3000
```

## Authentication & Authorization

Protected endpoints expect a Firebase ID token in the `Authorization` header:

```http
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

Role controls implemented in middleware:

- **Admin-only:** user role updates, rider approval updates
- **Rider role:** available in middleware for rider-specific protection

## API Reference

### Health

| Method | Endpoint | Description            |
| ------ | -------- | ---------------------- |
| `GET`  | `/`      | Service status message |

### Users

| Method  | Endpoint             | Description                                            |
| ------- | -------------------- | ------------------------------------------------------ |
| `GET`   | `/users`             | List users (supports `searchText`)                     |
| `GET`   | `/users/:id`         | Get user by MongoDB ID                                 |
| `GET`   | `/users/:email/role` | Get role by email                                      |
| `POST`  | `/users`             | Create user (defaults role to `user`)                  |
| `PATCH` | `/users/:id/role`    | Update user role (**Admin + Firebase token required**) |

### Riders

| Method  | Endpoint                   | Description                                                |
| ------- | -------------------------- | ---------------------------------------------------------- |
| `POST`  | `/riders`                  | Submit rider application (`status: pending`)               |
| `PATCH` | `/riders/:id`              | Approve/reject rider (**Admin + Firebase token required**) |
| `GET`   | `/riders`                  | List riders (supports `status`, `district`, `workStatus`)  |
| `GET`   | `/riders/delivery-per-day` | Rider delivery count grouped by day (`email` query)        |

### Parcels

| Method  | Endpoint                         | Description                                                |
| ------- | -------------------------------- | ---------------------------------------------------------- |
| `GET`   | `/parcels`                       | List parcels (supports `email`, `deliveryStatus`)          |
| `GET`   | `/parcels/rider`                 | Rider-focused parcel list (`riderEmail`, `deliveryStatus`) |
| `GET`   | `/parcels/:id`                   | Get parcel by ID                                           |
| `GET`   | `/parcels/delivery-status/stats` | Aggregate parcel count by delivery status                  |
| `POST`  | `/parcels`                       | Create parcel and generate `trackingId`                    |
| `PATCH` | `/parcels/:id`                   | Assign rider to parcel                                     |
| `PATCH` | `/parcels/:id/status`            | Update parcel delivery status                              |

### Payments

| Method  | Endpoint                   | Description                                                |
| ------- | -------------------------- | ---------------------------------------------------------- |
| `POST`  | `/create-checkout-session` | Create Stripe Checkout session                             |
| `PATCH` | `/payment-success`         | Confirm successful payment using `session_id` query        |
| `GET`   | `/payments`                | Get payment history by email (**Firebase token required**) |

### Tracking

| Method | Endpoint                      | Description                             |
| ------ | ----------------------------- | --------------------------------------- |
| `GET`  | `/trackings/:trackingId/logs` | Get tracking timeline/logs for a parcel |

## Parcel Tracking Flow

At key lifecycle events, tracking entries are inserted/upserted into the `trackings` collection. Typical sequence:

1. `parcel_created`
2. `parcel_paid`
3. `driver-assigned`
4. `parcel_delivered`

Each tracking document stores:

- `trackingId`
- `status`
- `details`
- `createdAt`

## Deployment Notes

- Set all required environment variables in your hosting platform
- Keep Firebase service credentials secure (never commit real credentials)
- Configure CORS policy appropriately for production frontend domains
- Ensure MongoDB network access and user permissions are configured

## License

This project is currently licensed under **ISC** (as defined in `package.json`).
