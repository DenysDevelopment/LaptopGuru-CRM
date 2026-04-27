# Allegro Direct setup

Step-by-step for hooking up the CRM to a seller's Allegro Discussions inbox.

## 1. Register the Allegro Application

1. Open <https://apps.developer.allegro.pl/> while logged into the
   **seller account** that the CRM should send/receive on behalf of.
2. **Create new application** → choose **«Aplikacja ma dostęp do
   przeglądarki…»** (`authorization_code` flow). Other types won't work
   because we need user-context tokens for messaging.
3. **Ścieżka aplikacji (redirect URI):** add **two** lines, one URL per
   line:
   ```
   https://crm.YOUR-DOMAIN/api/channels/allegro/callback
   http://localhost:3000/api/channels/allegro/callback
   ```
   Replace `crm.YOUR-DOMAIN` with the production CRM host.
4. **Cel aplikacji:** «Tworzę aplikację tylko na swoje potrzeby»
   (single-tenant — one seller).
5. **Uprawnienia (scopes):** required + recommended:
   - `allegro:api:messaging` (REQUIRED — read + send Discussions)
   - `allegro:api:profile:read` (REQUIRED — buyer login resolution)
   - `allegro:api:orders:read` (recommended — order context in tickets)
   - `allegro:api:sale:offers:read` (recommended — offer context)
6. Save → copy the **Client ID** and **Client Secret**.

For testing without affecting the real account, repeat the same flow
under <https://apps.developer.allegro.pl/sandbox> and remember to flip
the channel's `environment=sandbox` in step 3 below.

## 2. Create the ALLEGRO channel in the CRM

In the CRM go to **Settings → Channels → New channel**, type =
**Allegro**, name e.g. «Allegro Direct». Fill the config:

| Key | Value |
|---|---|
| `oauth_client_id` | (from the Developer Portal) |
| `oauth_client_secret` | (from the Developer Portal) |
| `environment` | `production` (or `sandbox` for the sandbox app) |

Save. The channel appears in the list with a **Подключить Allegro**
button.

## 3. Connect the seller account (OAuth dance)

1. Click **Подключить Allegro** on the channel row.
2. The CRM redirects you to allegro.pl, which asks you to consent to
   the requested scopes.
3. After consent Allegro redirects back to the CRM. The button now
   shows **Переподключить (your-allegro-login)** and the channel is
   ready.

The CRM stores `oauth_access_token`, `oauth_refresh_token`,
`oauth_expires_at`, `seller_login`, `seller_id` in `ChannelConfig`
with `isSecret=true` on the token rows. Tokens are refreshed silently
(60 s ahead of expiry) on every API call.

## 4. Verify it works

1. **Inbound:** as the buyer, open a discussion thread in Allegro and
   write something. Within ~60 seconds the next polling tick of
   `AllegroPollCron` ingests the thread, you should see a new
   conversation in `/messaging?channel=ALLEGRO` with status **NEW**.
2. **Outbound:** open the conversation in the CRM, type a reply, send.
   The message lands in the Allegro discussion.
3. **Send-flow:** in `/send` switch to Allegro mode, paste the buyer's
   thread ID into the optional «Отправить прямо в Allegro Discussion»
   field and submit. The short link is delivered as an Allegro message
   automatically; the response includes `allegro: { ok: true }`.

## 5. Re-authorize after 30 days

Allegro refresh tokens are valid for ~30 days. If a refresh fails
(401 from `/auth/oauth/token`), the channel will start failing
deliveries — the **Подключить Allegro** button on the row turns into
**Переподключить**, click it to repeat step 3.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Connect button → 400 «Set oauth_client_id and oauth_client_secret first» | ChannelConfig is missing the fields. Edit the channel and add them. |
| Callback → 400 «Invalid state» | Tab was reused after switching companies. Re-click Connect. |
| Polling never picks up messages | Wrong `environment` (sandbox vs production). Check the channel config. |
| /send Allegro returns `allegro: { ok: false, error: "Allegro 403: ..." }` | Token didn't get the right scope. Re-register the App with `allegro:api:messaging` ticked, recreate Client Secret, repeat OAuth. |
