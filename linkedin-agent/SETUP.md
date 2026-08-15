# One-time setup

Everything here is done once (plus a ~5-minute token renewal every ~2 months).
Nothing posts to LinkedIn until these steps are complete **and** you merge a
drafts PR, so there's no risk in doing this at your own pace.

## 1. Create a LinkedIn developer app

1. Go to <https://developer.linkedin.com/> → **My apps** → **Create app**.
2. Fill in the basics. LinkedIn requires associating a **LinkedIn Page** — use
   one you admin, or create a minimal page for yourself.
3. In the app's **Products** tab, request these two products (both are
   self-serve and usually approved instantly):
   - **Share on LinkedIn** — grants the `w_member_social` scope (posting).
   - **Sign In with LinkedIn using OpenID Connect** — grants `openid profile`
     (used to find your person URN and health-check the token).
4. In the **Auth** tab:
   - Note the **Client ID** and **Client Secret**.
   - Add an **Authorized redirect URL**. If you have nothing running locally,
     `https://oauth.pstmn.io/v1/callback` (Postman's helper) works; so does
     `http://localhost:3000/callback` (you'll copy the code from the address
     bar of the failed redirect).

## 2. Mint the access token

LinkedIn uses 3-legged OAuth; two manual steps:

**a. Authorize in the browser.** Open this URL (fill in your values, keep the
scopes exactly as written):

```
https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=YOUR_CLIENT_ID&redirect_uri=YOUR_REDIRECT_URL&scope=openid%20profile%20w_member_social
```

Approve. You'll land on your redirect URL with `?code=...` in the address bar.
Copy that code — it's single-use and expires in ~30 minutes.

**b. Exchange the code for a token:**

```bash
curl -X POST https://www.linkedin.com/oauth/v2/accessToken \
  -d grant_type=authorization_code \
  -d code=THE_CODE_FROM_STEP_A \
  -d client_id=YOUR_CLIENT_ID \
  -d client_secret=YOUR_CLIENT_SECRET \
  -d redirect_uri=YOUR_REDIRECT_URL
```

The response's `access_token` is your token. It lasts **~60 days** and cannot
be refreshed automatically on the standard tier — the daily sentinel workflow
will warn you in an issue before it expires.

## 3. Find your person URN

```bash
curl -H "Authorization: Bearer YOUR_ACCESS_TOKEN" https://api.linkedin.com/v2/userinfo
```

Take the `sub` value from the response; your URN is `urn:li:person:<sub>`
(e.g. `sub: "AbC12dE3f"` → `urn:li:person:AbC12dE3f`).

## 4. Add the GitHub secrets

Repo → **Settings** → **Secrets and variables** → **Actions** → **New
repository secret**, five times:

| Secret | Value |
| --- | --- |
| `ANTHROPIC_API_KEY` | An Anthropic API key (console.anthropic.com) — powers drafting, revisions, and the retro |
| `LINKEDIN_CLIENT_ID` | From step 1 (kept for renewals) |
| `LINKEDIN_CLIENT_SECRET` | From step 1 (kept for renewals) |
| `LINKEDIN_ACCESS_TOKEN` | From step 2 |
| `LINKEDIN_PERSON_URN` | From step 3, the full `urn:li:person:...` string |

Optional: add a repository **variable** `LINKEDIN_REVIEWER` with the GitHub
username that drafts PRs should be assigned to (defaults to the repo owner).

## 5. Record the token date

Commit the file `linkedin-agent/.token-issued` containing just today's date:

```bash
date +%F > linkedin-agent/.token-issued
git add linkedin-agent/.token-issued && git commit -m "Record LinkedIn token date" && git push
```

The sentinel uses this to start warning at day 50, ten days before expiry.

## 6. Personalize the agent

Fill in `profile/questionnaire.md`, then update `profile/voice.md` and
`profile/audience.md` to match your answers (or open an issue/PR and ask
`@claude` to do it from your questionnaire answers). The better these files,
the less editing your Sunday drafts will need.

## 7. Smoke-test

1. Actions → **LinkedIn / Token sentinel** → Run workflow. It should pass quietly.
2. Actions → **LinkedIn / Draft weekly posts** → Run workflow. Within a few
   minutes a PR titled "LinkedIn drafts — week of ..." should appear.
3. Actions → **LinkedIn / Publish** → Run workflow with **dry run** checked and
   a target date matching one of the drafts *after merging the PR*. The log
   shows the exact payload that would have been sent.
4. When you're ready for the real thing: merge a drafts PR and either wait for
   the weekday cron or dispatch Publish with dry run **unchecked**.

## Renewing the token

When the sentinel opens a "LinkedIn token needs attention" issue (or ~every 2
months):

1. Repeat step 2 (authorize + exchange) — same app, same scopes.
2. Update the `LINKEDIN_ACCESS_TOKEN` secret.
3. Update `linkedin-agent/.token-issued` to today's date and push.

The sentinel closes the alert issue automatically on its next healthy run.

## Notes and limits

- The publisher and retro commit directly to `main` (archiving posts, updating
  the log). If you enable branch protection on `main`, allow the
  `github-actions` bot to push, or those commits will fail and raise alerts.
- Posting targets your **personal profile** (`urn:li:person:...`). Company-page
  posting would need the Community Management API and an org URN — out of scope
  for v1.
- LinkedIn's API doesn't expose personal organic post analytics on this tier,
  which is why metrics flow through the drop-box issue instead of being pulled
  automatically.
