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

## Punchlist

> **Next session — start here (three small fixes, one at a time):**
> 1. `fateReviewChips` sell and donate missing fate options — add Keep, Trash, Unsure to sell chips; add Keep, Sell, Trash to donate chips. Then refactor `fateReviewChips` to use a single `FATE_REVIEW_CHIPS` object per the scalpel/single-source-of-truth principles above.
> 2. `handleDisposal` skip path doesn't check `_resumeAfterDisposal` or `_resumeAfterTrash` — copy the resume check from the note-written branch into the skip branch (lines ~1570-1577).
> 3. "Stopped reviewing. N of M actioned" → "Stopped reviewing. N of M items have been changed."
 (upcoming features needing tests on implementation)

- Export CSV — export inventory as a flat CSV file with columns: box name, box location, item name, fate, notes. One row per item. Needs tests for correct column order, escaping of commas/quotes in values, and empty boxes handled gracefully.
- Import accepts CSV or JSON — the import button and `import` command should accept either format. CSV import should reconstruct boxes and items from the flat structure. Needs tests for valid CSV, malformed CSV, mixed encoding edge cases, and round-trip fidelity (export then re-import produces equivalent state).
- Split app.js into modules — at 1500+ LOC, natural split points are state/helpers, handlers, fate review, trash/disposal, UI/DOM functions, and processInput/init. Requires decision on bundler (esbuild/rollup), ES modules, or multiple script tags. Multiple script tags is lowest friction but requires load order management and test setup changes. Hold until a bundler is added or readability becomes a genuine pain point.
- Test coverage with c8 — run `npx c8 node tests/test.js` to get line, branch, and function coverage reports with no architecture changes. Add a `coverage` script to a `package.json` if one doesn't exist. Use coverage reports to identify untested code paths and prioritize new tests.
- localStorage quota handling — `saveState` currently has no error handling for `QuotaExceededError`. When storage is full, the app should catch the error, show a warning message with an Export JSON chip, and suppress repeated warnings using a `storageFull` flag. Import should still work when storage is full (state lives in memory; only the save-back fails). Tests: throwing `setItem` stub shows warning + chip; normal `setItem` saves silently; repeated saves after full don't repeat the warning; import works regardless of storage state.
- Soft deletion — items (and optionally boxes) receive a `deleted_at` timestamp instead of being spliced from the array. Soft-deleted items are hidden from all UI views (review list, item count, sidebar tags) but included in JSON export.
  - Open questions to resolve before implementing:
    - Scope: items only, or boxes too?
    - Export format: top-level `deleted` array alongside `boxes`. Each deleted item retains a `boxId` field referencing its original box, preserving provenance without cluttering the active box's items array.
    - Review command: a `review deleted` or `restore` command to list soft-deleted items, with options to restore or hard-delete permanently.
    - Current `deleteActiveItem` and `handleDeleteByNumber` do hard deletion — both would need to be updated to set `deleted_at` instead of splicing.
    - Session/daily deletion count still applies.
    - Filtering: all existing functions that iterate `box.items` (groupItems, countFates, boxSummaryLine, reviewBox) must filter out soft-deleted items.
- Merge on import JSON — when importing, instead of replacing, offer a merge strategy:
  - Boxes only in the JSON file are added to the app
  - Boxes only in the app are kept as-is
  - Boxes present in both: surface a review prompt during import to choose the merge strategy (keep app version, keep JSON version, or merge items from both)
  - Items within a merged box should be deduplicated by name+fate where possible
