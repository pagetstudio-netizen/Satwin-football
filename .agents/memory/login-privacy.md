---
name: Login privacy
description: Privacy constraint for remembered login data in browser storage
---

Persisting a phone number in browser storage can trigger privacy findings even when the password is not stored. The login flow should not persist passwords, phone numbers, or other login identifiers locally.

**Why:** The privacy scanner treats phone numbers as sensitive personal data and flags them as a data-sharing risk when written to local storage.

**How to apply:** Keep login fields transient and rely on the server-side session cookie. If legacy login storage exists, remove it on the login page.