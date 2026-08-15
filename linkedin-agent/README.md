# LinkedIn Leadership Agent

A GitHub-native agent that builds a consistent leadership presence on LinkedIn:
it drafts posts in your voice, gives you a one-click approval step, publishes on
a weekday schedule via the official LinkedIn API, and learns from post
performance over time. GitHub Actions are the scheduler, pull requests are the
approval UI, and this directory is the agent's memory.

**New here? Do the one-time setup first: [SETUP.md](SETUP.md).**

## The weekly rhythm

| When (Central) | What happens | Workflow |
| --- | --- | --- |
| Sunday ~4 PM | Claude drafts 5 posts (Mon–Fri) and opens a PR assigned to you | `linkedin-draft.yml` |
| You, anytime before the day | Review the PR: edit inline, ask `@claude` for revisions, delete a day, or merge | — |
| Mon–Fri ~8 AM | The post for that date (if merged to `main`) publishes to LinkedIn and is archived | `linkedin-publish.yml` |
| Saturday ~9 AM | Claude folds any metrics you dropped into the tracking issue into the performance log | `linkedin-retro.yml` |
| Daily | The access token is health-checked; an alert issue opens before it silently expires | `linkedin-token-sentinel.yml` |
| Every drafts PR | Drafts are linted (format, length, duplicate dates) | `linkedin-validate.yml` |

## How approval works

**Merging the drafts PR is the approval.** The publisher only reads
`linkedin-agent/drafts/` on `main`, and files only reach `main` by being merged.
On each weekday it looks for `drafts/<today>.md`; if present it posts the body
verbatim to LinkedIn, then moves the file to `published/` with the post URN —
which is also the guard that makes reruns harmless.

While reviewing a drafts PR you can:

- **Edit** any draft directly on the branch — what's in the file is exactly what posts.
- **Comment** `@claude <request>` (e.g. `@claude make Thursday less preachy`) and
  Claude revises the drafts on the branch.
- **Delete** a draft file to skip that day.
- **Close** the PR unmerged to skip the whole week.

## How it learns

Paste post metrics (impressions, reactions, comments — informal is fine) into
the open issue labeled `linkedin-metrics` whenever convenient. The Saturday
retro reads that issue plus recent published posts and appends lessons to
[`performance/log.md`](performance/log.md). The Sunday drafter reads that log
before writing, so every batch of drafts is informed by what actually worked.

## When something breaks

Failures never pass silently: every scheduled workflow opens or updates an
issue labeled `linkedin-agent-alert` with the run link and likely cause. The
most common alert is token expiry — LinkedIn member tokens last ~60 days and
can't be auto-renewed; [SETUP.md](SETUP.md#renewing-the-token) covers the
5-minute renewal.

## File map

```
profile/questionnaire.md  Fill this in once; it seeds the three files below
profile/voice.md          How the posts should sound (drafter reads this)
profile/audience.md       Who the posts are for (drafter reads this)
profile/pillars.md        The 5 content pillars + weekday rotation
drafts/                   Pending posts, one per date (YYYY-MM-DD.md)
published/                Archived posts with LinkedIn post URNs
performance/log.md        Metrics + lessons learned (retro writes, drafter reads)
scripts/validate.js       Draft linter (run on every PR)
scripts/publish.js        Publisher (supports DRY_RUN=1)
scripts/check-token.js    Token health check
.token-issued             YYYY-MM-DD the current token was minted (you maintain this)
```

## Testing locally

```bash
node linkedin-agent/scripts/validate.js                 # lint all drafts
DRY_RUN=1 TARGET_DATE=2026-08-17 \
  node linkedin-agent/scripts/publish.js                # print payload, post nothing
LINKEDIN_ACCESS_TOKEN=... node linkedin-agent/scripts/check-token.js
```

Both Claude-powered workflows (`draft`, `retro`) and the publisher also support
**Run workflow** (workflow_dispatch) from the Actions tab; the publisher's
dispatch defaults to dry-run.
