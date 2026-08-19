#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════════
   Campfire — nightly card pipeline.

   Appends a few new cards to data/campfire-cards.json each night. The base
   265+ deck lives embedded in index.html; this file is the optional add-on
   the page merges on load (and silently ignores if it is missing or broken).

   HARD RULES this script is built around:
     1. data/campfire-cards.json is APPEND-ONLY. Existing entries, level
        arrays, and the _readme are never rewritten or reordered. A malformed
        file aborts the run rather than being regenerated.
     2. The youngest-player age gate is a safety feature. Every level has a
        fixed set of legal `min` ages (ALLOWED below). It is enforced twice:
        in the JSON schema sent to the model, and again on the way back.
        Embers is adults-only and can never emit anything but 18.

   Usage:  node scripts/campfire.js [--dry-run] [--level=roast]
           --dry-run  plan the run and print it; no API call, no file writes.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const CARDS_PATH = path.join('data', 'campfire-cards.json');
const DECK_PATH = 'index.html';
const CARDS_PER_RUN = 3;
const MODEL = 'claude-opus-5';

/* Legal `min` ages per level — the age gate, mirrored from the base deck.
   Widening one of these weakens a safety feature; do not do it casually. */
const LEVELS = {
  spark: {
    name: 'Spark',
    mins: [4, 7, 10],
    brief: 'Easy, funny, no stakes. Good for a car ride or a five year old. Written as a question.'
  },
  kindling: {
    name: 'Kindling',
    mins: [7, 10, 12],
    brief: 'Real opinions and real memories. Where most of a good dinner lands. Written as a question.'
  },
  bonfire: {
    name: 'Bonfire',
    mins: [10, 12, 13],
    brief: 'The ones a family would normally avoid. Slower, heavier, worth the time. Written as a question.'
  },
  roast: {
    name: 'Roast',
    mins: [4, 7, 10, 13],
    brief: 'Ridiculous hypotheticals and loving slander — who gets voted off the island, who plays us in the movie. Teasing, never cruel, and never aimed at a real flaw. Written as a question.'
  },
  dare: {
    name: 'Dare',
    mins: [4, 7, 10],
    brief: 'Do something instead of saying something; they break tension fast. Written as an instruction to the table, not a question.'
  },
  embers: {
    name: 'Embers',
    mins: [18],
    brief: 'Adults only, for the two people the rest of this is built on. Nothing explicit, but nothing easy either. Written as a question. Every card is min 18 without exception.'
  }
};

/* Which level gets topped up on which day. Roast runs twice — it is the
   newest and smallest level, so it has the most catching up to do. */
const ROTATION = ['spark', 'kindling', 'bonfire', 'roast', 'dare', 'embers', 'roast'];

const HOUSE_STYLE = [
  'The deck avoids contractions entirely: "what is", not "what\'s"; "you would", not "you\'d".',
  'One sentence per card. No preamble, no title, no quotation marks around it.',
  'Second person, addressed to the table. Warm, direct, specific. Never corporate, salesy, or preachy.',
  'No emoji, no exclamation marks, no stage directions in brackets.',
  'Write for the youngest age you assign it to: a card marked 4 has to make sense to a four year old with no reading required.'
].join('\n');

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/* Normalized form used for duplicate detection. Deliberately loose: the page
   dedupes on exact text, so anything this catches is a bonus. */
function norm(q) {
  return String(q).toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9 ]/g, '').trim();
}

/* Every question already in play: the base deck embedded in index.html plus
   whatever previous nightly runs appended. */
function existingQuestions(cards) {
  const seen = new Set();
  if (fs.existsSync(DECK_PATH)) {
    const html = fs.readFileSync(DECK_PATH, 'utf8');
    for (const m of html.matchAll(/q:\s*"((?:[^"\\]|\\.)*)"/g)) seen.add(norm(m[1]));
  }
  for (const key of Object.keys(LEVELS)) {
    for (const c of cards[key] || []) if (c && c.q) seen.add(norm(c.q));
  }
  return seen;
}

/* Read the append target. Missing is fine (create the skeleton); malformed is
   not (abort rather than clobber someone's hand edit). */
function readCards() {
  if (!fs.existsSync(CARDS_PATH)) {
    log(`${CARDS_PATH} not found — creating it.`);
    const skeleton = {
      _readme: 'Optional additions to the Campfire deck. Written by scripts/campfire.js on the nightly cron. Safe to delete, empty, or break — the page falls back to the base deck silently. Schema: each level array holds {min, q}.',
      _updated: null
    };
    for (const key of Object.keys(LEVELS)) skeleton[key] = [];
    return skeleton;
  }
  const raw = fs.readFileSync(CARDS_PATH, 'utf8');
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('top level is not an object');
    }
    return parsed;
  } catch (e) {
    throw new Error(`${CARDS_PATH} is malformed (${e.message}). Refusing to overwrite it — fix or delete the file and re-run.`);
  }
}

