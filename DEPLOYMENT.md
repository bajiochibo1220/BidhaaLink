# Manual Render Free + Vercel deployment

This guide uses a manually created Render Web Service on the Free plan, not a Render Blueprint. The app schema has already been migrated to Neon in `business_website`. Do not run migrations as part of the Render build.

## 1. Push the project to GitHub

Commit and push the deployment configuration and migration changes. Do not commit `.env`; it contains private values and is ignored by Git.

## 2. Deploy the frontend to Vercel first

1. In Vercel, choose **Add New → Project** and import this repository.
2. Set **Root Directory** to the repository root.
3. Use **Framework Preset: Other**, leave **Build Command** blank, and set **Output Directory** to `public` (also configured in `vercel.json`).
4. Deploy and copy the production URL, such as `https://your-project.vercel.app`. You will enter it as Render's `CLIENT_URL`.

## 3. Create the Render Free Web Service manually

1. In Render, click **New + → Web Service**. Do not select **Blueprint**.
2. Connect the GitHub repository and choose the same branch you deployed to Vercel.
3. Set:

   | Render field | Value |
   |---|---|
   | Name | `my-business-website-api` |
   | Region | `Ohio` (the current Neon endpoint is in AWS `us-east-2`) |
   | Root Directory | Leave blank (the app is at the repository root) |
   | Language / Runtime | `Node` |
   | Build Command | `npm ci` |
   | Start Command | `npm start` |
   | Instance Type | `Free` |

   Use the exact service name shown above so its URL matches the upstreams in `vercel.json`: `https://my-business-website-api.onrender.com`. If Render gives you a different hostname, replace the two Render destinations in `vercel.json` and push the change.

4. In **Advanced**, set the health check path to `/api/health` if the option is available.
5. Add the environment variables below before deploying if the form allows it. Otherwise, create the service, add the variables in its **Environment** page, then redeploy.
6. Create the service. Render supplies `PORT` automatically; do not add your own `PORT` value.

## 4. Set Render environment variables

Add these in the Render service's **Environment** page. Enter secret values directly in Render; do not put them in Git or Vercel.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | The direct Neon connection string from local `.env` (host does **not** contain `-pooler`) |
| `DATABASE_SCHEMA` | `business_website` |
| `JWT_SECRET` | Generate a fresh long random value for production; do not reuse a sample or share it |
| `CLIENT_URL` | Exact Vercel production origin, e.g. `https://your-project.vercel.app`, no trailing slash |
| `BASE_URL` | `https://my-business-website-api.onrender.com` (or the actual Render URL) |
| `CLOUDINARY_CLOUD_NAME` | Existing Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Existing Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Existing Cloudinary API secret |

The direct Neon endpoint is intentional: this Render app uses a PostgreSQL connection setting to select `business_website`, and the Neon pooled URL does not support that setting. `DIRECT_URL` is only needed when running `npm run migrate` from a trusted development machine; it is not needed for the deployed app's normal runtime.

Set these only if you use the associated services:

- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` or `SENDGRID_API_KEY`.
- M-Pesa: `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_PASSKEY`, `MPESA_SHORTCODE`, `MPESA_ENVIRONMENT`, and `MPESA_CALLBACK_URL` set to `https://my-business-website-api.onrender.com/api/payments/mpesa-callback`.
- Airtel Money: `AIRTEL_CLIENT_ID`, `AIRTEL_CLIENT_SECRET`, `AIRTEL_ENVIRONMENT`, and `AIRTEL_CALLBACK_URL` set to `https://my-business-website-api.onrender.com/api/payments/airtel-callback`.
- PayPal: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_MODE`. PayPal return links use `CLIENT_URL`.
- Redis: `REDIS_URL` only if you have a Redis service; caching is optional.

Use sandbox payment credentials and modes for initial checkout and callback checks. If you later add a Vercel custom domain, update `CLIENT_URL` to that exact origin and redeploy Render.

## 5. Check both deployments

1. In Render, wait for the deploy to finish and visit `https://my-business-website-api.onrender.com/api/health`. It should return `status: healthy`, `database: connected`, and the app schema should be present.
2. In Vercel, open `/`, `/marketplace`, and `/admin.html`.
3. Visit `/api/health` through the Vercel domain too. It should proxy to Render and return the same healthy status.
4. Test sign-in, page refresh while signed in, sign-out, and a CSRF-protected update.
5. Check the browser Network panel for Socket.IO: the client script should load and the WebSocket connection should upgrade successfully. If `/api/health` works but Socket.IO does not, check the `/socket.io/` Vercel rewrite and Render logs.
6. Upload a test image and video and confirm each returned Cloudinary URL opens.
7. Test password reset/email and payment callbacks in sandbox. Render Free blocks outbound SMTP ports 25, 465, and 587, which are the ports this app's Nodemailer SMTP/SendGrid transports use; those email flows need an HTTPS email API integration or a paid service plan.
8. Register the first super admin at `/admin.html`, then create the first business.

## Free plan limits to plan around

- Render spins down a Free web service after 15 minutes without traffic; waking it can take about a minute. The first request after idle may feel slow.
- The app's scheduled tasks run inside the web server process. They stop while the service is asleep, so automatic order cleanup and account-deletion jobs are not reliable on Free.
- Render may restart a Free service, and its local filesystem is ephemeral. The app uses Cloudinary for durable media; do not rely on local upload files.
- Free is useful for preview/testing. These limits make it unsuitable for reliable production payments, email, and scheduled processing.

## Database note

The app's 29 migrations are already applied to the Neon `business_website` schema. They did not copy existing Aiven customer/business/order data. If that data is needed, migrate it separately before switching customers to the new deployment. For future SQL/schema changes, add a migration file under `migrations/sql/` and apply it with `npm run migrate`.
