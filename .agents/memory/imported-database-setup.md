---
name: Imported database setup
description: Fresh imported projects may have only Replit's session table before the checked-in application schema is applied.
---

When setting up an imported app that uses Drizzle and connect-pg-simple, preserve the existing `session` table and treat application tables as new, even if Drizzle presents an ambiguous rename prompt.

**Why:** Drizzle can misidentify a pre-existing session table as a rename candidate for the first application table during an interactive schema push.

**How to apply:** Inspect `information_schema` first; apply the checked-in schema transactionally while skipping only tables already present and structurally identical, never using a broad force push when it could rename or drop session data.