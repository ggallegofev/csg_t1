#!/usr/bin/env node
/**
 * Cheatsheet generator: select REFs by id → CSV in form-generator column order.
 * Usage:
 *   node scripts/generate-cheatsheet.mjs ref1 ref2 ref3              # English, stdout
 *   node scripts/generate-cheatsheet.mjs ref1 ref2 --lang=fr         # French wording where available
 *   node scripts/generate-cheatsheet.mjs ref1 ref2 --output=out.csv   # write to file
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

const CHEATSHEET_HEADERS = [
  'Scalability',
  'Group',
  'Comment',
  'ref',
  'question',
  'question description',
  'type',
  'scale',
  'start_at_one',
  'left_label',
  'center_label',
  'right_label',
  'allow_multiple_selection',
  'allow_other_choice',
  'choices (separated by ";")',
  'randomized',
];

function escapeCsv(value) {
  if (value === null || value === undefined || value === '') return '';
  const s = String(value);
  if (/[,"\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  return v;
}

function refToRow(ref, questionWording, questionDescription) {
  return [
    ref.scalability ?? '',
    ref.group ?? '',
    ref.comment ?? '',
    ref.ref ?? '',
    questionWording ?? ref.question ?? '',
    questionDescription ?? ref.question_description ?? '',
    ref.type ?? '',
    ref.scale ?? '',
    ref.start_at_one === true ? 'TRUE' : ref.start_at_one === false ? 'FALSE' : '',
    ref.left_label ?? '',
    ref.center_label ?? '',
    ref.right_label ?? '',
    ref.allow_multiple_selection === true ? 'TRUE' : ref.allow_multiple_selection === false ? 'FALSE' : '',
    ref.allow_other_choice === true ? 'TRUE' : ref.allow_other_choice === false ? 'FALSE' : '',
    ref.choices ?? '',
    ref.randomized === true ? 'TRUE' : ref.randomized === false ? 'FALSE' : '',
  ];
}

function main() {
  const args = process.argv.slice(2);
  let refIds = [];
  let lang = null;
  let outputPath = null;

  for (const a of args) {
    if (a.startsWith('--lang=')) lang = a.slice(7).trim();
    else if (a.startsWith('--output=')) outputPath = a.slice(9).trim();
    else if (!a.startsWith('--')) refIds.push(a.trim());
  }

  if (refIds.length === 0) {
    console.error('Usage: node scripts/generate-cheatsheet.mjs <ref> [ref ...] [--lang=xx] [--output=path.csv]');
    process.exit(1);
  }

  const refsData = JSON.parse(readFileSync(join(dataDir, 'refs.json'), 'utf-8'));
  const refsList = refsData.refs;
  const refByRef = new Map(refsList.map((r) => [r.ref, r]));

  let translations = {};
  try {
    const transData = JSON.parse(readFileSync(join(dataDir, 'translations.json'), 'utf-8'));
    translations = transData.translations ?? {};
  } catch (_) {
    // no translations file or invalid
  }

  const rows = [CHEATSHEET_HEADERS.map(escapeCsv).join(',')];
  const missing = [];

  for (const refId of refIds) {
    const ref = refByRef.get(refId);
    if (!ref) {
      missing.push(refId);
      continue;
    }
    let questionWording = ref.question;
    let questionDescription = ref.question_description;
    if (lang && translations[refId]?.[lang]) {
      const t = translations[refId][lang];
      if (typeof t === 'string') questionWording = t;
      else if (t && typeof t.question === 'string') {
        questionWording = t.question;
        if (typeof t.question_description === 'string') questionDescription = t.question_description;
      }
    }
    const row = refToRow(ref, questionWording, questionDescription);
    rows.push(row.map((c) => escapeCsv(cellValue(c))).join(','));
  }

  if (missing.length) {
    console.error('Unknown REF(s): ' + missing.join(', '));
    process.exit(1);
  }

  const csv = rows.join('\n');
  if (outputPath) writeFileSync(outputPath, csv, 'utf-8');
  else process.stdout.write(csv);
}

main();
