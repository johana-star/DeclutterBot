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
| Location | Same directory as `app.js` and `index.html` |
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
- Incorrect behaviour (wrong output, wrong state)
- Missing behaviour (something that should happen but doesn't — like a UI action not echoing a command)
- Scoping / initialisation bugs (e.g. `renderBoxTree` not defined at call time)
- Data migration bugs (e.g. `parentId` undefined vs null from localStorage)

**Feature changes also require tests.** If you change how an existing feature behaves — not just add a new one — update or add tests to cover the new behaviour. The existing tests may still pass while the changed behaviour is untested.

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

var app = require('./app.js');
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
| `FINISHED` | No active box, session summary state |

**When adding a new stage:** add a `case` to the `switch` in `processInput`, and if the feature can be invoked from any stage, also add an intercept above the switch.

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

**Any label used in `setChips()` must also be intercepted as a global command.** Chip labels can appear as user input at any stage, including `BOX_OPEN` where unrecognised text is treated as an item name. Failing to intercept a chip label will cause it to be logged as an item — this has already happened with "Skip to next box".

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
node test.js
```

To run a single suite:

```bash
node test_move.js
node test_remove.js
```

All files exit with code `0` on success and `1` on any failure.

**When adding a new test file**, name it `test_<feature>.js` — `test.js` auto-discovers all files matching that pattern. No registration required.

## Existing Tests

| File | Feature covered |
|------|----------------|
| `test_move.js` | Move box to a new location (`move`, `m`) |
| `test_remove.js` | Remove an item from a box (`remove`, `delete`) |
| `test_box_batch.js` | Batch box creation with singularizer (`five wooden boxes`, `3 shelves`) |
| `test_delete_dump.js` | Delete empty box; dump all items into another box |
| `test_nest.js` | Nested boxes: nest command, circular prevention, delete guard, dump with children |
| `test_item_view.js` | Item detail view: number selection, actions, notes editing, photo count |

---

## Punchlist (upcoming features needing tests on implementation)

- Export CSV — export inventory as a flat CSV file with columns: box name, box location, item name, fate, notes. One row per item. Needs tests for correct column order, escaping of commas/quotes in values, and empty boxes handled gracefully.
- Import accepts CSV or JSON — the import button and `import` command should accept either format. CSV import should reconstruct boxes and items from the flat structure. Needs tests for valid CSV, malformed CSV, mixed encoding edge cases, and round-trip fidelity (export then re-import produces equivalent state).
- Merge on import JSON — when importing, instead of replacing, offer a merge strategy:
  - Boxes only in the JSON file are added to the app
  - Boxes only in the app are kept as-is
  - Boxes present in both: surface a review prompt during import to choose the merge strategy (keep app version, keep JSON version, or merge items from both)
  - Items within a merged box should be deduplicated by name+fate where possible
- Import JSON ✅ implemented — file input in header, validates structure, normalises legacy fields, confirms before overwrite, re-renders with summary
- DRY common bot responses into a response dictionary — bot messages like fate confirmations, error strings, and stage transitions are currently hardcoded inline throughout the handlers. Extract them into a single `RESPONSES` object at the top of app.js so wording can be changed in one place. Needs tests to verify response keys exist and return strings.
- Compound command history — multi-step exchanges (e.g. `move` then `bedroom`) should be stored as a single history entry (`move bedroom`) rather than two separate ones. Approach: when a command triggers an `AWAITING_*` stage, save the command as a pending prefix; when the next message is sent in that stage, combine prefix + answer into one history entry instead of storing them separately. Stages to consider: `AWAITING_MOVE_LOCATION`, `AWAITING_DUMP_TARGET`, `AWAITING_NEST_PARENT`, `AWAITING_BOX_NAME`, `AWAITING_LOCATION`, `AWAITING_BATCH_CONFIRM`, `AWAITING_DELETE_BOX_CONFIRM`
- Arrow up/down ✅ implemented — cycles through sent message history; arrow down returns to draft
- Context bar says "say hi to get started" but saying "hi" returns a freeform error — either make "hi" trigger the welcome flow when there is no active box, or update the context bar copy to give accurate guidance
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

## Keeping CONTRIBUTING.md Up to Date

**CONTRIBUTING.md must be updated in the same change as the code it describes.** It is not a document to update later — later never comes.

### Checklist — run this when finishing any change

When you make a code change, ask yourself:

- [ ] Did I add a new `AWAITING_*` stage? → Update the stage table
- [ ] Did I add a new global command (intercepted above the `switch`)? → Document it in the global command intercept section
- [ ] Did I add a new chip label? → Also add it as a global intercept in `processInput`
- [ ] Did I add a new single-character shorthand? → Document it in the input normalisation section
- [ ] Did I add tests to an existing file? → Inserted them **before** the summary block, not appended after `process.exit`
- [ ] Did I move a function into or out of the DOM guard? → Update the DOM guard section
- [ ] Did I discover a new browser compatibility issue? → Add it to the Safari / iOS section
- [ ] Did I change how tests are structured or stubbed? → Update the How Tests Work section
- [ ] Did I share all modified files? → Every file changed in a session should be included in the final present_files call, including test files
- [ ] Did I fix a bug? → Write a test that reproduces the original failure
- [ ] Did I change existing behaviour? → Update or add tests covering the new behaviour
- [ ] Did I complete a punchlist item? → Remove it from the punchlist
- [ ] Did I change the app's conversation flow? → Update the Mermaid diagram in README.md and flowchart.html
- [ ] Did I identify a new upcoming feature? → Add it to the punchlist
- [ ] Before adding a punchlist item, did I verify the current behaviour? → Check actual output/behaviour first; do not add tasks based on assumptions about what the code does. The task may already be done.

### Automated tasks removed from the checklist

The tasks below no longer need to be reviewed before commiting, as they are automatic.

- Did I add a new test file? → `test.js` auto-discovers any file matching `test_*.js`, no registration needed
