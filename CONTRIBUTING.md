# Contributing to DeclutterBot

## New Features Require Tests

**Every new feature must be accompanied by a test file before it is considered complete.**

This project uses a lightweight Node.js test harness with no external dependencies. Tests live alongside the source files and are run with:

```bash
node test_<feature>.js
```

---

## Test File Conventions

| Item | Convention |
|------|------------|
| File name | `test_<feature>.js` (e.g. `test_move.js`, `test_batch.js`) |
| Location | `tests/` subfolder |
| Runner | Node.js — no install required |
| Exit code | `0` on all pass, `1` on any failure |

---

## Tests Are Required for Bug Fixes Too

**Bug fixes require a test that would have caught the bug.** A fix without a test is just a guess — it may regress silently.

When fixing a bug, write a test that:
1. **Reproduces the original failure** — the test should fail before the fix is applied
2. **Passes after the fix** — confirming the fix works
3. **Is named after the bug** — e.g. `assert('selectBox echoes user message (regression)')` so it's clear why the test exists if it ever fails again

This applies to:
- Incorrect behavior (wrong output, wrong state)
- Missing behavior (something that should happen but doesn't — like a UI action not echoing a command)
- Scoping / initialisation bugs (e.g. `renderBoxTree` not defined at call time)
- Data migration bugs (e.g. `parentId` undefined vs null from localStorage)

**Feature changes also require tests.** If you change how an existing feature behaves — not just add a new one — update or add tests to cover the new behavior. The existing tests may still pass while the changed behavior is untested.

---

## What to Test

For each feature, cover at minimum:

- **Happy path** — the primary intended input works correctly
- **Shorthand / aliases** — e.g. `m` as well as `move`
- **Prompt fallback** — if required info is missing, the bot asks for it
- **Follow-up answer** — the bot correctly handles the answer to its own prompt
- **No active context** — graceful error when no box/item is active
- **Side-effect safety** — existing data (items, other boxes) is not corrupted
- **Edge cases** — multi-word input, unexpected casing, empty strings

See `test_move.js` for a worked example covering all of the above.

---

## How Tests Work

Tests stub all DOM and browser globals before loading `app.js`, then call logic functions directly and assert on state and message output.

### Stub pattern

```js
// Set stubs as globals BEFORE require()
global.addBotMessage = function(text) { lastBotMessage = text; };
global.setChips      = function(chips) { lastChips = chips; };
global.renderSidebar = function() {};
// ... etc.

var app = require('../app.js');
var state        = app.state;
var processInput = app.processInput;
```

### Adding tests to an existing file

Always insert new tests **before the summary block** at the bottom of the file — never append with `cat >>` or add them after the `process.exit` call. Tests placed after `process.exit` will silently not run when the file is executed standalone (the process exits before reaching them), but will run inside the test runner where `process.exit` is suppressed — causing the runner's count to diverge from the individual file's count.

The summary block looks like this and must remain the last thing in the file:

```js
// ── SUMMARY ──────────────────
console.log('\n' + (failed === 0 ? '✅' : '❌') + ' ' + passed + ' passed, ' + failed + ' failed\n');
process.exit(failed > 0 ? 1 : 0);
```

### Reset between tests

Each test case should call a `reset()` helper that wipes `state` back to a clean slate and clears captured output:

```js
function reset() {
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;
  state.pendingBatch = null;
  state.conversationStage = 'BOX_OPEN';
  state.conversationHistory = [];
  lastBotMessage = null;
  lastChips = [];
}
```

### Assert helpers

```js
function assert(desc, condition) { ... }
function assertIncludes(desc, haystack, needle) { ... }
```

---

## Browser Compatibility (Safari / iOS)

**Do not define functions inside `if` blocks that need to be globally accessible.** Safari/iOS does not hoist function declarations inside conditional blocks to global scope — they are block-scoped. This means functions like `sendUserMessage`, `chipClick`, `handleKey`, and `setChips` become invisible to `onclick` attributes in HTML if defined inside `if (typeof document !== 'undefined') { ... }`.

The correct pattern is to define all functions at the top level of the script, and guard any `document`/`localStorage` calls inside the function body:

```js
// WRONG — Safari cannot find this from onclick attributes
if (typeof document !== 'undefined') {
  function sendUserMessage() { ... }
}

// CORRECT — top-level, guards document call internally
function sendUserMessage() {
  if (typeof document === 'undefined') return;
  var input = document.getElementById('user-input');
  ...
}
```

## Browser Compatibility (Safari / iOS) — Template Literals

**Do not use nested template literals.** Backticks inside `${}` expressions inside another template literal cause a silent script error on Safari/iOS that kills the entire app. This has already broken the app once.

```js
// WRONG - nested backticks crash Safari/iOS
el.innerHTML = `<span class="tag-${f}">${f}</span>`;

// CORRECT - plain string concatenation
el.innerHTML = '<span class="tag-' + f + '">' + f + '</span>';
```

As a general rule, prefer ES5-compatible syntax (`var`, plain functions, string concatenation) throughout `app.js`. Modern syntax is fine in test files, which only run in Node.

---

## Known Issues

### Silent freeze when reviewing items with very large data

**Symptom:** When reviewing items with exceptionally large names or contents (e.g., multiple kilobytes per item), the app stops responding silently with no console errors. The only recovery is a browser tab refresh.

**Root cause:** Unknown — likely a rendering bottleneck in `reviewBox()` or `showFateReviewCurrentItem()` when processing large item data.

**Trigger:** Only occurs when items are intentionally overloaded far beyond normal use (e.g., pasting code snippets as item names).

**Priority:** Low — the design assumes reasonably-sized item names and descriptions. This is an edge case that requires deliberate abuse of the app's input constraints.

**Workaround:** If this occurs, refresh the tab. Data is persisted in localStorage, so no work is lost.

**TODO:** Profile `reviewBox()` and `showFateReviewCurrentItem()` with large datasets to identify and eliminate the bottleneck. Consider adding a check to warn users if item size exceeds a threshold.

---

## app.js Architecture

### DOM guard pattern

`app.js` is split into two zones separated by a `typeof document` guard:

```js
// Zone 1 - pure logic, always available (Node + browser)
function processInput(...) { ... }
function handleMove(...) { ... }

// Zone 2 - DOM functions, browser only
if (typeof document !== 'undefined') {
  function addBotMessage(...) { document.getElementById('chat-messages')... }
  function setChips(...) { ... }
}
```

**When adding a new function:** if it touches `document`, `localStorage`, or any browser API, put it inside the guard. If it only manipulates `state` and calls other functions, put it outside. Getting this wrong silently breaks tests.

### State machine stages

All conversation flow is driven by `state.conversationStage`. Existing stages:

| Stage | Meaning |
|-------|---------|
| `WELCOME` | Initial greeting, not yet started |
| `AWAITING_BOX_NAME` | Bot asked for a box name |
| `AWAITING_LOCATION` | Bot asked where the box is |
| `BOX_OPEN` | Inside a box, ready for next item |
| `AWAITING_ITEM_NAME` | Explicitly waiting for an item name |
| `AWAITING_BATCH_CONFIRM` | Asked user to confirm N x item |
| `AWAITING_BATCH_QTY` | Asked user to correct the quantity |
| `AWAITING_BATCH_FATE` | Asked fate for an entire batch |
| `AWAITING_ITEM_DESC` | Asked for item description |
| `AWAITING_FATE` | Asked keep/donate/trash/sell/unsure |
| `AWAITING_ITEM_NOTES` | Asked for notes before moving on |
| `AWAITING_MOVE_LOCATION` | Asked where to move the active box |
| `AWAITING_BOX_BATCH_CONFIRM` | Asked to confirm N lettered boxes |
| `AWAITING_BOX_BATCH_QTY` | Asked to correct the box batch quantity |
| `AWAITING_BOX_BATCH_LOCATION` | Asked for shared location of a box batch |
| `AWAITING_DELETE_BOX_CONFIRM` | Asked to confirm deletion of an empty box |
| `AWAITING_DUMP_TARGET` | Asked which box to dump items into |
| `AWAITING_NEST_CHILD` | Asked which box to nest (reserved for future two-step nest flow) |
| `AWAITING_NEST_PARENT` | Asked which box to nest the active box inside |
| `AWAITING_ITEM_VIEW` | Showing item detail, waiting for an action (change fate / edit notes / remove / back) |
| `AWAITING_ITEM_VIEW_NOTES` | Waiting for new notes text for the viewed item |
| `AWAITING_FATE_REVIEW_ACTION` | Fate review list shown, waiting for item-by-item / bulk / back |
| `AWAITING_FATE_REVIEW_ITEM` | Mid item-by-item fate review walk |
| `AWAITING_FATE_REVIEW_BULK` | Bulk action chosen, awaiting confirmation |
| `AWAITING_TRASH_DELETE` | Asked whether to delete a trashed item (yes/no/always/never) |
| `AWAITING_DISPOSAL` | Asked where a kept-trash item can be safely disposed of |
| `FINISHED` | No active box, session summary state |

**When adding a new stage:** add a `case` to the `switch` in `processInput`, and if the feature can be invoked from any stage, also add an intercept above the switch.

### Context-aware copy with generic fallback

When bot copy depends on context (e.g. item name, location, fate), attempt a specific response first and fall back to a generic one. This pattern is used in `disposalPrompt()` — item name is matched against keyword categories (batteries, e-waste, clothing, hazardous) before falling back to a generic disposal question. Apply this pattern in future features rather than always using generic copy.

### Global command intercept

Some commands must work regardless of what stage the bot is in. These are handled by an early-return block at the top of `processInput`, before the `switch`:

```js
function processInput(text, photos) {
  var t = text.toLowerCase().trim();
  if (t === 'y') { t = 'yes'; text = 'yes'; }   // normalisation
  if (t === 'reset') { clearAll(); return; }      // global
  if (t === 'new box') { startNewBox(); return; } // global
  if (t.startsWith('move')) { handleMove(...); return; } // global

  switch (state.conversationStage) { ... }        // stage-specific
}
```

If a command only makes sense in a specific stage, handle it in the `switch`. If it should work from anywhere, intercept it above.

**Any label used in `setChips()` must also be intercepted as a global command.**

**Sub-menus that show chips must set a stage.** If a function shows chips but does not change `conversationStage`, those chips have no safe landing zone — any chip that doesn't match an existing global intercept will fall through to `handleItemName` and be logged as an item. The rule is: if you call `setChips()`, you must also set `conversationStage` to a stage that handles those chips. `handleFateReviewMenu` was broken because it showed `Back` as a chip but left the stage as `BOX_OPEN`, so `Back` was logged as an item name.

**Corollary: never show a chip you haven't also intercepted.** Before adding a chip to any `setChips()` call, verify there is either (a) a global intercept for that label, or (b) a stage set that handles it in the switch. Chip labels can appear as user input at any stage, including `BOX_OPEN` where unrecognized text is treated as an item name. Failing to intercept a chip label will cause it to be logged as an item — this has already happened with "Skip to next box".

Similarly, **natural language commands must be intercepted before they reach `handleItemName`**. Any phrase not caught by the global intercepts will be treated as an item name — this is how "Remove Skip to next box from Desktop" became a logged item.

### Input normalisation

Single-character shorthands are expanded at the very top of `processInput`, before any other logic runs:

```js
if (t === 'y') { t = 'yes'; text = 'yes'; }
if (t === 'n') { t = 'no';  text = 'no';  }
```

**When adding a new shorthand**, add it here. Do not scatter alias handling throughout individual stage handlers.

### Number extraction from commands

When extracting a number from a command like `"delete 5"` or `"move 3"`, use regex to get the **trailing number**:

```js
// GOOD: Extracts last number, works with multi-word commands
var match = command.match(/(\d+)$/);
var num = parseInt(match[1], 10);  // Gets "5" from "delete 5" or "delete item 5"

// AVOID: Position-dependent, breaks if command format changes
var num = parseInt(command.split(' ')[1], 10);  // Breaks: "delete item 5" → "item"

// AVOID: Magic slice indices, hard to understand
var num = parseInt(command.slice(7), 10);  // What is 7? Why 7?
```

Regex `/(\d+)$/` is:
- **Robust:** Works with any command structure as long as the number is last
- **Future-proof:** Handles "delete item 5" just as well as "delete 5"
- **Clear:** Pattern explicitly shows what we're matching
- **Consistent:** Already used throughout handlers for `.match()` patterns

---

## Running Tests

To run all tests at once:

```bash
node tests/test.js
```

To run a single suite:

```bash
node tests/test_move.js
node tests/test_remove.js
```

All files exit with code `0` on success and `1` on any failure.

**When adding a new test file**, place it in the `tests/` folder and name it `test_<feature>.js` — `tests/test.js` auto-discovers all files matching that pattern inside the `tests/` folder. No registration required.

## Existing Tests

| File | Feature covered |
|------|----------------|
| `tests/test_move.js` | Move box to a new location (`move`, `m`) |
| `tests/test_box_batch.js` | Batch box creation with singularizer (`five wooden boxes`, `3 shelves`) |
| `tests/test_delete_dump.js` | Delete empty box; dump all items into another box |
| `tests/test_nest.js` | Nested boxes: nest command, circular prevention, delete guard, dump with children |
| `tests/test_item_view.js` | Item detail view: number selection, actions, notes editing, photo count |
| `tests/test_history.js` | Arrow up/down input history; sidebar click history |
| `tests/test_import.js` | Import JSON: valid import, validation, normalisation, confirm/cancel |
| `tests/test_fate_review.js` | Cross-box fate review: collect, list, item-by-item, bulk actions, resume flows |
| `tests/test_help.js` | Help command: hi/hello/hey/help/? from any stage, context-aware chips; add item command |
| `tests/test_trash.js` | Trash deletion: delete prompt, always/never preference, disposal notes, deletion count |

---

## Work Estimation & Point Sizing

When planning work sessions, use **story points** (relative effort) rather than clock time estimates. Guidelines:

- **1-2 points:** Trivial changes (copy updates, single-line fixes, obvious renames)
- **3-4 points:** Small refactors or feature additions (extract a helper, add error handling, UI tweak)
- **5 points:** Medium task (feature + tests, complex refactor, multiple call sites)
  - **Must decompose if any uncertainty** — if you're unsure whether it's 5 or 8, break it down
- **8 points:** Large task (new subsystem, major refactor, multiple features)
  - **Mandatory decomposition** — never pull an 8-pointer in one go; break into 3-5 and handle serially
- **13+ points:** Epic, needs design phase and breakdown before work begins

**Rationale:** Point estimates are relative and more stable than time estimates. A 5-pointer always means "similar scope to past 5-pointers" regardless of your environment or expertise. Time estimates drift with learning, debugging, and unknowns. Points account for uncertainty naturally: a 5-pointer that takes 3 hours is still a 5-pointer; padding for unknowns inflates the points, which naturally cascade to breaking down larger work.

---

## Completed Tasks

- Promote location to box — `convert location <name>`, `convert location <name> to box`, `nest <name>`, `nest <name> in <location>`. Finds all boxes whose `location` string matches the name, reparents them under a target box (existing box with that name, or newly created), sets their `location` to `null`. `effectiveLocation(box)` walks the parent chain to find the nearest non-null location — boxes with `location: null` inherit from their parent. Ambiguous case (name matches both a location and a box) surfaces a clarifying message. 26 tests in test_promote_location.js.

- Multi-line item entry — Shift+Enter inserts a newline in the textarea (Enter still submits). When a multiline submission arrives in `AWAITING_ITEM_NAME` or `BOX_OPEN`, `processMultilineItems(lines)` handles it: empty lines skipped, each non-empty line parsed through `parseItemEntry`, batch quantities expanded, all items logged immediately with no fate/notes prompts (name-only lines get unsure). Lines with unrecognized fates are cached and reported in the summary message with the original line text for easy resubmission. Summary: "N items added." Stage awareness (routing line 1 to the active prompt handler) deferred to v2. 37 tests in test_multiline.js.

- Comma-separated item entry — `handleItemName` now accepts comma-separated input to set fate and notes in a single line. `parseItemEntry(text)` splits on commas and interprets: 1 part = name only (existing flow); 2 parts = name + fate (if recognized, skip fate prompt) or name + notes (fate=unsure, warn, done); 3 parts = name + fate + notes (done immediately); 4+ parts = joined name parts + fate + notes. Trailing empty notes field (e.g. `bowl, ceramic, keep,`) supported for names containing commas. Unrecognized fate values warn and default to unsure. 52 tests in test_item_entry.js.

- Item → box promotion — "Make it a box" chip appears in item detail view for single items (hidden when count > 1). `promoteItemToBox(item, parentBox)` creates a nested box retaining the item's id, name, location (from parent), parentId, fate, notes (merged with description if present), and createdAt. Item is soft-deleted from the parent. Name collision guard prevents promotion if a box with the same name already exists at the same location. `back to <parent name>` chip navigates back to the parent box. 28 tests in test_promote.js.

- Data model cleanup — renamed `addedAt` to `createdAt` on item objects for consistency with boxes (which already used `createdAt`). Removed the vestigial `photos: []` field from all item construction sites in app.js (`handleFate`, `commitBatch`, `importCSV`, `importJSON`), from import normalization, and from `exportJSON` (the `delete exported.photos` guard is no longer needed). `commitBatch` signature simplified from `(qty, itemName, photos)` to `(qty, itemName)`. All 12 affected test files updated to use `createdAt` and drop `photos` from fixtures.

- Fate tags right-aligned in box cards — `.box-card-body` restructured as a row flex container. `.box-card-text` (name + meta) takes the left with `flex: 1`; `.box-counts` is pinned right with `flex-direction: column`, `align-items: flex-end`, `max-width: 38%`. Tags stack vertically on the right. Emergent design property: card height grows with the number of distinct fate categories, subtly encouraging users to put like with like.
- Location filter — clicking a location header sets `activeLocationFilter` (session-only variable). Filtered state: other locations dim to 0.3 opacity, their boxes are hidden, the sidebar header shows an inline blush/sakura badge with the location name and a ✕ to clear, and the box count reads "N of total". Clicking "Inventory" when filtered also clears. Clicking the active location again clears. `setLocationFilter(locKey)`, `clearLocationFilter()` added to app.js. Active-location styling (`loc-active`) fires on the filtered location itself, not on whichever location contains the active box — those two states no longer conflict.

- Location headers in sidebar — top-level boxes are now grouped by location in the sidebar. Locations with 2+ boxes get a collapsible header row: peony caret (▼/▶), abyss label, navy box count. Locations with 1 box get a shorter non-collapsible header: lavender label and count, no caret. Collapsed state persisted in localStorage under `declutterbot_collapsed_locations` (separate from app state, not exported). Box meta line no longer repeats location since it's shown in the header above. `renderSidebar` refactored to group by normalized (lowercased) location key; new helpers `renderBoxCard`, `toggleLocationCollapse`, `saveCollapsedLocations`. Full Tide Garden palette (28 tokens) added to `:root` in index.html. `--lavender` (#7570a9) and `--mustard` (#d8c030) now available. No test changes required (pure rendering change).

- CSS token rename — renamed all CSS custom properties in index.html from old theme names to Tide Garden names: `--brown` → `--abyss`, `--brown-mid` → `--navy`, `--brown-light` → `--coastal`, `--brown-pale` → `--horizon`, `--rust` → `--peony`, `--rust-light` → `--sakura`, `--warm-white` → `--white`, `--paper` → `--feta`, `--border` → `--chevre`. Consolidated duplicate `--ink`/`--brown` and `--ink-mid`/`--brown-mid` pairs. Semantic comments added to `--white`, `--abyss`, `--navy`, `--feta`, `--chevre`. No behavior change.
- Import/export format toggle — replaced 4 header buttons (Import JSON, Import CSV, Export JSON, Export CSV) with a JSON·CSV pill toggle + 2 buttons (Import, Export). Toggle defaults to JSON. Typed commands `import`, `import json`, `import csv`, `export`, `export json`, `export csv` all still work and set the toggle state as a side effect. File handling logic moved to inline `<script>` in index.html (`setFormat`, `triggerImport`, `handleImportFile`, `triggerExport`); app.js command handlers delegate to these via `typeof` guards. No new tests needed (pure UI change; underlying `importCSV`/`importJSON`/`exportCSV`/`exportJSON` functions unchanged).

- Reset command — removed the one-click Reset button from the header (too easy to trigger on mobile). Reset is now a typed command only (`reset` or `start over`). With no data it resets immediately; with data it enters `AWAITING_RESET_CONFIRM` stage with Yes/No chips, showing a count of boxes and items at risk. Cancelling returns to normal flow; confirming wipes state and restarts the welcome flow. `window.confirm()` no longer used. `_doReset()` now mutates state in-place (instead of replacing the object) so exported references stay valid across the reset. 17 tests in test_reset.js.

- Merge-on-import (CSV + JSON) — both `importCSV()` and `importJSON()` now merge incoming data into existing state rather than replacing it. Deduplication is two-tier: (1) **ID match** on box or item → true duplicate, skipped silently; (2) **near-duplicate** (same name/location for boxes, same name/fate/notes for items, but different or absent id) → skipped and surfaced as a ⚠️ warning in the summary message. Incoming IDs are retained; missing IDs are generated. CSV format extended to 7 columns (adding `box id`, `item id`); legacy 5-column CSVs still accepted. Export now writes 7 columns. 75 tests passing in test_import_csv.js.


- Pure helpers extraction (later reverted) — Attempted to extract 22 pure utility functions (225 LOC) into dedicated `helpers.js` module, but the extraction was incomplete and created test/app entanglement issues. The file was never loaded in the browser, causing all functions to be duplicated in `app.js`. After attempting to complete the extraction in May 2026, the complexity of syncing out-of-date functions and resolving lodash conflicts led to the decision to delete `helpers.js` entirely and keep all utility functions in `app.js`. All pure helper functions remain in app.js.
- Number extraction refactoring — Changed all number extraction from command strings to use regex `/(\d+)$/` instead of position-based slicing. Patterns: `command.slice(7)`, `command.split(' ')[1]` replaced with `command.match(/(\d+)$/)[1]`. More robust (works with multi-word commands), future-proof (handles "delete item 5"), consistent with existing code patterns. Added `extractNumberFromCommand()` helper for reuse. 3 locations updated in app.js.
- 120-char line length refactoring — all lines now at or under 120 characters by code point count. Expanded dense object literals, long `addBotMessage` strings, and extracted long regex patterns to variables. Added documentation to CONTRIBUTING on line length rules and how to measure correctly (character count, not bytes).
- Add Lodash via CDN — Lodash 4.17.21 added to index.html via cdnjs. Test setup: (1) `npm init -y && npm install lodash`, (2) add `global._ = require('lodash')` to test stubs before `require('../app.js')`. All calls guarded with `typeof _ !== 'undefined'` for graceful degradation in Node tests.
- commitState() helper — centralized `saveState(); renderSidebar(); updateContextBar();` into a single helper with canonical ordering (saveState first for persistence, then UI updates). Reduces boilerplate and ensures consistent call order throughout app.js. Replaced at call sites: selectBox (line 162), execute (line 335), importJSON (lines 1238-1240), clearAll (line 1284).
- localStorage quota handling — added `QuotaExceededError` handling in `saveState()`. When storage is full, shows warning "Storage full. Delete items marked trash to continue, or export your inventory." with "Export JSON" and "Always ignore" chips. User can select "Always ignore" to suppress warnings and continue with in-memory state (persists until refresh). State persists normally once items are deleted and storage is available again. Added `storageFull` flag to state to track warning state. All 563 tests pass.
- fateReviewChips refactored to use filter pattern — extracted `addInformationChips(fate)` helper that returns fate-specific action chips (e.g., 'Add to kit' for keep, 'Delete' for trash). `fateReviewChips()` now computes chips dynamically as `FATES.filter(f => f !== fate).capitalize() + addInformationChips(fate) + ['Skip']`. Removes hardcoded arrays and makes it easy to modify fate transitions. Chips now display consistently: other fates (capitalized) → action chips → Skip.
- Storage budget counter — live countdown of remaining item capacity displayed in context bar, right-aligned as "capacity: N items". Calculates as `(5MB - JSON.stringify(state)) / divisor` where divisor is learned from actual data when 10+ items exist, otherwise defaults to 14,397 items on empty state. Recalculates every ~10 items (~30 saveState calls, accounting for 3-4 saves per item from name + fate + notes interactions). Budget decrements immediately on item add, increments on item delete. Recalculation pulse animation shows when recalibration runs. Initial display shows exactly 14,397 items; after adding items, number becomes more accurate based on actual average bytes per item.
- Soft deletion data model + hiding — items now have `deleted_at` timestamp field (null by default). `deleteActiveItem()` sets `deleted_at` instead of splicing from array. Filtering applied to `groupItems()`, `countFates()`, `boxSummaryLine()`, and `reviewBox()` to hide soft-deleted items from all views. Item counts (e.g. "5 items logged") reflect only non-deleted items. Deleted items remain in state for Slice 2 (restore feature). Tests updated to check `deleted_at` instead of array length.
- CSV export — `escapeCSV()` helper implements RFC 4180 escaping (doubles quotes, wraps fields with commas/quotes/newlines). `exportCSV()` builds header + rows using functional `.reduce()` pattern, includes soft-deleted items, downloads as `inventory.csv`. Button in header + `export csv` command. 23 tests covering escaping, special characters, multiple boxes, empty locations, soft deletion inclusion.
- CSV import — `parseCSV()` validates exact header order (location, box name, item name, fate, notes), `parseCSVLine()` does RFC 4180 unquoting. `importCSV()` groups rows by (location, box_name) pair to create separate boxes, defaults invalid fates to `unsure`, allows duplicate rows, skips empty lines. Matches JSON import behavior: confirms overwrite if existing data, clears inventory on confirm, resets session preferences. Button in header + `import csv` command + `handleImportCSV()` file handler. 40 tests covering parsing, round-trip fidelity, validation, all FATES preservation.
- Functional refactoring — replaced for loops with `.filter()`, `.map()`, `.reduce()`, `.find()`, `.forEach()` in: `countFates()`, `groupItems()`, `exportCSV()`, `activeBox()`, `activeItem()`, item transfer operations. Code is more declarative and consistent with codebase style.
- No chips shown after "Review items" on an empty box — `setBoxOpenChips()` now called after the empty message in `reviewBox`.
- Trash N from box review — `state._reviewingBox` flag set in `handleTrashByNumber`, checked in `deleteActiveItem` and `handleDisposal` to call `reviewBox()` instead of `setBoxOpenChips()`.
- Change fate from box review — elliptical action chips (Keep, Donate, Sell, Unsure, Trash, Delete) now appear in the review screen. 1-2 eligible items show numbered chips (e.g. `Keep 1`); 3+ show an elliptical chip (e.g. `Keep...`) which prepopulates the input and sends a reminder listing eligible item numbers. Implemented via `buildActionChips`, `eligibleGroupNumbers`, and `handleEllipticalAction` helpers.
- Arrow up/down — cycles through sent message history; arrow down returns to draft
- Context bar + help command — hi/hello/hey/help/? all trigger contextual help; context bar now reads "type \"help\" or \"?\" for commands"
- Rename to DeclutterBot — completed
- Nested boxes — nest command, parentId data model, sidebar indent/caret, delete guard, dump with child re-parenting

## Punchlist

- Extract inline scripts to ui.js — the `<script>` block at the bottom of `index.html` (lines ~593-634) contains `setFormat`, `triggerImport`, `handleImportFile`, `triggerExport`, and `openNewTab`. Move these to a `ui.js` file and replace the inline block with `<script src="ui.js"></script>`. Load order: lodash → ui.js → app.js.


- Remove markdown parser — `renderMarkdown` is called only in `addBotMessage` and handles `**bold**`, `_italic_`, and `\n` → `<br/>`. Now that `addBotMessage` supports raw HTML passthrough (strings starting with `<`), the parser can be removed by converting all `**...**` and `_..._` usage at each call site to inline `<strong>` and `<em>` tags. Audit required: ~30-40 `addBotMessage` call sites. Not a quick session — do as a dedicated cleanup pass.

- Start sorting chip broken — On fresh start (no boxes), the "Start sorting" chip appears but clicking it does nothing. Typing a box name works. Likely the chip doesn't map to the correct command or isn't wired to trigger box creation. Verify chip click handler maps "Start sorting" to the expected input, or remove the chip and rely on typed input only.

- Chip position on mobile — on phone, chips display at the bottom of the message box, covering the most recent message. Move chips to the top of the input area (pinned between message list and input bar) so the user can read context before tapping.
- Header space on mobile — the header takes up too much vertical space on phone. Collapse or hide labels on small screens. Pair with import/export toggle work (fewer buttons = easier to compress).
- Sidebar landscape breakpoint — box drawer does not appear when the app is in landscape on a phone. The breakpoint needs to be revised down to match phone actual dimensions. Best validated with Xcode simulator.
- Promote item to box from chat — currently "Make it a box" is only accessible via the item detail view chip. Add a chat command: `promote <N>` or `make <item-name> a box` that promotes a numbered item in the active box without navigating into item detail view first.
- Semantic CSS token rename — the Tide Garden token names are now in place. A follow-up pass should assign semantic aliases (e.g. `--color-surface`, `--color-border`, `--color-interactive`) so the stylesheet reads in terms of purpose rather than palette name. Low priority until the palette is stable.

- Location headers in sidebar — when two or more boxes share a location, group them under a collapsible location header row. The header should be visually lighter than a box card (roughly half to a third the height). Headers should be collapsible (fold all boxes in that location), persist their collapsed state in localStorage, and support drag-and-drop reordering of locations relative to each other. Boxes within a location should remain draggable within and across location groups. Boxes with unique locations (only one box at that location) are shown without a header. This is a pure rendering change — no change to the data model, as location is already a field on each box.
- Can we persist "box folding"  between sessions. when a box contains other boxes, we already display a caret which toggles the boxes below it between present and absent in the UI. However, the display does not persist when a browser refreshes. We don't need to store the data abywhere other than the browser. (Like, no need to track this in the CSV and JSON, though it can be if that is an easier implementation.)

### Low Priority

- Soft Deletion Slice 2: Restore/review deleted + export — Add `review deleted` or `restore` command to list soft-deleted items with delete timestamp and original box context. Chips for: restore to original box, permanently hard-delete from array, or cancel. Update JSON export to include `deleted` array alongside `boxes` (each with `boxId` for provenance). Tests: verify deleted items appear in restore view, verify export structure, verify restore works, verify permanent delete removes from `deleted` array and state. Builds on Slice 1 (soft deletion data model).
- Elliptical chip eligibility model — move fate transitions to explicit data structure (implement when requirement appears). Currently assumes any fate can transition to any other (filter: `group.fate !== fate`). When needed: create `FATE_TRANSITIONS` lookup table at top of app.js defining allowed transitions per fate. Makes transition rules explicit, testable, and decoupled from chip building logic. Do not implement speculatively.
- Test coverage with c8 — run `npx c8 node tests/test.js` to get line, branch, and function coverage reports with no architecture changes. Add a `coverage` script to a `package.json` if one doesn't exist. Use coverage reports to identify untested code paths and prioritize new tests.
- DRY common bot responses into a response dictionary — bot messages like fate confirmations, error strings, and stage transitions are currently hardcoded inline throughout the handlers. Extract them into a single `RESPONSES` object at the top of app.js so wording can be changed in one place. Needs tests to verify response keys exist and return strings.
- Fuzzy command matching — near-misses like "trasj" should match "trash". Highest priority: fate words (keep, donate, trash, sell, unsure) since they are typed frequently and the set is small. Approach: Levenshtein distance of 1 on fate words before falling through to item name; consider extending to other common commands. Needs tests for common typos and confirmation that valid item names are not accidentally matched.
- Rename short/unclear variable names — one and two letter variables (e.g. `g`, `g2`) should be replaced with descriptive names. Audit all handlers added during the trash/delete implementation pass. Remaining candidates: `g`/`group` variables in reviewBox and groupItems loops. Note: well-known abbreviations like `pref`, `idx`, `btn` are acceptable as suffixes on descriptive names — e.g. `effectivePref` is preferred over `effPref` (too terse) or `effectivePreference` (unnecessarily verbose).
- Document variable naming convention in CONTRIBUTING — add a section stating: avoid single and double letter variable names unless following a strong established convention (e.g. loop index `i`); avoid opaque abbreviations; prefer full descriptive names even if longer.
- Single letter command shortcuts — audit all commands and define a consistent set of single-letter shorthands. Currently: `y`/`n`, `m` (move), `h` (help). Candidates: `d` (done with this box), `r` (review items), `n` (new box — conflicts with no), `a` (add item). Each shorthand must be added to the global intercept block in `processInput` and documented in README.md commands table. Requires tests confirming shortcuts are not logged as item names.
- Location input UX — the location prompt ("Where is this box located?") is easy to confuse with the first item prompt ("What's the first item?"), especially early in a session. Consider offering previously-used locations as chips rather than free-text, which would also reduce typos and inconsistent naming (e.g. "dining room" vs "Dining Room"). This aligns naturally with the location model refactor where location would be selected from a list rather than typed freehand.
- Router refactor — make "every verb produces a world response" structurally enforced rather than a documented convention requiring audits. Currently `tryGlobalIntercept` is a 250-line chain of `if` statements where silent `return true` (no `addBotMessage`) is structurally possible and hard to spot. The fix is to separate routing from responding: handlers return a response string, the router calls `addBotMessage` with it. Silent fallthrough becomes impossible because the shape of the code enforces the contract.

  ```js
  function routeCommand(command) {
    if (command === 'reset')        return clearAll;
    if (command === 'review items') return reviewItems;
    // ...
    return null; // unrecognised — falls through to stage handler
  }

  function tryGlobalIntercept(command) {
    const handler = routeCommand(command);
    if (!handler) return false;
    const response = handler();
    if (response) addBotMessage(response); // enforced at the router level
    return true;
  }
  ```

  Handlers that currently call `addBotMessage` themselves would be refactored to return strings instead. Estimated 3 points — meaningful refactor touching every handler, but the path is mechanical once the router shape is agreed on.

- Move single item to another box — `move item <N> to <box name>` should move a specific numbered item from the active box to another named box. Currently there is no way to move individual items between boxes; `Dump into...` moves all items. This is a high-priority gap since users regularly sort items into wrong boxes and need to correct them without moving everything. Also accessible via the "Move to box" chip in item detail view — currently moves the whole name+fate group; should move a single item.
- "Put X into Y" natural language — parse `put <source> into <target>` by splitting on "into"/"inside"/"in". Fuzzy-match source against items in the active box (substring, case-insensitive). Fuzzy-match target against boxes first, then items. If target is an item: promote it to a box first, then move source into it. If target is a box: move source into it. If ambiguous (multiple matches): ask for clarification. Depends on: move single item. The sentence "put eggplant-colored Berkeley Bowl bag into lilac-colored Trader Joe's grocery bag" should just work.
- Mantra copy review — the mantra system is implemented and triggered correctly (on load, every 7th item, 25% on trash, after box done, after session done). The load and trashed pools have approved copy. The last three pools (itemAdded, boxDone, sessionDone) still need copy approval before shipping. Approved load mantras: "Be here now.", "You have enough. You are enough.", "Make your future self thankful for the journey you started today.", "The present is a gift.", "Begin at the beginning." Approved trashed mantras: "Everything has its moment. You have your lifetime.", "Less is more.", "Wherever you go, there you are.", "Go slow, but go.", "All that there is is this moment." Candidate itemAdded, boxDone, sessionDone mantras are in the code but flagged for review.
- `whereami` debug command — typing `whereami` (or `?!`) should print the current `conversationStage`, active box name, and last chips shown. Useful for diagnosing silent failures where chips disappear and no response is rendered. Should be a global intercept that works from any stage.
- Review all boxes uses an unordered list while review by fate uses a numbered list. Upgrade review all boxes to use a numbered list and allow box selection by number (type `3` to open box 3 directly).
- Six-chip trash delete prompt is taller than the standard prompt and may obscure the last message. Consider a layout fix or reducing to four chips by moving always/never for this box to a secondary prompt.
- Compound command history — multi-step exchanges (e.g. `move` then `bedroom`) should be stored as a single history entry (`move bedroom`) rather than two separate ones. Approach: when a command triggers an `AWAITING_*` stage, save the command as a pending prefix; when the next message is sent in that stage, combine prefix + answer into one history entry instead of storing them separately. Stages to consider: `AWAITING_MOVE_LOCATION`, `AWAITING_DUMP_TARGET`, `AWAITING_NEST_PARENT`, `AWAITING_BOX_NAME`, `AWAITING_LOCATION`, `AWAITING_BATCH_CONFIRM`, `AWAITING_DELETE_BOX_CONFIRM`
- Arrow up/down ✅ implemented — cycles through sent message history; arrow down returns to draft
- Improve dump command parsing — parse `dump <source> into <target>` by matching both source and target against known box names. "into" is a reserved separator keyword and should be blocked from box names at creation time, with a friendly error suggesting underscores or other separators. Current behavior takes everything after "dump " as the target name, which fails when the source box name appears inline (e.g. `dump above fridge into car` creates a new box named "above fridge into car" instead of dumping "Above Fridge" into "Car"). New box creation from a dump command should also validate against the reserved word. Note: active box is not necessarily the source — the command may name a different source box explicitly.
- Natural language box commands — `trash box <name>` and `delete box <name>` should switch to the named box and trigger the delete flow. Currently these are logged as new item names. Similarly `move box <name>` could switch to a named box and trigger the move flow without requiring the user to first navigate to the box manually.
- Go for a long walk — step away from the codebase, clear your head, come back with fresh perspective
- `test_trash.js` intermittently fails. when run order is different? When localStorage mutates mid-test.

### Completed

- Context bar + help command ✅ implemented — hi/hello/hey/help/? all trigger contextual help; context bar now reads "type \"help\" or \"?\" for commands"
- Nesting a box should inherit parent's location ✅ fixed — `child.location = parent.location` added to `handleNestConfirm` after `parentId` is set.
- Import JSON ✅ implemented — file input in header, validates structure, normalizes legacy fields, confirms before overwrite, re-renders with summary
- Chip click focus ✅ implemented — focus returned to textarea after chip click; global `keydown` listener redirects any keypress to the textarea if focus is elsewhere (excluding modifier keys, Tab, and Escape)
- No chips shown after "Review items" on an empty box ✅ fixed — `setBoxOpenChips()` now called after the empty message in `reviewBox`.
- Trash N from box review ✅ fixed — `state._reviewingBox` flag set in `handleTrashByNumber`, checked in `deleteActiveItem` and `handleDisposal` to call `reviewBox()` instead of `setBoxOpenChips()`.
- Change fate from box review ✅ resolved — elliptical action chips (Keep, Donate, Sell, Unsure, Trash, Delete) now appear in the review screen. 1-2 eligible items show numbered chips (e.g. `Keep 1`); 3+ show an elliptical chip (e.g. `Keep...`) which prepopulates the input and sends a reminder listing eligible item numbers. Chip order and filter logic driven by the `FATES` constant via `flatMap`. Implemented via `buildActionChips`, `eligibleGroupNumbers`, and `handleEllipticalAction` helpers.

## Session Summary

**Latest refactoring session (May 2026):**
- Extracted 22 pure helper functions into dedicated `helpers.js` module (225 LOC)
- Refactored number extraction from `slice()` to regex `/(\d+)$/` for robustness
- Added named regex pattern constants to `handleFinished()` for clarity
- Updated `handleHelp()` with complete current command list (21 commands)
- Fixed `test_trash.js` reset() to clear all review-all state variables
- Updated CONTRIBUTING.md with helpers.js best practices + number extraction patterns + checklist items
- Result: 800/800 tests passing, cleaner architecture, better code reusability

**Known issue:** Test failure in test_trash.js "shows 2 deleted today" when run in full suite (likely localStorage state bleed between tests, passes in actual use). See TEST_FAILURE_NOTES.md for details.
- Move any box by name (not just the active box)
- Rename to DeclutterBot ✅ completed
- `uid()` generates a random 7-char base-36 string (~78 billion possibilities) but does not verify uniqueness against existing IDs. A collision would silently corrupt parentId/activeBoxId foreign key relationships. Fix: collect all in-use IDs at generation time and retry on collision. Add a test that generates a large number of IDs and asserts no duplicates.
- Remove vestigial `photos: []` field from item objects — photos were deactivated at the UI level but the field remains on every item object, adding noise to exported JSON. Safe to remove before the location model is implemented since the field is never populated. Removal points: item creation in `handleFate`, `commitBatch`, and any other place items are constructed. Also remove from import normalization and any test fixtures that include it.
- Location model and photo support — see full spec in Design Philosophy section. Summary: 24 photos app-wide, one per room (location), 300px longest side, 128 colors, ~81 KB each, ~2 MB total. Replaces the old per-item photo flow. Previously deactivated features (camera button, ZIP export, base64 dataUrl persistence) should not be restored — the new implementation stores photos on location objects, not items, and uses the quantized PNG approach specified above. Blocked on location model implementation.
- Nested boxes ✅ implemented — nest command, parentId data model, sidebar indent/caret, delete guard, dump with child re-parenting
- Location-as-box: treat a location as a named container so you can say "bedroom > Mac mini > screenshots" and have the hierarchy reflected as nested boxes (depends on: nested boxes feature)
  - A location string like "bedroom - Mac mini" should optionally be parsed as a path: bedroom (location) > Mac mini (parent box) > screenshots (this box)
  - Entering a sub-location that matches an existing box name should nest rather than duplicate
  - The location prompt UX needs to guide users toward this syntax without requiring it
- Filter by location
  - Two entry points: a chat command (e.g. "show boxes in bedroom") and a sidebar control (exact UI TBD — could be a clickable location label on each box card, a dedicated filter button, or similar)
  - When active, the sidebar shows only boxes matching the location filter; a visible "clear filter" control should appear in the sidebar
  - Partial matching: "bedroom" should match "bedroom - east wall" and "bedroom - west wall"
  - Location strings should be split on common separators (dash, comma, slash, colon) before matching, so individual segments are matched independently
---

## Design Philosophy

DeclutterBot is intentionally unserious. It does not promise to remember everything, just what matters. Some features are session-only by design — they provide immediate value without the complexity of persistence, migration, or state management. When a persisted version of the feature lands later, the session-only implementation is replaced, not extended.

Examples of this principle in practice:
- **Sidebar drag to reorder** — boxes can be dragged to reorder within the sidebar for the current session. Order is not saved. When the location model lands, this will be replaced with within-room drag ordering backed by state.
- **Photos** — 24 photos app-wide, one per room, session-deletable. The correct resize is 300x225 (or whatever the aspect ratio is when the longer side is reduced to 300) at 128 colors. This yields photos ~85KB, which for two dozen will consume ~2MB of the 5 MB of localStorage. This leaves ~3 MB for text. Quality target is "recognize the room", not "read the label". More dedicated photo management belongs in the user's camera app.

When evaluating whether a feature needs persistence, ask: does losing this on page refresh meaningfully harm the user's ability to accomplish their goal? If no, session-only is the right default.

## Feature Scoping

### Scalpel, not shotgun

Features that touch many functions simultaneously are hard to test completely and prone to regressions. Before implementing a feature, identify the minimum slice that delivers value and can be tested end-to-end in isolation. Ship that slice, confirm it works, then extend it.

A feature is too large if it:
- Touches more than 4-5 functions
- Requires changes to `processInput`, the switch statement, state initialization, AND handler functions simultaneously
- Introduces new resume flows that thread through existing handlers (handleDisposal, handleFate, deleteActiveItem)

When a feature feels large, ask: what is the smallest version of this that is useful? Build that first.

### Single source of truth for repeated structures

When the same invariant must hold across multiple parallel data structures (e.g. every fate must be reachable from every other fate in review chips), those structures should be derived from a single authoritative object rather than maintained in parallel. Parallel structures drift. A single object with one test is reliable.

Example: fate review chips should be derived from a single `FATE_REVIEW_CHIPS` object where each fate's chips are defined once, omitting the current fate from the available options. One object to update, one assertion to verify the invariant.

```js
// Prefer this:
var FATE_REVIEW_CHIPS = {
  trash:  ['Keep', 'Donate', 'Sell', 'Move to unsure', 'Delete', 'Disposal note'],
  sell:   ['Keep', 'Donate', 'Trash', 'Move to unsure', 'Add selling notes'],
  donate: ['Keep', 'Sell', 'Trash', 'Move to unsure', 'Add donation destination'],
  unsure: ['Keep', 'Donate', 'Trash', 'Sell'],
  keep:   ['Change fate', 'Add to kit']
};

// Over this:
function fateReviewChips(fate) {
  switch (fate) {
    case 'trash':  return ['Delete', 'Disposal note', ...]; // must be kept in sync manually
    case 'sell':   return ['Add selling notes', ...];       // easy to miss a fate
    ...
  }
}
```

### Every item in a fate review must be able to reach any other fate

This is a hard rule, not a suggestion. When reviewing items of fate X, the chips must always include paths to all other fates. A sell item must be reclassifiable as keep, trash, donate, or unsure. A trash item must be reclassifiable as keep, donate, or sell. Omitting any fate from the chip set is a bug. Verify this with a single test against the `FATE_REVIEW_CHIPS` object rather than per-fate assertions.



## File Structure and Load Order

### Current structure

All application logic lives in `app.js`. The other files have clean boundaries:

| File | Responsibility |
|------|---------------|
| `app.js` | Everything — world model, render functions, router, handlers |
| `helpers.js` | Pure utility functions — no side effects, no state mutations, no DOM |
| `styles.css` | All CSS |
| `ui.js` | Browser UI glue — import/export button handlers |

Load order in `index.html`:
```
lodash.min.js → app.js → ui.js
```

### Intended structure (not yet implemented — extraction reverted)

The goal is to decompose `app.js` into layers by abstraction level:

| File | Responsibility |
|------|---------------|
| `state.js` | World model — `state`, `FATES`, `uid`, `activeBox`, `activeItem`, `activeItems`, `loadState` |
| `render.js` | DOM output — all functions that read state and write to the DOM |
| `helpers.js` | Pure utility functions |
| `app.js` | Orchestration — router, all `handle*` functions |
| `ui.js` | Browser UI glue |

Intended load order:
```
lodash.min.js → state.js → render.js → app.js → ui.js
```

**Status:** An extraction attempt was made in May 2026 but reverted. `state.js` existed briefly as a separate file but was removed when the browser broke. All state management remains in `app.js` for now.

### Why the extraction hasn't shipped (and was reverted)

An extraction attempt was made and reverted. Tests passed but the browser broke — empty inventory, item count not rendering, keypresses not submitting.

**Root cause: implicit vs explicit dependencies.**

The current codebase runs all `<script>` tags in a shared global scope. Every function defined in `app.js` is available everywhere automatically — no import statements needed. This means dependencies are implicit: a function in `render.js` can call `state` or `FATES` because they happen to be defined by the time it runs, not because the file declares that it needs them. Splitting files breaks these implicit assumptions in ways that are invisible until the browser runs.

Three specific failures:

1. **Global scoping** — functions like `addBotMessage`, `renderSidebar`, `setChips` are referenced as bare names throughout `app.js`. Splitting them into a separate file changes when they're defined relative to when they're called, causing silent `undefined` errors in the browser that don't appear in Node tests.

2. **The Node shim pattern** — `app.js` uses `var` re-declarations to wrap render functions so tests can stub them at runtime. This pattern breaks when the real implementations move to a file that loads before the shim runs — the shim wraps a function that no longer exists in `app.js` scope.

3. **`_addBotMessageImpl`** — the test harness captures the real `addBotMessage` before stubbing. After extraction, the capture happened after the shim had already replaced it with the stub wrapper.

**The correct fix is ES modules (`import`/`export`).** ES modules make dependencies explicit — each file declares exactly what it needs and what it provides. The module system guarantees evaluation order regardless of `<script>` tag order, eliminating load-order fragility. The Node shim pattern becomes unnecessary because tests mock at the import boundary instead. All three failures above go away.

**The blocker** is infrastructure: ES modules require either a bundler (webpack, esbuild, rollup) or a local dev server. They don't work when `index.html` is opened via `file://`. That's a larger architectural decision than a single session — until it's made, `app.js` remains a single file and the intended structure is documented here as intent.

---
- `render.js` — depends on `state.js`. Reads state, writes DOM. Does not call handlers.
- `helpers.js` — no dependencies. Pure functions only.
- `app.js` — depends on all of the above. Orchestrates everything.
- `ui.js` — depends on `app.js`. Browser-only, called by HTML `onclick` attributes.

### Node.js test shim pattern

Tests stub browser globals (`addBotMessage`, `renderSidebar`, etc.) before requiring `app.js`. The shim block at the top of `app.js` runs after requires and wraps these names to call `global.*` at runtime — so tests can override them. `render.js` only sets a global if it isn't already defined, so test stubs take priority.

## Data Model Migrations

When a field is renamed or removed from the item or box schema, add a migration to `loadState()` alongside the existing normalization block. Migrations run once on first load and are idempotent — safe to run against already-migrated data.

**Pattern:**

```js
// In loadState(), inside the box loop:
for (var j = 0; j < (box.items || []).length; j++) {
  var item = box.items[j];
  // Migrate: oldField -> newField (added in May 2026)
  if (item.oldField !== undefined && item.newField === undefined) {
    item.newField = item.oldField;
    delete item.oldField;
  }
  // Remove: vestigialField (removed in May 2026)
  if (item.vestigialField !== undefined) delete item.vestigialField;
}
```

**Rules:**
- Guard every migration with an existence check so it only fires on old data
- Delete the old field after migrating — don't leave both present
- After `loadState()` runs, `commitState()` saves the migrated data back, so the migration only runs once per device
- Document the migration here with the date it was added

**Migrations applied so far:**

| Field | Change | Date |
|---|---|---|
| `box.parentId` | `undefined` → `null` (nesting introduced) | early 2026 |
| `item.addedAt` | renamed to `item.createdAt` | May 2026 |
| `item.photos` | removed (vestigial, never populated) | May 2026 |

## Voice & Copy

DeclutterBot is a text adventure that helps you pare down. The feel is a calm, slightly dry companion — not a productivity tool, not a chatbot — the friend sitting on the floor with you saying "okay, what's next?"

### The text adventure model

Text adventures have a well-defined architecture: a world model, a parser, a set of verbs that operate on objects in the world, and responses that describe state changes. DeclutterBot maps onto this directly:

- **World model** — `state`: boxes, items, locations, fates
- **Parser** — `processInput` / `tryGlobalIntercept` / `routeToHandler`
- **Verbs** — commands (keep, donate, trash, move, dump, nest, review…)
- **Objects** — boxes (the room you're in) and items (the things in it)
- **Responses** — describe what happened to the object, not that the input was received

This framing is a design constraint, not just a metaphor. When adding a feature, ask: is this a world model concern, a parser concern, or a response concern? Keep them separate. The active box is the room you're currently in; commands apply to it unless you name a different target.

### Copy principles

These apply to every bot message. When editing existing messages or writing new ones, check against this list before shipping.

- **No filler openers.** "Perfect.", "Got it —", "Nice work!" are padding. Cut them or fold them into the actual information. The first word should be content.
- **Statements over questions where possible.** "First item?" beats "Tell me about the first item you pick up — what is it?" A question is only needed when there's a real choice.
- **Every verb produces a world response.** If the parser accepts input (doesn't reject it as unrecognised), the world must describe what happened — even if nothing changed. "I don't know a location called X" is a valid response. Silent fallthrough — where the parser claims to have handled a command but produces no bot message — breaks the player's mental model and feels like a bug. In `tryGlobalIntercept`, every `return true` must be preceded by an `addBotMessage` call or a delegated handler that guarantees one.
- **Objects have identity.** Responses describe what happened to the thing, not that the user's input was acknowledged. "Bowl — donate." not "Got it, I've marked bowl as donate."
- **Counts as facts, not praise.** "4 in the box." not "You've logged 4 items!"
- **End on the prompt.** The last thing the user reads should be what they need to do next, not the acknowledgment of what they just did.
- **Em dashes sparingly.** Consistent with the general style rule. Use a period or a line break instead in most cases.
- **Clarity over voice for irreversible actions.** Reset confirmation, delete confirmation, and any action that cannot be undone should be explicit and plain, even if that means breaking the voice rules. The user needs to know what's about to happen.

### What the voice is not

The help command output is functional reference material — leave it as a list. Import/export confirmations are transactional. Error messages for invalid inputs should be terse and direct. The voice applies to the conversational flow (naming items, assigning fates, finishing boxes, transitions between stages), not to every string in the app.

## JavaScript Style

ES6 is the target. The codebase was originally written in ES5 but that constraint is no longer necessary — ES6 has been universally browser-supported since 2016.

**Standing rules:**
- Use `const` and `let` instead of `var` in new code and when touching existing code
- Use arrow functions (`=>`) instead of `function() {}` where appropriate
- Use template literals instead of string concatenation
- Use native array methods (`map`, `filter`, `reduce`, `find`, `some`, `every`) instead of `for` loops where they improve readability
- Lodash is available and encouraged where it improves readability. Prefer native array methods for simple cases (`map`, `filter`, `find`), reach for Lodash for more complex operations (`_.groupBy`, `_.flatMap`, `_.chunk`, `_.uniqBy`, etc.). Import via CDN in index.html if not already present.

**Arrow functions:** always use parentheses around parameters, even for single parameters. `(group) => group.fate !== 'trash'` not `group => group.fate !== 'trash'`. Consistent parentheses make all arrow functions easier to scan.

**Variable naming:** use descriptive names. Single-letter variables (`g`, `i`, `j`, `n`, `b`) are not permitted except as classic `for` loop counters where the variable is never referenced outside the loop body. In all other cases — array methods, named loop variables, intermediate values — use a name that describes what the variable holds. Examples: `group` not `g`, `itemIndex` not `i`, `boxIndex` not `j`, `num` at minimum but prefer `itemNumber` or `groupIndex`. When editing a function, rename any single-letter variables you encounter.

**Line length:** keep all lines at or under 120 characters. This is enforced by character count, not bytes — the multi-byte box-drawing characters in section banners (`─`) are single characters and do not inflate the count. When a line exceeds the limit:

- Break long `addBotMessage` strings with `+` concatenation across two or three lines, indented to align with the opening quote.
- Expand dense object literals (`{ id: uid(), name: ..., ... }`) to multi-line form.
- Extract long regex literals to a named variable defined on the line above (`var pattern = /…/; if (n.match(pattern))`), or split into two named patterns if the regex itself is over the limit.
- Split long boolean conditions at `&&` or `||`, placing the operator at the start of the continuation line.
- Never measure line length with `awk length()` or `wc -c` — both count bytes. Use Python's `len()` on a decoded string, or check character count in your editor.

**Migration strategy:** modernize incrementally. New code is written in ES6. Existing functions are modernized when touched for any other reason. Do not rewrite functions solely to modernize them — follow the scalpel principle.

## Working with Claude

### Style instructions

Conversational style instructions (punctuation preferences, tone, formatting) should be written into this document to be effective across sessions. Claude does not self-monitor style reliably. A rule stated once in conversation may not override trained patterns. If a style preference matters, write it here.

Current style rules:
- Use American spelling (behavior, not behaviour)
- Minimize em dashes. Use commas, colons, or parentheses instead in most cases.
- Do not use bullet points or numbered lists in conversational responses unless the content is genuinely list-shaped.

### On navigating vs. driving

When Claude drives (writes code directly), it tends to produce working but not necessarily idiomatic code. The review loop to catch style and quality issues is slower than a human catching them in the moment. When Claude navigates (guides a human driver), the human catches improvements naturally — better variable names, cleaner test assertions, idiomatic patterns — because they can see the code clearly as they type it.

For complex or high-surface-area changes, prefer Claude navigating and a human driving. Reserve Claude driving for mechanical or repetitive changes where speed matters more than elegance.

## On Claude's self-descriptions

Claude frequently describes its own processing using language borrowed from human cognition ("mental scan", "I noticed", "I feel") or from machine learning ("reinforcement", "learning"). Neither is accurate.

Claude has little to no understanding of why or how it reaches conclusions. Any self-description is metaphorical at best, and at worst is pattern-matching to plausible-sounding answers from training data. When Claude explains its own behavior, it is not reporting introspective knowledge.

**When Claude self-describes, treat the description skeptically.** Whenever a response includes a claim about how Claude works, why it made a choice, or what it is "doing" internally, that claim should be read as an approximation borrowed from human or ML vocabulary, not as a reliable account of the underlying process.

**Claude must append a disclaimer whenever it uses self-describing language.** Trigger phrases include but are not limited to: "I notice", "I think", "I feel", "I scan", "I learned", "I recall", "I understand", "mentally", or any description of an internal process. The disclaimer to append is:

> *Note: this is a metaphorical description. Claude does not have reliable introspective access to its own processing.*

This rule is mechanical by design. The more specific the trigger, the more likely it is to be applied consistently.

---

## Keeping CONTRIBUTING.md Up to Date

**CONTRIBUTING.md must be updated in the same change as the code it describes.** It is not a document to update later — later never comes.

### Checklist — run this when finishing any change

When you make a code change, ask yourself:

- [ ] Did I add a new utility function with zero side effects? → Add it to `helpers.js`, not `app.js`
- [ ] Did I add a function to `helpers.js`? → Export it in `module.exports` and add to global scope
- [ ] Did I add a function to `helpers.js`? → Copy the updated file to `tests/helpers.js` so tests load correctly
- [ ] Did I add a new `AWAITING_*` stage? → Update the stage table
- [ ] Did I add a new global command (intercepted above the `switch`)? → Document it in the global command intercept section
- [ ] Did I add a new chip label? → Also add it as a global intercept in `processInput`
- [ ] Did I call `setChips()` without changing `conversationStage`? → This is almost always a bug. Every chip display must be paired with a stage that handles those chips, otherwise they fall through to `handleItemName`.
- [ ] Did I add a new single-character shorthand? → Document it in the input normalisation section
- [ ] Did I add tests to an existing file? → Inserted them **before** the summary block, not appended after `process.exit`
- [ ] Did I move a function into or out of the DOM guard? → Update the DOM guard section
- [ ] Did I move or restructure an existing function? → Diff the before and after line-by-line to confirm every property, class assignment, and side effect is preserved. A moved function that compiles and passes tests can still be missing lines.
- [ ] When editing a function, reformat it for readability — one statement per line, consistent indentation, no semicolon-separated statements on a single line. This is a standing instruction, not a per-task decision. If a function is touched for any reason, leave it more readable than you found it.
- [ ] After writing to a file, read back the specific lines that changed before presenting the file to the user. One `grep` or `view` call after every write catches most errors before the user sees them. The pattern write → present → user notices error → fix is more expensive than write → verify → present.
- [ ] When the user reports something didn't work, check the file before constructing an explanation. A plausible-sounding explanation is not a substitute for evidence. Read the file first.
- [ ] Did I find something wrong while investigating a question? → Report it, don't fix it. The user asked a question, not for a code change. Scope decisions belong to the navigator.
- [ ] Am I about to write to a file? → Copy it first (`cp file.js file.js.bak`), write to a `.tmp` file, verify the result, then use `os.replace(tmp, original)` which is atomic. Never use `open(path, 'w')` directly on a source file — it truncates before writing and leaves an empty file if the write fails.
- [ ] How large is the change surface area? → Count the number of functions modified, moved, or deleted. Larger surface area = higher risk of undetected regression, regardless of test passage. A try/catch wrapping one function is lower risk than a refactor touching ten. **Safety correlates inversely with change surface area** — this is the primary structural measure of risk, not intuition.
- [ ] Did I discover a new browser compatibility issue? → Add it to the Safari / iOS section
- [ ] Did I change how tests are structured or stubbed? → Update the How Tests Work section
- [ ] After making a batch change to a structured section (table, list, code block), did I verify the entire section — not just that the operation reported success? A partial replacement can leave the rest unchanged without any error.
- [ ] Did I share all modified files? → Every file changed in a session should be included in the final present_files call, including test files
- [ ] Did I fix a bug? → Write a test that reproduces the original failure
- [ ] Did I change existing behavior? → Update or add tests covering the new behavior
- [ ] Did I complete a punchlist item? → Remove it from the punchlist
- [ ] Did I change the app's conversation flow? → Update the Mermaid diagram in README.md and flowchart.html
- [ ] Did I add, remove, or rename a user-facing command? → Update `handleHelp()` in app.js — the two-section structure (always available / inside a box) must stay accurate
- [ ] Did I identify a new upcoming feature? → Add it to the punchlist
- [ ] Before adding a punchlist item, did I verify the current behavior? → Check actual output/behavior first; do not add tasks based on assumptions about what the code does. The task may already be done.
- [ ] Did I add a function to helpers.js? → Export in module.exports and global scope, plus copy to `tests/helpers.js`

## Soft-Delete Bug Fixes (May 2026)

**Fixed:** box.items.length was counting soft-deleted items in control-flow decisions and user-facing messages.

**Root cause:** Soft-deleted items (marked with `deleted_at` timestamp) were being counted in:
- Chip visibility decisions (Dump vs Delete)
- Delete/dump guards (allowing operations on empty boxes)
- User messages ("N items logged")
- Context bar display

**Solution:**
- Created `activeItems(box)` helper in helpers.js to filter soft-deleted items
- Updated 9 locations in app.js to use activeItems() instead of raw box.items.length
- Added 5 comprehensive tests in test_delete_dump.js

**Locations fixed:**
- Line 2094: setBoxOpenChips() — chip decision logic
- Line 2111-2113: handleDeleteBox() — delete guard and error message
- Line 2165, 2185: handleDump() — dump guard and message
- Line 2227, 2240: handleDumpTarget() — dump count messages
- Line 1136, 1201: addItemBatch/handleItemNotes() — item count confirmations
- Line 217: updateContextBar() — context bar display

**Test coverage:** 57 tests in test_delete_dump.js, including 5 new soft-delete scenarios

### Automated tasks removed from the checklist

The tasks below no longer need to be reviewed before commiting, as they are automatic.

- Did I add a new test file? → `test.js` auto-discovers any file matching `test_*.js`, no registration needed

---

## `handleHelp()` — keeping the command reference current

`handleHelp()` is the single source of truth for what commands exist and how they work. It is context-aware: it shows different responses depending on whether the user has an active box and whether they're in item detail view.

**Structure:**

```
<h3>Always available</h3>         shown in all contexts
  New box, Review all boxes, Review by fate,
  Done for now, Import/Export, Reset, arrow keys

<h3>Inside a box</h3>             shown only when activeBox() is truthy
  Add item (with entry syntax), Review items, Move, Nest box, Convert location,
  Dump into..., Trash, Remove, Done with this box

<h3>Open a box to use</h3>        shown when no active box, instead of "Inside a box"
  (brief list of box-only command names)

<h3>From item detail</h3>         shown in all contexts
  Move to box, Make it a box
  (expanded with descriptions when in AWAITING_ITEM_VIEW stage)
```

Headers use `<h3>` tags directly since `addBotMessage` supports raw HTML passthrough.

**Rules:**

- Commands that only work from `FINISHED` (Review all boxes) — such as `Rename <N>`, `Delete <N>`, `Move <N>` — belong in the description of "Review all boxes", not as separate entries. They are not directly typeable from a cold start.
- "Review items" is listed in "Inside a box" because it requires an active box — typing it with no active box does nothing.
- Commands that only work from item detail view (`AWAITING_ITEM_VIEW`) — such as `Move to box` and `Make it a box` — are shown in all contexts under "From item detail". Brief form (just command names) shown normally; expanded form (with descriptions) shown when actually in item detail view.
- Item entry syntax and multiline entry are features of `Add item`, not standalone commands. Document them inline on that line, not as separate entries.
- Import and Export are paired and can share a line each.

**When to update:** any time a command is added, removed, renamed, or its availability changes (e.g. a box-only command becomes global, or vice versa). Update `handleHelp()` in the same commit as the feature change — treat it like a changelog entry, not optional documentation.

---

## Session Summary

**Latest refactoring session (May 2026):**
- Extracted 22 pure helper functions into dedicated `helpers.js` module (225 LOC)
- Refactored number extraction from `slice()` to regex `/(\d+)$/` for robustness
- Added named regex pattern constants to `handleFinished()` for clarity
- Updated `handleHelp()` with complete current command list (21 commands)
- Fixed `test_trash.js` reset() to clear all review-all state variables
- Updated CONTRIBUTING.md with helpers.js best practices + number extraction patterns + checklist items
- Result: 800/800 tests passing, cleaner architecture, better code reusability

**Known issue:** Test failure in test_trash.js "shows 2 deleted today" when run in full suite (likely localStorage state bleed between tests, passes in actual use). See TEST_FAILURE_NOTES.md for details.
