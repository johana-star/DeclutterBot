// state.js — World model for DeclutterBot
// ==========================================
// The nouns of the system: boxes, items, fates, and the operations
// that read or hydrate them. No DOM, no render calls, no side effects.
//
// Load order: state.js must be first — everything else depends on it.

// ── Utilities needed by state ─────────────────────────────────────────────────
function titleize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function uid() { return Math.random().toString(36).slice(2, 9); }

// ── Fates ─────────────────────────────────────────────────────────────────────
const FATES       = ['trash', 'return', 'sell', 'keep', 'donate', 'unsure'];
const FATE_TITLES = FATES.map(titleize);

// ── World state ───────────────────────────────────────────────────────────────
// Single mutable object representing the full inventory.
// Mutated in place by handlers; serialised to localStorage by saveState().
let state = {
  boxes:               [],
  activeBoxId:         null,
  activeItemId:        null,
  pendingBatch:        null,
  pendingBoxBatch:     null,
  pendingDeleteBoxId:  null,
  pendingNest:         null,
  activeItemViewGroup: null,
  pendingFateReview:   null,
  conversationStage:   'WELCOME',
  emptyBoxesForDelete: null,
  emptyBoxPositions:   null,
  renamePositions:     null,
  pendingRenameBoxId:  null,
  movePositions:       null,
  pendingMoveBoxId:    null,
};

// ── State accessors ───────────────────────────────────────────────────────────
function activeBox() {
  return state.boxes.find(function(box) { return box.id === state.activeBoxId; }) || null;
}

function activeItem() {
  var box = activeBox();
  if (!box || !state.activeItemId) return null;
  return box.items.find(function(item) { return item.id === state.activeItemId; }) || null;
}

function activeItems(box) {
  return box ? _.reject(box.items, function(item) { return item.deleted_at; }) : [];
}

// ── Schema migrations ─────────────────────────────────────────────────────────
// Applied in loadState() whenever persisted data is loaded.
// See CONTRIBUTING.md — Data Model Migrations for the full migration log.
function _migrateState() {
  for (var i = 0; i < state.boxes.length; i++) {
    var box = state.boxes[i];
    // parentId: undefined -> null (nesting introduced)
    if (box.parentId === undefined) box.parentId = null;
    // items: addedAt -> createdAt, remove vestigial photos field
    for (var j = 0; j < (box.items || []).length; j++) {
      var item = box.items[j];
      if (item.addedAt !== undefined && item.createdAt === undefined) {
        item.createdAt = item.addedAt;
        delete item.addedAt;
      }
      if (item.photos !== undefined) delete item.photos;
    }
  }
}

// ── Persistence ───────────────────────────────────────────────────────────────
function loadState() {
  var raw = localStorage.getItem('declutterbot_state');
  if (raw) {
    try {
      state = JSON.parse(raw);
      _migrateState();
    } catch(e) {}
  }
}

// ── Node.js export (for tests) ────────────────────────────────────────────────
if (typeof module !== 'undefined' && module.exports) {
  const exports = { state, FATES, FATE_TITLES, uid, titleize, loadState, activeBox, activeItem, activeItems };
  if (typeof global !== 'undefined') Object.assign(global, exports);
  module.exports = exports;
}
