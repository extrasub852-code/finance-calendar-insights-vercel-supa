# Finance Calendar Insights

An Outlook-style week calendar with a **Finance Insights** sidebar. Data is stored in **SQLite** via a small **Express** API so events, budgets, and tracked spend persist across sessions.

## Features

- **SQLite persistence** — events, per-category monthly budgets, balance, and tracked expenses.
- **First-run onboarding** — starting balance and a **monthly budget per category** (Social, Work, Travel, Health, Other).
- **Week view** — double-click an empty time slot to create an event (single-click still selects an event).
- **Finance Insights** — **week-level** summary (estimated spend this week, per-category breakdown, month-to-date totals) plus **selected-event** detail when you pick an event.

## Prerequisites

- [Node.js](https://nodejs.org/) 20+ and npm

## Setup

```bash
cd finance-calendar-insights
npm install
npx prisma db push
npm run dev
```

This runs **two processes**: the API on `http://127.0.0.1:3001` and Vite on `http://localhost:5173` (with `/api` proxied to the API). Open the Vite URL in your browser.

The database file is created at `prisma/dev.db` (see `DATABASE_URL` in `.env`).

## Build

```bash
npm run build
npm run preview
```

For production you would serve `dist/` and run the API separately (e.g. `tsx server/index.ts` or a bundled server).

## GitHub

Create a new empty repository on GitHub, then:

```bash
cd finance-calendar-insights
git init
git add .
git commit -m "Initial commit: Finance Calendar Insights"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/finance-calendar-insights.git
git push -u origin main
```

## Stack

- React 19, TypeScript, Vite 6, Tailwind CSS 4
- Express, Prisma, SQLite

## License

MIT
