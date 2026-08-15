#!/usr/bin/env node
'use strict';

// Health-checks the LinkedIn access token. LinkedIn member tokens live about
// 60 days and cannot be auto-refreshed on the standard developer tier, so the
// daily sentinel workflow runs this and opens an alert issue before posting
// silently breaks.
//
// Exit codes: 0 = healthy, 2 = valid but aging (renew soon), 1 = invalid/expired.
// When GITHUB_OUTPUT is set, also writes `status` (ok|warn|expired|error) and
// a human-readable multiline `message` for the workflow to drop into an issue.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ISSUED_MARKER = path.join(ROOT, '.token-issued');
const WARN_AFTER_DAYS = 50; // tokens last ~60 days; warn with ~10 days to spare

function emit(status, message, exitCode) {
  console.log(message);
  const out = process.env.GITHUB_OUTPUT;
  if (out) {
    fs.appendFileSync(
      out,
      `status=${status}\nmessage<<LINKEDIN_TOKEN_EOF\n${message}\nLINKEDIN_TOKEN_EOF\n`
    );
  }
  process.exit(exitCode);
}

function tokenAgeDays() {
  if (!fs.existsSync(ISSUED_MARKER)) return null;
  const raw = fs.readFileSync(ISSUED_MARKER, 'utf8').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const issued = Date.parse(`${raw}T00:00:00Z`);
  if (Number.isNaN(issued)) return null;
  return Math.floor((Date.now() - issued) / 86_400_000);
}

async function main() {
  const token = (process.env.LINKEDIN_ACCESS_TOKEN || '').trim();
  if (!token) {
    emit(
      'error',
      'LINKEDIN_ACCESS_TOKEN is not configured. Follow linkedin-agent/SETUP.md to create it.',
      1
    );
  }

  let response;
  try {
    response = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    emit('error', `Could not reach the LinkedIn API: ${err.message}. Will retry on the next run.`, 1);
  }

  if (response.status === 401) {
    emit(
      'expired',
      'LinkedIn token check FAILED: the API returned 401 Unauthorized.\n' +
        'The access token has expired or been revoked, so scheduled posts will not go out.\n' +
        'Fix: repeat the "Mint the access token" steps in linkedin-agent/SETUP.md, update the ' +
        'LINKEDIN_ACCESS_TOKEN secret, and update linkedin-agent/.token-issued to today\'s date.',
      1
    );
  }

  if (!response.ok) {
    emit(
      'error',
      `LinkedIn token check got an unexpected HTTP ${response.status} from /v2/userinfo. ` +
        'The token may still work; investigate if this persists.',
      1
    );
  }

  const age = tokenAgeDays();
  if (age === null) {
    emit(
      'ok',
      'LinkedIn token is valid. Note: linkedin-agent/.token-issued is missing or not a YYYY-MM-DD ' +
        'date, so age-based expiry warnings are disabled. Commit that file with the date the token ' +
        'was minted to get renewal warnings before the ~60-day expiry.',
      0
    );
  }

  if (age >= WARN_AFTER_DAYS) {
    emit(
      'warn',
      `LinkedIn token is still valid but is ${age} days old. LinkedIn member tokens expire around ` +
        'day 60 and cannot be refreshed automatically.\n' +
        'Renew soon: repeat the token steps in linkedin-agent/SETUP.md, update the ' +
        'LINKEDIN_ACCESS_TOKEN secret, and reset linkedin-agent/.token-issued.',
      2
    );
  }

  emit('ok', `LinkedIn token is valid (${age} days old; renewal warning starts at day ${WARN_AFTER_DAYS}).`, 0);
}

main().catch((err) => {
  emit('error', `check-token.js crashed: ${err.stack || err}`, 1);
});
