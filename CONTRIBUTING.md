# Contributing to Sortie

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

### Input normalisation

Single-character shorthands are expanded at the very top of `processInput`, before any other logic runs:

```js
if (t === 'y') { t = 'yes'; text = 'yes'; }
if (t === 'n') { t = 'no';  text = 'no';  }
```

**When adding a new shorthand**, add it here. Do not scatter alias handling throughout individual stage handlers.

---

## Existing Tests

| File | Feature covered |
|------|----------------|
| `test_move.js` | Move box to a new location (`move`, `m`) |

---

## Punchlist (upcoming features needing tests on implementation)

- Arrow up — recall previous user message (terminal-style history)
- Move any box by name (not just the active box)
---

## Keeping CONTRIBUTING.md Up to Date

**CONTRIBUTING.md must be updated in the same change as the code it describes.** It is not a document to update later — later never comes.

### Checklist — run this when finishing any change

When you make a code change, ask yourself:

- [ ] Did I add a new `AWAITING_*` stage? → Update the stage table
- [ ] Did I add a new global command (intercepted above the `switch`)? → Document it in the global command intercept section
- [ ] Did I add a new single-character shorthand? → Document it in the input normalisation section
- [ ] Did I add a new test file? → Add a row to the existing tests table
- [ ] Did I move a function into or out of the DOM guard? → Update the DOM guard section
- [ ] Did I discover a new browser compatibility issue? → Add it to the Safari / iOS section
- [ ] Did I change how tests are structured or stubbed? → Update the How Tests Work section
- [ ] Did I complete a punchlist item? → Remove it from the punchlist
- [ ] Did I identify a new upcoming feature? → Add it to the punchlist
