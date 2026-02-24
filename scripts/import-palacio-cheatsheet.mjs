#!/usr/bin/env node
/**
 * Import questions from a Palacio-style cheatsheet CSV (with Bundle, Subject, Topic, Subtopic
 * instead of REF, and no Scalability/Group columns). Proposes GROUP and REF per row, sets
 * scalability to Standard, and optionally merges new refs into data/refs.json.
 *
 * Usage:
 *   node scripts/import-palacio-cheatsheet.mjs path/to/cheatsheet.csv
 *   node scripts/import-palacio-cheatsheet.mjs path/to/cheatsheet.csv --dry-run   # report only
 *   node scripts/import-palacio-cheatsheet.mjs path/to/cheatsheet.csv --merge     # write refs.json
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', 'data');

// ----- CSV parse (handles quoted fields and "" and newlines inside quotes) -----
function parseCsv(text) {
  const rows = [];
  let i = 0;
  const len = text.length;
  while (i < len) {
    const row = [];
    while (i < len) {
      const ch = text[i];
      if (ch === '"') {
        let cell = '';
        i++;
        while (i < len) {
          if (text[i] === '"') {
            i++;
            if (text[i] === '"') {
              cell += '"';
              i++;
            } else break;
          } else {
            cell += text[i];
            i++;
          }
        }
        row.push(cell);
        if (text[i] === ',') i++;
        else if (text[i] === '\r' || text[i] === '\n' || i >= len) break;
      } else {
        let cell = '';
        while (i < len && text[i] !== ',' && text[i] !== '\r' && text[i] !== '\n') {
          cell += text[i];
          i++;
        }
        row.push(cell.trim());
        if (text[i] === ',') i++;
        else break;
      }
    }
    if (row.length) rows.push(row);
    while (i < len && (text[i] === '\r' || text[i] === '\n')) i++;
  }
  return rows;
}

function getCol(headers, name) {
  const i = headers.findIndex((h) => h.trim().toLowerCase() === name.toLowerCase());
  return i >= 0 ? i : -1;
}

function parseBool(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().toUpperCase();
  if (t === 'TRUE' || t === '1') return true;
  if (t === 'FALSE' || t === '0' || t === '') return false;
  return null;
}

function parseIntOrNull(s) {
  if (s === null || s === undefined || String(s).trim() === '') return null;
  const n = parseInt(String(s).trim(), 10);
  return Number.isNaN(n) ? null : n;
}

/** Strip * from choice labels for consistency with refs library */
function normalizeChoices(s) {
  if (s === null || s === undefined || String(s).trim() === '') return null;
  return String(s)
    .split(';')
    .map((c) => c.replace(/^\s*\*|\*\s*$/g, '').trim())
    .filter(Boolean)
    .join(';') || null;
}

// Bundle (old label) → Group (Plan / User / Ancillary)
function bundleToGroup(bundle) {
  const b = (bundle || '').trim();
  if (/^plan$/i.test(b)) return 'Plan';
  if (/^user$/i.test(b)) return 'User';
  if (/^ancillary$/i.test(b)) return 'Ancillary';
  return 'Plan'; // default
}

/**
 * Propose REF id from labels and question. Prefer matching existing refs by intent;
 * otherwise derive from Topic_Subtopic (snake_case, lowercase).
 */
function proposeRef(row, headers) {
  const question = (row[getCol(headers, 'question')] ?? '').trim();
  const topic = (row[getCol(headers, 'Topic')] ?? '').trim();
  const subtopic = (row[getCol(headers, 'Subtopic')] ?? '').trim();
  const subject = (row[getCol(headers, 'Subject')] ?? '').trim();

  const qNorm = question.replace(/\*/g, '').replace(/\s+/g, ' ').toLowerCase();

  const refByIntent = [
    { pattern: /recommend.*friends|plan_nps/i, ref: 'plan_nps' },
    { pattern: /attend.*with anyone|with anyone|company|demographics.*general/i, ref: 'company' },
    { pattern: /how many people|group_size/i, ref: 'group_size' },
    { pattern: /travel to|travel to the experience|travel_time|component.*travel/i, ref: 'travel_time' },
    { pattern: /your age|demographics.*age/i, ref: 'age' },
    { pattern: /past 5 years|visited.*historical|frequency_monument|leisure_habits/i, ref: 'frequency_monument' },
    { pattern: /how long.*were you at|how long.*at.*hidden|visit_duration|time spent at/i, ref: 'time_spent' },
    { pattern: /spend queueing|queueing|wait_time|time_waiting/i, ref: 'time_waiting' },
    { pattern: /entrance.*check-in|check-in process|check_in/i, ref: 'rating_check_in' },
    { pattern: /rate the staff|rate.*staff|staff\s*\?/i, ref: 'rating_staff' },
    { pattern: /amount of people|number of people|capacity_5|capacity/i, ref: 'capacity' },
    { pattern: /duration of the experience|duration_5|feel about the duration/i, ref: 'duration' },
    { pattern: /3 words|three words|describe your experience|3_words/i, ref: 'three_words' },
    { pattern: /value for money|value for money of your ticket|rating_vfm|expectations.*general/i, ref: 'rating_vfm' },
    { pattern: /likely.*return|return.*experience|return_likelihood/i, ref: 'return_likelihood' },
    { pattern: /where do you live|residence|demographics.*residence/i, ref: 'residence' },
    { pattern: /enjoy the most|enjoyed the most|favorite|favorite_element/i, ref: 'favorite_element' },
    { pattern: /make this experience better|improvement_ideas|improvement/i, ref: 'improvement_ideas' },
  ];

  for (const { pattern, ref } of refByIntent) {
    if (pattern.test(qNorm) || (topic && pattern.test(topic)) || (subtopic && pattern.test(subtopic))) {
      return ref;
    }
  }

  const part = [topic, subtopic].filter(Boolean).join('_').replace(/\W+/g, '_').replace(/_+/g, '_').toLowerCase();
  if (part) return part;
  return subject ? subject.replace(/\W+/g, '_').toLowerCase() : 'unknown';
}

