# Mesh Shift Log

Mobile-first internal shift checklist MVP for Mesh Youngstorget hospitality staff.

## Demo staff codes

- `1001` Bobby / manager
- `1002` Ivana
- `1003` Vlad
- `1004` Rebekka
- `1005` Mircea
- `OPEN` Time2Staff Opening
- `CLOSE` Time2Staff Closing
- `EVENT` Time2Staff Event Responsible

## What is included

- Staff-code login
- Opening, daytime, closing, event, weekly and guide views
- Date-based checklist completion using `localStorage`
- Task inputs for text, number, yes/no and comments
- Manager dashboard with progress, completed tasks, missing tasks, critical missing tasks, history and filters
- JSON export/import for logs and routine data
- Placeholder routine data in `src/data/routines.js`

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Deploy to GitHub Pages

This project uses Vite with a relative base path and the `gh-pages` package.

```bash
npm run deploy
```

Before deploying, make sure the repository has GitHub Pages enabled for the `gh-pages` branch in the GitHub repository settings.

## Notes

This MVP intentionally has no backend. Logs and imported routine edits live in the browser's `localStorage`, so each device has its own copy unless exported and imported manually.
