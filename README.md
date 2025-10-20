# School Discipline App

This repository contains a Vite + React web app for managing attendance, behavior, and reports.

Quick start

1. Install dependencies

```bash
npm install
```

2. Run development server (uses `/api` proxy during dev unless `VITE_API_BASE_URL` is set)

```bash
npm run dev
```

3. Build for production

```bash
npm run build
```

Git / GitHub

1. Initialize and push to GitHub (example using GitHub CLI):

```bash
git init
git add .
git commit -m "Initial commit"
# replace USER/REPO with your values
gh repo create USER/REPO --public --source=. --remote=origin --push
```

2. Or push manually:

```bash
git remote add origin git@github.com:USER/REPO.git
git branch -M main
git push -u origin main
```

Deploy to Vercel

Option A — Git-based (recommended)
- Connect the GitHub repo to Vercel via the Vercel dashboard.
- Set Build Command: `npm run build`
- Set Output Directory: `dist`
- Add environment variable `VITE_API_BASE_URL` in Vercel settings if you want to point to a specific backend.

Option B — Vercel CLI quick deploy

```bash
vercel --prod
```

Environment variables

- `VITE_API_BASE_URL` — optional. If set it should point to your backend (for example `https://school-discipline.runasp.net`). If left empty during development the app uses `/api` and the Vite dev server proxy.

Support

If you want I can:
- Create a `.gitignore` and `.env.example` (done),
- Add a GitHub Actions CI workflow, or
- Automatically create the GitHub repo via the GitHub CLI (I can give you the exact command to run),
- Connect the project to Vercel using the CLI (I can run interactive `vercel` commands locally if you allow it).
