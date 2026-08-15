'use strict';

// Shared helpers for the LinkedIn agent scripts. Draft files use a minimal
// flat YAML frontmatter (key: value only) so we can parse without dependencies.

function parseDraft(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
  if (!match) {
    throw new Error('missing frontmatter block (file must start with --- ... ---)');
  }
  const front = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx === -1) {
      throw new Error(`unparseable frontmatter line: "${line}"`);
    }
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = JSON.parse(value);
    } else if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
      value = value.slice(1, -1);
    }
    front[key] = value;
  }
  const body = match[2].replace(/^\s*\n/, '').trimEnd();
  return { front, body };
}

function serializeDraft(front, body) {
  const lines = Object.entries(front).map(([key, value]) => {
    const str = String(value);
    const needsQuoting = /[:#"']/.test(str) || str !== str.trim() || str === '';
    return `${key}: ${needsQuoting ? JSON.stringify(str) : str}`;
  });
  return `---\n${lines.join('\n')}\n---\n\n${body}\n`;
}

// Today's date as YYYY-MM-DD in the given IANA timezone.
function todayInTimezone(timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date());
}

const PILLARS = [
  'personal-lesson',
  'industry-pov',
  'team-culture',
  'contrarian-take',
  'celebrating-others',
];

const MAX_POST_CHARS = 3000; // LinkedIn's hard limit for post text
const MIN_POST_CHARS = 100;

module.exports = {
  parseDraft,
  serializeDraft,
  todayInTimezone,
  PILLARS,
  MAX_POST_CHARS,
  MIN_POST_CHARS,
};