- Import JSON ✅ implemented — file input in header, validates structure, normalizes legacy fields, confirms before overwrite, re-renders with summary
- DRY common bot responses into a response dictionary — bot messages like fate confirmations, error strings, and stage transitions are currently hardcoded inline throughout the handlers. Extract them into a single `RESPONSES` object at the top of app.js so wording can be changed in one place. Needs tests to verify response keys exist and return strings.
- Chip click focus ✅ implemented — focus returned to textarea after chip click; global `keydown` listener redirects any keypress to the textarea if focus is elsewhere (excluding modifier keys, Tab, and Escape)
- Fuzzy command matching — near-misses like "trasj" should match "trash". Highest priority: fate words (keep, donate, trash, sell, unsure) since they are typed frequently and the set is small. Approach: Levenshtein distance of 1 on fate words before falling through to item name; consider extending to other common commands. Needs tests for common typos and confirmation that valid item names are not accidentally matched.
- Rename short/unclear variable names — one and two letter variables (e.g. `g`, `g2`) should be replaced with descriptive names. Audit all handlers added during the trash/delete implementation pass. Remaining candidates: `g`/`group` variables in reviewBox and groupItems loops. Note: well-known abbreviations like `pref`, `idx`, `btn` are acceptable as suffixes on descriptive names — e.g. `effectivePref` is preferred over `effPref` (too terse) or `effectivePreference` (unnecessarily verbose).
- Document variable naming convention in CONTRIBUTING — add a section stating: avoid single and double letter variable names unless following a strong established convention (e.g. loop index `i`); avoid opaque abbreviations; prefer full descriptive names even if longer.
- Single letter command shortcuts — audit all commands and define a consistent set of single-letter shorthands. Currently: `y`/`n`, `m` (move), `h` (help). Candidates: `d` (done with this box), `r` (review items), `n` (new box — conflicts with no), `a` (add item). Each shorthand must be added to the global intercept block in `processInput` and documented in README.md commands table. Requires tests confirming shortcuts are not logged as item names.
- Trash N from box review does not return to review list after completing the delete flow — after answering yes/no to the delete prompt, the user is left without review chips. Delete N returns to the review list correctly. Fix: after trash delete flow completes (handleTrashDelete), if the stage was previously BOX_OPEN/reviewing, re-show the review chips. The delete behavior is the correct model.
- Move single item to another box — `move item <N> to <box name>` should move a specific numbered item from the active box to another named box. Currently there is no way to move individual items between boxes; `Dump into...` moves all items. This is a high-priority gap since users regularly sort items into wrong boxes and need to correct them without moving everything.
- `whereami` debug command — typing `whereami` (or `?!`) should print the current `conversationStage`, active box name, and last chips shown. Useful for diagnosing silent failures where chips disappear and no response is rendered. Should be a global intercept that works from any stage.
- Review all boxes uses an unordered list while review by fate uses a numbered list. Upgrade review all boxes to use a numbered list and allow box selection by number (type `3` to open box 3 directly).
- Six-chip trash delete prompt is taller than the standard prompt and may obscure the last message. Consider a layout fix or reducing to four chips by moving always/never for this box to a secondary prompt.
- Change fate from box review — when reviewing a box (`review items`), there is no way to change an item's fate to keep/donate/sell/unsure directly. Current chips offer `Trash N` or `Delete N` only. Options: add `Unsure N`, `Keep N`, `Donate N`, `Sell N` chips to the review screen, or make the item detail view (accessed by typing a number) the primary path for fate changes and ensure all fates are reachable from there.
- Compound command history — multi-step exchanges (e.g. `move` then `bedroom`) should be stored as a single history entry (`move bedroom`) rather than two separate ones. Approach: when a command triggers an `AWAITING_*` stage, save the command as a pending prefix; when the next message is sent in that stage, combine prefix + answer into one history entry instead of storing them separately. Stages to consider: `AWAITING_MOVE_LOCATION`, `AWAITING_DUMP_TARGET`, `AWAITING_NEST_PARENT`, `AWAITING_BOX_NAME`, `AWAITING_LOCATION`, `AWAITING_BATCH_CONFIRM`, `AWAITING_DELETE_BOX_CONFIRM`
- Arrow up/down ✅ implemented — cycles through sent message history; arrow down returns to draft
- Context bar + help command ✅ implemented — hi/hello/hey/help/? all trigger contextual help; context bar now reads "type \"help\" or \"?\" for commands"
- Natural language box commands — `trash box <name>` and `delete box <name>` should switch to the named box and trigger the delete flow. Currently these are logged as new item names. Similarly `move box <name>` could switch to a named box and trigger the move flow without requiring the user to first navigate to the box manually.
- Move any box by name (not just the active box)
- Rename to DeclutterBot ✅ completed
- `uid()` generates a random 7-char base-36 string (~78 billion possibilities) but does not verify uniqueness against existing IDs. A collision would silently corrupt parentId/activeBoxId foreign key relationships. Fix: collect all in-use IDs at generation time and retry on collision. Add a test that generates a large number of IDs and asserts no duplicates.
- Photo support (currently deactivated) — camera button, ZIP export, and item photo display were removed due to reliability issues with base64 dataUrl persistence in localStorage. To re-enable: restore pendingPhotos flow in sendUserMessage, restore handlePhotoUpload, restore photo-btn and photo-input in index.html, restore exportZip, restore photo count in showItemDetail, restore photos array in exportJSON
- Box photos (blocked on photo support reactivation above)
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

- [ ] Did I add a new `AWAITING_*` stage? → Update the stage table
- [ ] Did I add a new global command (intercepted above the `switch`)? → Document it in the global command intercept section
- [ ] Did I add a new chip label? → Also add it as a global intercept in `processInput`
- [ ] Did I call `setChips()` without changing `conversationStage`? → This is almost always a bug. Every chip display must be paired with a stage that handles those chips, otherwise they fall through to `handleItemName`.
- [ ] Did I add a new single-character shorthand? → Document it in the input normalisation section
- [ ] Did I add tests to an existing file? → Inserted them **before** the summary block, not appended after `process.exit`
- [ ] Did I move a function into or out of the DOM guard? → Update the DOM guard section
- [ ] Did I move or restructure an existing function? → Diff the before and after line-by-line to confirm every property, class assignment, and side effect is preserved. A moved function that compiles and passes tests can still be missing lines.
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
- [ ] Did I identify a new upcoming feature? → Add it to the punchlist
- [ ] Before adding a punchlist item, did I verify the current behavior? → Check actual output/behavior first; do not add tasks based on assumptions about what the code does. The task may already be done.

### Automated tasks removed from the checklist

The tasks below no longer need to be reviewed before commiting, as they are automatic.

- Did I add a new test file? → `test.js` auto-discovers any file matching `test_*.js`, no registration needed
