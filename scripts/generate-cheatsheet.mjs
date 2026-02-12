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

function getTranslation(translations, refId, lang) {
  if (!lang || !translations[refId]?.[lang]) return null;
  const t = translations[refId][lang];
  if (typeof t === 'string') return { question: t };
  return t;
}

function refToRow(ref, trans) {
  const q = trans?.question ?? ref.question ?? '';
  const qd = trans?.question_description ?? ref.question_description ?? '';
  const left = trans?.left_label ?? ref.left_label ?? '';
  const center = trans?.center_label ?? ref.center_label ?? '';
  const right = trans?.right_label ?? ref.right_label ?? '';
  const choices = trans?.choices ?? ref.choices ?? '';
  return [
    ref.scalability ?? '',
    ref.group ?? '',
    ref.comment ?? '',
    ref.ref ?? '',
    q,
    qd,
    ref.type ?? '',
    ref.scale ?? '',
    ref.start_at_one === true ? 'TRUE' : ref.start_at_one === false ? 'FALSE' : '',
    left,
    center,
    right,
    ref.allow_multiple_selection === true ? 'TRUE' : ref.allow_multiple_selection === false ? 'FALSE' : '',
    ref.allow_other_choice === true ? 'TRUE' : ref.allow_other_choice === false ? 'FALSE' : '',
    choices,
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
    const trans = getTranslation(translations, refId, lang);
    const row = refToRow(ref, trans);
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
