# AI360 read-only browser observer

This Browserbase Function is the isolated visual-navigation worker for the closed pilot.

It accepts only a URL and an explicit domain allowlist. It permits GET and HEAD requests, blocks cross-domain top-level navigation, disables automatic CAPTCHA solving, never receives AI360 credentials, never reuses an authenticated browser context and returns one bounded observation plus a compressed viewport screenshot.

Publish from this directory with `npm install` followed by `npm run publish`. Put the returned Function ID in the AI360 server environment as `BROWSERBASE_NAVIGATE_FUNCTION_ID`. Do not enable the pilot until the function passes the evaluation suite.

Schedule an hourly authenticated `POST` to `/api/internal/browser-artifacts/cleanup` from the deployment platform. Send `Authorization: Bearer <AI360_BROWSER_CLEANUP_SECRET>`. Pilot readiness stays closed until this secret exists, so evidence retention cannot be enabled without a cleanup path.
