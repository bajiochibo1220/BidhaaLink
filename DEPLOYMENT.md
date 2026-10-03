# Vercel + Render + Neon deployment

## What is configured in this repository

- Render runs the Express app, PostgreSQL client, Socket.IO server, and scheduled jobs as one long-running web service.
- Vercel serves the files in `public/` and rewrites `/api/*` and `/socket.io/*` to the Render service. API responses are explicitly excluded from Vercel rewrite caching.
- Runtime requests and `npm run migrate` use matching direct Neon endpoints. This is a persistent Render Node service, so a direct endpoint supports the per-connection schema search path without transaction-pooler limitations. Marketplace tables live in the `business_website` schema, keeping pre-existing public tables separate.
- Package installation no longer runs SQL migrations as a side effect.
- Future database schema/data changes should be added as new files under `migrations/sql/` and applied with `npm run migrate`.

The Render service name is `my-business-website-api`, so its default public URL is expected to be `https://my-business-website-api.onrender.com`. If Render assigns a different public hostname, update `BASE_URL` in Render and both upstream destinations in `vercel.json` to that hostname before deploying the frontend.

## 1. Check the database before applying schema changes

The local `.env` has valid matching direct Neon URLs for `DATABASE_URL` and `DIRECT_URL`. Both were checked with read-only queries. Keep these credentials private. The connected Neon database has unrelated public tables, including `notifications` and `system_settings` with different columns from this app’s migrations. The app now uses a separate `business_website` schema so those public tables remain untouched. This only separates table namespaces; it does not create a separate database or backup the existing data.

If Aiven contains data you need, export and restore that data to Neon before switching production traffic. Take a backup first and verify key table counts. Do not run migrations against a database containing valuable data until you have a restorable backup and have reviewed the migration SQL.

Run `npm run migrate` from this repository to create/update the `business_website` schema. The migration runner uses `DIRECT_URL`. Check the command output for any failed migration. This command changes the Neon schema and may apply seed rows; it is intentionally not run automatically during deploy.

## 2. Deploy the backend to Render

1. Push this repository to GitHub or another Git provider supported by Render.
2. In Render, choose **New → Blueprint** and select the repository. Render reads `render.yaml` and creates the `my-business-website-api` web service.
3. The manifest uses `npm ci` for build, `npm start` for launch, and `/api/health` for its health check. It selects the paid Starter plan so the server and in-process cron schedules keep running.
4. In the Render service’s Environment page, set `DATABASE_URL` to the direct Neon URL and `DIRECT_URL` to that same direct URL. The persistent Render service uses the direct endpoint for its database pool and schema setting. `npm run migrate` also uses `DIRECT_URL`.
5. Set `CLIENT_URL` to the final Vercel production origin, for example `https://your-project.vercel.app` or your custom frontend domain.
6. Enter the existing Cloudinary cloud name, API key, and API secret. Keep the current Cloudinary account; do not replace it with local storage.
7. Add credentials only for payment and email providers you use. Set M-Pesa and Airtel callback URLs to the Render host plus `/api/payments/mpesa-callback` and `/api/payments/airtel-callback`. Set provider modes to sandbox until callbacks have been checked.
8. Confirm the service is healthy and `https://my-business-website-api.onrender.com/api/health` reports `status: healthy` and `database: connected`.

After the first successful deployment, open `/admin.html` and register the first super admin. The migrations intentionally remove the development seed account, so there is no default production password. Then use the admin interface to add the first business before expecting marketplace listings.

Render’s filesystem is not durable by default. Product/business media must successfully upload to Cloudinary; do not depend on local upload paths surviving restarts or deploys.

## 3. Deploy the frontend to Vercel

1. In Vercel, import the same Git repository as a separate project.
2. Set the project root to the repository root. Keep the Vercel config in the root so it can apply its rewrites.
3. Set the output directory to `public` (already specified in `vercel.json`). The HTML pages are under `public/html`, with static assets in `public/css` and `public/js`.
4. Deploy a Preview first. Open the preview homepage, `/marketplace`, and `/admin.html` to confirm the static page rewrites load the expected files.
5. After assigning the production domain, update Render’s `CLIENT_URL` to that exact origin and redeploy Render if necessary.

## 4. Verify the deployed app

Check these flows on the Vercel production URL before directing customers to it:

- `/api/health` through the Vercel URL returns healthy and reports a connected database.
- Login, logout, page refresh while signed in, and CSRF-protected updates work.
- The browser Network panel shows `/api/*` calls going through Vercel and receiving application responses, not Vercel 404s or Render HTML error pages.
- Socket.IO connects and chat/order/admin live updates work. Vercel’s external rewrites proxy HTTP traffic; validate the `/socket.io/` WebSocket upgrade on the deployed URL because platform behavior can differ from ordinary HTTP rewrites.
- Upload a test image and video, verify their returned Cloudinary URLs, and open those URLs after a Render restart.
- Verify password reset/email links, M-Pesa/Airtel callbacks, and PayPal return URLs use the correct public hostnames.
- Confirm the Render logs show the database, Cloudinary, and cron jobs initialized. Do not share raw environment-validation output publicly.

Keep Aiven available until the Neon data, app flows, and payment callbacks have passed these checks. For the initial database cutover, take a fresh Aiven export close to the switch time and avoid writes during the final export/restore window.
