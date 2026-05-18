# DeclutterBot — Sorting Companion

A browser-based chatbot that guides you through sorting boxes and their contents. Log every item, assign it a fate, add notes, and export your inventory when you're done.

---

## Getting Started

No installation required. Open `index.html` in any modern browser (Chrome, Firefox, Safari).

```
index.html   ← open this
app.js       ← loaded automatically
```

Your data is saved to `localStorage` automatically as you work, so you can close the tab and pick up where you left off.

---

## How It Works

DeclutterBot walks you through a structured workflow:

1. **Name a box** — give it a label and a location
2. **Pick up an item** — describe it to the bot
3. **Assign a fate** — keep, donate, trash, sell, return, or unsure
4. **Add notes** — optional condition, value, or destination
5. **Repeat** until the box is empty, then move to the next

> Open [flowchart.html](./flowchart.html) in a browser for a visual walkthrough of this workflow.

---

## Commands

Commands can be typed or tapped as suggestion chips.

| Command | What it does |
|---------|--------------|
| `new box` | Start logging a new box |
| `add item` | Add an item to the active box |
| `review items` | List items in the current box |
| `review all boxes` | Summary of every box |
| `review by fate` | Review all items of a given fate across every box |
| `rename <box number>` | Rename a box |
| `move <location>` | Move the active box to a new location |
| `delete <box number>` | Delete an empty box |
| `nest box` | Put the active box inside another |
| `convert location <name>` | Promote a location string to a nested box |
| `dump into...` | Transfer all items from active box to another |
| `trash <name or number>` | Mark an item for deletion |
| `remove <name or number>` | Remove an item from the active box |
| `done with this box` | Finish sorting this box |
| `done for now` | End session and see summary |
| `reset` | Clear all data (asks for confirmation) |
| `import json` | Merge a saved inventory into current |
| `import csv` | Load items from a CSV file |
| `export json` | Download your inventory as JSON |
| `export csv` | Download your inventory as CSV |
| `y` / `n` | Shorthand for yes / no at any prompt |
| ↑ / ↓ arrow keys | Cycle through previously sent messages |

---

## Item Entry

When adding items, you can set fate and notes in the same line.

**Comma format** — position 2 is always fate, everything after is notes:
```
bowl                          → asks for fate, then notes
bowl, keep                    → fate set, asks for notes
bowl, keep, chipped rim       → fate and notes set, done
bowl, keep, ceramic, chipped  → name="bowl", fate=keep, notes="ceramic, chipped"
```

**Semicolon format** — use when commas appear in the item name or notes:
```
bowl, ceramic; keep; chipped, hand-painted from Mexico
```

**Multiline entry** — Shift+Enter inserts a newline, Enter submits. Each line is treated as a separate item.

---

## Batch Entry

If you have multiple identical items, say so naturally:

> "eleven paper towel rolls"
> "3 old magazines"

DeclutterBot will detect the quantity, ask you to confirm, then log each as a separate entry.

---

## Exporting Your Data

| Button | Output |
|--------|--------|
| **Export JSON** | Structured inventory — all boxes, items, fates, and notes |
| **Export CSV** | Flat spreadsheet — one row per item |
| **Import JSON** | Merge a saved inventory into the current session |
| **Import CSV** | Load items from a CSV file |

---

## File Structure

```
index.html          Browser entry point — HTML, CSS, and UI bindings
app.js              All application logic
tests/              Test suite — run with: node tests/test.js
  test.js           Auto-discovers and runs all test_*.js files
  lodash.js         Bundled lodash for tests (no network dependency)
flowchart.html      Visual process flowchart — open in browser
CONTRIBUTING.md     Development guide — read before making changes
README.md           This file
.githooks/
  pre-commit        Runs tests and updates tree.txt before every commit
```

---

## Setup

Clone the repo, then run these two commands once to activate the pre-commit hook:

```bash
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks
```

After that, `node tests/test.js` will run automatically before every commit. Any test failure aborts the commit.

## Running Tests

```bash
node tests/test.js
```

To run a single suite:

```bash
node tests/test_reset.js
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add new test files.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- Voice and copy principles
- Data model and migration patterns
- The text adventure architecture model
- How to add features (including the test requirement)
- The punchlist of planned features
