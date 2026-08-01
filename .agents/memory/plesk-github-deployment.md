---
name: Plesk GitHub deployment
description: Production deployment uses a committed dist build and a Node.js startup file relative to the application root.
---

For this project, Plesk must pull the versioned `dist` directory from GitHub; the production server starts `dist/index.cjs` and serves static files from `dist/public`.

**Why:** Plesk does not automatically see the Replit workspace build, and a missing or incorrect document root causes either “startup file not found” or a 403 response.

**How to apply:** Keep `dist` tracked for Plesk pulls, use `/dist/public` as the document root relative to the application root, use `dist/index.cjs` as the startup file, and provide `SUPABASE_DATABASE_URL` (or `DATABASE_URL`) plus `SESSION_SECRET` as server environment variables.