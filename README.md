# DeclutterBot — Sorting Companion

A browser-based chatbot that guides you through sorting boxes and their contents. Log every item, assign it a fate, attach photos, and export your inventory when you're done.

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
3. **Assign a fate** — keep, donate, trash, sell, or unsure
4. **Add notes** — optional condition, value, or destination
5. **Repeat** until the box is empty, then move to the next

> Open [flowchart.html](./flowchart.html) in a browser for a visual walkthrough of this workflow.

```mermaid
flowchart TD
    START([Start session]) --> HAS_BOXES{Any boxes\nalready logged?}

    HAS_BOXES -->|No| NAME_BOX[Name the box\ne.g. Garage #1]
    HAS_BOXES -->|Yes| CONTINUE{Continue last box\nor start new one?}

    CONTINUE -->|New box| NAME_BOX
    CONTINUE -->|Continue| PICK_UP

    NAME_BOX --> SET_LOC[Set location\ne.g. spare bedroom]
    SET_LOC --> PICK_UP[Pick up an item\nand describe it]

    PICK_UP --> QUANTITY{More than\none of this item?}

    QUANTITY -->|Yes| CONFIRM_QTY[Confirm quantity\ne.g. 11 × paper towel rolls]
    QUANTITY -->|No| FATE

    CONFIRM_QTY --> BATCH_FATE[Assign fate\nto all at once]
    BATCH_FATE --> MIXED{Mixed fates?}
    MIXED -->|Yes| FATE
    MIXED -->|No| NOTES

    FATE[Assign fate] --> KEEP([Keep])
    FATE --> DONATE([Donate])
    FATE --> TRASH([Trash])
    FATE --> SELL([Sell])
    FATE --> UNSURE([Unsure — revisit later])

    KEEP --> NOTES
    DONATE --> NOTES
    TRASH --> NOTES
    SELL --> NOTES
    UNSURE --> NOTES

    NOTES[Add notes?\ne.g. condition, value, destination] --> MORE_ITEMS{More items\nin this box?}

    MORE_ITEMS -->|Yes| PICK_UP
    MORE_ITEMS -->|No| BOX_DONE[Box summary\nkeep · donate · trash · sell · unsure]

    BOX_DONE --> ANOTHER{Another\nbox to sort?}

    ANOTHER -->|Yes| NAME_BOX
    ANOTHER -->|No| EXPORT[Export inventory\nJSON or ZIP with photos]
    EXPORT --> END([Session complete])
```

---

## Commands

Commands can be typed or tapped as suggestion chips. Single-letter shorthands are supported where noted.

| Command | Shorthand | What it does |
|---------|-----------|--------------|
| `new box` | — | Start logging a new box |
| `done with this box` | `done` | Finish the current box, see summary |
| `skip to next box` | — | Same as done, no summary |
| `review items` | — | List all items in the current box |
| `move <location>` | `m <location>` | Move the active box to a new location |
| `move` | `m` | Prompts for the new location |
| `remove <name or number>` | `delete <name or number>` | Remove an item from the active box |
| `remove` | `delete` | Prompts with usage hint |
| `review all boxes` | — | Summary of every box |
| `reset` | — | Clear all data (asks for confirmation) |
| `y` / `n` | — | Shorthand for yes / no at any prompt |
| ↑ / ↓ arrow keys | — | Cycle through previously sent messages (like a terminal) |

---

## Batch Entry

If you have multiple identical items, say so naturally:

> "eleven paper towel rolls"  
> "3 old magazines"

DeclutterBot will detect the quantity, ask you to confirm, then log each as a separate entry — all sharing the same fate when you assign it.

---

## Exporting Your Data

| Button | Output |
|--------|--------|
| **Import JSON** | Load a previously exported `inventory.json` — replaces current inventory |
| **Export JSON** | Structured inventory — all boxes, items, fates, and notes |

---

## File Structure

```
index.html          Browser entry point — HTML and CSS only
app.js              All application logic
test_move.js        Tests for the move box feature
CONTRIBUTING.md     Development guide — read before making changes
README.md           This file
flowchart.html      Visual process flowchart — open in browser
.githooks/          Git hooks — run `git config core.hooksPath .githooks` to activate
  pre-commit        Runs test.js before every commit; aborts on failure
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

See [CONTRIBUTING.md](./CONTRIBUTING.md) for how to add new test files.

To run a single suite:

```bash
node tests/test_move.js
```

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:

- How to add features (including the test requirement)
- The conversation state machine and how to extend it
- Safari / iOS compatibility rules
- The update checklist to run after every change
- The punchlist of planned features
