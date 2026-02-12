# REF Question Library

Central store of survey question REFs for post-experience surveys. Each REF is a unique question definition (wording, type, settings) used to build cheatsheets for the Typeform form generator.

## Structure

- **`data/refs.json`** — All REFs with English wording, question type, and settings. Sorted by two categorisations:
  - **Scalability**: `Standard` (widely applicable) or `Custom` (tailored to a specific experience)
  - **Group**: `Plan` (general experience), `User` (attendee), or `Ancillary`
- **`data/translations.json`** — Translations per REF and language (e.g. `fr`). Each entry can include: `question`, `question_description`, `left_label`, `center_label`, `right_label`, and `choices` (semicolon-separated). Omitted fields fall back to the REF’s English value. French (modern, everyday) is provided for all REFs.
- **`data/ref-schema.json`** — JSON Schema for refs; use for validation and editor support.

## Cheatsheet column order

The form generator expects columns in this exact order. Any export (e.g. cheatsheet generator) must preserve it:

| # | Column | Notes |
|---|--------|--------|
| 1 | Scalability | Standard / Custom |
| 2 | Group | Plan / User / Ancillary |
| 3 | Comment | Free text |
| 4 | **ref** | Unique REF id (key) |
| 5 | question | Question wording (EN or translated) |
| 6 | question description | Optional instruction |
| 7 | type | long_text, multiple_choice, opinion_scale, rating |
| 8 | scale | e.g. 5, 11 |
| 9 | start_at_one | TRUE/FALSE for opinion_scale |
| 10 | left_label | Scale left anchor |
| 11 | center_label | Scale centre |
| 12 | right_label | Scale right anchor |
| 13 | allow_multiple_selection | TRUE/FALSE |
| 14 | allow_other_choice | TRUE/FALSE |
| 15 | choices (separated by ";") | Semicolon-separated options |
| 16 | randomized | TRUE/FALSE |

## Adding or editing REFs

Edit `data/refs.json` directly. Keep:

- **ref** unique across all entries.
- **scalability** one of `Standard`, `Custom`.
- **group** one of `Plan`, `User`, `Ancillary`.
- **type** one of `long_text`, `multiple_choice`, `opinion_scale`, `rating` (or null if not yet set).
- **choices** as a single string with options separated by `;` (no spaces around semicolons).
- Unused fields as `null`.

## Web UI (table + download)

Open the REF list in a browser: table view with checkboxes, language selector, and a **Download cheatsheet** button that produces the same CSV as the CLI generator.

Because the page loads `data/refs.json` and `data/translations.json` via `fetch`, you need to serve the project folder (opening `index.html` as a file won’t work). From the project root:

```bash
npx serve .
# or: python3 -m http.server 8000
```

Then open the URL shown (e.g. http://localhost:3000). Share the same URL with colleagues on the same network, or deploy the folder to any static host (GitHub Pages, Netlify, etc.) and share that link.

## Cheatsheet generator (CLI)

Build a cheatsheet CSV from a list of REF ids (same column order as above):

```bash
# English wording, print to stdout
node scripts/generate-cheatsheet.mjs plan_nps duration rating_venue

# French wording where available (falls back to English if no translation)
node scripts/generate-cheatsheet.mjs plan_nps duration --lang=fr

# Write to a file
node scripts/generate-cheatsheet.mjs three_words favorite_element improvement_ideas --output=my-cheatsheet.csv
```

Unknown REF ids cause the script to exit with an error. Translations are read from `data/translations.json` under `translations[ref_id][lang]` (string or `{ question, question_description }`).

## Validation

```bash
node scripts/validate.mjs
```

## Incomplete REFs

The last REF in the initial import (`fb_purchase_food_category`) has no `type` set—add it when the question type is decided. The validator will still pass; add a `type` when the question type is decided.