function rowToRef(row, headers) {
  const ixDesc = getCol(headers, 'question description');
  const ixType = getCol(headers, 'type');
  const ixScale = getCol(headers, 'scale');
  const ixStart = getCol(headers, 'start_at_one');
  const ixLeft = getCol(headers, 'left_label');
  const ixCenter = getCol(headers, 'center_label');
  const ixRight = getCol(headers, 'right_label');
  const ixMulti = getCol(headers, 'allow_multiple_selection');
  const ixOther = getCol(headers, 'allow_other_choice');
  const ixChoices = headers.findIndex((h) => /choices/i.test(h));
  const ixRandom = getCol(headers, 'Randomized');
  const ixBundle = getCol(headers, 'Bundle');
  const ixQuestion = getCol(headers, 'question');

  const question = ixQuestion >= 0 ? String(row[ixQuestion] ?? '').trim() : '';
  const bundle = ixBundle >= 0 ? row[ixBundle] : '';

  const ref = proposeRef(row, headers);
  const group = bundleToGroup(bundle);

  const get = (ix, fn = (v) => v) => (ix >= 0 && row[ix] !== undefined && row[ix] !== '') ? fn(row[ix]) : null;

  const choicesRaw = ixChoices >= 0 ? row[ixChoices] : '';
  const choices = normalizeChoices(choicesRaw);

  return {
    scalability: 'Standard',
    group,
    comment: null,
    ref,
    question,
    question_description: get(ixDesc, (v) => String(v).trim()) || null,
    type: get(ixType, (v) => String(v).trim()) || null,
    scale: parseIntOrNull(row[getCol(headers, 'scale')]),
    start_at_one: get(ixStart, parseBool),
    left_label: get(ixLeft, (v) => String(v).trim()) || null,
    center_label: get(ixCenter, (v) => String(v).trim()) || null,
    right_label: get(ixRight, (v) => String(v).trim()) || null,
    allow_multiple_selection: get(ixMulti, parseBool),
    allow_other_choice: get(ixOther, parseBool),
    choices,
    randomized: get(ixRandom, parseBool),
  };
}

function main() {
  const args = process.argv.slice(2);
  const csvPath = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const merge = args.includes('--merge');

  if (!csvPath) {
    console.error('Usage: node scripts/import-palacio-cheatsheet.mjs <path/to/cheatsheet.csv> [--dry-run] [--merge]');
    process.exit(1);
  }

  const csvText = readFileSync(csvPath, 'utf-8');
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    console.error('CSV has no data rows.');
    process.exit(1);
  }

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const refsData = JSON.parse(readFileSync(join(dataDir, 'refs.json'), 'utf-8'));
  const existingRefs = refsData.refs;
  const existingRefIds = new Set(existingRefs.map((r) => r.ref));

  const proposed = [];
  const report = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const refObj = rowToRef(row, headers);
    const isNew = !existingRefIds.has(refObj.ref);
    proposed.push({ refObj, isNew, rowIndex: i + 2 });
    report.push({
      row: i + 2,
      question: refObj.question.slice(0, 60) + (refObj.question.length > 60 ? '…' : ''),
      proposedGroup: refObj.group,
      proposedRef: refObj.ref,
      isNew,
    });
  }

  console.log('\n--- Import proposal: Scalability = Standard, GROUP and REF per row ---\n');
  report.forEach((r) => {
    console.log(`Row ${r.row}: ${r.question}`);
    console.log(`  → GROUP: ${r.proposedGroup}   REF: ${r.proposedRef}${r.isNew ? ' (NEW)' : ' (existing)'}`);
  });

  const toAdd = proposed.filter((p) => p.isNew).map((p) => p.refObj);
  const newRefIds = [...new Set(toAdd.map((r) => r.ref))];

  const seen = new Set();
  const deduped = toAdd.filter((r) => {
    if (seen.has(r.ref)) return false;
    seen.add(r.ref);
    return true;
  });

  console.log('\n--- Summary ---');
  console.log(`Total rows: ${dataRows.length}`);
  console.log(`Proposed new REFs to add: ${newRefIds.length} (${newRefIds.join(', ') || 'none'})`);
  console.log(`Refs that match existing: ${dataRows.length - deduped.length}`);

  const proposalPath = join(dataDir, 'import-palacio-proposal.json');
  const proposal = {
    source: csvPath,
    importedAt: new Date().toISOString(),
    refsToAdd: deduped,
    report: report.map((r) => ({ row: r.row, proposedGroup: r.proposedGroup, proposedRef: r.proposedRef, isNew: r.isNew })),
  };
  writeFileSync(proposalPath, JSON.stringify(proposal, null, 2), 'utf-8');
  console.log(`\nProposal written to ${proposalPath}`);

  if (merge && deduped.length > 0) {
    const merged = [...existingRefs];
    for (const r of deduped) {
      if (!existingRefIds.has(r.ref)) {
        merged.push(r);
        existingRefIds.add(r.ref);
      }
    }
    refsData.refs = merged;
    writeFileSync(join(dataDir, 'refs.json'), JSON.stringify(refsData, null, 2), 'utf-8');
    console.log(`Merged ${deduped.length} new ref(s) into data/refs.json`);
  } else if (merge && deduped.length === 0) {
    console.log('No new refs to merge; data/refs.json unchanged.');
  } else if (!dryRun && !merge) {
    console.log('\nRun with --merge to append new refs to data/refs.json');
  }
}

main();
