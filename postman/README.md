# ExpressPay Postman evidence

This collection proves the direct ExpressPay sandbox connection in a format
that can be demonstrated or screenshotted for a reviewer. It complements:

- `npm run payments:contract` — application/provider contract tests;
- `npm run payments:verify` — disposable database activation and credits test;
- the later manual hosted-checkout payment — the final end-to-end proof.

## Set up Postman

1. Import `AI360_ExpressPay_Sandbox.postman_collection.json`.
2. Import `AI360_ExpressPay_Sandbox.postman_environment.json`.
3. Duplicate the environment and call the copy `AI360 ExpressPay Sandbox - LOCAL`.
4. Enter the sandbox `merchant_id` and `api_key` as **current values** only.
5. Select that environment. Never commit or share the populated copy.

Run request 1, then request 2. Open each response's **Test Results** and
**Visualize** tabs. The Visualize views deliberately omit the API key and token.

If request 1 returns provider status 4, the payload reached ExpressPay but the
runtime's outbound IP is not allowlisted. ExpressPay must allowlist the stable
staging-server egress IP before the test can pass.

## What to share with management

Create a short PDF or slide containing:

1. Screenshot of request 1's Visualize tab.
2. Screenshot of request 2's Visualize tab.
3. Terminal screenshot showing `payments:contract` passed.
4. Terminal screenshot showing `payments:verify` passed.
5. For final approval, the AI360 payment-status page after a completed sandbox
   payment showing `approved`, plus the corresponding ExpressPay portal entry.

Do **not** share the Postman environment, raw request body, Postman Console, full
run export, checkout URL, or provider token. Those can contain credentials or
transaction capabilities.

The first two requests create and query a pending hosted checkout; they do not
test AI360 subscription activation by themselves. Final sign-off still requires
one completed sandbox checkout through the staging application.
