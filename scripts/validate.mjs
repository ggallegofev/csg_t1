#!/usr/bin/env node
/**
 * Validates data/refs.json: required fields, unique refs, allowed enum values.
 * Usage: node scripts/validate.mjs
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const refsPath = join(__dirname, '..', 'data', 'refs.json');

const SCALABILITY = new Set(['Standard', 'Custom']);
const GROUP = new Set(['Plan', 'User', 'Ancillary']);
const TYPE = new Set(['long_text', 'multiple_choice', 'opinion_scale', 'rating', null]);

function validate() {
  const raw = readFileSync(refsPath, 'utf-8');
  const data = JSON.parse(raw);
  const refs = data.refs;
  if (!Array.isArray(refs)) {
    console.error('refs must be an array');
    process.exit(1);
  }

  const seenRefs = new Set();
  let failed = false;

  refs.forEach((r, i) => {
    const row = i + 2; // 1-based + header
    if (!r.ref) {
      console.error(`Row ${row}: missing ref`);
      failed = true;
    } else if (seenRefs.has(r.ref)) {
      console.error(`Row ${row}: duplicate ref "${r.ref}"`);
      failed = true;
    } else {
      seenRefs.add(r.ref);
    }
    if (!r.scalability) {
      console.error(`Row ${row} (${r.ref}): missing scalability`);
      failed = true;
    } else if (!SCALABILITY.has(r.scalability)) {
      console.error(`Row ${row} (${r.ref}): invalid scalability "${r.scalability}"`);
      failed = true;
    }
    if (!r.group) {
      console.error(`Row ${row} (${r.ref}): missing group`);
      failed = true;
    } else if (!GROUP.has(r.group)) {
      console.error(`Row ${row} (${r.ref}): invalid group "${r.group}"`);
      failed = true;
    }
    if (r.question === undefined || r.question === null) {
      console.error(`Row ${row} (${r.ref}): missing question`);
      failed = true;
    }
    if (r.type != null && !TYPE.has(r.type)) {
      console.error(`Row ${row} (${r.ref}): invalid type "${r.type}"`);
      failed = true;
    }
  });

  if (failed) process.exit(1);
  console.log(`Validated ${refs.length} REFs.`);
}

validate();
