# Luwingu Rider (Render version)

A Node.js server (server.js) with the pages in public/. Pages: /  (passengers)  /driver  /admin

## Put it online on Render
1. Upload everything in this folder to a GitHub repository (server.js and package.json at the top level).
2. On render.com: New > PostgreSQL. Create it in the same region you will use for the app, and copy its Internal Database URL.
3. New > Web Service > pick your repository. Build command: npm install   Start command: node server.js
4. Environment variables:
   - DATABASE_URL     the Internal Database URL from step 2 (without it the app saves to a file that Render erases on restart)
   - ADMIN_PASSWORD   your own admin password
   - VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT   for phone notifications (make the keys on your laptop with: npx web-push generate-vapid-keys; VAPID_SUBJECT = mailto:your-email)
   - Optional: FARE_PER_KM (default 10), PGSSL=require if the database complains about SSL
5. Create the service. The log should say "Connected to PostgreSQL."

## Run on your laptop
npm install, then  node server.js  (add DATABASE_URL to use PostgreSQL; without it data goes to data.json). Open http://localhost:3000. Phone notifications need https, so they will not work over plain Wi-Fi addresses.

## What it does
Passengers pick a district, set pickup/destination on the map (Default or Satellite), see the road route and fare (K10 per km), and choose Cash, Airtel, MTN or Zamtel (recorded only; the app does not collect the money). When a driver accepts, the passenger sees the driver's photo and motorbike picture.
Drivers register with a district, a passport-size photo and a motorbike picture; the admin approves them. They only see and accept requests from their own district, with a sound, banner and (if turned on) phone notification.
Admin: approve/reject/delete drivers, drivers grouped by district with a filter, View photos, View trips map, all rides with fare and payment. Handle the drivers' pictures carefully.
