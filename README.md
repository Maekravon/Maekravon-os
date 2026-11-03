# NEXORA OS 2.0

NEXORA OS is a business operating system prototype built with React, TypeScript, and Vite. It preserves the dark navy / cyan / purple NEXORA identity.

## Requirements

- Chromebook with Linux development environment enabled, or another computer with Node.js 20.19+ or 22.12+
- Internet connection for initial package installation

## Start on a Chromebook

1. Download and extract `nexora-os-2.zip`.
2. Open the Chromebook **Terminal** app (Linux).
3. Move into the extracted project folder. Example:

   `cd ~/Downloads/nexora-os-2`

   If you extracted it somewhere else, use that folder's path.

4. Check Node.js:

   `node -v`

   If Node.js is not installed, install a current Node.js LTS version in the Linux environment before continuing. The official Node.js site is https://nodejs.org/.

5. Install project packages:

   `npm install`

6. Start the development server:

   `npm run dev`

7. The terminal will show a local address, usually `http://localhost:5173`. Open that address in Chrome.

8. Keep the terminal running while you use the app. Press `Ctrl + C` in the terminal to stop it.

## What works in this first build

- Responsive NEXORA OS shell and navigation
- Command Center dashboard
- Lead search
- Add new leads
- Change lead status
- Live dashboard totals
- Export local workspace backup
- Browser local storage persistence

## Important: demo mode

This first build stores demo leads in the current browser on the current device. It does **not** yet have production login, cloud synchronization, multi-user access, or a real AI service. Do not enter sensitive customer information into the demo.

The Supabase client placeholder is in `src/lib.ts`. The next implementation stage will add real authentication, tenant-isolated database tables, and Row Level Security before any customer data is stored in the cloud.

## Connect Supabase later

1. Create a project at https://supabase.com/.
2. Copy `.env.example` to a new file named `.env`.
3. Add the Supabase Project URL and anon/publishable key to `.env`.
4. Restart the Vite server after changing environment variables.

Do not put a Supabase service-role key or any private API key in a `VITE_` variable. Browser-exposed variables are public.

## Build check

Run:

`npm run build`

A successful build creates the deployable static site in `dist/`.

## Project structure

- `src/App.tsx` — application shell and working lead module
- `src/styles.css` — NEXORA visual system
- `src/lib.ts` — Supabase client configuration
- `src/main.tsx` — application entry point
- `.env.example` — safe placeholder for public Supabase configuration