async function askForCards(level, cards, existing) {
  const cfg = LEVELS[level];
  // Required lazily so --dry-run works without the dependency installed.
  const Anthropic = require('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  /* enum pins the age gate in the schema itself, so an out-of-band `min`
     cannot come back in the first place. */
  const schema = {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            min: { type: 'integer', enum: cfg.mins },
            q: { type: 'string' }
          },
          required: ['min', 'q'],
          additionalProperties: false
        }
      }
    },
    required: ['cards'],
    additionalProperties: false
  };

  const avoid = [];
  if (fs.existsSync(DECK_PATH)) {
    const html = fs.readFileSync(DECK_PATH, 'utf8');
    const block = html.split(`${level}: { name:`)[1];
    if (block) {
      for (const m of block.split(']}')[0].matchAll(/q:\s*"((?:[^"\\]|\\.)*)"/g)) avoid.push(m[1]);
    }
  }
  for (const c of cards[level] || []) if (c && c.q) avoid.push(c.q);

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: {
      effort: 'low',
      format: { type: 'json_schema', schema }
    },
    system: `You write conversation cards for Campfire, a free card deck families play at the dinner table. It is a parent-facing RaisedCurious property: confident, warm, direct, the voice of a smart parent who reads a lot.\n\nHouse style, which the existing 300+ cards follow without exception:\n${HOUSE_STYLE}`,
    messages: [{
      role: 'user',
      content: `Write ${CARDS_PER_RUN} new cards for the ${cfg.name} level.

${cfg.name}: ${cfg.brief}

Assign each card a "min", the age of the youngest player it is written for. Legal values for this level: ${cfg.mins.join(', ')}. Pick the honest one — a card that needs a teenager's life experience is not a 7.

These already exist. Do not repeat them, and do not write a near-variation of one:
${avoid.map(q => `- ${q}`).join('\n')}`
    }]
  });

  const text = response.content.find(b => b.type === 'text');
  if (!text) throw new Error('model returned no text block');
  return JSON.parse(text.text).cards || [];
}

/* Second enforcement pass. The schema should make most of this unreachable;
   it runs anyway because the age gate is the one thing that must not slip. */
function validate(proposed, level, existing) {
  const cfg = LEVELS[level];
  const kept = [];
  const batch = new Set();
  for (const card of proposed) {
    const q = typeof card?.q === 'string' ? card.q.trim() : '';
    const min = Number(card?.min);
    if (!q) { log('  ✗ dropped: empty question'); continue; }
    if (!cfg.mins.includes(min)) { log(`  ✗ dropped (min ${card?.min} not legal for ${level}): ${q}`); continue; }
    if (level === 'embers' && min !== 18) { log(`  ✗ dropped (embers must be 18): ${q}`); continue; }
    const key = norm(q);
    if (existing.has(key) || batch.has(key)) { log(`  ✗ dropped (duplicate): ${q}`); continue; }
    batch.add(key);
    kept.push({ min, q });
    if (kept.length >= CARDS_PER_RUN) break;
  }
  return kept;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const forced = (args.find(a => a.startsWith('--level=')) || '').split('=')[1];

  const level = forced || ROTATION[new Date().getUTCDay()];
  if (!LEVELS[level]) throw new Error(`unknown level "${level}" (expected one of: ${Object.keys(LEVELS).join(', ')})`);

  const cards = readCards();
  if (!Array.isArray(cards[level])) cards[level] = [];   // adds a new level key (e.g. roast) without touching the rest
  const existing = existingQuestions(cards);

  log(`Level tonight: ${LEVELS[level].name} (${cards[level].length} nightly cards so far, ${existing.size} questions already in play)`);

  if (dryRun) {
    log(`DRY RUN — would ask ${MODEL} for ${CARDS_PER_RUN} ${LEVELS[level].name} cards with min in {${LEVELS[level].mins.join(', ')}}, then append to ${CARDS_PATH}. No API call made, no files written.`);
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  const proposed = await askForCards(level, cards, existing);
  const kept = validate(proposed, level, existing);

  if (!kept.length) {
    log('No usable cards this run — leaving the file untouched.');
    return;
  }

  cards[level].push(...kept);
  cards._updated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(CARDS_PATH, JSON.stringify(cards, null, 2) + '\n');

  for (const c of kept) log(`  ✓ ${LEVELS[level].name} ${c.min}+ — ${c.q}`);
  log(`Appended ${kept.length} card(s) to ${CARDS_PATH}.`);
}

main().catch(err => {
  log(`FAILED: ${err.message}`);
  process.exit(1);
});
