# ADR 0009 — httpOnly cookie sessions

Status: proposed · 2026-11-27

**Context.** The prototype persists the session JWT in `localStorage` (`secrets.session`), so any XSS
is an instant account takeover. The prompt allows "secure HTTP-only cookies or secure token-based
sessions" but forbids sensitive data in localStorage.

**Decision.** Session JWT is set as `__Host-secrets_session` (httpOnly, Secure, SameSite=Lax, Path=/).
The client never sees the token. Mutations require a CSRF token from `/v1/auth/me`, sent as
`X-CSRF-Token`, plus an `Origin` check. WebSocket auth uses the same cookie on the same origin.
Bearer auth remains for CLI/native clients only and is not used by the browser.

**Consequences.** XSS can no longer exfiltrate a session; CSRF surface grows and is covered by
double-submit + SameSite + Origin checks. Requires single-origin deployment (already the case: the API
serves the web build). Native apps will need a token exchange flow later.
