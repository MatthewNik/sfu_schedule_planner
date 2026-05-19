# SFU Schedule Planner

A Local-First SFU Course And Degree Planning Workspace Built With React, Vite,
TypeScript, IndexedDB, And Pure Planning Engines.

The App Is An Unofficial Planner. Forecasts, Warnings, And Generated Plans Are
Estimates Based On Available Course Outline Data And User-Entered Requirements.
They Are Not Official SFU Advising.

## Security Notes

- No Secrets Are Required For The MVP.
- `VITE_*` Variables Are Public In The Browser Bundle. Only Use Them For Public
  Configuration Like `VITE_SFU_API_BASE_URL`.
- Keep Real `.env` Files Local. Only `.env.example` Should Be Committed.
- Local Planner Data Is Stored In IndexedDB On The User's Device. Anyone With
  Browser/Device Access May Be Able To Access It.

## Scripts

```bash
npm install
npm run dev
npm run build
npm run test
npm run security:check
```

This Workspace Was Scaffolded Without A Local Node/npm Runtime Available, So Run
`npm install` Once Node Is Installed To Generate `package-lock.json`.
