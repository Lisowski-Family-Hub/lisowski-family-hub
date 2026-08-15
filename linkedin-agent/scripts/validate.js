#!/usr/bin/env node
'use strict';

// Lints every draft in linkedin-agent/drafts/. Run by the PR validator
// workflow and by the drafter workflow before it opens a PR.
// Exits 1 with per-file messages when anything is off.

const fs = require('fs');
const path = require('path');
const { parseDraft, PILLARS, MAX_POST_CHARS, MIN_POST_CHARS } = require('./lib');

const ROOT = path.join(__dirname, '..');
const DRAFTS_DIR = path.join(ROOT, 'drafts');
const PUBLISHED_DIR = path.join(ROOT, 'published');

function listMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
}

const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

const drafts = listMarkdown(DRAFTS_DIR);
const published = new Set(listMarkdown(PUBLISHED_DIR));

for (const file of drafts) {
  const dateFromName = file.replace(/\.md$/, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFromName)) {
    fail(file, 'filename must be YYYY-MM-DD.md');
    continue;
  }
  if (Number.isNaN(Date.parse(`${dateFromName}T00:00:00Z`))) {
    fail(file, `"${dateFromName}" is not a real calendar date`);
    continue;
  }
  if (published.has(file)) {
    fail(file, 'a published post already exists for this date (see published/)');
  }

  let parsed;
  try {
    parsed = parseDraft(fs.readFileSync(path.join(DRAFTS_DIR, file), 'utf8'));
  } catch (err) {
    fail(file, err.message);
    continue;
  }
  const { front, body } = parsed;

  if (front.date !== dateFromName) {
    fail(file, `frontmatter date "${front.date || ''}" must match the filename date`);
  }
  if (!PILLARS.includes(front.pillar)) {
    fail(file, `pillar "${front.pillar || ''}" must be one of: ${PILLARS.join(', ')}`);
  }
  if (!['draft', 'approved'].includes(front.status)) {
    fail(file, `status "${front.status || ''}" must be "draft" or "approved"`);
  }
  if (!front.hook || !front.hook.trim()) {
    fail(file, 'hook is required (one line describing the opening angle)');
  } else if (front.hook.length > 200) {
    fail(file, `hook is ${front.hook.length} chars; keep it under 200`);
  }

  if (!body.trim()) {
    fail(file, 'post body is empty');
  } else if (body.length > MAX_POST_CHARS) {
    fail(file, `post body is ${body.length} chars; LinkedIn's limit is ${MAX_POST_CHARS}`);
  } else if (body.length < MIN_POST_CHARS) {
    fail(file, `post body is only ${body.length} chars; write at least ${MIN_POST_CHARS}`);
  }
}

if (errors.length > 0) {
  console.error(`Draft validation failed (${errors.length} problem${errors.length === 1 ? '' : 's'}):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(`Validated ${drafts.length} draft${drafts.length === 1 ? '' : 's'} — all good.`);
