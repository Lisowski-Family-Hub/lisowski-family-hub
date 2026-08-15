#!/usr/bin/env node
'use strict';

// Publishes today's approved draft to LinkedIn via the UGC Posts API, then
// archives it to published/ with the post URN. Designed to be safe to re-run:
// every "nothing to do" path exits 0, and the draft -> published move is the
// idempotency guard (a rerun finds no draft for today and stops).
//
// Env:
//   LINKEDIN_ACCESS_TOKEN  member token with w_member_social (required unless DRY_RUN)
//   LINKEDIN_PERSON_URN    e.g. urn:li:person:AbC123 (required unless DRY_RUN)
//   DRY_RUN                any truthy value: print the payload, call nothing
//   TARGET_DATE            YYYY-MM-DD override (defaults to today in POST_TIMEZONE)
//   POST_TIMEZONE          IANA tz for "today" (default America/Chicago)

const fs = require('fs');
const path = require('path');
const { parseDraft, serializeDraft, todayInTimezone } = require('./lib');

const ROOT = path.join(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');
const PUBLISHED_DIR = path.join(ROOT, 'published');
const API_URL = 'https://api.linkedin.com/v2/ugcPosts';

function isTruthy(value) {
  return Boolean(value) && value !== '0' && value.toLowerCase() !== 'false';
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`Missing required environment variable ${name}. See linkedin-agent/SETUP.md.`);
    process.exit(1);
  }
  return value.trim();
}

function archive(targetDate, front, body, extraFront) {
  const archived = serializeDraft(
    { ...front, ...extraFront, status: 'published' },
    body
  );
  fs.mkdirSync(PUBLISHED_DIR, { recursive: true });
  fs.writeFileSync(path.join(PUBLISHED_DIR, `${targetDate}.md`), archived);
  fs.unlinkSync(path.join(DRAFTS_DIR, `${targetDate}.md`));
  console.log(`Archived to published/${targetDate}.md`);
}

async function main() {
  const dryRun = isTruthy(process.env.DRY_RUN || '');
  const timeZone = process.env.POST_TIMEZONE || 'America/Chicago';
  const targetDate = (process.env.TARGET_DATE || '').trim() || todayInTimezone(timeZone);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    console.error(`TARGET_DATE "${targetDate}" must be YYYY-MM-DD.`);
    process.exit(1);
  }

  const draftPath = path.join(DRAFTS_DIR, `${targetDate}.md`);
  const publishedPath = path.join(PUBLISHED_DIR, `${targetDate}.md`);

  if (fs.existsSync(publishedPath)) {
    console.log(`Post for ${targetDate} is already in published/ — nothing to do.`);
    return;
  }
  if (!fs.existsSync(draftPath)) {
    console.log(`No approved draft at drafts/${targetDate}.md — nothing to publish today.`);
    return;
  }

  const { front, body } = parseDraft(fs.readFileSync(draftPath, 'utf8'));
  if (!body.trim()) {
    console.error(`drafts/${targetDate}.md has an empty body; refusing to publish.`);
    process.exit(1);
  }

  const author = dryRun
    ? (process.env.LINKEDIN_PERSON_URN || 'urn:li:person:DRY_RUN_PLACEHOLDER')
    : requireEnv('LINKEDIN_PERSON_URN');

  const payload = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: body },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
  };

  if (dryRun) {
    console.log(`[dry-run] Would POST ${API_URL} for ${targetDate} (${body.length} chars):`);
    console.log(JSON.stringify(payload, null, 2));
    console.log('[dry-run] No API call made; draft left in place.');
    return;
  }

  const token = requireEnv('LINKEDIN_ACCESS_TOKEN');
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Restli-Protocol-Version': '2.0.0',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  if (response.status === 201) {
    let postUrn = response.headers.get('x-restli-id') || '';
    if (!postUrn) {
      try {
        postUrn = JSON.parse(responseText).id || '';
      } catch {
        /* leave blank */
      }
    }
    console.log(`Published ${targetDate} to LinkedIn: ${postUrn || '(URN not returned)'}`);
    archive(targetDate, front, body, {
      postUrn: postUrn || 'unknown',
      publishedAt: new Date().toISOString(),
    });
    return;
  }

  if (response.status === 401) {
    console.error(
      'LinkedIn returned 401 Unauthorized — the access token is invalid or expired.\n' +
        'Re-run the token steps in linkedin-agent/SETUP.md and update the LINKEDIN_ACCESS_TOKEN secret.'
    );
    process.exit(1);
  }

  if (response.status === 422 && /duplicate/i.test(responseText)) {
    console.log(
      `LinkedIn flagged ${targetDate} as a duplicate of an existing post — treating as already published.`
    );
    archive(targetDate, front, body, {
      postUrn: 'unknown (LinkedIn duplicate detection)',
      publishedAt: new Date().toISOString(),
    });
    return;
  }

  console.error(`LinkedIn API error ${response.status}: ${responseText.slice(0, 2000)}`);
  process.exit(1);
}

main().catch((err) => {
  console.error(`publish.js failed: ${err.stack || err}`);
  process.exit(1);
});
