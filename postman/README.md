# ExpressPay Postman verification kit

This kit tests ExpressPay's hosted-checkout Submit and Query APIs directly in
either sandbox or live. It does not submit card or Mobile Money credentials and
cannot complete a charge by itself.

Official contract: <https://expresspaygh.com/developers/docs/accept-payments/merchant-api>

## Files to import

Import all three files into Postman:

1. `AI360_ExpressPay_Sandbox.postman_collection.json`
2. `AI360_ExpressPay_Sandbox.postman_environment.json`
3. `AI360_ExpressPay_Live.postman_environment.json`

The collection filename retains its original name for compatibility, but the
collection supports both environments.

## Prepare sandbox

1. Duplicate `AI360 ExpressPay Sandbox - TEMPLATE`.
2. Name the copy `AI360 ExpressPay Sandbox - LOCAL`.
3. Add the sandbox merchant ID and API key as secret/current values.
4. Set a real test email and phone number approved by ExpressPay.
5. Keep `target_environment=sandbox` and
   `expresspay_origin=https://sandbox.expresspaygh.com` unchanged.
6. Select the environment.

Run requests in order:

1. `0 - Show this Postman runner's public IP`
2. `1 - Create hosted checkout`
3. `2 - Query checkout server-to-server`

Request 1 stores the returned token only in the selected local environment.
Request 2 queries that exact token and verifies order, currency and amount.

## Prepare live

Only continue after ExpressPay confirms all of the following:

- live merchant ID and API key are active;
- the public IP shown by request 0 is allowlisted for the live merchant;
- a low-value live order is permitted;
- the expected minimum test amount and test payer details.

Then:

1. Duplicate `AI360 ExpressPay Live - TEMPLATE`.
2. Name the copy `AI360 ExpressPay Live - LOCAL`.
3. Add the live merchant ID and API key as secret/current values.
4. Confirm `expresspay_origin=https://expresspaygh.com`.
5. Set the ExpressPay-approved live amount, email and phone.
6. Set `live_confirmation=YES_I_UNDERSTAND`.
7. Select the live environment and run requests 0, 1 and 2 in order.

The collection refuses a live provider request unless the exact confirmation
text is present. It also refuses any mismatch between the selected target and
the endpoint.

## IP allowlisting warning

Postman calls ExpressPay directly. Therefore ExpressPay sees the public IP of
the Postman runner, not Hostinger's server IP:

- Postman Desktop app/agent: normally your current internet public IP;
- Postman cloud runner: a Postman-owned outbound IP, which may differ;
- AI360 production checkout: Hostinger's outbound server IP.

An ExpressPay Submit status `4` means the request reached the provider but that
source IP is not allowed for the selected merchant. Ask ExpressPay to allowlist
the IP shown by request 0, or test through the deployed AI360 application.

## Provider results

Submit response `status`:

- `1`: success; token created
- `2`: invalid credentials
- `3`: invalid request
- `4`: invalid source IP

Query response `result`:

- `1`: approved
- `2`: declined
- `3`: transaction/system error
- `4`: pending

A successful Submit is not a completed payment. A new token will normally be
Pending until someone opens hosted checkout and completes the transaction.

## Safe evidence sharing

Share screenshots from each response's **Test Results** and **Visualize** tabs.
The visualizations omit the API key and full provider token.

Never share:

- populated Postman environments;
- raw request bodies or the Postman Console;
- merchant API keys;
- provider tokens or checkout URLs;
- environment exports after credentials have been entered.
