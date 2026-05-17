// app.js — DeclutterBot core logic
// DOM-touching functions (addBotMessage, setChips, renderSidebar, etc.)
// are expected to be defined globally or stubbed before this file runs.
// Pure helper functions are also available in helpers.js

// Load and make helpers globally available (for tests and modular usage)
if (typeof require !== 'undefined') {
  try {
    require('./helpers.js');
  } catch(e) {
    try {
      require('./tests/helpers.js');
    } catch(e2) {
      // helpers.js not available, but that's okay - functions are defined below
    }
  }
}

const _ = typeof require !== 'undefined' ? require('./tests/lodash.js') : window._;

// Helper: Filter out soft-deleted items
const helpers = {
  activeItems: function(box) {
    return box ? _.reject(box.items, (item) => item.deleted_at) : [];
  },

  activeBoxes: function() {
    return _.reject(state.boxes, (box) => box.deleted_at);
  },

  welcomeBackMessage: function(includeItemCount) {
    const boxCount = state.boxes.length;
    const boxText = '<strong>' + boxCount + '</strong> box' + (boxCount !== 1 ? 'es' : '');

    if (includeItemCount) {
      let itemCount = 0;
      state.boxes.forEach(function(box) {
        itemCount += helpers.activeItems(box).length;
      });
      const itemText = '<strong>' + itemCount + '</strong> item' + (itemCount !== 1 ? 's' : '');
      return '<p>Back at it. ' + boxText + ', ' + itemText + ' so far.</p><p>Pick up where you left off?</p>';
    }

    return '<p>Back at it. ' + boxText + ' in play. Pick up where you left off?</p>';
  },

  emoji: {
    middleDot: '\u00b7',
    multiplicationSign: '\u00d7',
    emDash: '\u2014',
    ellipses: '\u2026',
    upArrow: '\u2191',
    rightArrow: '\u2192',
    downArrow: '\u2193',
    warningSign: '\u26a0\ufe0f',  // Variation selector for emoji presentation
    checkMark: '\u2705\ufe0f',    // Variation selector for emoji presentation
    blueHeart: '\uD83D\uDC99',
    moneyBag: '\uD83D\uDCB0',
    box: '\uD83D\uDCE6',
    trashBin: '\uD83D\uDDD1\ufe0f',  // Variation selector for emoji presentation
    shrug: '\uD83E\uDD37'
  }
};

let state = {
  boxes: [],
  activeBoxId: null,
  activeItemId: null,
  pendingBatch: null,
  pendingBoxBatch: null,
  pendingDeleteBoxId: null,
  pendingNest: null,
  activeItemViewGroup: null,
  pendingFateReview: null,
  conversationStage: 'WELCOME',
  emptyBoxesForDelete: null,
  emptyBoxPositions: null,
  renamePositions: null,
  pendingRenameBoxId: null,
  movePositions: null,
  pendingMoveBoxId: null,
};
const FATES = ['trash','return','sell','keep','donate','unsure'];
function titleize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
const FATE_TITLES = FATES.map(titleize);
let collapsedBoxIds = [];
let sessionDeletedCount = 0;
let sessionTrashPreference = null; // null | 'always' | 'never'
let boxTrashPreferences = {}; // boxId -> 'always' | 'never'
function toggleCollapse(id) {
  var index     = collapsedBoxIds.indexOf(id);
  var collapsed = index === -1;

  collapsed ? collapsedBoxIds.push(id) : collapsedBoxIds.splice(index, 1);
  var box = state.boxes.find((boxLookup) => boxLookup.id === id);

  if (box) { addUserMessage((collapsed ? 'collapse ' : 'expand ') + box.name, []); }
  renderSidebar();
}

function saveState() {
  _budgetSaveCount++;
  if (_budgetSaveCount >= 30) {
    _budgetSaveCount = 0;
    updateBudgetDisplay(true); // show recalculating pulse
    setTimeout(function() {
      const STORAGE_MAX = 5 * 1024 * 1024;
      const stateData = state;
      const used = JSON.stringify(stateData).length;
      const totalItems = state.boxes.reduce((sum, b) => sum + b.items.length, 0);
      const totalObjects = totalItems + state.boxes.length;
      if (totalObjects >= 10) {
        const divisor = Math.round(used / totalObjects);
        const remaining = Math.max(0, STORAGE_MAX - used);
        _budgetItems = Math.floor(remaining / divisor);
      }
      // else: keep using 14,397 (set at line 235)
      updateBudgetDisplay();
    }, 1500);
  }
  _budgetDirty = true;
  try {
    localStorage.setItem('declutterbot_state', JSON.stringify(state));
  } catch(err) {
    if (err.name === 'QuotaExceededError') {
      if (!state.storageFull) {
        state.storageFull = true;
        addBotMessage(
          '<p><strong>Storage full.</strong> Delete items marked <strong>trash</strong> to continue, or export your inventory.</p>' +
          '<p>State is saved in memory until you refresh the page.</p>'
        );
        setChips(['Export JSON', 'Always ignore']);
      }
    } else {
      throw err;
    }
  }
}
function loadState() {
  var raw = localStorage.getItem('declutterbot_state');
  if (raw) { try {
    state = JSON.parse(raw);
    state.boxes.forEach(function(box) {
      // Normalise parentId: undefined -> null (added when nesting was introduced)
      if (box.parentId === undefined) { box.parentId = null; }
      // Migrate items: addedAt -> createdAt, remove vestigial photos field
      (box.items || []).forEach(function(item) {
        if (item.addedAt !== undefined && item.createdAt === undefined) {
          item.createdAt = item.addedAt;
          delete item.addedAt;
        }
        if (item.photos !== undefined) { delete item.photos; }
      });
    });
  } catch(e) {} }
}

function commitState() {
  saveState();
  renderSidebar();
  updateContextBar();
}

function uid() { return Math.random().toString(36).slice(2,9); }
function activeBox() {
  return state.boxes.find(function(box) { return box.id === state.activeBoxId; });
}
function activeItem() {
  var box = activeBox();
  if (!box || !state.activeItemId) { return null; }
  return box.items.find(function(item) { return item.id === state.activeItemId; });
}
function countFates(box) {
  var items = helpers.activeItems(box);
  return items.reduce(function(counts, item) {
    counts[item.fate] = (counts[item.fate] || 0) + 1;
    return counts;
  }, {});
}

// Recursively counts fates across a box and all its descendants.
// Used for sidebar badge display so nested boxes surface their contents upward.
function countFatesDeep(box) {
  var counts = countFates(box);
  var children = state.boxes.filter(function(b) { return b.parentId === box.id; });
  children.forEach(function(child) {
    var childCounts = countFatesDeep(child);
    Object.keys(childCounts).forEach(function(fate) {
      counts[fate] = (counts[fate] || 0) + childCounts[fate];
    });
  });
  return counts;
}

// Location collapse state — persisted in localStorage, not in app state
var collapsedLocationKeys = (function() {
  try {
    var raw = localStorage.getItem('declutterbot_collapsed_locations');
    return raw ? JSON.parse(raw) : [];
  } catch(e) { return []; }
})();

// Active location filter — session only
var activeLocationFilter = null;

function saveCollapsedLocations() {
  try {
    localStorage.setItem('declutterbot_collapsed_locations', JSON.stringify(collapsedLocationKeys));
  } catch(e) {}
}

function toggleLocationCollapse(locKey) {
  var idx = collapsedLocationKeys.indexOf(locKey);
  if (idx === -1) {
    collapsedLocationKeys.push(locKey);
  } else {
    collapsedLocationKeys.splice(idx, 1);
  }
  saveCollapsedLocations();
  renderSidebar();
}

function setLocationFilter(locKey) {
  if (activeLocationFilter === locKey) {
    clearLocationFilter();
  } else {
    activeLocationFilter = locKey;
    renderSidebar();
  }
}

function clearLocationFilter() {
  activeLocationFilter = null;
  renderSidebar();
}

function renderSidebar() {
  var el = document.getElementById('sidebar-content');
  var cnt = document.getElementById('box-count');
  var inventoryLabel = document.getElementById('inventory-label');
  var filterBadge = document.getElementById('filter-badge');

  cnt.textContent = state.boxes.length + ' box' + (state.boxes.length !== 1 ? 'es' : '');
  if (state.boxes.length === 0) {
    el.innerHTML = '<div class="empty-sidebar">No boxes yet.<br/>Start chatting to<br/>begin sorting.</div>';
    if (inventoryLabel) { inventoryLabel.className = 'inventory-label'; }
    if (filterBadge) { filterBadge.style.display = 'none'; }
    return;
  }

  // Group top-level boxes by normalized location, preserving order
  var topLevel = state.boxes.filter(function(b) { return (b.parentId == null); });
  var locationOrder = [];
  var locationGroups = {};
  topLevel.forEach(function(box) {
    var locKey = (box.location || '').toLowerCase().trim() || 'no location';
    if (!locationGroups[locKey]) {
      locationGroups[locKey] = { display: box.location || 'no location', boxes: [] };
      locationOrder.push(locKey);
    }
    locationGroups[locKey].boxes.push(box);
  });

  // Update sidebar header
  var isFiltered = activeLocationFilter !== null && locationGroups[activeLocationFilter];
  if (inventoryLabel) {
    inventoryLabel.className = 'inventory-label' + (isFiltered ? ' inventory-label-filtered' : '');
    inventoryLabel.onclick = isFiltered ? clearLocationFilter : null;
  }
  if (filterBadge) {
    if (isFiltered) {
      var filteredCount = locationGroups[activeLocationFilter].boxes.length;
      filterBadge.style.display = 'inline-flex';
      filterBadge.innerHTML = escHtml(locationGroups[activeLocationFilter].display)
        + ' <span class="filter-badge-x" onclick="clearLocationFilter()">&#x2715;</span>';
      cnt.innerHTML = '<span class="count-filtered">' + filteredCount + '</span> of ' + state.boxes.length;
    } else {
      filterBadge.style.display = 'none';
      cnt.textContent = state.boxes.length + ' box' + (state.boxes.length !== 1 ? 'es' : '');
    }
  }

  var html = '';
  locationOrder.forEach(function(locKey) {
    var group = locationGroups[locKey];
    var isMulti = group.boxes.length > 1;
    var isLocCollapsed = collapsedLocationKeys.indexOf(locKey) !== -1;
    var isFiltering = activeLocationFilter !== null;
    var isFilteredOut = isFiltering && activeLocationFilter !== locKey;
    var isFilteredIn = isFiltering && activeLocationFilter === locKey;
    // Suppress box-active highlight when dimmed; filter-active always wins
    var hasActiveBox = group.boxes.some(function(b) { return b.id === state.activeBoxId; });
    var showActive = isFilteredIn || (!isFilteredOut && hasActiveBox);

    var activeClass = showActive ? ' loc-active' : '';
    var dimClass = isFilteredOut ? ' loc-dimmed' : '';

    if (isMulti) {
      var caretChar = isLocCollapsed ? '&#9654;' : '&#9660;';
      var collapsedTags = '';
      if (isLocCollapsed) {
        var totals = {};
        group.boxes.forEach(function(b) {
          var fc = countFatesDeep(b);
          FATES.forEach(function(f) {
            if (fc[f]) { totals[f] = (totals[f] || 0) + fc[f]; }
          });
        });
        FATES.forEach(function(f) {
          if (totals[f]) {
            collapsedTags += '<span class="tag tag-' + f + '">' + f + ' ' + totals[f] + '</span>';
          }
        });
      }
      html += '<div class="location-header' + activeClass + dimClass + '" onclick="setLocationFilter(\'' + escAttr(locKey) + '\')">'
        + '<div class="location-header-top">'
        + '<button class="location-caret" onclick="event.stopPropagation();toggleLocationCollapse(\'' + escAttr(locKey) + '\')">' + caretChar + '</button>'
        + '<span class="location-label">' + escHtml(group.display) + '</span>'
        + '<span class="location-count">' + group.boxes.length + ' boxes</span>'
        + '</div>'
        + (collapsedTags ? '<div class="location-tags">' + collapsedTags + '</div>' : '')
        + '</div>';
    } else {
      html += '<div class="location-header single' + activeClass + dimClass + '" onclick="setLocationFilter(\'' + escAttr(locKey) + '\')">'
        + '<div class="location-header-top">'
        + '<span class="location-label-spacer"></span>'
        + '<span class="location-label">' + escHtml(group.display) + '</span>'
        + '<span class="location-count">1 box</span>'
        + '</div>'
        + '</div>';
    }

    // Show boxes unless this location is filtered out, or multi+collapsed
    if (!isFilteredOut && (!isMulti || !isLocCollapsed)) {
      group.boxes.forEach(function(box) {
        html += renderBoxCard(box, 0, collapsedBoxIds);
      });
    }
  });

  el.innerHTML = html;
}



function renderBoxCard(box, depth, collapsedIds) {
  var fates = countFatesDeep(box);
  var tags = '';
  tags = FATES.filter((fateName) => fates[fateName] > 0)
    .map((fateName) => '<span class="tag tag-' + fateName + '">' + fateName + ' ' + fates[fateName] + '</span>')
    .join('');
  var total = helpers.activeItems(box).length;
  var kidBoxes = state.boxes.filter(function(b) { return b.parentId === box.id; });
  var hasKids = kidBoxes.length > 0;
  var isCollapsed = collapsedIds && collapsedIds.indexOf(box.id) !== -1;
  var ac = box.id === state.activeBoxId ? ' active' : '';
  var indent = depth * 16;
  var caret = hasKids
    ? '<button class="sidebar-caret" onclick="event.stopPropagation();toggleCollapse(\'' + box.id + '\')">'
      + (isCollapsed ? '&#9654;' : '&#9660;') + '</button>'
    : '<span class="sidebar-caret-spacer"></span>';
  var metaParts = [];
  if (total > 0) { metaParts.push(total + ' item' + (total !== 1 ? 's' : '')); }
  if (hasKids) { metaParts.push(kidBoxes.length + ' box' + (kidBoxes.length !== 1 ? 'es' : '')); }
  if (metaParts.length === 0) { metaParts.push('empty'); }
  var html = '<div class="box-card' + ac + '" draggable="true" data-box-id="' + box.id + '"'
    + ' style="margin-left:' + indent + 'px" onclick="selectBox(\'' + box.id + '\')">'
    + '<div class="box-card-header">' + caret
    + '<div class="box-card-body">'
    + '<div class="box-card-text">'
    + '<div class="box-name">' + escHtml(box.name) + '</div>'
    + '<div class="box-meta">' + metaParts.join(', ') + '</div>'
    + '</div>'
    + (tags ? '<div class="box-counts">' + tags + '</div>' : '')
    + '</div></div></div>';
  if (!isCollapsed) {
    html += renderBoxTree(box.id, depth + 1, collapsedIds);
  }
  return html;
}

function renderBoxTree(boxId, depth, collapsedIds) {
  var html = '';
  var children = state.boxes.filter(function(b) {
    return (b.parentId == null ? null : b.parentId) === boxId;
  });
  html += children.map((child) => renderBoxCard(child, depth, collapsedIds)).join('');
  return html;
}


function selectBox(id) {
  state.activeBoxId = id;
  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';
  commitState();
  var box = activeBox();
  addUserMessage(box.name, []);
  // Add to arrow-up history so sidebar clicks are navigable
  if (inputHistory.length === 0 ||
      inputHistory[inputHistory.length - 1] !== box.name) {
    inputHistory.push(box.name);
    if (inputHistory.length > 100) { inputHistory.shift(); }
  }
  var summary = box.items.length > 0 ? boxSummaryLine(box) : 'empty';
  addBotMessage(
    '<p>Switched to <strong>' + box.name + '</strong>. Contents: ' + summary +
    '.</p><p>What would you like to do?</p>'
  );
  setBoxOpenChips();
}

function updateContextBar() {
  var box = activeBox();
  var dot = document.getElementById('context-dot');
  var label = document.getElementById('context-label');
  if (box) {
    dot.classList.remove('dot-inactive'); dot.classList.add('dot-active');
    var item = activeItem();
    label.textContent = item
      ? 'Box: ' + box.name + '  ' + helpers.emoji.rightArrow + '  Item: ' + item.name
      : 'Active box: ' + box.name + '  ' + helpers.emoji.middleDot + '  ' + helpers.activeItems(box).length + ' items';
  } else {
    dot.classList.remove('dot-active'); dot.classList.add('dot-inactive');
    label.textContent = state.boxes.length === 0
      ? 'No active box ' + helpers.emoji.emDash + ' say hi to get started'
      : 'No active box ' + helpers.emoji.emDash + ' type "help" or "?" for commands';
  }
}

function updateBudgetDisplay(recalculating) {
  if (typeof document === 'undefined') { return; }
  var el = document.getElementById('storage-budget');
  if (!el) { return; }
  if (recalculating) {
    el.textContent = 'recalculating...';
    if (el.classList) { el.classList.add('budget-recalculating'); }
    el.style.color = '';
    return;
  }
  if (el.classList) { el.classList.remove('budget-recalculating'); }
  el.textContent = 'capacity: ' + _budgetItems.toLocaleString() + ' items';
  el.style.opacity = _budgetItems < 1000 ? '1' : '0.6';
  el.style.color = _budgetItems < 500 ? 'var(--peony)' : '';
}

function escHtml(s) {
  return String(s||'').
    replace(/&/g,'&amp;').
    replace(/</g,'&lt;').
    replace(/>/g,'&gt;').
    replace(/\n/g, '<br/>');
}
function escAttr(s) {
  return String(s||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}
// ── INPUT HISTORY state vars ──────────────────────────────────────────────────
let inputHistory = [];   // sent messages, oldest first
let _budgetItems = 14397; // counter, updated per-item and recalibrated every ~10 items
let _budgetSaveCount = 0;  // counts saveState() calls, triggers recalibration at 30 (approx 10 items since 3-4 saves per item)
let historyIndex = -1;   // -1 = not browsing; 0 = oldest
let historyDraft = '';   // text in field before arrow-up was pressed

// DOM functions defined at top level so Safari/iOS can find them as globals.
// Each guards its document calls so they are safe to define in Node too.
function addBotMessage(text, photos) {
  var msgs = typeof document !== 'undefined' && document.getElementById('chat-messages');
  if (!msgs) { return; }
  var div = document.createElement('div');
  div.className = 'msg bot';
  var isHtml = typeof text === 'string' && text.trimStart().startsWith('<');
  div.innerHTML = '<div class="msg-avatar">S</div><div class="msg-bubble">'
    + (isHtml ? text : '<p>' + escHtml(text) + '</p>')
    + '</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text, photos) {
  var msgs = typeof document !== 'undefined' && document.getElementById('chat-messages');
  if (!msgs) { return; }
  var div = document.createElement('div');
  div.className = 'msg user';
  var displayText = escHtml(text.replace(/\n+/g, ' ↩ '));
  div.innerHTML = '<div class="msg-avatar">You</div><div class="msg-bubble"><p>'+displayText+'</p></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function _setChipsImpl(chips) {
  if (typeof document === 'undefined') { return; }
  var el = document.getElementById('quick-replies');
  var html = '';
  html = chips.map((chip) => {
    // Extract the fate word from chip labels like "Trash 4", "Keep...", "Return 2"
    let trailingDigitPattern = /[\.\s\d]+$/
    let chipWord = chip.toLowerCase().replace(trailingDigitPattern, '').trim();
    // "Delete" gets its own distinct style (cayenne dotted border)
    let fateClass = chipWord === 'delete' ? ' fate-delete'
                  : FATES.includes(chipWord) ? ' fate-' + chipWord : '';
    return '<button class="chip' + fateClass + '" onclick="chipClick(\'' + escAttr(chip) + '\')">' +
      escHtml(chip) + '</button>';
  }).join('');
  el.innerHTML = html;
}

function _chipClickImpl(t) {
  if (t==='Move box') { t='move'; }
  // Strip count suffix from fate review menu chips e.g. "Review keep (11)" -> "Review keep"
  var display = t.replace(/\s*\(\d+\)$/, '');
  document.getElementById('user-input').value=display;
  sendUserMessage();
  document.getElementById('user-input').focus();
}

function showTyping() {
  if (typeof document === 'undefined') { return; }
  document.getElementById('typing').classList.add('visible');
  document.getElementById('chat-messages').scrollTop=9999;
}

function hideTyping() {
  if (typeof document === 'undefined') { return; }
  document.getElementById('typing').classList.remove('visible');
}

function handleKey(e) {
  var input = document.getElementById('user-input');
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendUserMessage();
    return;
  }
  if (e.key === 'Enter' && e.shiftKey) {
    // Let the newline insert naturally, then resize
    setTimeout(function() { autoResize(input); }, 0);
    return;
  }
  if (e.key === 'ArrowUp') {
    if (inputHistory.length === 0) { return; }
    e.preventDefault();
    if (historyIndex === -1) {
      historyDraft = input.value;
      historyIndex = inputHistory.length - 1;
    } else if (historyIndex > 0) {
      historyIndex--;
    }
    input.value = inputHistory[historyIndex];
    autoResize(input);
    input.selectionStart = input.selectionEnd = input.value.length;
    return;
  }
  if (e.key === 'ArrowDown') {
    if (historyIndex === -1) { return; }
    e.preventDefault();
    if (historyIndex < inputHistory.length - 1) {
      historyIndex++;
      input.value = inputHistory[historyIndex];
    } else {
      historyIndex = -1;
      input.value = historyDraft;
    }
    autoResize(input);
    input.selectionStart = input.selectionEnd = input.value.length;
    return;
  }
}

function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

async function sendUserMessage() {
  if (typeof document === 'undefined') { return; }
  var input = document.getElementById('user-input');
  var text = input.value.trim();
  if (!text) { return; }
  if (inputHistory.length === 0 || inputHistory[inputHistory.length - 1] !== text) {
    inputHistory.push(text);
    if (inputHistory.length > 100) { inputHistory.shift(); }
  }
  historyIndex = -1;
  historyDraft = '';
  input.value = ''; input.style.height = 'auto';
  setChips([]);
  addUserMessage(text, []);
  showTyping();
  await new Promise(function(r){setTimeout(r,500);});
  hideTyping();
  var lines = text.split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
  var eligibleStage = state.conversationStage === 'AWAITING_ITEM_NAME'
                   || state.conversationStage === 'BOX_OPEN';
  if (lines.length > 1 && eligibleStage) {
    processMultilineItems(lines);
  } else {
    processInput(text, []);
  }
  commitState();
}

function handleBoxOpen(command, photos) {
  // Handle delete N (delete item N from current box)
  if (/^delete \d+$/.test(command)) {
    var match = command.match(/(\d+)$/);
    handleDeleteByNumber(parseInt(match[1], 10));
    return;
  }

  // Handle move command (relocate current box)
  if (command !== 'move to box' && ['m', 'move'].includes(command.split(' ')[0])) {
    const loc = command.split(' ').slice(1).join(' ');
    handleMove(loc);
    return;
  }

  // Handle number input (select item by number) or treat as item name
  if (/^\d+$/.test(command.trim()) && activeBox()) {
    handleItemViewByNumber(parseInt(command.trim(), 10));
  } else {
    handleItemName(command, photos);
  }
}

function handleAddItem() {
  if (!activeBox()) {
    addBotMessage('No active box. Open one first, or start a new one.');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
  } else {
    state.conversationStage = 'BOX_OPEN';
    addBotMessage("What's the item?");
  }
}

function handleContinueLastBox() {
  if (state.activeBoxId && activeBox()) { selectBox(state.activeBoxId); }
  else if (state.boxes.length > 0) { selectBox(state.boxes[state.boxes.length - 1].id); }
  else { startNewBox(); }
}

// Returns true if a global command was handled, false if processInput should continue.
// Global commands are ones that can be invoked from any stage (reset, done, etc).
function tryGlobalIntercept(command, photos, input) {
  input = input || command; // original case preserved
  // clearAll
  if (['reset', 'start over'].includes(command)) { clearAll(); return true; }

  // doneWithBox
  if (['done', 'done with this box', 'skip to next box'].includes(command)) { doneWithBox(); return true; }

  // handleDeleteBox
  if (['delete box', 'delete this box'].includes(command)) { handleDeleteBox(); return true; }


  // handleTrashAll
  if (['trash all'].includes(command)) { handleTrashAll(); return true; }

  // handleDump
  if (command === 'dump into...') { handleDump('dump'); return true; }

  // handleEllipticalAction
  // Only use for item fate view context, not for review-all
  if (command === 'delete...') {
    var isReviewAllDelete = (state.conversationStage === 'FINISHED' ||
      state.conversationStage === 'AWAITING_DELETE_EMPTY_BOX') &&
      state.emptyBoxesForDelete;
    if (!isReviewAllDelete) {
      handleEllipticalAction('Delete', group => group.fate === 'trash'); return true;
    }
  }
  if (command === 'donate...') { handleEllipticalAction('Donate', group => group.fate !== 'donate'); return true; }
  if (command === 'keep...')   { handleEllipticalAction('Keep',   group => group.fate !== 'keep');   return true; }
  if (command === 'sell...')   { handleEllipticalAction('Sell',   group => group.fate !== 'sell');   return true; }
  if (command === 'trash...')  { handleEllipticalAction('Trash',  group => group.fate !== 'trash');  return true; }
  if (command === 'unsure...')  { handleEllipticalAction('Unsure',  group => group.fate !== 'unsure');  return true; }
  if (command === 'return...') { handleEllipticalAction('Return', group => group.fate !== 'return'); return true; }

  // handleFateReview
  if (['review donate', 'review keep', 'review sell', 'review trash', 'review unsure'].includes(command)) {
    handleFateReview(command.slice(7)); return true;
  }

  // handleFateReviewMenu
  if (command === 'review by fate') { handleFateReviewMenu(); return true; }

  // handleFinished
  if (command === 'done for now')     { handleFinished('done'); return true; }
  if (command === 'review all boxes') { handleFinished('review all'); return true; }

  // handleHelp
  if (['?', 'h', 'hello', 'help', 'hey', 'hi'].includes(command)) { handleHelp(); return true; }

  // handleItemViewAction
  if (command === 'back to list') { handleItemViewAction('back to list'); return true; }
  if (command.startsWith('back to ')) { handleItemViewAction(command); return true; }

  // convert location / nest <location-name> — promote a location string to a box
  if (command.startsWith('convert location ')) {
    handlePromoteLocation(input);
    return true;
  }
  // nest <name> where name matches a location (not a box) — or nest <name> in <loc>
  if (command.startsWith('nest ') && !['nest box', 'nest into'].includes(command)) {
    var nestRest = command.slice(5);
    // Check if bare 'nest <name>' where name is a known location
    var inIdx = nestRest.lastIndexOf(' in ');
    var nestLocName = (inIdx !== -1 ? nestRest.slice(0, inIdx) : nestRest).trim();
    var isKnownLocation = state.boxes.some(function(b) {
      return (b.location || '').toLowerCase() === nestLocName;
    });
    var isKnownBox = state.boxes.some(function(b) {
      return b.name.toLowerCase() === nestLocName && !b.deleted_at;
    });
    if (isKnownLocation && !isKnownBox) {
      handlePromoteLocation(input);
      return true;
    }
    if (isKnownLocation && isKnownBox) {
      // Name matches both a location and a box — use the existing box (option 1)
      handlePromoteLocation(input);
      return true;
    }
    // Not a location match — fall through to existing nest handler
  }

  // open N — open the Nth item in the current review list (child boxes are numbered)
  if (/^open \d+$/.test(command)) {
    var openNum = parseInt(command.split(' ')[1], 10);
    var openBox = activeBox();
    if (openBox) {
      var result = renderReviewLines(openBox, 0, 1, []);
      var match = result.childBoxes.find(function(ob) { return ob.number === openNum; });
      if (match) {
        selectBox(match.box.id);
        return true;
      }
    }
    addBotMessage('No box at position ' + openNum + ' in this list.');
    return true;
  }

  // handleNest
  if (['nest box', 'put inside'].includes(command)) { handleNest(command); return true; }

  // import — typed commands set format then trigger the shared file input
  if (['import', 'import json'].includes(command)) {
    if (typeof setFormat === 'function') { setFormat('json'); }
    if (typeof triggerImport === 'function') {
      triggerImport();
    } else {
      addBotMessage('Use the ↑ Import button in the header to import a file.');
    }
    return true;
  }

  if (['import csv'].includes(command)) {
    if (typeof setFormat === 'function') { setFormat('csv'); }
    if (typeof triggerImport === 'function') {
      triggerImport();
    } else {
      addBotMessage('Use the ↑ Import button in the header to import a file.');
    }
    return true;
  }

  // export — typed commands set format then export
  if (['export csv'].includes(command)) {
    if (typeof setFormat === 'function') { setFormat('csv'); }
    if (typeof triggerExport === 'function') {
      triggerExport();
    } else {
      exportCSV();
    }
    return true;
  }

  if (['export', 'export json'].includes(command)) {
    if (typeof setFormat === 'function') { setFormat('json'); }
    if (typeof triggerExport === 'function') {
      triggerExport();
    } else {
      exportJSON();
    }
    return true;
  }

  // always ignore — dismiss storage full warning
  if (command === 'always ignore') {
    state.storageFull = false;
    addBotMessage('Continuing without storage persistence. Export your data regularly to avoid losing changes at refresh.');
    setBoxOpenChips();
    return true;
  }

  // add item
  if (command === 'add item') { handleAddItem(); return true; }

  // continue last box
  if (command === 'continue last box') { handleContinueLastBox(); return true; }

  // new box
  if (command === 'new box') { startNewBox(); return true; }

  // review items — only intercept if there is an active box
  if (command === 'review items') {
    if (activeBox()) { reviewBox(); }
    return activeBox() !== null;
  }

  // back — routes to fate review handler based on stage or pending review
  if (command === 'back' && (
      state.conversationStage === 'AWAITING_FATE_REVIEW_ACTION' ||
      state.conversationStage === 'AWAITING_FATE_REVIEW_ITEM' ||
      state.conversationStage === 'AWAITING_FATE_REVIEW_BULK' ||
      state.pendingFateReview)) {
    handleFateReviewAction('back'); return true;
  }

  // 'Review keep (11)' style chips from the fate review menu
  if (/^review (keep|donate|trash|sell|unsure)( \(\d+\))?$/.test(command)) {
    handleFateReview(command.replace(/^review /, '').replace(/\s*\(\d+\)$/, '').trim());
    return true;
  }

  // dump variants
  if (command.split(' ')[0] === 'dump') { handleDump(command); return true; }

  // fate N chips — keep N, donate N, sell N, unsure N, return N, trash N, delete N
  if (/^(keep|donate|sell|unsure|return) \d+$/.test(command)) {
    var fateMatch = command.match(/^(\w+) (\d+)$/);
    var fateWord = fateMatch[1];
    var fateNum = parseInt(fateMatch[2], 10);
    var fateBox = activeBox();
    if (fateBox) {
      var fateGroups = groupItems(fateBox.items);
      if (fateNum >= 1 && fateNum <= fateGroups.length) {
        var fateGroup = fateGroups[fateNum - 1];
        fateBox.items.forEach(function(it) {
          if (it.name === fateGroup.name && it.fate === fateGroup.fate && !it.deleted_at) {
            it.fate = fateWord;
          }
        });
        commitState();
        addBotMessage('<strong>' + fateGroup.name + '</strong> ' + helpers.emoji.rightArrow + ' ' + fateWord + '.');
        reviewBox();
      }
    }
    return true;
  }

  // trash N / delete N
  if (/^trash \d+$/.test(command)) {
    var match = command.match(/(\d+)$/);
    handleTrashByNumber(parseInt(match[1], 10));
    return true;
  }
  if (/^delete \d+$/.test(command)) {
    // Only use for item context, not for review-all
    var isReviewAllDelete = (state.conversationStage === 'FINISHED' ||
      state.conversationStage === 'AWAITING_DELETE_EMPTY_BOX') &&
      state.emptyBoxPositions;
    if (!isReviewAllDelete) {
      var match = command.match(/(\d+)$/);
      handleDeleteByNumber(parseInt(match[1], 10));
      return true;
    }
  }

  // move command — exclude 'move to box' which is handled by the item view stage
  if (command !== 'move to box' && ['m', 'move'].includes(command.split(' ')[0])) {
    // Only use for box-context, not for review-all stages
    var isReviewAllMove = (state.conversationStage === 'FINISHED' ||
      state.conversationStage === 'AWAITING_MOVE_ELLIPTICAL' ||
      state.conversationStage === 'AWAITING_MOVE_LOCATION_REVIEW') &&
      state.movePositions &&
      (command === 'move...' || /^move \d+$/.test(command));
    if (!isReviewAllMove) {
      const loc = command.split(' ').slice(1).join(' ');
      handleMove(loc); return true;
    }
  }

  // nest variants
  if (['nest', 'put inside', 'nest box'].includes(command)) { handleNest(command); return true; }
  if (['put', 'nest'].includes(command.split(' ')[0]) &&
      (command.indexOf(' inside ') !== -1 || command.indexOf(' in ') !== -1 || command.indexOf(' on ') !== -1)) {
    handleNest(command); return true;
  }

  // move and nest commands handled by global intercept (except review-all context)

  return false;
}

function routeToHandler(stage, command, photos) {
  switch(stage) {
    case 'AWAITING_DELETE_BOX_CONFIRM':  handleDeleteBoxConfirm(command);             break;
    case 'AWAITING_TRASH_ALL_CONFIRM':   handleTrashAllConfirm(command);              break;
    case 'AWAITING_DELETE_TRASHED_CONFIRM':      handleDeleteTrashedConfirm(command);         break;
    case 'AWAITING_DELETE_BOX_AFTER_TRASH_ALL': handleDeleteBoxAfterTrashAllConfirm(command); break;
    case 'AWAITING_DISPOSAL':            handleDisposal(command);              break;
    case 'AWAITING_DUMP_TARGET':         handleDumpTarget(command);            break;
    case 'AWAITING_FATE_REVIEW_ACTION':  handleFateReviewAction(command);      break;
    case 'AWAITING_FATE_REVIEW_BULK':    handleFateReviewBulk(command);        break;
    case 'AWAITING_FATE_REVIEW_ITEM':    handleFateReviewItem(command);        break;
    case 'AWAITING_MOVE_LOCATION':       handleMove(command);                  break;
    case 'AWAITING_NEST_CHILD':          handleNestChild(command);             break;
    case 'AWAITING_PROMOTE_LOCATION':     handlePromoteLocationConfirm(command); break;
    case 'AWAITING_NEST_PARENT':         handleNestParent(command);            break;
    case 'AWAITING_TRASH_DELETE':        handleTrashDelete(command);           break;
    case 'WELCOME':                      handleWelcome(command, photos);       break;
    case 'AWAITING_BOX_NAME':            handleBoxName(command);               break;
    case 'AWAITING_BOX_BATCH_CONFIRM':   handleBoxBatchConfirm(command);       break;
    case 'AWAITING_BOX_BATCH_QTY':       handleBoxBatchQty(command);           break;
    case 'AWAITING_BOX_BATCH_LOCATION':  handleBoxBatchLocation(command);      break;
    case 'AWAITING_LOCATION':            handleLocation(command);              break;
    case 'BOX_OPEN':                     handleBoxOpen(command, photos);       break;
    case 'AWAITING_ITEM_NAME':           handleItemName(command, photos);      break;
    case 'AWAITING_BATCH_CONFIRM':       handleBatchConfirm(command, photos);  break;
    case 'AWAITING_BATCH_QTY':           handleBatchQty(command);              break;
    case 'AWAITING_BATCH_FATE':          handleBatchFate(command, photos);     break;
    case 'AWAITING_ITEM_DESC':           handleItemDesc(command, photos);      break;
    case 'AWAITING_FATE':                handleFate(command, photos);          break;
    case 'AWAITING_ITEM_NOTES':          handleItemNotes(command);             break;
    case 'AWAITING_ITEM_VIEW':           handleItemViewAction(command);        break;
    case 'AWAITING_ITEM_VIEW_NOTES':     handleItemViewNotes(command);         break;
    case 'AWAITING_ITEM_MOVE_TARGET':    handleItemMoveTarget(command);        break;
    case 'AWAITING_DELETE_EMPTY_BOX':    handleFinished(command);              break;
    case 'AWAITING_BOX_RENAME':          handleBoxRenameConfirm(command);      break;
    case 'AWAITING_RENAME_ELLIPTICAL':   handleEllipticalRenameConfirm(command); break;
    case 'AWAITING_MOVE_LOCATION_REVIEW': handleMoveLocationConfirm(command);  break;
    case 'AWAITING_RESET_CONFIRM':         handleResetConfirm(command);          break;
    case 'AWAITING_MOVE_ELLIPTICAL':     handleEllipticalMoveConfirm(command); break;
    case 'FINISHED':                     handleFinished(command);              break;
    default:                             handleFreeform(command, photos);
  }
}

function processInput(input, photos) {
  let command = input.toLowerCase().trim();

  // ── Aliases — must run first as they mutate command ──────────────────────────
  if (command === 'y') { command = 'yes'; }
  if (command === 'n') { command = 'no'; }

  if (tryGlobalIntercept(command, photos, input)) return;

  routeToHandler(state.conversationStage, command, photos);
}

function handleMove(loc) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to move. Open a box first.'); return; }
  if (!loc || !loc.trim()) {
    state.conversationStage = 'AWAITING_MOVE_LOCATION';
    addBotMessage('<p>Where would you like to move <strong>"' + box.name + '"</strong>?</p>');
    return;
  }
  var prev = box.location || 'unspecified';
  box.location = loc.trim();
  // Restore the stage we were in before the move command
  if (state.conversationStage === 'AWAITING_MOVE_LOCATION') {
    state.conversationStage = 'BOX_OPEN';
  }
  addBotMessage(
    '<p>Moved <strong>"' + box.name + '"</strong> from <em>' + prev +
    '</em> to <em>' + box.location + '</em>.</p>'
  );
}

function handleDeleteByNumber(num) {
  // Immediate deletion for already-trashed items — no prompt
  var box = activeBox();
  if (!box) { addBotMessage('No active box. Open a box first.'); return; }
  var groups = groupItems(box.items);
  if (num < 1 || num > groups.length) {
    addBotMessage(
      '<p>No item ' + num + ' in the list. Use <em>"review items"</em> to see the current list.</p>'
    );
    return;
  }
  var g = groups[num - 1];
  var name = g.name;
  var countLabel = g.count > 1 ? g.count + ' × ' : '';
  box.items = box.items.filter(function(it){ return !(it.name === g.name && it.fate === g.fate); });
  if (state.activeItemId) {
    var still = box.items.some(function(it){ return it.id === state.activeItemId; });
    if (!still) { state.activeItemId = null; }
  }
  state.conversationStage = 'BOX_OPEN';
  if (helpers.activeItems(box).length === 0) {
    addBotMessage(deletionLog(countLabel + name) + ' The box is now empty.');
    setChips(['Add item', 'Move box', 'Done with this box', 'Delete this box']);
  } else {
    let newGroups = groupItems(box.items);
    let lines = newGroups.map((group, index) => {
      let prefix = group.count > 1 ? group.count + ' × ' : '';
      return (index + 1) + '. <strong>' + prefix + group.name + '</strong> → ' + group.fate;
    }).join('\n');
    let chips = newGroups.map((group, index) => {
      return (group.fate === 'trash' ? 'Delete ' : 'Trash ') + (index + 1);
    });

    addBotMessage(deletionLog(countLabel + name) + ' Remaining in "' + box.name + '":\n' + lines.trim());
    setChips(chips.concat(['Add item', 'Move box', 'Done with this box']));
  }
}

function handleTrashByNumber(num) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box. Open a box first.'); return; }
  var groups = groupItems(box.items);
  if (num < 1 || num > groups.length) {
    addBotMessage(
      '<p>No item ' + num + ' in the list. Use <em>"review items"</em> to see the current list.</p>'
    );
    return;
  }
  var group = groups[num - 1];
  // Mark ALL items in the group as trash, activate the first

  box.items.forEach((item) => {
    if (item.name === group.name && item.fate === group.fate) { item.fate = 'trash';}
  });

  state.activeItemId = box.items.find((item) => item.name === group.name && item.fate === 'trash').id;
  // Trigger the trash delete prompt
  var boxPref = activeBox() ? boxTrashPreferences[activeBox().id] : null;
  var effectivePref = boxPref || sessionTrashPreference;
  if (effectivePref === 'always') { deleteActiveItem(); return; }
  if (effectivePref === 'never') {
    addBotMessage(helpers.emoji.trashBin + ' <strong>' + group.name + '</strong> marked trash.\n\n' + disposalPrompt(group.name));
    state.conversationStage = 'AWAITING_DISPOSAL';
    setChips(['Skip disposal note', 'Done with this box']);
    return;
  }
  addBotMessage(helpers.emoji.trashBin + ' <strong>' + group.name + '</strong> ' + helpers.emoji.emDash + ' delete now?');
  state.conversationStage = 'AWAITING_TRASH_DELETE';
  state._reviewingBox = true; // flag to restore review list after delete
  setChips(['Yes', 'No', 'Always this session', 'Never this session', 'Always for this box', 'Never for this box']);
}

function handleWelcome(text, photos) {
  addBotMessage(
    'Welcome to **DeclutterBot**! I\'ll help you sort through boxes, log what\'s inside,' +
    ' and decide what to do with each item.\n\nLet\'s start with your first box. What would you like to call it?'
  );
  state.conversationStage = 'AWAITING_BOX_NAME';
}
// Returns true if text is a reserved command word and shouldn't be used as a box name
function isReservedCommand(text) {
  var cmd = text.toLowerCase().trim();

  // Exact matches for common commands
  var exactReserved = [
    'reset', 'start over', 'done', 'done with this box', 'skip to next box',
    'delete box', 'delete this box', 'trash all', 'new box', 'another',
    'review all', 'review by fate', 'review items',
    'nest', 'put inside', 'nest box', 'move box', 'add item',
    'm', 'move', 'move to box',
    'dump into...'
  ];
  if (exactReserved.includes(cmd)) return true;

  // Elliptical commands (with ...)
  if (/\.\.\.$/.test(cmd)) {
    var base = cmd.replace(/\.\.\.$/, '');
    var reserved = ['delete', 'rename', 'move', 'donate', 'keep', 'sell', 'trash', 'unsure', 'return', 'review', 'dump'];
    if (reserved.includes(base)) return true;
  }

  // Number-based commands: delete 1, move 5, rename 3, trash 2, keep 1, donate 2, etc.
  if (/^(delete|rename|move|trash|keep|donate|sell|unsure|return)\s+\d+$/.test(cmd)) return true;

  // Review commands with numbers (review keep (3), etc.)
  if (/^review\s+(keep|donate|trash|sell|unsure)(\s*\(\d+\))?$/.test(cmd)) return true;

  // Note: Pure numbers (^\d+$) are NOT reserved - they're used for selecting items/boxes

  return false;
}

// Helper for handling number-based review-all actions (delete N, move N, rename N)
// Extracts the number from command, looks up position, and calls the handler
function executeReviewAllActionByNumber(command, pattern, positionsArray, handler) {
  var match = command.match(pattern);
  if (match) {
    var boxNum = parseInt(match[1], 10);
    var posIndex = positionsArray.indexOf(boxNum);
    if (posIndex !== -1) {
      handler(posIndex);
      return true;
    }
  }
  return false;
}

function startNewBox() {
  state.activeBoxId=null; state.activeItemId=null;
  state.conversationStage='AWAITING_BOX_NAME';
  addBotMessage('New box. What\'s it called?');
}
// ── SINGULARIZER ─────────────────────────────────────────────────────────────
function singularize(word) {
  var w = word.toLowerCase().trim();
  // Explicit irregular plurals — add more here as edge cases are found
  var irregulars = {
    'shelves':'shelf', 'knives':'knife', 'leaves':'leaf', 'lives':'life',
    'wolves':'wolf', 'halves':'half', 'loaves':'loaf', 'scarves':'scarf',
    'wives':'wife', 'thieves':'thief', 'men':'man', 'women':'woman',
    'children':'child', 'teeth':'tooth', 'feet':'foot', 'mice':'mouse',
    'geese':'goose', 'oxen':'ox', 'dice':'die', 'people':'person',
  };
  if (irregulars[w]) { return irregulars[w]; }
  // Words that are already singular or uncountable — leave alone
  var invariant = ['series','species','scissors','trousers','glasses','clothes','furniture',
    'equipment','luggage','baggage','box','shelf','knife','leaf'];
  if (invariant.indexOf(w) !== -1) return w;
  // Common suffix rules
  if (w.match(/[^aeiou]ies$/)) return w.slice(0,-3)+'y'; // berries->berry
  if (w.match(/(s|sh|ch|x|z)es$/)) return w.slice(0,-2);  // boxes->box, dishes->dish
  if (w.match(/ses$/)) return w.slice(0,-2);               // buses->bus
  if (w.match(/[^s]s$/)) return w.slice(0,-1);             // rolls->roll, bags->bag
  return w; // already singular or unrecognized
}

function singularizeLast(phrase) {
  // Singularize only the last word of a multi-word phrase
  var words = phrase.trim().split(/\s+/);
  var last = words[words.length - 1];
  var singular = singularize(last);
  // Preserve original casing of first letter
  if (last[0] === last[0].toUpperCase() && last[0] !== last[0].toLowerCase()) {
    singular = singular[0].toUpperCase() + singular.slice(1);
  }
  words[words.length - 1] = singular;
  return words.join(' ');
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function handleBoxName(text) {
  var raw = text.trim() || 'Unnamed box';

  // Guard against reserved command words
  if (isReservedCommand(raw)) {
    addBotMessage(
      'That sounds like a command! Please use a different name for your box. ' +
      'Try something descriptive like "spare bedroom", "kitchen stuff", or "my books".'
    );
    setChips(['Try again', 'Review all boxes']);
    return;
  }

  // Check for batch: "five wooden boxes", "3 shelves"
  var parsed = parseQuantity(raw);
  if (parsed && parsed.qty >= 2 && parsed.qty <= 26) {
    var singular = singularizeLast(parsed.itemName);
    state.pendingBoxBatch = { qty: parsed.qty, baseName: singular };
    state.conversationStage = 'AWAITING_BOX_BATCH_CONFIRM';
    addBotMessage(
      'I see <strong>' + parsed.qty + ' ' + helpers.emoji.multiplicationSign + ' ' + singular
      + '<strong/>. Should I create ' + parsed.qty + ' boxes named <strong>' + singular
      + ' A</strong> through <strong>' + singular + ' ' + LETTERS[parsed.qty - 1] + '</strong>?'
    );
    setChips(['Yes, create ' + parsed.qty, 'No, just 1', 'Change quantity']);
    return;
  }
  var box = {id:uid(),name:raw,location:'',notes:'',parentId:null,createdAt:new Date().toISOString(),items:[]};
  state.boxes.push(box); state.activeBoxId=box.id;
  state.conversationStage='AWAITING_LOCATION';
  let locPrompt = locationPrompt('<strong>"' + raw + '"</strong> ' + helpers.emoji.emDash + ' good name.');
  addBotMessage(locPrompt.message);
  setChips(locPrompt.chips);
}

function handleBoxBatchConfirm(text) {
  var command = text.toLowerCase().trim();
  var batch = state.pendingBoxBatch;
  if (!batch) { state.conversationStage = 'AWAITING_BOX_NAME'; return; }

  if (command.startsWith('no') || command.includes('just 1') || command === '1') {
    state.pendingBoxBatch = null;
    var box = {
      id: uid(), name: batch.baseName, location: '', notes: '',
      parentId: null, createdAt: new Date().toISOString(), items: []
    };
    state.boxes.push(box); state.activeBoxId=box.id;
    state.conversationStage='AWAITING_LOCATION';
    let boxLocationPrompt = locationPrompt('Just the one <strong>"'+batch.baseName+'"</strong> then.');
    addBotMessage(boxLocationPrompt.message);
    setChips(boxLocationPrompt.chips);
    return;
  }
  if (command.includes('change') || command.includes('quantity')) {
    addBotMessage(
      '<p>How many <strong>' + batch.baseName + '</strong> boxes are there?</p>'
    );
    state.conversationStage = 'AWAITING_BOX_BATCH_QTY';
    return;
  }
  // Affirmative
  var numMatch = command.match(/\d+/);
  var qty = numMatch ? parseInt(numMatch[0], 10) : batch.qty;
  batch.qty = qty;
  state.conversationStage = 'AWAITING_BOX_BATCH_LOCATION';
  let locPrompt = locationPrompt('Where are all ' + qty + ' <strong>' + batch.baseName + '</strong> boxes located? (They\'ll share the same location)');
  addBotMessage(locPrompt.message);
  setChips(locPrompt.chips);
}

function handleBoxBatchQty(text) {
  var batch = state.pendingBoxBatch;
  if (!batch) { state.conversationStage = 'AWAITING_BOX_NAME'; return; }
  var wordQty = WORD_NUMBERS[text.toLowerCase().trim()];
  var qty = wordQty || parseInt(text, 10);
  if (!qty || isNaN(qty) || qty < 1 || qty > 26) {
    addBotMessage('Please give a number between 1 and 26.');
    return;
  }
  batch.qty = qty;
  state.conversationStage = 'AWAITING_BOX_BATCH_CONFIRM';
  addBotMessage(
    'Got it ' + helpers.emoji.emDash + ' <strong>' + qty + ' ' + helpers.emoji.multiplicationSign + ' '
    + batch.baseName + '<strong>. Create boxes <strong>' + batch.baseName + ' A<strong> through <strong>'
    + batch.baseName + ' ' + LETTERS[qty - 1] + '<strong>?'
  );
  setChips(['Yes, create ' + qty, 'No, just 1']);
}

function handleBoxBatchLocation(text) {
  var batch = state.pendingBoxBatch;
  if (!batch) { state.conversationStage = 'AWAITING_BOX_NAME'; return; }
  var location = text.trim() || 'unspecified';
  var now = new Date().toISOString();

  let newBoxes = Array.from({length: batch.qty}, (_, i) => {
    let name = batch.baseName + ' ' + LETTERS[i];
    let id = uid();
    return {id, name, location, notes: '', parentId: null, createdAt: now, items: []};
  });

  state.boxes.push(...newBoxes);
  state.activeBoxId = newBoxes[0].id;
  state.pendingBoxBatch = null;
  state.conversationStage = 'BOX_OPEN';

  let names = newBoxes.map((box) => box.name);
  addBotMessage(
    'Created <strong>' + batch.qty + '</strong> boxes in <em>' + location + '</em>:\n' + names.join(', ') +
    '.\n\nStarting with <strong>' + names[0] + '</strong>. Tell me about the first item you pick up.'
  );
  setChips(['Skip to next box','Review items','Done']);
}

// Returns up to 3 most-recently-created distinct locations (normalized lowercase),
// preserving the display form of the most recent box at each location.
function recentLocations(limit = null) {
  // slice is used to create a shallow copy, so reverse doesn't mutate state.boxes.
  let uniqueLocations = _.uniqBy(state.boxes.slice().reverse(), (box) => (box.location || '').trim().toLowerCase())
    .map((box) => (box.location || '').trim())
    .filter((loc) => loc && loc !== 'unspecified');

  return limit ? uniqueLocations.slice(0, limit) : uniqueLocations;
}

// Returns { message, chips } for the location prompt, context-aware.
function locationPrompt(boxLabel) {
  let recent = recentLocations(3);
  let allLocs = recentLocations();

  var msg;
  if (recent.length === 0) {
    msg = '<p>' + (boxLabel ? boxLabel + '</p><p>' : '') +
      'Where is this box located? (e.g. "spare bedroom", "garage shelf 2", "storage unit A")</p>';
  } else {
    var examples = recent.map(function(l) { return '"' + l + '"'; }).join(', ');
    msg = '<p>' + (boxLabel ? boxLabel + '</p><p>' : '') +
      'Where is this box located? (e.g. ' + examples + ')</p>';
  }

  var chips = recent.slice();
  chips.push('New location');
  if (allLocs.length >= 4) { chips.push('List all locations'); }
  return { message: msg, chips: chips };
}

function handleLocation(text) {
  var command = text.toLowerCase().trim();

  // "List all locations" chip
  if (command === 'list all locations') {
    var allLocs = recentLocations();
    var prompt = locationPrompt();
    addBotMessage('All locations:\n\n' + allLocs.map(function(l) { return '- ' + l; }).join('\n') +
      '\n\n' + prompt.message);
    setChips(prompt.chips);
    return;
  }

  // "New location" chip — just re-prompt with empty input so user can type freely
  if (command === 'new location') {
    var prompt2 = locationPrompt();
    addBotMessage('Type the new location name:');
    setChips(prompt2.chips.filter(function(c) { return c !== 'New location'; }));
    return;
  }

  var box = activeBox();
  box.location = text.trim() || 'unspecified';
  state.conversationStage = 'BOX_OPEN';
  addBotMessage(
    '<p><strong>"' + box.name + '"</strong> in the <em>' + box.location + '</em>.</p>' +
    '<p>First item?</p>'
  );
  setChips(['Skip to next box','Review items','Done']);
}

function handleBoxRenameConfirm(text) {
  var newName = text.trim();
  if (!newName) {
    addBotMessage('Please provide a name.');
    return;
  }
  var boxId = state.pendingRenameBoxId;
  if (!boxId) {
    addBotMessage('No box selected for renaming.');
    return;
  }
  var box = _.find(state.boxes, (b) => b.id === boxId);
  if (!box) {
    addBotMessage('Box not found.');
    return;
  }
  var oldName = box.name;
  box.name = newName;
  state.pendingRenameBoxId = null;
  state.conversationStage = 'FINISHED';
  addBotMessage(
    '<p>Renamed <strong>"' + oldName + '"</strong> to <strong>"' + newName + '"</strong>.</p>'
  );
  handleFinished('review all');
}

const WORD_NUMBERS = {
  'a':1,'an':1,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,
  'nine':9,'ten':10,'eleven':11,'twelve':12,'thirteen':13,'fourteen':14,'fifteen':15,
  'sixteen':16,'seventeen':17,'eighteen':18,'nineteen':19,'twenty':20,
  'twenty-one':21,'twenty-two':22,'twenty-three':23,'twenty-four':24,'twenty-five':25,
  'thirty':30,'forty':40,'fifty':50,'sixty':60,'seventy':70,'eighty':80,'ninety':90,'hundred':100
};

function parseQuantity(text) {
  let trimmed = text.trim();

  // Check for digit prefix: "5 boxes" -> {qty: 5, itemName: "boxes"}
  let digitMatch = trimmed.match(/^(\d+)\s+(.+)$/);
  if (digitMatch) {
    let quantity = parseInt(digitMatch[1], 10);
    if (quantity > 1) {
      // use both qty and quantity until qty is updated throught the project.
      return { qty: quantity, quantity: quantity, itemName: digitMatch[2].trim() };
    }
  }

  // Check for word numbers: "five boxes" or "twenty-one shelves"
  // BUT ignore hyphenated number words like "two-prong cable" or "three-way valve"
  let words = trimmed.toLowerCase().split(/\s+/);

  // Check if this looks like a hyphenated-number descriptor (e.g., "two-prong cable")
  // Pattern: number-word immediately followed by hyphen and another word
  if (words.length > 0) {
    let firstWord = words[0];
    // Check if first word is "number-something" where number is a known quantity word
    let hyphenParts = firstWord.split('-');
    if (hyphenParts.length >= 2 && WORD_NUMBERS[hyphenParts[0]]) {
      // This is a hyphenated number descriptor like "two-prong" or "three-way"
      // Don't treat as a batch quantity
      return null;
    }
  }

  // Try two-word numbers first ("twenty one"), then single words ("five")
  // We check up to 2 words because that's the longest number phrase we support
  const MAX_NUMBER_WORDS = 2;
  let result = null;

  // Check from MAX_NUMBER_WORDS down to 1 (single-word numbers like "five")
  [MAX_NUMBER_WORDS, 1].some((wordCount) => {
    let numberWords = words.slice(0, wordCount);

    // Try different joining strategies: "twenty-one", "twenty one", "twentyone"
    let withHyphen = numberWords.join('-');
    let withSpace = numberWords.join(' ');
    let withoutSeparator = numberWords.join('');

    let quantity = WORD_NUMBERS[withHyphen] || WORD_NUMBERS[withSpace] || WORD_NUMBERS[withoutSeparator];

    if (quantity && quantity > 1) {
      let itemName = words.slice(wordCount).join(' ').trim();
      if (itemName.length > 0) {
        result = {qty: quantity, quantity: quantity, itemName: itemName};
        return true; // stop iteration
      }
    }
    return false; // continue iteration
  });

  return result;
}

// Parse an item entry. Two separator modes:
//
// SEMICOLON mode — if any semicolon present, semicolons are the separators.
//   Commas are free in all fields.
//   name; fate           → set fate, ask for notes
//   name; fate; notes    → set all three, done
//   name; non-fate       → fate=unsure, treat as notes, done
//
// COMMA mode — no semicolons present. Position 2 is always fate:
//   name                 → ask fate, then notes
//   name, fate           → set fate, ask for notes
//   name, fate, notes    → set all three; notes=p3
//   name, fate, p3, p4   → name=p1, fate=p2, notes="p3, p4" (everything after fate joined as notes)
//
// Use semicolons when commas appear in the item name.

// Returns { fate, warning } — resolves a candidate string to a known fate or 'unsure'.
const resolveFate = (candidate, raw) => {
  if (FATES.includes(candidate)) return { fate: candidate, warning: null };
  return {
    fate: 'unsure',
    warning: `**${raw}** isn't a recognized fate — set to unsure. Valid fates: ${FATES.join(', ')}.`
  };
};

// Handles the 3+-part case: name is already resolved, fateRaw is the raw fate string, notes already joined.
const parseThreeParts = (name, fateRaw, notes) => {
  const { fate, warning } = resolveFate(fateRaw.toLowerCase(), fateRaw);
  return { name, fate, notes, warning };
};

// Handles the two-part case: second part is either a fate (ask notes) or a note (done, unsure).
const parseTwoParts = (name, second, hintForNotes) => {
  const fateLower = second.toLowerCase();
  if (FATES.includes(fateLower)) return { name, fate: fateLower, notes: null, warning: null };
  return {
    name, fate: 'unsure', notes: second,
    warning: `Treated **${second}** as a note. ${hintForNotes}`
  };
};

function parseItemEntry(text) {
  const useSemicolon = text.includes(';');
  const sep          = useSemicolon ? ';' : ',';
  const parts        = text.split(sep).map(p => p.trim());
  const name         = parts[0] || 'Unknown item';

  if (parts.length === 1) return { name, fate: null, notes: null, warning: null };

  if (parts.length === 2) {
    const hint = useSemicolon
      ? `Valid fates: ${FATES.join(', ')}.`
      : `If it's part of the name, use semicolons: \`${name}; keep; your notes here\``;
    return parseTwoParts(name, parts[1], hint);
  }

  // 3+ parts: name, fate, notes (notes joined with the same separator)
  return parseThreeParts(name, parts[1], parts.slice(2).join(sep + ' '));
}


// Process multiple item lines submitted at once (Shift+Enter multiline entry).
// Each line is parsed through parseItemEntry and logged immediately.
// Lines with warnings (unrecognized fate, etc.) are cached and reported in the summary.
// Name-only lines are logged as unsure with no notes — no fate/notes prompt.
function processMultilineItems(lines) {
  const box = activeBox();
  if (!box) { startNewBox(); return; }

  const errorLines = [];
  let added = 0;

  lines = lines.filter(l => l.trim());
  lines.forEach(line => {
    // Batch quantity check first
  const quantityResult = parseQuantity(line);
  if (quantityResult) {
    Array.from({length: quantityResult.quantity}, () => {
      const item = {
        id: uid(), name: quantityResult.itemName, description: '', fate: 'unsure',
        notes: '', createdAt: new Date().toISOString(), deleted_at: null
      };
      addItem(box, item);
      added++;
    });
    return;
  }

    const entry = parseItemEntry(line);
    const item = {
      id: uid(),
      name: entry.name || 'Unknown item',
      description: '',
      fate: entry.fate || 'unsure',
      notes: entry.notes || '',
      createdAt: new Date().toISOString(),
      deleted_at: null
    };
    addItem(box, item);
    added++;

    if (entry.warning) {
      errorLines.push({ line, warning: entry.warning });
    }
  });

  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';

  let msg = `**${added} item${added !== 1 ? 's' : ''} added** to "${box.name}".`;

  if (errorLines.length > 0) {
    msg += '\n\nThese lines had formatting issues — edit and resubmit:';
    errorLines.forEach(({ line, warning }) => {
      msg += `\n- \`${line}\` — ${warning}`;
    });
  }

  addBotMessage(msg);
  setBoxOpenChips();
}

function handleItemName(text, photos) {
  var box = activeBox();
  if (!box) { startNewBox(); return; }

  // Guard against reserved command words as item names
  if (isReservedCommand(text)) {
    addBotMessage(
      'That sounds like a command! Please describe the item you picked up. ' +
      'For example: "coffee mug", "blue shirt", "photo album".'
    );
    setChips(['Try again']);
    return;
  }

  // Batch quantity detection runs on the full text first
  var parsed = parseQuantity(text);
  if (parsed) {
    state.pendingBatch = {
      quantity: parsed.quantity,
      itemName: parsed.itemName,
      originalText: text.trim()
    };
    state.conversationStage = 'AWAITING_BATCH_CONFIRM';
    addBotMessage(
      '<p>I see <strong>' + parsed.quantity + ' ' + helpers.emoji.multiplicationSign + ' ' +
      parsed.itemName + '</strong>. Should I log ' + parsed.quantity +
      ' separate entries for these, all with the same fate?</p>'
    );
    setChips(['Yes, log ' + parsed.quantity, 'No, just 1', 'Change quantity']);
    return;
  }

  var entry = parseItemEntry(text);
  var name  = entry.name || 'Unknown item';
  var item  = {
    id: uid(), name: name, description: '', fate: entry.fate || 'unsure',
    notes: entry.notes || '', createdAt: new Date().toISOString(), deleted_at: null
  };
  addItem(box, item);
  state.activeItemId = item.id;

  var warn = entry.warning ? '</br></br><em>' + entry.warning + '</em>' : '';

  if (entry.fate !== null && entry.notes !== null) {
    // Both provided — log and move on
    state.activeItemId = null;
    state.conversationStage = 'BOX_OPEN';
    addBotMessage('<p><strong>' + name + '.</strong> ' + item.fate + (item.notes ? ' (' + item.notes + ')' : '') + '.' + warn + '</p><p><strong>' + helpers.activeItems(box).length + ' in the box.</strong> What\'s next?</p>');
    setBoxOpenChips();
  } else if (entry.fate !== null && entry.notes === null) {
    // Fate provided — skip fate prompt, ask for notes
    state.conversationStage = 'AWAITING_ITEM_NOTES';
    let fateToEmoji = {
      trash:  helpers.emoji.trashBin,
      keep:   helpers.emoji.checkMark,
      donate: helpers.emoji.blueHeart,
      sell:   helpers.emoji.moneyBag,
      return: helpers.emoji.box
    }

    addBotMessage(
      '<p>' + (fateToEmoji[entry.fate] || helpers.emoji.shrug)
      + ' <strong>' + titleize(item.fate) + '.</strong> ' + warn
      + 'Anything to note? (condition, value, where it\'s going) '
      + helpers.emoji.emDash + ' or just say <em>"next"</em>.</p>'
    );
    setChips(['Next item', 'No notes', 'Done with this box']);
  } else if (entry.fate === null && entry.notes !== null) {
    // Notes provided (2-part, second wasn't a fate) — already logged with unsure, done
    state.activeItemId = null;
    state.conversationStage = 'BOX_OPEN';
    addBotMessage('<p><strong>' + name + '.</strong> unsure (' + item.notes + ').' + warn + '</p><p><strong>' + helpers.activeItems(box).length + ' in the box.</strong> What\'s next?</p>');
    setBoxOpenChips();
  } else {
    // Name only — normal fate prompt
    state.conversationStage = 'AWAITING_FATE';
    addBotMessage('<strong>' + name + '.</strong> Keep it, sell it, or out it goes?');
    setChips(FATE_TITLES);
  }
}

function handleBatchConfirm(text, photos) {
  var command = text.toLowerCase().trim();
  var batch = state.pendingBatch;
  if (command.indexOf('change') !== -1 || command.indexOf('quantity') !== -1) {
    addBotMessage('<p>How many <strong>' + batch.itemName + '</strong> are there?</p>');
    state.conversationStage = 'AWAITING_BATCH_QTY';
    setChips([]);
    return;
  }
  if (command.startsWith('no') || command.indexOf('just 1') !== -1 || command === '1') {
    state.pendingBatch = null;
    var box = activeBox();
    // Use original text if available, otherwise fall back to parsed itemName
    var itemName = batch.originalText || batch.itemName;
    var item = {
      id: uid(), name: itemName, description: '', fate: 'unsure',
      notes: '', createdAt: new Date().toISOString(),
      deleted_at: null
    };
    addItem(box, item); state.activeItemId = item.id;
    state.conversationStage = 'AWAITING_FATE';
    addBotMessage(
      '<p>Just the one <strong>' + itemName +
      '</strong>. What should we do with it?</p>'
    );
    setChips(FATE_TITLES);
    return;
  }
  if (command.startsWith('yes') || command.indexOf('log') !== -1 ||
      command.indexOf('confirm') !== -1 || command.match(/^\d+$/)) {
    var nm = command.match(/\d+/);
    var qty = nm ? parseInt(nm[0],10) : batch.quantity;
    commitBatch(qty, batch.itemName); return;
  }
  addBotMessage(
    '<p>Log <strong>' + batch.quantity + ' ' + helpers.emoji.multiplicationSign + ' ' +
    batch.itemName + '</strong> as separate entries?</p>'
  );
  setChips(['Yes, log ' + batch.quantity,'No, just 1','Change quantity']);
}

function handleBatchQty(text) {
  var batch=state.pendingBatch; if(!batch){state.conversationStage='BOX_OPEN';return;}
  var parsed=parseQuantity(text);
  var wordQty=WORD_NUMBERS[text.toLowerCase().trim()];
  var qty=wordQty||(parsed&&parsed.quantity)||parseInt(text,10);
  if (!qty || isNaN(qty) || qty < 1) {
    addBotMessage(
      '<p>Sorry, I didn\'t catch a number. How many <strong>' + batch.itemName +
      '</strong> are there?</p>'
    );
    return;
  }
  batch.quantity=qty; state.conversationStage='AWAITING_BATCH_CONFIRM';
  addBotMessage(
    '<p>Got it ' + helpers.emoji.emDash + ' <strong>' + qty + ' ' +
    helpers.emoji.multiplicationSign + ' ' + batch.itemName +
    '</strong>. Log them all as separate entries?</p>'
  );
  setChips(['Yes, log '+qty,'No, just 1']);
}

function commitBatch(quantity, itemName) {
  var box = activeBox();
  var now = new Date().toISOString();
  let items = Array.from({length: quantity}, () => ({
    id: uid(),
    name: itemName,
    description: '',
    fate: 'unsure',
    notes: '',
    createdAt: now,
    deleted_at: null
  }));

  items.forEach((item) => addItem(box, item));
  state.activeItemId = items[0].id;
  state.pendingBatch = null;
  state.conversationStage = 'AWAITING_BATCH_FATE';
  addBotMessage(
    '<p>Logged <strong>' + quantity + ' ' + helpers.emoji.multiplicationSign + ' ' +
    itemName + '</strong>. What should we do with all of them?</p>'
  );
  setChips(FATE_TITLES.concat(['Mixed fates']));
}

function handleBatchFate(text, photos) {
  let box = activeBox();
  let trimmed = text.toLowerCase().trim();
  if (trimmed.includes('mixed')) {
    addBotMessage('Just the one, then. What should we do with it?');
    state.conversationStage='AWAITING_FATE';
    setChips(FATE_TITLES);
    return;
  }

  let matched = FATES.find((fate) => trimmed.includes(fate));
  if (!matched) {
    addBotMessage('What should we do with all of them?');
    setChips(FATE_TITLES.concat(['Mixed fates']));
    return;
  }

  let anchor = activeItem();
  if (anchor) {
    box.items.forEach((item) => {
      if (item.name === anchor.name && item.createdAt === anchor.createdAt) {
        item.fate = matched;
      }
    });
  }

  var fateMessages = {
    keep:   helpers.emoji.checkMark + ' <strong>Keep</strong> ' + helpers.emoji.emDash + ' all going back home.',
    donate: helpers.emoji.blueHeart + ' <strong>Donate</strong> ' + helpers.emoji.emDash + ' great!',
    trash:  helpers.emoji.trashBin + ' <strong>Trash</strong> ' + helpers.emoji.emDash + ' out they go.',
    sell:   helpers.emoji.moneyBag + ' <strong>Sell</strong> ' + helpers.emoji.emDash + ' nice haul!',
    unsure: helpers.emoji.shrug + ' <strong>Unsure</strong> ' + helpers.emoji.emDash + ' we\'ll revisit.'
  };

  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';
  addBotMessage(fateMessages[matched] + '\n\n<strong>' + helpers.activeItems(box).length + '</strong> item(s) logged in "' + box.name + '". What\'s next?');
  setBoxOpenChips();
}

function handleItemDesc(text, photos) {
  var item=activeItem(); if(!item){state.conversationStage='BOX_OPEN';handleFreeform(text,photos);return;}
  item.description=text.trim();
  state.conversationStage='AWAITING_FATE';
  addBotMessage('<p>Got it. What should we do with <strong>' + item.name + '</strong>?</p>');
  setChips(FATE_TITLES);
}

function handleFate(text, photos) {
  var item=activeItem(); if(!item){state.conversationStage='BOX_OPEN';handleFreeform(text,photos);return;}
  var t=text.toLowerCase().trim();
  var matched=null; for(var i=0;i<FATES.length;i++){if(t.indexOf(FATES[i])!==-1){matched=FATES[i];break;}}
  if (!matched) {
    addBotMessage(
      '<p>I didn\'t catch that ' + helpers.emoji.emDash +
      ' what should we do with <strong>' + item.name + '</strong>?</p>'
    );
    setChips(FATE_TITLES);
    return;
  }
  item.fate=matched;
  var fateMessages = {
    keep:   helpers.emoji.checkMark + ' **Keep.** Back it goes.',
    donate: helpers.emoji.blueHeart + ' **Donate.** Someone else\'s treasure.',
    trash:  helpers.emoji.trashBin + ' **Trash.** Gone.',
    sell:   helpers.emoji.moneyBag + ' **Sell.** Worth something to someone.',
    unsure: helpers.emoji.shrug + ' **Unsure.** We\'ll come back to it.',
    return: helpers.emoji.box + ' **Return.** Noted' + helpers.emoji.ellipses + ' someone\'s waiting for this.'
  };
  if (matched === 'trash') {
    var boxPref = activeBox() ? boxTrashPreferences[activeBox().id] : null;
    var effectivePref = boxPref || sessionTrashPreference;
    if (effectivePref === 'always') { deleteActiveItem(); return; }
    if (effectivePref === 'never') {
      addBotMessage(helpers.emoji.trashBin + ' <strong>Trash</strong> ' + helpers.emoji.emDash + ' noted.\n\n' + disposalPrompt(item.name));
      state.conversationStage = 'AWAITING_DISPOSAL';
      setChips(['Skip disposal note', 'Done with this box']);
      return;
    }
    addBotMessage(helpers.emoji.trashBin + ' <strong>Trash</strong> ' + helpers.emoji.emDash + ' delete this item now?');
    state.conversationStage = 'AWAITING_TRASH_DELETE';
    setChips(['Yes', 'No', 'Always this session', 'Never this session', 'Always for this box', 'Never for this box']);
    return;
  }
  if (state.pendingFateReview && state.pendingFateReview._resumeAfterFate) {
    state.pendingFateReview._resumeAfterFate = false;
    addBotMessage(fateMessages[matched]);
    state.pendingFateReview.index++;
    state.pendingFateReview.reviewedCount = (state.pendingFateReview.reviewedCount || 0) + 1;
    showFateReviewCurrentItem(state.pendingFateReview);
    return;
  }
  state.conversationStage='AWAITING_ITEM_NOTES';
  addBotMessage(
    fateMessages[matched] + '\n\nAnything to note? (condition, value, where it\'s going) ' + helpers.emoji.emDash + ' or just say _"next"_.'
  );
  setChips(['Next item','No notes','Done with this box']);
}

function handleItemNotes(text) {
  var item=activeItem(); var t=text.toLowerCase().trim();
  if(item&&t!=='next'&&t!=='next item'&&t!=='no notes'&&text.trim()) item.notes=text.trim();
  state.activeItemId=null; state.conversationStage='BOX_OPEN';
  var box=activeBox();
  addBotMessage('<strong>' + helpers.activeItems(box).length + ' in the box.</strong> What\'s next?');
  setBoxOpenChips();
}

function doneWithBox() {
  var box=activeBox(); if(!box){addBotMessage('No active box. Start a new one?');setChips(['New box']);return;}
  var fates=countFatesDeep(box); var parts=[];
  for(var i=0;i<FATES.length;i++){if(fates[FATES[i]])parts.push(fates[FATES[i]]+' to '+FATES[i]);}
  var summary=parts.length?parts.join(', '):'nothing yet';
  if (box) { delete boxTrashPreferences[box.id]; }
  state.activeBoxId=null; state.activeItemId=null; state.conversationStage='FINISHED';
  addBotMessage(
    '<p><strong>"' + box.name + '"</strong> ' + helpers.emoji.emDash + ' done.</p><p>' + summary + '.</p><p>Another box, or done for now?</p>'
  );
  setChips(['New box','Done for now','Review all boxes','Review by fate']);
}

// Group items by name+fate, return array of {name, fate, count, notes}
function groupItems(items) {
  var groups = [];
  var seen = {};
  // Defensive filter - some callers pass box.items directly
  items.filter(function(it) { return !it.deleted_at; }).forEach(function(it) {
    var key = it.name + '|' + it.fate;
    if (seen[key] !== undefined) {
      groups[seen[key]].count++;
    } else {
      seen[key] = groups.length;
      groups.push({ name: it.name, fate: it.fate, count: 1, notes: it.notes });
    }
  });
  return groups;
}

// One-line summary of a box's contents, grouped
function boxSummaryLine(box) {
  var items = helpers.activeItems(box);
  if (items.length === 0) { return 'empty'; }
  var groups = groupItems(items);
  return groups.map(function(g) {
    return (g.count > 1 ? g.count + ' × ' : '') + g.name + ' → ' + g.fate;
  }).join(', ');
}

// ── ELLIPTICAL CHIP HELPERS ───────────────────────────────────────────────────
// Shared logic for building action chips and handling elliptical chip intercepts.
// Each fate action (Trash, Delete, Keep, Donate, Sell, Unsure) uses the same
// pattern: filter eligible groups, apply threshold, build chips or intercept.

// Returns item numbers (1-based) from groups that match the filter function.
function eligibleGroupNumbers(groups, filterFn) {
  return groups
    .map(function(group, groupIndex) { return filterFn(group) ? groupIndex + 1 : null; })
    .filter(function(itemNumber) { return itemNumber !== null; });
}

// Builds chips for a fate action. ≤2 eligible → numbered chips. 3+ → elliptical.
function buildActionChips(groups, label, filterFn) {
  var eligible = eligibleGroupNumbers(groups, filterFn);
  if (eligible.length === 0) { return []; }
  if (eligible.length > 2) { return [label + '...']; }
  return eligible.map(function(itemNumber) { return label + ' ' + itemNumber; });
}

// Handles an elliptical chip click: sends reminder and prepopulates the input.
function handleEllipticalAction(label, filterFn) {
  var box = activeBox();
  if (!box) { return; }
  var groups = groupItems(box.items);
  var eligible = eligibleGroupNumbers(groups, filterFn);
  var verb = label.toLowerCase();
  addBotMessage(
    '<p>Which item? Type <em>' + verb +
    '</em> followed by the number. Applies to: ' + eligible.join(', ') + '.</p>'
  );
  var input = document.getElementById('user-input');
  if (input) {
    input.value = verb + ' ';
    if (input.focus) { input.focus(); }
  }
}

// Render the review lines for a box, recursing into child boxes.
// Returns { lines: string, counter: number, childBoxes: [{number, box}] }
// depth 0 = direct children of active box (show full sub-list)
// depth 1 = grandchildren (show as stub)
// Render review list HTML for a box, recursing into child boxes.
// Returns { html: string, counter: number, childBoxes: [{number, box}] }
// depth 0 = top level, depth 1 = one level in (full sub-list), depth 2+ = stub
// Render review list HTML for a box, recursing into child boxes.
// Returns { html: string, counter: number, childBoxes: [{number, box}] }
// depth 0 = top level items/boxes; depth 1 = contents of a child box (shown as sub-list)
// depth 2+ = stub only ("containing N items")
function renderReviewLines(box, depth, listItemNumber = 1, childBoxes = []) {
  let html = '';

  // Direct items
  let items = helpers.activeItems(box);
  let groups = groupItems(items);
  html += groups.map((group, index) => {
    let prefix = group.count > 1 ? group.count + ' ' + helpers.emoji.multiplicationSign +  ' ' : '';
    return '<li value="' + (listItemNumber + index) + '"><strong>' + escHtml(prefix + group.name) + '</strong>'
      + ' ' + helpers.emoji.rightArrow + ' ' + escHtml(group.fate)
      + (group.notes ? ' <span class="review-note">(' + escHtml(group.notes) + ')</span>' : '')
      + '</li>';
  }).join('');
  listItemNumber += groups.length;

  // Child boxes
  var children = state.boxes.filter(function(b) { return b.parentId === box.id; });
  children.forEach((child, index) => {
    let childItems = helpers.activeItems(child);
    let childChildren = state.boxes.filter((box) => box.parentId === child.id);
    let totalItems = childItems.length + childChildren.length;

    if (depth >= 1) {
      // Stub -- summarise without expanding
      html += '<li value="' + listItemNumber + '">'
        + helpers.emoji.box + ' <strong>' + escHtml(child.name) + '</strong>'
        + ' ' + helpers.emoji.rightArrow + ' ' + escHtml(child.fate || 'unsure')
        + (totalItems > 0 ? ' <span class="review-note">(containing '
        + totalItems + ' item' + (totalItems !== 1 ? 's' : '') + ')</span>' : '')
        + '</li>';
      listItemNumber++;
    } else {
      // Box entry -- show its contents as a sub-list
      html += '<li value="' + listItemNumber + '">'
        + helpers.emoji.box + ' <strong>' + escHtml(child.name) + '</strong>'
        + ' ' + helpers.emoji.rightArrow + ' ' + escHtml(child.fate || 'unsure');
      childBoxes.push({ number: listItemNumber, box: child });
      listItemNumber++;

      if (totalItems > 0) {
        let sub = renderReviewLines(child, depth + 1, 1, childBoxes);
        html += '<blockquote class="review-blockquote">'
          + '<ol class="review-sub">' + sub.html + '</ol></blockquote>';
      }
      html += '</li>';
    }
  });

  return { html: html, listItemNumber: listItemNumber, childBoxes: childBoxes };
}



function reviewBox() {
  var box = activeBox();
  var directItems = helpers.activeItems(box);
  var childBoxes = box ? state.boxes.filter(function(b) { return b.parentId === box.id; }) : [];

  if (!box || (directItems.length === 0 && childBoxes.length === 0)) {
    addBotMessage('This box has no items logged yet. Add some!');
    setBoxOpenChips();
    return;
  }

  var result = renderReviewLines(box, 0, 1, []);
  var lines = result.html;
  var openableBoxes = result.childBoxes; // [{number, box}]

  var groups = groupItems(directItems);

  // Action chips based on direct items only (elliptical/numbered as before)
  var chips = FATES
    .flatMap(function(fate) {
      return buildActionChips(groups, fate[0].toUpperCase() + fate.slice(1), function(g) { return g.fate !== fate; });
    })
    .concat(buildActionChips(groups, 'Delete', function(g) { return g.fate === 'trash'; }));

  if (directItems.length >= 2) { chips.push('Trash All'); }

  // Open N chips for each child box
  openableBoxes.forEach(function(ob) {
    chips.push('Open ' + ob.number);
  });

  // Build header
  var totalItems = directItems.length;
  var totalBoxes = childBoxes.length;
  var parts = [];
  if (totalItems > 0) { parts.push(totalItems + ' item' + (totalItems !== 1 ? 's' : '')); }
  if (totalBoxes > 0) { parts.push(totalBoxes + ' box' + (totalBoxes !== 1 ? 'es' : '')); }
  var groups2 = groupItems(directItems);
  var uniqueNote = (directItems.length > 0 && directItems.length !== groups2.length)
    ? ', ' + groups2.length + ' unique' : '';
  var header = '**Items in "' + box.name + '"'
    + (parts.length ? ' (' + parts.join(', ') + uniqueNote + ')' : '')
    + ':**';

  var headerText = header.replace(/\*\*/g, '');
  addBotMessage('<p><strong>' + headerText + '</strong></p><ol class="review-list">' + lines + '</ol>');
  setChips(chips.concat(['Add item', 'Move box', 'Done with this box']));
  state.conversationStage = 'BOX_OPEN';
}

// Regex patterns for command validation in review-all context
// (These validate command format, not extract values)
var PATTERN_PURE_NUMBER = /^\d+$/;        // Matches: "5", "42" (box selection)
var PATTERN_DELETE_NUMBER = /^delete \d+$/; // Matches: "delete 5", "delete 12"
var PATTERN_MOVE_NUMBER = /^move \d+$/;    // Matches: "move 3", "move 7"
var PATTERN_RENAME_NUMBER = /^rename \d+$/; // Matches: "rename 2", "rename 9"

function handleFinished(text) {
  // Number input selects a box from the review all list
  if (PATTERN_PURE_NUMBER.test(text)) {
    const boxIdx = parseInt(text, 10) - 1;
    if (boxIdx >= 0 && boxIdx < state.boxes.length) {
      selectBox(state.boxes[boxIdx].id);
    } else {
      addBotMessage('No box ' + text + ' in the list.');
    }
    return;
  }
  var command = text.toLowerCase();
  if (command.indexOf('new box') !== -1 || command.indexOf('another') !== -1) {
    startNewBox();
  } else if (command.indexOf('done') !== -1 || command.indexOf('stop') !== -1) {
    var total = 0;
    state.boxes.forEach((box) => {
      total += helpers.activeItems(box).length;
    });
    addBotMessage(
      '<p>Good work. <strong>' + state.boxes.length + ' box' +
      (state.boxes.length !== 1 ? 'es' : '') + '</strong>, <strong>' + total +
      ' item' + (total !== 1 ? 's' : '') +
      '</strong> sorted.</p><p>Export any time with the buttons above.</p>'
    );
    setChips(['New box', 'Review by fate']);
  } else if(command.indexOf('review all') !==- 1) {
    // Set stage to FINISHED so all review-all commands route back to handleFinished
    state.conversationStage = 'FINISHED';

    var boxes = helpers.activeBoxes();
    var lines = _.map(boxes, (box, i) => {
      var loc = box.location ? ' (' + box.location + ')' : '';
      return (i+1) + '. <strong>' + box.name + '</strong>' + loc + ' — ' + boxSummaryLine(box);
    }).join('<br>');
    addBotMessage('<p><strong>All boxes:</strong><br>' + lines + '</p>');

    // Identify empty boxes and their positions in the review list
    var emptyBoxPositions = _.compact(_.map(boxes, (box, i) => {
      return helpers.activeItems(box).length === 0 ? (i + 1) : null;
    }));

    // Build delete chips based on number of empty boxes
    var deleteChips = [];
    if (emptyBoxPositions.length === 1) {
      deleteChips.push('Delete ' + emptyBoxPositions[0]);
    } else if (emptyBoxPositions.length === 2) {
      deleteChips.push('Delete ' + emptyBoxPositions[0]);
      deleteChips.push('Delete ' + emptyBoxPositions[1]);
    } else if (emptyBoxPositions.length >= 3) {
      deleteChips.push('Delete...');
    }

    // Store empty boxes for delete commands (with their positions)
    var emptyBoxes = _.reject(boxes, (box) => {
      return helpers.activeItems(box).length > 0;
    });
    if (emptyBoxes.length > 0) {
      state.emptyBoxesForDelete = emptyBoxes;
      state.emptyBoxPositions = emptyBoxPositions;
    } else {
      state.emptyBoxesForDelete = null;
      state.emptyBoxPositions = null;
    }

    // Build rename chips based on number of eligible boxes
    var renameChips = [];
    var renamePositions = _.range(1, boxes.length + 1);

    if (renamePositions.length === 1) {
      renameChips.push('Rename ' + renamePositions[0]);
    } else if (renamePositions.length === 2) {
      renameChips.push('Rename ' + renamePositions[0]);
      renameChips.push('Rename ' + renamePositions[1]);
    } else if (renamePositions.length >= 3) {
      renameChips.push('Rename...');
    }

    // Store rename positions for rename commands
    if (renamePositions.length > 0) {
      state.renamePositions = renamePositions;
    } else {
      state.renamePositions = null;
    }

    // Build move chips based on number of eligible boxes
    var moveChips = [];
    var movePositions = _.range(1, boxes.length + 1);

    if (movePositions.length === 1) {
      moveChips.push('Move ' + movePositions[0]);
    } else if (movePositions.length === 2) {
      moveChips.push('Move ' + movePositions[0]);
      moveChips.push('Move ' + movePositions[1]);
    } else if (movePositions.length >= 3) {
      moveChips.push('Move...');
    }

    // Store move positions for move commands
    if (movePositions.length > 0) {
      state.movePositions = movePositions;
    } else {
      state.movePositions = null;
    }

    setChips(deleteChips.concat(renameChips).concat(moveChips).concat(['New box','Done for now','Review by fate']));
  } else {
    // Handle delete number commands in the review all context (for any number of boxes or specific selection in elliptical)
    if (PATTERN_DELETE_NUMBER.test(command) &&
        state.emptyBoxesForDelete &&
        state.emptyBoxPositions) {
      if (executeReviewAllActionByNumber(command, /delete (\d+)/, state.emptyBoxPositions, handleDeleteEmptyBox)) {
        return;
      }
    }

    // Handle delete... elliptical in the review all context
    if (command === 'delete...' &&
        state.emptyBoxesForDelete &&
        state.emptyBoxesForDelete.length >= 3) {
      handleEllipticalDeleteEmptyBox();
      return;
    }

    // Handle move number commands in the review all context (for 1-9 boxes or specific selection in elliptical)
    if (PATTERN_MOVE_NUMBER.test(command) &&
        state.movePositions) {
      if (executeReviewAllActionByNumber(command, /move (\d+)/, state.movePositions, handleMoveBox)) {
        return;
      }
    }

    // Handle move... elliptical in the review all context
    if (command === 'move...' &&
        state.movePositions &&
        state.movePositions.length >= 3) {
      handleEllipticalMoveBox();
      return;
    }

    // Handle rename number commands in the review all context (for any number of boxes or specific selection in elliptical)
    if (PATTERN_RENAME_NUMBER.test(command) &&
        state.renamePositions) {
      if (executeReviewAllActionByNumber(command, /rename (\d+)/, state.renamePositions, handleRenameBox)) {
        return;
      }
    }

    // Handle rename... elliptical in the review all context
    if (command === 'rename...' &&
        state.renamePositions &&
        state.renamePositions.length >= 3) {
      handleEllipticalRenameBox();
      return;
    }

    // Handle other freeform commands while in review all
    handleFreeform(command, []);
  }
}

function handleDeleteEmptyBox(index) {
  if (!state.emptyBoxesForDelete || index < 0 || index >= state.emptyBoxesForDelete.length) {
    addBotMessage('Invalid box number.');
    return;
  }
  var box = state.emptyBoxesForDelete[index];
  // Soft delete the box
  box.deleted_at = new Date().toISOString();
  sessionDeletedCount++;
  addBotMessage('<p>Deleted the empty box <strong>"' + box.name + '"</strong>.</p>');
  // Refresh the review
  state.emptyBoxesForDelete = null;
  state.emptyBoxPositions = null;
  handleFinished('review all');
}

function handleEllipticalDeleteEmptyBox() {
  if (!state.emptyBoxesForDelete || state.emptyBoxesForDelete.length < 3 ||
      !state.emptyBoxPositions) {
    addBotMessage('No empty boxes to delete.');
    return;
  }
  state.conversationStage = 'AWAITING_DELETE_EMPTY_BOX';
  var eligible = state.emptyBoxPositions;
  addBotMessage(
    '<p>Which box? Type <em>delete</em> followed by the number. Applies to: ' +
    eligible.join(', ') + '.</p>'
  );
  var input = document.getElementById('user-input');
  if (input) {
    input.value = 'delete ';
    if (input.focus) { input.focus(); }
  }
}

function handleRenameBox(index) {
  if (!state.renamePositions || index < 0 || index >= state.renamePositions.length) {
    addBotMessage('Invalid box number.');
    return;
  }
  var boxes = helpers.activeBoxes();
  if (index >= boxes.length) {
    addBotMessage('Invalid box number.');
    return;
  }
  var box = boxes[index];
  state.conversationStage = 'AWAITING_BOX_RENAME';
  state.pendingRenameBoxId = box.id;
  addBotMessage('<p>What would you like to call <strong>' + box.name + '</strong>?</p>');
}

function handleEllipticalRenameBox() {
  if (!state.renamePositions || state.renamePositions.length < 3) {
    addBotMessage('No boxes to rename.');
    return;
  }
  state.conversationStage = 'AWAITING_RENAME_ELLIPTICAL';
  var eligible = state.renamePositions;
  addBotMessage(
    '<p>Which box? Type <em>rename</em> followed by the number. Applies to: ' +
    eligible.join(', ') + '.</p>'
  );
  var input = document.getElementById('user-input');
  if (input) {
    input.value = 'rename ';
    if (input.focus) { input.focus(); }
  }
}

function handleEllipticalRenameConfirm(command) {
  if (!state.renamePositions || state.renamePositions.length < 3) {
    addBotMessage('No boxes available for renaming.');
    return;
  }
  var match = command.match(/rename (\d+)/);
  if (match) {
    var boxNum = parseInt(match[1], 10);
    var posIndex = state.renamePositions.indexOf(boxNum);
    if (posIndex !== -1) {
      handleRenameBox(posIndex);
      return;
    }
  }
  addBotMessage('Invalid selection. Try again.');
}

function handleMoveBox(index) {
  if (!state.movePositions || index < 0 || index >= state.movePositions.length) {
    addBotMessage('Invalid box number.');
    return;
  }
  var boxes = helpers.activeBoxes();
  if (index >= boxes.length) {
    addBotMessage('Invalid box number.');
    return;
  }
  var box = boxes[index];
  state.conversationStage = 'AWAITING_MOVE_LOCATION_REVIEW';
  state.pendingMoveBoxId = box.id;
  addBotMessage('<p>Where would you like to move <strong>"' + box.name + '"</strong>?</p>');
}

function handleEllipticalMoveBox() {
  if (!state.movePositions || state.movePositions.length < 3) {
    addBotMessage('No boxes to move.');
    return;
  }
  state.conversationStage = 'AWAITING_MOVE_ELLIPTICAL';
  var eligible = state.movePositions;
  addBotMessage(
    '<p>Which box? Type <em>move</em> followed by the number. Applies to: ' +
    eligible.join(', ') + '.</p>'
  );
  var input = document.getElementById('user-input');
  if (input) {
    input.value = 'move ';
    if (input.focus) { input.focus(); }
  }
}

function handleMoveLocationConfirm(newLocation) {
  var location = newLocation.trim();
  if (!location) {
    addBotMessage('Please provide a location.');
    return;
  }
  var boxId = state.pendingMoveBoxId;
  if (!boxId) {
    addBotMessage('No box selected for moving.');
    return;
  }
  var box = _.find(state.boxes, (b) => b.id === boxId);
  if (!box) {
    addBotMessage('Box not found.');
    return;
  }
  var prevLocation = box.location || 'unspecified';
  box.location = location;
  state.pendingMoveBoxId = null;
  state.conversationStage = 'FINISHED';
  addBotMessage(
    '<p>Moved <strong>"' + box.name + '"</strong> from <em>' + prevLocation +
    '</em> to <em>' + location + '</em>.</p>'
  );
  handleFinished('review all');
}

function handleEllipticalMoveConfirm(command) {
  if (!state.movePositions || state.movePositions.length < 3) {
    addBotMessage('No boxes available for moving.');
    return;
  }
  var match = command.match(/move (\d+)/);
  if (match) {
    var boxNum = parseInt(match[1], 10);
    var posIndex = state.movePositions.indexOf(boxNum);
    if (posIndex !== -1) {
      handleMoveBox(posIndex);
      return;
    }
  }
  addBotMessage('Invalid selection. Try again.');
}

function handleHelp() {
  if (state.boxes.length === 0) {
    addBotMessage(
      'What\'s the first box called? <em>(This command will show a help menu once you have input some data.)</em>'
    );
    state.conversationStage = 'AWAITING_BOX_NAME';
    setChips([]);
  } else {
    var box = activeBox();
    var inItemDetail = state.conversationStage === 'AWAITING_ITEM_VIEW' ||
                       state.conversationStage === 'AWAITING_ITEM_VIEW_NOTES';

    var always = [
      '<p>Here\'s what you can do:</p>',
      '<h3>Always available</h3>',
      '<p><em>"New box"</em> — start a new box<br/>',
      '<em>"Review all boxes"</em> — summary of every box; from there you can rename, move, or delete empty boxes<br/>',
      '<em>"Review by fate"</em> — review all items of a given fate across every box<br/>',
      '<em>"Done for now"</em> — end session and see summary<br/>',
      '<em>"Import JSON"</em> / <em>"Import CSV"</em> — merge a saved inventory into current<br/>',
      '<em>"Export JSON"</em> / <em>"Export CSV"</em> — download your inventory<br/>',
      '<em>"Reset"</em> — clear all data (asks for confirmation)<br/>',
      helpers.emoji.upArrow + ' / ' + helpers.emoji.downArrow + ' arrow keys — recall previous commands</p>',
    ];

    var boxOnly = box ? [
      '<h3>Inside a box</h3>',
      '<p><em>"Add item"</em> — log the next item (supports <em>name, fate, notes</em> or <em>name; fate; notes</em>; Shift+Enter for multiple)<br/>',
      '<em>"Review items"</em> — list items in this box; type a number to view item detail<br/>',
      '<em>"Move &lt;location&gt;"</em> — relocate this box (e.g. <em>"move garage"</em>)<br/>',
      '<em>"Nest box"</em> — put this box inside another<br/>',
      '<em>"Convert location &lt;name&gt;"</em> — promote a location string to a nested box<br/>',
      '<em>"Dump into..."</em> — transfer all items to another box<br/>',
      '<em>"Trash &lt;name or number&gt;"</em> — mark an item for deletion<br/>',
      '<em>"Remove &lt;name or number&gt;"</em> — remove an item from this box<br/>',
      '<em>"Done with this box"</em> — finish sorting this box</p>',
    ] : [
      '<h3>Open a box to use</h3>',
      '<p><em>"Add item"</em>, <em>"Review items"</em>, <em>"Move"</em>, <em>"Nest box"</em>, <em>"Convert location"</em>, <em>"Dump into..."</em>, <em>"Trash"</em>, <em>"Remove"</em>, <em>"Done with this box"</em></p>',
    ];

    var itemDetailSection = inItemDetail ? [
      '<h3>From item detail</h3>',
      '<p><em>"Move to box"</em> — move a single item to another box<br/>',
      '<em>"Make it a box"</em> — promote an item to a nested box</p>',
    ] : [
      '<h3>From item detail</h3>',
      '<p><em>"Move to box"</em>, <em>"Make it a box"</em></p>',
    ];

    addBotMessage(always.concat(boxOnly, itemDetailSection).join('\n'));
    if (box) {
      setBoxOpenChips();
    } else {
      state.conversationStage = 'FINISHED';
      setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    }
  }
}

function handleFreeform(text, photos) {
  var command = text.toLowerCase().trim();
  var greetings = ['hi','hello','hey','help','?','list boxes','inventory','start'];
  if (greetings.indexOf(command) !== -1 || !activeBox()) {
    if (state.boxes.length === 0) {
      addBotMessage('What\'s the first box called?');
      state.conversationStage = 'AWAITING_BOX_NAME';
      setChips([]);
    } else {
      addBotMessage(helpers.welcomeBackMessage(false));
      state.conversationStage = 'FINISHED';
      setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    }
    return;
  }
  addBotMessage(
    'Not sure what you mean. Try: _"New box"_, _"Add item"_, _"Done with this box"_, or _"Review items"_.'
  );
  setBoxOpenChips();
}

function exportJSON() {
  var data={exportedAt:new Date().toISOString(),boxes:[]};
  for(var i=0;i<state.boxes.length;i++){
    var box=state.boxes[i]; var items=[];
    for(var j=0;j<box.items.length;j++){
      var it=box.items[j];
      var exported = Object.assign({},it);
      items.push(exported);
    }
    data.boxes.push(Object.assign({},box,{items:items}));
  }
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  dlBlob(blob,'inventory.json');
}

function escapeCSV(field) {
  if (field === null || field === undefined) { return ''; }
  var str = String(field);
  // Replace newlines with spaces to prevent multi-line fields that break naive line splitting
  str = str.replace(/\n/g, ' ');
  if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function exportCSV() {
  var header = ['location,box name,item name,fate,notes,box id,item id'];
  var rows = state.boxes.reduce(function(acc, box) {
    var boxRows = box.items.map(function(item) {
      return [
        escapeCSV(box.location || ''),
        escapeCSV(box.name),
        escapeCSV(item.name),
        escapeCSV(item.fate),
        escapeCSV(item.notes || ''),
        escapeCSV(box.id || ''),
        escapeCSV(item.id || '')
      ].join(',');
    });
    return acc.concat(boxRows);
  }, header);
  var csv = rows.join('\n');
  var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  dlBlob(blob, 'inventory.csv');
}


function dlBlob(blob, name) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

function parseCSV(text) {
  var lines = text.trim().split('\n');
  if (lines.length === 0) { return []; }

  var headerLine = lines[0];
  var headers = parseCSVLine(headerLine);

  var legacyHeaders = ['location', 'box name', 'item name', 'fate', 'notes'];
  var fullHeaders   = ['location', 'box name', 'item name', 'fate', 'notes', 'box id', 'item id'];
  var isLegacy = JSON.stringify(headers) === JSON.stringify(legacyHeaders);
  var isFull   = JSON.stringify(headers) === JSON.stringify(fullHeaders);

  if (!isLegacy && !isFull) {
    addBotMessage(
      'CSV format error: expected columns in order: location, box name, item name, fate, notes' +
      ' (optionally followed by box id, item id)'
    );
    return null;
  }

  var expectedCols = isFull ? 7 : 5;

  // Remove blank lines
  let nonEmptyLines = lines.slice(1).filter((line) => line.trim() !== '');

  // Validate all rows have correct column count
  let invalidRow = nonEmptyLines.find((line, index) => {
    let values = parseCSVLine(line);
    if (values.length !== expectedCols) {
      addBotMessage('CSV format error on line ' + (index + 2) + ': expected ' + expectedCols + ' columns, got ' + values.length);
      return true;
    }
    return false;
  });
  if (invalidRow) { return null; }

  // Transform validated rows to objects
  let rows = nonEmptyLines.map((line) => {
    let values = parseCSVLine(line);
    return {
      location: values[0] || '',
      boxName:  values[1],
      itemName: values[2],
      fate:     values[3],
      notes:    values[4] || '',
      boxId:    isFull ? (values[5] || '') : '',
      itemId:   isFull ? (values[6] || '') : ''
    };
  });

  return rows;
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

  // The for loop below is intended. For character-by-character parsing with state,
  // look-ahead, and manual skipping, a traditional for loop is the right tool.
  for (var i = 0; i < line.length; i++) {
    var char = line[i];
    var next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

function importCSV(text) {
  var rows = parseCSV(text);
  if (!rows) { return; }

  if (rows.length === 0) {
    addBotMessage('CSV is empty (no items to import).');
    return;
  }

  // Group incoming rows by boxId (if present) or by (location|boxName) key
  var boxMap = {};
  var boxOrder = [];
  rows.forEach(function(row) {
    // Prefer id-based key so re-exports of the same box always merge correctly;
    // fall back to name+location for legacy/hand-edited CSVs.
    var boxKey = row.boxId ? ('id:' + row.boxId) : (row.location + '|' + row.boxName);
    if (!boxMap[boxKey]) {
      boxMap[boxKey] = {
        id:       row.boxId || '',
        location: row.location,
        name:     row.boxName,
        items:    []
      };
      boxOrder.push(boxKey);
    }
    boxMap[boxKey].items.push({
      id:   row.itemId || '',
      name: row.itemName,
      fate: FATES.indexOf(row.fate) !== -1 ? row.fate : 'unsure',
      notes: row.notes
    });
  });

  // Build lookups of existing boxes by id and by (location|name)
  var existingById   = {};
  var existingByName = {};
  state.boxes.forEach(function(box) {
    if (box.id) { existingById[box.id] = box; }
    existingByName[(box.location || '') + '|' + box.name] = box;
  });

  // Also build a set of all existing item IDs for fast lookup
  var existingItemIds = {};
  state.boxes.forEach(function(box) {
    box.items.forEach(function(item) {
      if (item.id) { existingItemIds[item.id] = true; }
    });
  });

  var newBoxCount      = 0;
  var newItemCount     = 0;
  var nearDupItems     = []; // { boxName, itemName } — same props, different id
  var nearDupBoxes     = []; // box names that matched by name only (no id match)

  boxOrder.forEach(function(boxKey) {
    var boxData     = boxMap[boxKey];
    var existingBox = null;

    // 1. Try id match first (definitive)
    if (boxData.id && existingById[boxData.id]) {
      existingBox = existingById[boxData.id];
    }
    // 2. Fall back to name+location match
    if (!existingBox) {
      var nameKey = (boxData.location || '') + '|' + boxData.name;
      if (existingByName[nameKey]) {
        existingBox = existingByName[nameKey];
        // If incoming had an id but it didn't match, note as near-dup box
        if (boxData.id && existingBox.id && boxData.id !== existingBox.id) {
          nearDupBoxes.push(boxData.name);
        }
      }
    }

    if (existingBox) {
      // Merge items into existing box
      boxData.items.forEach(function(incomingItem) {
        // 1. ID match → true duplicate, skip silently
        if (incomingItem.id && existingItemIds[incomingItem.id]) { return; }

        // 2. Near-duplicate: same name+fate+notes but different/no id
        var isNearDup = existingBox.items.some(function(existItem) {
          return existItem.deleted_at === null &&
            existItem.name  === incomingItem.name &&
            existItem.fate  === incomingItem.fate &&
            (existItem.notes || '') === (incomingItem.notes || '');
        });
        if (isNearDup) {
          nearDupItems.push({ boxName: existingBox.name, itemName: incomingItem.name });
          return;
        }

        // 3. Genuinely new item
        var newItem = {
          id:          incomingItem.id || uid(),
          name:        incomingItem.name,
          description: '',
          fate:        incomingItem.fate,
          notes:       incomingItem.notes,
          createdAt:     new Date().toISOString(),
          deleted_at:  null
        };
        existingBox.items.push(newItem);
        existingItemIds[newItem.id] = true;
        newItemCount++;
      });
    } else {
      // Create new box, retaining incoming IDs
      var box = {
        id:        boxData.id || uid(),
        name:      boxData.name,
        location:  boxData.location,
        notes:     '',
        parentId:  null,
        createdAt: new Date().toISOString(),
        items:     boxData.items.map(function(item) {
          return {
            id:          item.id || uid(),
            name:        item.name,
            description: '',
            fate:        item.fate,
            notes:       item.notes,
            createdAt:     new Date().toISOString(),
            deleted_at:  null
          };
        })
      };
      state.boxes.push(box);
      newBoxCount++;
      newItemCount += box.items.length;
    }
  });

  commitState();

  var parts = [];
  if (newBoxCount  > 0) { parts.push(newBoxCount  + ' new box'  + (newBoxCount  !== 1 ? 'es' : '')); }
  if (newItemCount > 0) { parts.push(newItemCount + ' new item' + (newItemCount !== 1 ? 's' : '')); }
  var summary = parts.length > 0
    ? parts.join(' and ') + ' merged in.'
    : 'No new items to import (all already present).';

  var warnings = [];
  if (nearDupBoxes.length > 0) {
    warnings.push('\n\n⚠️ <strong>Possible duplicate box' + (nearDupBoxes.length !== 1 ? 'es' : '') + '</strong> (same name/location, different id): ' +
      nearDupBoxes.map(function(n) { return '<strong>' + n + '</strong>'; }).join(', ') + '. Items were merged into the existing box.');
  }
  if (nearDupItems.length > 0) {
    var grouped = {};
    nearDupItems.forEach(function(d) {
      if (!grouped[d.boxName]) { grouped[d.boxName] = []; }
      grouped[d.boxName].push(d.itemName);
    });
    var details = Object.keys(grouped).map(function(boxName) {
      return '<strong>' + boxName + '</strong>: ' + grouped[boxName].join(', ');
    }).join('; ');
    warnings.push('\n\n⚠️ <strong>Possible duplicate item' + (nearDupItems.length !== 1 ? 's' : '') + '</strong> skipped (same name/fate/notes, no id match): ' + details + '.');
  }

  addBotMessage(helpers.emoji.checkMark + ' ' + summary + warnings.join('') + '\n\nReady to continue organizing?');
  state.conversationStage = 'BOX_OPEN';
  setChips(['New box', 'Review all boxes', 'Review by fate']);
}

function importJSON(data) {
  // Validate structure
  if (!data || !Array.isArray(data.boxes)) {
    addBotMessage(
      'Import failed ' + helpers.emoji.emDash + ' the file does not look like a valid DeclutterBot inventory.' +
      ' Expected a JSON object with a "boxes" array.'
    );
    return;
  }

 // Normalise incoming boxes
  let incomingBoxes = data.boxes;
  let normalizeBox = (box) => {
    if (box.parentId === undefined) { box.parentId = null; }
    if (!Array.isArray(box.items)) { box.items = []; }
    box.items.forEach((item) => {
      if (!item.notes) { item.notes = ''; }
      if (!item.fate) { item.fate = 'unsure'; }
      if (item.deleted_at === undefined) { item.deleted_at = null; }
    });
  };
  incomingBoxes.forEach(normalizeBox);

  // Build lookups of existing boxes by id and by (location|name)
  var existingById   = {};
  var existingByName = {};
  state.boxes.forEach(function(box) {
    if (box.id) { existingById[box.id] = box; }
    existingByName[(box.location || '') + '|' + box.name] = box;
  });

  // Build set of all existing item IDs
  var existingItemIds = {};
  state.boxes.forEach(function(box) {
    box.items.forEach(function(item) {
      if (item.id) { existingItemIds[item.id] = true; }
    });
  });

  var newBoxCount  = 0;
  var newItemCount = 0;
  var nearDupItems = [];
  var nearDupBoxes = [];

  incomingBoxes.forEach(function(incomingBox) {
    var existingBox = null;

    // 1. Try id match first
    if (incomingBox.id && existingById[incomingBox.id]) {
      existingBox = existingById[incomingBox.id];
    }
    // 2. Fall back to name+location match
    if (!existingBox) {
      var nameKey = (incomingBox.location || '') + '|' + incomingBox.name;
      if (existingByName[nameKey]) {
        existingBox = existingByName[nameKey];
        if (incomingBox.id && existingBox.id && incomingBox.id !== existingBox.id) {
          nearDupBoxes.push(incomingBox.name);
        }
      }
    }

    if (existingBox) {
      // Merge items
      incomingBox.items.forEach(function(incomingItem) {
        // 1. ID match → true duplicate, skip silently
        if (incomingItem.id && existingItemIds[incomingItem.id]) { return; }

        // 2. Near-duplicate: same name+fate+notes, different/no id
        var isNearDup = existingBox.items.some(function(existItem) {
          return existItem.deleted_at === null &&
            existItem.name  === incomingItem.name &&
            existItem.fate  === incomingItem.fate &&
            (existItem.notes || '') === (incomingItem.notes || '');
        });
        if (isNearDup) {
          nearDupItems.push({ boxName: existingBox.name, itemName: incomingItem.name });
          return;
        }

        // 3. Genuinely new item — retain incoming id or mint a fresh one
        var newItem = Object.assign({}, incomingItem, {
          id:         incomingItem.id || uid(),
          deleted_at: null
        });
        existingBox.items.push(newItem);
        existingItemIds[newItem.id] = true;
        newItemCount++;
      });
    } else {
      // New box — retain incoming id or mint a fresh one
      incomingBox.id = incomingBox.id || uid();
      incomingBox.items = incomingBox.items.map(function(item) {
        return Object.assign({}, item, {
          id:         item.id || uid(),
          deleted_at: item.deleted_at || null
        });
      });
      state.boxes.push(incomingBox);
      newBoxCount++;
      newItemCount += helpers.activeItems(incomingBox).length;
    }
  });

  state.activeBoxId     = null;
  state.activeItemId    = null;
  state.conversationStage = 'FINISHED';
  commitState();
  if (typeof document !== 'undefined' && document.getElementById('chat-messages')) {
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('quick-replies').innerHTML = '';
  }

  var parts = [];
  if (newBoxCount  > 0) { parts.push('<strong>' + newBoxCount  + '</strong> new box'  + (newBoxCount  !== 1 ? 'es' : '')); }
  if (newItemCount > 0) { parts.push('<strong>' + newItemCount + '</strong> new item' + (newItemCount !== 1 ? 's' : '')); }
  var summary = parts.length > 0
    ? parts.join(' and ') + ' merged in'
    : 'No new items to import (all already present)';

  var warnings = [];
  if (nearDupBoxes.length > 0) {
    warnings.push('\n\n' + helpers.emoji.warningSign + ' <strong>Possible duplicate box' + (nearDupBoxes.length !== 1 ? 'es' : '') + '</strong> (same name/location, different id): ' +
      nearDupBoxes.map(function(n) { return '<strong>' + n + '</strong>'; }).join(', ') + '. Items were merged into the existing box.');
  }
  if (nearDupItems.length > 0) {
    var grouped = {};
    nearDupItems.forEach(function(d) {
      if (!grouped[d.boxName]) { grouped[d.boxName] = []; }
      grouped[d.boxName].push(d.itemName);
    });
    var details = Object.keys(grouped).map(function(boxName) {
      return '<strong>' + boxName + '</strong>: ' + grouped[boxName].join(', ');
    }).join('; ');
    warnings.push('\n\n' + helpers.emoji.warningSign + ' <strong>Possible duplicate item' + (nearDupItems.length !== 1 ? 's' : '') + '</strong> skipped (same name/fate/notes, no id match): ' + details + '.');
  }

  addBotMessage('<p>' + summary + '.' +
    (data.exportedAt ? ' Exported ' + new Date(data.exportedAt).toLocaleDateString() + '.' : '') +
    warnings.join('') +
    '\n\nWhat would you like to do?' + '</p>');
  setChips(['Review all boxes', 'Continue last box', 'New box']);
}

const WELCOME_MSG =
  '<p>Let\'s sort through this together.\n\n' +
  'Pick up a box, give it a name, and we\'ll go item by item ' + helpers.emoji.emDash +
  ' <strong>keep, donate, sell, trash, return,</strong> or <strong>unsure</strong>.' +
  ' Add notes and export everything when you\'re done.\n\n' +
  'What\'s the first box called?</p>';

function clearAll() {
  // Immediately wipe if there is nothing to lose
  if (state.boxes.length === 0) { _doReset(); return; }
  // Otherwise ask for typed confirmation before wiping anything
  var boxCount = state.boxes.length;
  var itemCount = state.boxes.reduce(function(sum, box) {
    return sum + helpers.activeItems(box).length;
  }, 0);
  state.conversationStage = 'AWAITING_RESET_CONFIRM';
  addBotMessage(
    '<p>⚠️ This clears everything — <strong>' + boxCount + ' box' + (boxCount !== 1 ? 'es' : '') +
    '</strong> and <strong>' + itemCount + ' item' + (itemCount !== 1 ? 's' : '') + '</strong>, gone. Export first if you want a record.</p>' +
    '<p>Type <strong>yes</strong> to confirm reset, or <strong>no</strong> to cancel.</p>'
  );
  setChips(['Yes', 'No']);
}

function handleResetConfirm(command) {
  if (command === 'yes') {
    _doReset();
  } else {
    state.conversationStage = 'BOX_OPEN';
    addBotMessage('Cancelled. Everything\'s still here.');
    setBoxOpenChips();
  }
}

function _doReset() {
  localStorage.removeItem('declutterbot_state');
  // Mutate state in-place so exported references remain valid
  state.boxes              = [];
  state.activeBoxId        = null;
  state.activeItemId       = null;
  state.pendingBatch       = null;
  state.pendingBoxBatch    = null;
  state.pendingDeleteBoxId = null;
  state.pendingNest        = null;
  state.activeItemViewGroup = null;
  state.pendingFateReview  = null;
  state.conversationStage  = 'WELCOME';
  state.storageFull        = false;
  state.emptyBoxesForDelete = null;
  state.emptyBoxPositions  = null;
  state.renamePositions    = null;
  state.pendingRenameBoxId = null;
  state.movePositions      = null;
  state.pendingMoveBoxId   = null;
  sessionDeletedCount = 0; sessionTrashPreference = null; boxTrashPreferences = {};
  if (typeof document !== 'undefined') {
    var chatEl = document.getElementById('chat-messages');
    var repliesEl = document.getElementById('quick-replies');
    if (chatEl) { chatEl.innerHTML    = ''; }
    if (repliesEl) { repliesEl.innerHTML = ''; }
  }
  commitState();
  setTimeout(function() {
    addBotMessage(WELCOME_MSG);
    state.conversationStage = 'AWAITING_BOX_NAME';
    setChips([]);
  }, 100);
}

// Init — only runs in browser, not in Node test environment
if (typeof window !== 'undefined') {

loadState(); renderSidebar();
updateContextBar();
// Two ticks after load: set budget to 14397 minus items already in state
setTimeout(function() { setTimeout(function() {
  mantra('load');
  // Run v2 recalibration immediately on load for an accurate starting count
  const STORAGE_MAX = 5 * 1024 * 1024;
  const stateData = state;
  const used = JSON.stringify(stateData).length;
  const totalItems = state.boxes.reduce((sum, b) => sum + b.items.length, 0);
  const totalObjects = totalItems + state.boxes.length;
  if (totalObjects >= 10) {
    const divisor = Math.round(used / totalObjects);
    const remaining = Math.max(0, STORAGE_MAX - used);
    _budgetItems = Math.floor(remaining / divisor);
  }
  // else: keep using 14,397 (set at line 235)
  updateBudgetDisplay();
}, 0); }, 0);
initSidebarDrag();
// Expose impl functions to global scope for onclick attributes
window.setChips  = _setChipsImpl;
window.chipClick = _chipClickImpl;

// Redirect printable keypresses to the textarea if focus is elsewhere.
// Captures the keystroke by appending it manually after focusing,
// preventing it from being lost. Excludes modifier combos, Tab, Escape.
document.addEventListener('keydown', function(e) {
  var input = document.getElementById('user-input');
  if (document.activeElement === input) { return; }
  if (e.metaKey || e.ctrlKey || e.altKey) { return; }
  if (e.key === 'Tab' || e.key === 'Escape') { return; }
  var isPrintable = e.key.length === 1;
  var isNavKey = e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                 e.key === 'Enter' || e.key === 'Backspace';
  if (!isPrintable && !isNavKey) { return; }
  input.focus();
  if (isPrintable) {
    input.value += e.key;
    autoResize(input);
    e.preventDefault();
  }
});

// Prevent send button click from blurring the textarea.
// mousedown fires before blur, so preventDefault keeps focus in place.
const sendBtn = document.querySelector('.send-btn');
if (sendBtn) {
  sendBtn.addEventListener('mousedown', function(e) { e.preventDefault(); });
}

if (state.boxes.length === 0) {
  setTimeout(function() {
    addBotMessage(WELCOME_MSG);
    state.conversationStage = 'AWAITING_BOX_NAME';
    setChips([]);
  }, 200);
} else {
  setTimeout(function() {
    addBotMessage(helpers.welcomeBackMessage(true));
    state.conversationStage = state.activeBoxId ? 'BOX_OPEN' : 'FINISHED';
    setChips(['New box', 'Continue last box', 'Review all boxes']);
  }, 200);
}
}

// Capture real implementations before Node shim wrappers shadow the names
const _addBotMessageImpl  = addBotMessage;
const _addUserMessageImpl = addUserMessage;

// In Node, alias global stubs via wrappers so tests can override globals at runtime
if (typeof window === 'undefined' && typeof global !== 'undefined') {
  var addBotMessage    = function(t,p){ return (global.addBotMessage    ||function(){})(t,p); };
  var setChips         = function(c){   return (global.setChips         ||function(){})(c);   };
  var addUserMessage   = function(t,p){ return (global.addUserMessage   ||function(){})(t,p); };
  var renderSidebar    = function(){    return (global.renderSidebar    ||function(){})();    };
  var updateContextBar = function(){    return (global.updateContextBar ||function(){})();    };
  var showTyping       = function(){    return (global.showTyping       ||function(){})();    };
  var hideTyping       = function(){    return (global.hideTyping       ||function(){})();    };
  var saveState        = function(){    return (global.saveState        ||function(){})();    };
  if (typeof localStorage === 'undefined') {
    var localStorage = global.localStorage || {
      getItem: function(){ return null; }, setItem: function(){}, removeItem: function(){}
    };
  }
}

function setBoxOpenChips() {
  var box = activeBox();
  var hasActiveItems = box && helpers.activeItems(box).length > 0;
  var extra = hasActiveItems ? 'Dump into...' : 'Delete this box';
  setChips(['Add item', 'Review items', 'Move box', 'Nest box', extra, 'Review by fate', 'Done with this box']);
}

function handleDeleteBox() {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to delete. Open a box first.'); return; }
  var kids = childBoxes(box.id);
  if (kids.length > 0) {
    var kidNames = kids.map(function(b){ return '"' + b.name + '"'; }).join(', ');
    addBotMessage(
      '<p><strong>"' + box.name + '"</strong> contains ' + kids.length + ' box(es): ' + kidNames +
      '. Move or delete those first.</p>'
    );
    setBoxOpenChips();
    return;
  }
  var activeCount = helpers.activeItems(box).length;
  if (activeCount > 0) {
    addBotMessage(
      '<p><strong>"' + box.name + '"</strong> still has ' + activeCount + ' item(s).' +
      ' Empty the box first, or use _"dump into <box name>"_ to transfer all items to another box.</p>'
    );
    setChips(['Review items', 'Dump into...', 'Done with this box']); // box has items
    return;
  }
  var prev = state.conversationStage;
  state.conversationStage = 'AWAITING_DELETE_BOX_CONFIRM';
  state.pendingDeleteBoxId = box.id;
  addBotMessage(
    '<p>Delete <strong>"' + box.name +
    '"</strong>? It is empty. This cannot be undone.</p>'
  );
  setChips(['Yes, delete it', 'No, keep it']);
}

function handleDeleteBoxConfirm(text) {
  var command = text.toLowerCase().trim();
  var boxId = state.pendingDeleteBoxId;
  state.pendingDeleteBoxId = null;
  state.conversationStage = 'FINISHED';

  if (command === 'no' || command === 'no, keep it' || command.startsWith('no')) {
    addBotMessage('Kept. What would you like to do?');
    state.conversationStage = 'BOX_OPEN';
    setChips(['Add item', 'Review items', 'Move box', 'Done with this box']);
    return;
  }

  let foundBox = state.boxes.find((box) => box.id === boxId);
  let index = foundBox ? state.boxes.indexOf(foundBox) : -1;
  if (index === -1) { addBotMessage('Could not find that box.'); return; }

  let name = state.boxes[index].name;
  let parentId = state.boxes[index].parentId || null;
  state.boxes.splice(index, 1);
  state.activeBoxId = null;
  state.activeItemId = null;
  commitState();

  var parentBox = parentId ? state.boxes.find(function(b) { return b.id === parentId; }) : null;
  if (parentBox) {
    state.activeBoxId = parentBox.id;
    state.conversationStage = 'BOX_OPEN';
    addBotMessage(
      '<p>Deleted <strong>"' + name + '"</strong>. Back in <strong>"' +
      parentBox.name + '"</strong>.</p>'
    );
    setBoxOpenChips();
  } else {
    state.conversationStage = 'FINISHED';
    addBotMessage(
      '<p>Deleted <strong>"' + name + '"</strong>. ' + state.boxes.length +
      ' box' + (state.boxes.length !== 1 ? 'es' : '') + ' remaining.</p>'
    );
    setChips(['New box', 'Review all boxes', 'Done for now', 'Review by fate']);
  }
}

function dumpChipLabel(source, target) {
  if (sameProximity(source.location, target.location)) return target.name;
  return target.location ? target.location + ' · ' + target.name : target.name;
}

function handleDump(text) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to dump. Open a box first.'); return; }
  var activeCount = helpers.activeItems(box).length;
  if (activeCount === 0) { addBotMessage('"' + box.name + '" is already empty — nothing to dump.'); return; }

  // Parse target from "dump into <name>" or "dump <name>"
  var command = text.toLowerCase().trim();
  var targetName = '';
  if (command.startsWith('dump into ')) targetName = text.slice(10).trim();
  else if (command.startsWith('dump ') && command !== 'dump') targetName = text.slice(5).trim();

  if (targetName) {
    handleDumpTarget(targetName);
  } else {
    state.conversationStage = 'AWAITING_DUMP_TARGET';
    var others = state.boxes.filter(function(b){ return b.id !== box.id; });
    if (others.length === 0) {
      addBotMessage('There are no other boxes to dump into. You can type a new box name and I\'ll create it.');
      state.conversationStage = 'AWAITING_DUMP_TARGET';
      return;
    }
    var chips = others.map(function(b){ return dumpChipLabel(box, b); });
    addBotMessage(
      '<p>Dump all ' + activeCount + ' item(s) from <strong>"' + box.name + '"</strong> into which box?' +
      ' Type a new name to create one.</p>'
    );
    setChips(chips);
  }
}

function handleDumpTarget(text) {
  var source = activeBox();
  if (!source) { state.conversationStage = 'BOX_OPEN'; return; }

  // Strip location prefix from chip labels: "dining room · top shelf" -> try "top shelf" too
  var command = text.toLowerCase().trim();
  var chipBoxName = command.indexOf(' · ') !== -1 ? command.slice(command.indexOf(' · ') + 3).trim() : command;

  // Find target:
  // Filter out source box, then search
  let eligibleBoxes = state.boxes.filter((box) => box.id !== source.id);
  // First try exact match on box name
  let target = eligibleBoxes.find((box) => ([command, chipBoxName].includes(box.name.toLowerCase()))
  // Then try partial match on box name only (NOT location)
  ) || eligibleBoxes.find((box) => box.name.toLowerCase().includes(chipBoxName));

  // No match — create a new box with the typed name, then transfer
  if (!target) {
    var newBox = {
      id: uid(), name: text.trim(), location: '', notes: '',
      parentId: null, createdAt: new Date().toISOString(), items: []
    };
    state.boxes.push(newBox);
    target = newBox;
    // Transfer items to new box, then ask for its location
    var count = helpers.activeItems(source).length;
    source.items.forEach(function(item) { target.items.push(item); });
    source.items = [];
    // Set new box as active and ask for location
    state.activeBoxId = target.id;
    state.conversationStage = 'AWAITING_LOCATION';
    addBotMessage(
      '<p>Created <strong>"' + target.name + '"</strong> and dumped <strong>' + count + '</strong> item(s) into it.' +
      ' "' + source.name + '" is now empty.</p><p>Where is <strong>"' + target.name + '"</strong> located?</p>'
    );
    return;
  }

  var count = helpers.activeItems(source).length;
  source.items.forEach(function(item) { target.items.push(item); });
  source.items = [];
  // Re-parent direct children of source to target (preserving deeper ancestry)
  let reparentedChildren = state.boxes.filter((box) => box.parentId === source.id);
  reparentedChildren.forEach((child) => { child.parentId = target.id; });
  state.conversationStage = 'BOX_OPEN';
  var msg = '<p>Dumped <strong>' + count + '</strong> item(s) from <strong>"' + source.name + '"</strong> into <strong>"' + target.name + '"</strong>.'
    + (reparentedChildren.length ? ' Also moved ' + reparentedChildren.length + ' nested box(es).' : '')
    + ' "' + source.name + '" is now empty.</p>';
  addBotMessage(msg);
  setChips(['Delete box', 'Add item', 'Done with this box']);
}

// ── NEST HELPERS ──────────────────────────────────────────────────────────────
function getDescendantIds(boxId) {
  // Return all descendant box IDs (children, grandchildren, etc.)
  let result = [];
  let queue = [boxId];
  while (queue.length) {
    let current = queue.shift();
    let children = state.boxes.filter((box) => box.parentId === current);
    children.forEach((child) => {
      result.push(child.id);
      queue.push(child.id);
    });
  }
  return result;
}

function childBoxes(boxId) {
  return state.boxes.filter(function(b){ return (b.parentId == null ? null : b.parentId) === boxId; });
}

function locSegments(loc) {
  return (loc||'').toLowerCase().trim().split(/[\s,\-\/\|]+/).filter(Boolean);
}
function sameProximity(locA, locB) {
  // True if either location is a prefix of the other by segment
  var a = locSegments(locA), b = locSegments(locB);
  if (!a.length || !b.length) { return false; }
  var shorter = a.length <= b.length ? a : b;
  var longer  = a.length <= b.length ? b : a;
  return shorter.every((segment, index) => segment === longer[index]);
}
function nestChipLabel(source, candidate) {
  // Same or proximate location → just name; different → location · name
  if (sameProximity(source.location, candidate.location)) return candidate.name;
  return candidate.location ? candidate.location + ' · ' + candidate.name : candidate.name;
}

// Returns the nearest non-null location by walking the parent chain.
// Boxes directly inside another box have location:null — their location
// is inherited from the first ancestor that has a location string.
function effectiveLocation(box) {
  if (!box) { return null; }
  if (box.location) { return box.location; }
  var parent = state.boxes.find(function(b) { return b.id === box.parentId; });
  return parent ? effectiveLocation(parent) : null;
}

// Promote a location string to a box.
// Finds all boxes whose location matches locationName (case-insensitive),
// reparents them under targetBox, and sets their location to null.
function promoteLocationToBox(locationName, targetBox) {
  var matched = state.boxes.filter(function(b) {
    return (b.location || '').toLowerCase() === locationName.toLowerCase();
  });

  if (matched.length === 0) {
    addBotMessage(
      '<p>No boxes found with location <strong>"' + locationName + '"</strong>.</p>'
    );
    return;
  }

  matched.forEach(function(b) {
    b.parentId  = targetBox.id;
    b.location  = null;
  });

  commitState();
  addBotMessage(
    '<p>Moved <strong>' + matched.length + ' box' + (matched.length !== 1 ? 'es' : '') +
    '</strong> from location <em>' + locationName + '</em> into <strong>"' + targetBox.name + '"</strong>.</p>'
  );
  setBoxOpenChips();
}

// Parse and execute a promote-location command.
// Accepts:
//   convert location <name>
//   convert location <name> to box
//   nest <name>              (only when name matches a location, not a box)
//   nest <name> in <loc>
function handlePromoteLocation(text) {
  var raw = text.trim();
  var lower = raw.toLowerCase();

  // Extract location name and optional parent location
  var locationName, inLocation;

  if (lower.startsWith('convert location ')) {
    locationName = raw.slice('convert location '.length)
      .replace(/\s+to\s+box\s*$/i, '').trim();
  } else if (lower.startsWith('nest ')) {
    var rest = raw.slice('nest '.length);
    var inIdx = rest.toLowerCase().lastIndexOf(' in ');
    if (inIdx !== -1) {
      locationName = rest.slice(0, inIdx).trim();
      inLocation   = rest.slice(inIdx + 4).trim();
    } else {
      locationName = rest.trim();
    }
  }

  if (!locationName) {
    addBotMessage(
      '<p>What location should I convert? Use: <em>convert location <name></em> or _nest <name>_.</p>'
    );
    return;
  }

  // Check location actually exists
  var matchedBoxes = state.boxes.filter(function(b) {
    return (b.location || '').toLowerCase() === locationName.toLowerCase();
  });
  if (matchedBoxes.length === 0) {
    addBotMessage(
      '<p>No boxes found with location <strong>"' + locationName +
      '"</strong>. Check the spelling.</p>'
    );
    return;
  }

  // Find existing box with that name, or create one
  var targetBox = state.boxes.find(function(b) {
    return b.name.toLowerCase() === locationName.toLowerCase() && !b.deleted_at;
  });

  if (targetBox) {
    // Box already exists — use it, confirm
    promoteLocationToBox(locationName, targetBox);
  } else {
    // Need to create the box — need a location for it
    var parentLocation = inLocation || null;

    if (!parentLocation) {
      // Try to infer from existing boxes at that location — use their nearest ancestor's location
      // Or prompt
      addBotMessage(
        'I\'ll create a box called **"' + locationName + '"** and move all ' +
        matchedBoxes.length + ' box' + (matchedBoxes.length !== 1 ? 'es' : '') + ' into it.\n\n' +
        'What location should **"' + locationName + '"** be in?'
      );
      state.pendingPromoteLocation = { locationName: locationName };
      state.conversationStage = 'AWAITING_PROMOTE_LOCATION';
      let locPrompt = locationPrompt();
      setChips(locPrompt.chips);
      return;
    }

    var newBox = {
      id:        uid(),
      name:      locationName,
      location:  parentLocation,
      parentId:  null,
      fate:      null,
      notes:     '',
      createdAt: new Date().toISOString(),
      items:     []
    };
    state.boxes.push(newBox);
    promoteLocationToBox(locationName, newBox);
  }
}

function handlePromoteLocationConfirm(text) {
  var pending = state.pendingPromoteLocation;
  if (!pending) { state.conversationStage = 'BOX_OPEN'; return; }

  var newBox = {
    id:        uid(),
    name:      pending.locationName,
    location:  text.trim() || 'unspecified',
    parentId:  null,
    fate:      null,
    notes:     '',
    createdAt: new Date().toISOString(),
    items:     []
  };
  state.boxes.push(newBox);
  state.pendingPromoteLocation = null;
  state.conversationStage = 'BOX_OPEN';
  promoteLocationToBox(pending.locationName, newBox);
}

function handleNest(text) {
  var box = activeBox();

  // Parse "put <child> inside/in/on <parent>" inline — works with or without active box
  var command = text.toLowerCase().trim();
  var insideIdx = command.indexOf(' inside ');
  if (insideIdx === -1) { insideIdx = command.indexOf(' in '); }
  if (insideIdx === -1) { insideIdx = command.indexOf(' on '); }
  if (insideIdx !== -1 && ['put', 'nest'].includes(command.split(' ')[0])) {
    var pfxLen = command.split(' ')[0] === 'put' ? 4 : 5;
    // find which preposition matched
    var prep = ' inside ';
    if (command.indexOf(' inside ') === -1) prep = command.indexOf(' in ') !== -1 ? ' in ' : ' on ';
    var splitIdx = command.indexOf(prep);
    var childName  = text.slice(pfxLen, splitIdx).trim();
    var parentName = text.slice(splitIdx + prep.length).trim();
    // Resolve child by name, fall back to active box
    var child = null;
    child = state.boxes.find((box) => box.name.toLowerCase() === childName.toLowerCase());
    if (!child && childName) {
      // partial match
      child = state.boxes.find((box) => box.name.toLowerCase().includes(childName.toLowerCase()));
    }
    if (!child) child = box; // fall back to active box
    if (!child) {
      addBotMessage('<p>Could not find a box named <strong>"' + childName + '"</strong>.</p>');
      return;
    }
    state.pendingNest = { childId: child.id };
    handleNestParent(parentName);
    return;
  }

  // Bare "nest" or "nest box" — needs an active box
  if (!box) {
    addBotMessage(
      '<p>No active box. Open a box first, then use <em>"nest"</em> to put it inside another.</p>'
    );
    return;
  }

  // "nest" or "nest box" — prompt for which child to nest (default active box)
  state.pendingNest = { childId: box.id };
  state.conversationStage = 'AWAITING_NEST_PARENT';
  var others = state.boxes.filter(function(b){
    return b.id !== box.id && getDescendantIds(box.id).indexOf(b.id) === -1;
  });
  if (others.length === 0) {
    addBotMessage(
      '<p>No other boxes to nest <strong>"' + box.name +
      '"</strong> inside. Create one first.</p>'
    );
    state.conversationStage = 'BOX_OPEN';
    return;
  }
  var chips = others.map(function(b){ return nestChipLabel(box, b); });
  addBotMessage('<p>Put <strong>"' + box.name + '"</strong> inside which box?</p>');
  setChips(chips);
}

function handleNestChild(text) {
  // Not currently reached via normal flow (nest always sets child first)
  // Kept for future "put X inside Y" where X is asked first
  state.conversationStage = 'AWAITING_NEST_PARENT';
  handleNest('nest');
}

function handleNestParent(text) {
  var nest = state.pendingNest;
  if (!nest) { state.conversationStage = 'BOX_OPEN'; return; }

  var command = text.toLowerCase().trim();
  // Strip location prefix from chip labels
  var namePart = command.indexOf(' · ') !== -1 ? command.slice(command.indexOf(' · ') + 3).trim() : command;

  var parent = null;
  // Search all boxes including the child itself so we can give a specific circular error
  parent = state.boxes.find((box) =>
    box.name.toLowerCase() === command || box.name.toLowerCase() === namePart
  ) || null;
  if (!parent) {
    parent = state.boxes.find((box) => box.name.toLowerCase().includes(namePart));
  }
  if (!parent) {
    addBotMessage(
      '<p>Could not find a box matching <strong>"' + text +
      '"</strong>. Try the full name.</p>'
    );
    return;
  }
  // Prevent circular nesting
  var descendants = getDescendantIds(nest.childId);
  if (parent.id === nest.childId || descendants.indexOf(parent.id) !== -1) {
    addBotMessage('Cannot nest a box inside itself or one of its children.');
    return;
  }

  var child = null;
  child = state.boxes.find((box) => box.id === nest.childId);
  if (!child) { state.pendingNest = null; state.conversationStage = 'BOX_OPEN'; return; }

  child.parentId = parent.id;
  child.location = parent.location; // inherit parent's location on nest
  state.pendingNest = null;
  state.conversationStage = 'BOX_OPEN';
  renderSidebar();
  updateContextBar();
  addBotMessage('<strong>"' + child.name + '"</strong> is now inside <strong>"' + parent.name + '"</strong>.');
  setBoxOpenChips();
}

// ── UPDATED RENDERSIDEBAR (tree-aware) ────────────────────────────────────────
// ── UPDATED DELETE GUARD ──────────────────────────────────────────────────────
// (handleDeleteBox already exists — we patch it below via replace)

// ── UPDATED DUMP WITH CHILDREN ────────────────────────────────────────────────
// (handleDumpTarget patched below)

function promoteItemToBox(item, parentBox) {
  // Check for name collision — a box with this name already exists at this location
  var locKey = (parentBox.location || '').toLowerCase();
  var collision = state.boxes.some(function(b) {
    return b.name.toLowerCase() === item.name.toLowerCase()
      && (b.location || '').toLowerCase() === locKey
      && b.id !== parentBox.id;
  });
  if (collision) {
    addBotMessage(
      '<p>A box called <strong>"' + item.name + '"</strong> already exists in <em>' + (parentBox.location || 'this location') + '</em>.' +
      ' Rename the item first, then promote it.</p>'
    );
    return;
  }

  // Build the new box, retaining the item's id and data
  var newBox = {
    id:        item.id,
    name:      item.name,
    location:  parentBox.location,
    parentId:  parentBox.id,
    fate:      item.fate,
    notes:     item.description
      ? item.notes + (item.notes ? '\n' : '') + item.description
      : item.notes,
    createdAt: item.createdAt || new Date().toISOString(),
    items:     []
  };

  // Soft-delete the item from its parent box
  item.deleted_at = new Date().toISOString();

  // Add the new box and select it
  state.boxes.push(newBox);
  state.activeBoxId = newBox.id;
  state.activeItemId = null;
  state.activeItemViewGroup = null;
  state.conversationStage = 'BOX_OPEN';
  commitState();

  var notesLine = newBox.notes ? '<p>Notes carried over: "' + newBox.notes + '".</p>' : '';
  addBotMessage(
    '<p><strong>"' + newBox.name + '"</strong> is now a box inside <strong>"' + parentBox.name + '"</strong>.</p>' +
    notesLine +
    '<p>Add its contents when you\'re ready.</p>'
  );
  setChips(['Add item', 'Review items', 'Back to ' + parentBox.name]);
}

function showItemDetail(group, groupIndex) {
  var box = activeBox();
  var lines = [];
  lines.push('<strong>' + (group.count > 1 ? group.count + ' × ' : '') + group.name + '</strong>');
  lines.push('Fate: ' + group.fate);
  if (group.notes) { lines.push('Notes: ' + group.notes); }

  state.conversationStage = 'AWAITING_ITEM_VIEW';
  state.activeItemViewGroup = groupIndex;
  addBotMessage('<p>' + lines.join('<br>') + '</p>');
  var actionChip = (group && group.fate === 'trash') ? 'Delete' : 'Trash';
  var chips = ['Change fate', 'Edit notes', actionChip, 'Move to box'];
  if (group && group.count === 1) { chips.push('Make it a box'); }
  chips.push('Back to list');
  setChips(chips);
}

function handleItemViewByNumber(num) {
  var box = activeBox();
  if (!box) { return; }
  var groups = groupItems(box.items);
  if (num < 1 || num > groups.length) {
    // Not a valid item number — treat as item name instead
    handleItemName(String(num), []);
    return;
  }
  showItemDetail(groups[num - 1], num - 1);
}

function handleItemViewAction(text) {
  var box = activeBox();
  var command = text.toLowerCase().trim();
  var groups = box ? groupItems(box.items) : [];
  var groupIdx = state.activeItemViewGroup || 0;
  var group = groups[groupIdx];

  if (command === 'back to list' || command === 'back') {
    state.conversationStage = 'BOX_OPEN';
    state.activeItemViewGroup = null;
    reviewBox();
    return;
  }
  if (command.startsWith('back to ')) {
    // Find the named box and select it
    var targetName = text.trim().slice(8); // preserve case
    var targetBox = state.boxes.find(function(b) {
      return b.name.toLowerCase() === targetName.toLowerCase();
    });
    if (targetBox) {
      state.activeBoxId = targetBox.id;
      state.activeItemId = null;
      state.activeItemViewGroup = null;
      state.conversationStage = 'BOX_OPEN';
      commitState();
      reviewBox();
    } else {
      state.conversationStage = 'BOX_OPEN';
      state.activeItemViewGroup = null;
      reviewBox();
    }
    return;
  }
  if (command === 'trash' || command === 'delete') {
    state.conversationStage = 'BOX_OPEN';
    state.activeItemViewGroup = null;
    if (command === 'delete' || (group && group.fate === 'trash')) {
      handleDeleteByNumber(groupIdx + 1);
    } else {
      handleTrashByNumber(groupIdx + 1);
    }
    return;
  }
  if (command === 'change fate') {
    if (!group) { state.conversationStage = 'BOX_OPEN'; return; }
    // Find first item in this group and set it as active
    let foundItem = box.items.find((item) => item.name === group.name && item.fate === group.fate);
    if (foundItem) {
      state.activeItemId = foundItem.id;
    }
    state.conversationStage = 'AWAITING_FATE';
    state.activeItemViewGroup = null;
    addBotMessage('<p>What should we do with <strong>' + group.name + '</strong>?</p>');
    setChips(FATE_TITLES);
    return;
  }
  if (command === 'move to box') {
    if (!group) { state.conversationStage = 'BOX_OPEN'; return; }
    state.conversationStage = 'AWAITING_ITEM_MOVE_TARGET';
    var boxNames = state.boxes
      .filter(function(b){ return b.id !== (box ? box.id : null); })
      .map(function(b){ return b.name; });
    addBotMessage('<p>Move <strong>' + group.name + '</strong> to which box?</p>');
    setChips(boxNames.concat(['Cancel']));
    return;
  }
  if (command === 'edit notes') {
    if (!group) { state.conversationStage = 'BOX_OPEN'; return; }
    state.conversationStage = 'AWAITING_ITEM_VIEW_NOTES';
    addBotMessage(
      '<p>Current notes: ' + (group.notes || '<em>none</em>') +
      '</p><p>Enter new notes for <strong>' + group.name + '</strong>:</p>'
    );
    setChips(['Clear notes', 'Cancel']);
    return;
  }
  if (command === 'make it a box') {
    if (!group || group.count !== 1) { state.conversationStage = 'BOX_OPEN'; return; }
    // Find the single item object for this group
    var itemToPromote = null;
    itemToPromote = box.items.find((item) =>
      item.name === group.name && item.fate === group.fate && !item.deleted_at
    ) || null;
    if (!itemToPromote) { state.conversationStage = 'BOX_OPEN'; return; }
    promoteItemToBox(itemToPromote, box);
    return;
  }

  // Fallback
  state.conversationStage = 'BOX_OPEN';
  state.activeItemViewGroup = null;
  reviewBox();
}

function handleItemViewNotes(text) {
  var box = activeBox();
  var command = text.toLowerCase().trim();
  var groups = box ? groupItems(box.items) : [];
  var groupIdx = state.activeItemViewGroup || 0;
  var group = groups[groupIdx];

  if (command === 'cancel') {
    state.conversationStage = 'AWAITING_ITEM_VIEW';
    showItemDetail(group, groupIdx);
    return;
  }
  if (group && box) {
    var newNotes = command === 'clear notes' ? '' : text.trim();
    box.items.forEach(function(it){
      if (it.name === group.name && it.fate === group.fate) { it.notes = newNotes; }
    });
    addBotMessage('Notes ' + (newNotes ? 'updated to: "' + newNotes + '"' : 'cleared') + '.');
    // Refresh group and show updated detail
    var newGroups = groupItems(box.items);
    state.conversationStage = 'AWAITING_ITEM_VIEW';
    showItemDetail(newGroups[groupIdx] || newGroups[0], groupIdx);
  } else {
    state.conversationStage = 'BOX_OPEN';
    state.activeItemViewGroup = null;
  }
}

function handleItemMoveTarget(text) {
  var command = text.toLowerCase().trim();
  var box = activeBox();
  var groups = box ? groupItems(box.items) : [];
  var groupIdx = state.activeItemViewGroup || 0;
  var group = groups[groupIdx];

  if (command === 'cancel') {
    if (group) {
      showItemDetail(group, groupIdx);
    } else {
      state.conversationStage = 'BOX_OPEN'; reviewBox();
    }
    return;
  }

  // Find target box by name (case-insensitive)
  var target = null;
  target = state.boxes.find((b) =>
    b.name.toLowerCase() === command && b.id !== (box ? box.id : null)
  ) || null;

  if (!target) {
    addBotMessage('Couldn\'t find a box named "' + text.trim() + '". Which box?');
    var boxNames = state.boxes
      .filter(function(b){ return b.id !== (box ? box.id : null); })
      .map(function(b){ return b.name; });
    setChips(boxNames.concat(['Cancel']));
    return;
  }

  if (!box || !group) { state.conversationStage = 'BOX_OPEN'; return; }

  // Move all items in the group from active box to target box
  var moved = [];
  var remaining = [];
  box.items.forEach(function(it) {
    if (it.name === group.name && it.fate === group.fate) {
      moved.push(it);
    } else {
      remaining.push(it);
    }
  });
  box.items = remaining;
  moved.forEach(function(it){ target.items.push(it); });

  var count = moved.length;
  var label = count > 1 ? count + ' × ' + group.name : '<strong>' + group.name + '</strong>';
  addBotMessage('<p>Moved ' + label + ' to <strong>' + target.name + '</strong>.</p>');
  state.activeItemViewGroup = null;
  state.conversationStage = 'BOX_OPEN';
  reviewBox();
}

// ── ITEM HELPERS ──────────────────────────────────────────────────────────────
// Single point of truth for item creation and deletion.
// Any behavior that should happen on every add or remove (budget, logging,
// soft deletion hooks) belongs here rather than at each call site.

function addItem(box, item) {
  box.items.push(item);
  _budgetItems = Math.max(0, _budgetItems - 1);
  updateBudgetDisplay();
  maybeMantraOnItem();
  return item;
}

function removeItem(box, itemId) {
  var before = box.items.length;
  box.items = box.items.filter(function(it){ return it.id !== itemId; });
  var removed = before - box.items.length;
  if (removed > 0) {
    _budgetItems = _budgetItems + removed;
    updateBudgetDisplay();
  }
  return removed;
}

// ── MANTRAS ───────────────────────────────────────────────────────────────────
// Shown on load (always), and occasionally at specific meaningful moments.
// Tone: west coast, burnout, hippie, vegan, American Buddhist.

const MANTRAS = {
  // ✅ copy approved
  load: [
    'Be here now.',
    'You have enough. You are enough.',
    'Make your future self thankful for the journey you started today.',
    'The present is a gift.',
    'Begin at the beginning.',
  ],
  // ✅ copy approved
  trashed: [
    'Everything has its moment. You have your lifetime.',
    'Less is more.',
    'Wherever you go, there you are.',
    'Go slow, but go.',
    'All that there is is this moment.',
  ],
  // 🔄 copy pending approval
  itemAdded: [
    'One thing. Then the next thing.',
    'You named it. That\'s already something.',
    'Presence is just paying attention to what\'s actually here.',
    'This is the practice.',
  ],
  // 🔄 copy pending approval
  boxDone: [
    'Done is a complete sentence.',
    'You showed up. That\'s most of it.',
    'Rest is part of the work.',
    'The whole is made of these small completions.',
    'Your past self left you this. Your future self will thank you.',
  ],
  // 🔄 copy pending approval
  sessionDone: [
    'Enough for today.',
    'The work will be here. So will you.',
    'Come back when you\'re ready.',
    'Good session. Seriously.',
    'Go slow, but go.',
  ],
};

let _mantraItemCount = 0; // increments on item add, triggers mantra every ~7
let _mantrasEnabled = (typeof window !== 'undefined'); // true in browser, false in Node

function mantra(context) {
  if (!_mantrasEnabled || typeof addBotMessage === 'undefined') { return; }
  var pool = MANTRAS[context] || MANTRAS.load;
  var text = pool[Math.floor(Math.random() * pool.length)];
  addBotMessage('<em>' + text + '</em>');
}

function maybeMantraOnItem() {
  return; // no-op until copy is approved.
  _mantraItemCount++;
  if (_mantraItemCount % 7 === 0) { mantra('itemAdded'); }
}

// ── TRASH / DISPOSAL HELPERS ──────────────────────────────────────────────────

function disposalPrompt(itemName) {
  var n = (itemName||'').toLowerCase();
  // Batteries — more accessible drop-offs than general e-waste
  if (n.match(/batter|aa|aaa|9v|lithium/)) {
    return 'Batteries can be dropped off at many libraries, hardware stores, or e-waste facilities' +
      ' ' + helpers.emoji.emDash + ' where will you take this?';
  }
  // E-waste
  var ewastePattern1 = /laptop|phone|computer|monitor|printer|cable|charger|keyboard|mouse|\btv\b/;
  var ewastePattern2 = /tablet|speaker|headphone|camera|router|hard drive|ssd|ram|cpu|gpu/;
  if (n.match(ewastePattern1) || n.match(ewastePattern2)) {
    return 'E-waste needs a special drop-off ' + helpers.emoji.emDash + ' where will you take it?';
  }
  // Clothing / textiles
  if (n.match(/shirt|dress|coat|shoe|jacket|jean|trouser|pant|sock|underwear|fabric|textile|cloth|scarf|hat|glove/)) {
    return 'Clothing can be donated or textile-recycled ' + helpers.emoji.emDash + ' where will you drop this off?';
  }
  // Hazardous / chemicals
  if (n.match(/paint|bleach|oil|chemical|pesticide|solvent|cleaner|acid|flammable|hazard/)) {
    return 'Hazardous material ' + helpers.emoji.emDash + ' where can you safely dispose of this?';
  }
  // Generic fallback
  return 'Where can this be safely disposed of?';
}

function deletionLog(itemName) {
  // Track daily count
  var today = new Date().toDateString();
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem('declutterbot_daily_deleted')); } catch(e){}
  if (!stored || stored.date !== today) { stored = { date: today, count: 0 }; }
  stored.count++;
  try { localStorage.setItem('declutterbot_daily_deleted', JSON.stringify(stored)); } catch(e){}
  sessionDeletedCount++;
  var todayCount = stored.count;
  var parts = [todayCount + ' deleted today'];
  if (sessionDeletedCount !== todayCount) { parts.push(sessionDeletedCount + ' this session'); }
  return '<p>' + helpers.emoji.trashBin + ' Deleted <strong>' + itemName + '</strong>. ' + parts.join(', ') + '.</p>';
}

function deleteActiveItem() {
  var box = activeBox();
  var item = activeItem();
  if (!box || !item) { state.conversationStage = 'BOX_OPEN'; return; }
  var name = item.name;
  item.deleted_at = new Date().toISOString(); // soft delete
  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';
  _budgetItems = _budgetItems + 1; updateBudgetDisplay();
  addBotMessage(deletionLog(name));
  if (Math.random() < 0.25) mantra('trashed');
  if (state.pendingFateReview && state.pendingFateReview._resumeAfterTrash) {
    state.pendingFateReview._resumeAfterTrash = false;
    state.pendingFateReview.index++;
    showFateReviewCurrentItem(state.pendingFateReview);
    return;
  }
  if (state._reviewingBox) {
    state._reviewingBox = false;
    reviewBox();
    return;
  }
  setBoxOpenChips();
}

function trashAllItems(box) {
  if (!box) { return 0; }
  var count = 0;
  box.items.forEach(function(item) {
    if (!item.deleted_at) { item.fate = 'trash'; count++; }
  });
  return count;
}

function deleteAllItems(box) {
  if (!box) { return 0; }
  var count = 0;
  box.items.forEach(function(item) {
    if (!item.deleted_at) { item.deleted_at = new Date().toISOString(); count++; }
  });
  _budgetItems = _budgetItems + count;
  updateBudgetDisplay();
  return count;
}

function handleTrashAll() {
  var box = activeBox();
  if (!box) { state.conversationStage = 'BOX_OPEN'; return; }
  var items = helpers.activeItems(box);
  if (items.length === 0) {
    addBotMessage('No items to trash.');
    reviewBox();
    return;
  }
  state.conversationStage = 'AWAITING_TRASH_ALL_CONFIRM';
  addBotMessage('<p>Delete all <strong>' + items.length + '</strong> item(s)?</p>');
  setChips(['Yes', 'No']);
}

function handleTrashAllConfirm(text) {
  var command = text.toLowerCase().trim();
  var box = activeBox();
  if (!box) { state.conversationStage = 'BOX_OPEN'; return; }
  var items = helpers.activeItems(box);

  if (command === 'yes' || command === 'y') {
    // Mark all active items as trash
    trashAllItems(box);
    var trashCount = items.length;
    state.conversationStage = 'AWAITING_DELETE_TRASHED_CONFIRM';
    addBotMessage(
      '<p>Marked <strong>' + trashCount +
      '</strong> item(s) as trash.</p><p>Delete all trashed items in this box?</p>'
    );
    setChips(['Yes', 'No']);
  } else {
    state.conversationStage = 'BOX_OPEN';
    reviewBox();
  }
}

function handleDeleteTrashedConfirm(text) {
  var command = text.toLowerCase().trim();
  var box = activeBox();
  if (!box) { state.conversationStage = 'BOX_OPEN'; return; }

  if (command === 'yes' || command === 'y') {
    var deletedCount = deleteAllItems(box);
    var summary = '<p>Deleted <strong>' + deletedCount + '</strong> item(s).</p>';
    addBotMessage(summary);
    state.conversationStage = 'AWAITING_DELETE_BOX_AFTER_TRASH_ALL';
    addBotMessage('Delete the empty box "' + box.name + '" too?');
    setChips(['Yes', 'No']);
  } else {
    state.conversationStage = 'BOX_OPEN';
    addBotMessage('Items marked as trash but not deleted.');
    reviewBox();
  }
}

function handleDeleteBoxAfterTrashAllConfirm(text) {
  var command = text.toLowerCase().trim();
  var box = activeBox();
  if (!box) { state.conversationStage = 'BOX_OPEN'; return; }
  var boxName = box.name;

  if (command === 'yes' || command === 'y') {
    var parentId = box.parentId;
    var summary = 'Deleted the empty box "' + boxName + '".';
    addBotMessage(summary);
    state.boxes = state.boxes.filter(function(b) { return b.id !== box.id; });
    state.activeBoxId = null;

    if (parentId) {
      var parent = state.boxes.find(function(b) { return b.id === parentId; });
      if (parent) {
        state.activeBoxId = parent.id;
        reviewBox();
      } else {
        state.conversationStage = 'BOX_REVIEW';
        renderSidebar();
        handleFinished('');
      }
    } else {
      state.conversationStage = 'BOX_REVIEW';
      renderSidebar();
      handleFinished('');
    }
  } else {
    var summary = 'Kept the box "' + boxName + '".';
    addBotMessage(summary);
    state.conversationStage = 'BOX_OPEN';
    reviewBox();
  }
}


function handleTrashDelete(text) {
  var command = text.toLowerCase().trim();
  var item = activeItem();
  if (!item) { state.conversationStage = 'BOX_OPEN'; return; }

  if (command === 'yes' || command === 'y') {
    deleteActiveItem();
    return;
  }
  if (command === 'always this session' || command === 'always') {
    sessionTrashPreference = 'always';
    deleteActiveItem();
    return;
  }
  if (command === 'always for this box') {
    if (activeBox()) boxTrashPreferences[activeBox().id] = 'always';
    deleteActiveItem();
    return;
  }
  if (command === 'never this session' || command === 'never') {
    sessionTrashPreference = 'never';
  }
  if (command === 'never for this box') {
    if (activeBox()) boxTrashPreferences[activeBox().id] = 'never';
  }
  // No or Never — ask for disposal note
  addBotMessage(disposalPrompt(item.name));
  state.conversationStage = 'AWAITING_DISPOSAL';
  setChips(['Skip disposal note', 'Done with this box']);
}

function handleDisposal(text) {
  var command = text.toLowerCase().trim();
  var item = activeItem();
  var skipping = command === 'skip disposal note' || command === 'skip';
  var box = activeBox();

  state.activeItemId = null;
  if (!skipping && item && text.trim()) {
    var note = 'Safely dispose at: ' + text.trim();
    item.notes = item.notes ? item.notes + '. ' + note : note;
  }
  if (state.pendingFateReview &&
      (state.pendingFateReview._resumeAfterDisposal || state.pendingFateReview._resumeAfterTrash)) {
    state.pendingFateReview._resumeAfterDisposal = false;
    state.pendingFateReview._resumeAfterTrash = false;
    state.pendingFateReview.index++;
    showFateReviewCurrentItem(state.pendingFateReview);
    return;
  }
  state.conversationStage = 'BOX_OPEN';
  if (state._reviewingBox) {
    state._reviewingBox = false;
    reviewBox();
    return;
  }
  var botMsg = skipping ?
    '<p>Kept <strong>' + (item ? item.name : 'item') + '</strong> in "' + (box ? box.name : 'box') + '".</p>' +
    '<p>What\'s the next item?</p>' :
    '<p>Noted. What\'s the next item?</p>'
  addBotMessage(botMsg);
  setBoxOpenChips();
}

// ── FATE REVIEW ───────────────────────────────────────────────────────────────

function buildFateReviewPath(box) {
  var path = [box.name];
  var current = box;
  var safety = 0;
  while (current.parentId && safety < 10) {
    let parent = state.boxes.find((box) => box.id === current.parentId);
    if (!parent) { break; }
    path.unshift(parent.name);
    current = parent;
    safety++;
  }
  return path.join(' > ');
}

function collectFateItems(fate) {
  return state.boxes.flatMap((box) => {
    let boxPath = buildFateReviewPath(box);
    return box.items
      .filter((item) => item.fate === fate)
      .map((item) => ({
        itemId: item.id,
        boxId: box.id,
        itemName: item.name,
        boxPath: boxPath
      }));
  });
}

function addInformationChips(fate) {
  const infoChips = {
    keep:   ['Add to kit'],
    donate: ['Add donation destination'],
    sell:   ['Add selling notes'],
    trash:  ['Delete', 'Disposal note'],
    unsure: []
  };
  return infoChips[fate] || [];
}

function fateReviewChips(fate) {
  var chips = FATE_TITLES.filter(t => t !== titleize(fate));
  return chips.concat(addInformationChips(fate)).concat('Skip');
}

function fateReviewBulkChips(fate) {
  switch (fate) {
    case 'trash':  return ['Delete all', 'Move all to unsure', 'Cancel'];
    case 'return': return ['Mark all keep', 'Mark all unsure', 'Cancel'];
    case 'unsure': return ['Mark all keep', 'Mark all donate', 'Mark all trash', 'Mark all sell', 'Cancel'];
    case 'sell':   return ['Mark all donate', 'Cancel'];
    case 'donate': return ['Mark all sell', 'Cancel'];
    case 'keep':   return ['Cancel'];
    default:       return ['Cancel'];
  }
}

function showFateReviewList(review) {
  var lines = '<p>Items marked <strong>' + review.fate + '</strong> (' + review.items.length + '):</p><p>';
  lines += review.items.map((entry, index) =>
    (index + 1) + '. <strong>' + entry.itemName + '</strong> (' + entry.boxPath + ')'
  ).join('</br>') + '</p>';
  addBotMessage(lines + '<p>What would you like to do?</p>');
  setChips(['Item by item', 'Bulk action', 'Back']);
  state.conversationStage = 'AWAITING_FATE_REVIEW_ACTION';
}

function handleFateReviewMenu() {
  let fateCounts = {};
  state.boxes.forEach((box) => {
    box.items.forEach((item) => fateCounts[item.fate] = (fateCounts[item.fate] || 0) + 1);
  });

  let chips = FATES.slice().reverse()
    .filter((fate) => fateCounts[fate])
    .map((fate) => 'Review ' + fate + ' (' + fateCounts[fate] + ')');

  if (chips.length === 0) {
    addBotMessage('No items logged yet.');
    return;
  }
  // Set stage so Back chip is handled correctly regardless of prior stage
  state.conversationStage = 'AWAITING_FATE_REVIEW_ACTION';
  addBotMessage('Which fate would you like to review?');
  setChips(chips.concat(['Back']));
}

function handleFateReview(fate) {
  var cleanFate = fate.replace(/\s*\(\d+\)$/, '').trim().toLowerCase();
  if (cleanFate.startsWith('review ')) cleanFate = cleanFate.slice(7).trim();
  var items = collectFateItems(cleanFate);
  if (items.length === 0) {
    addBotMessage(
      '<p>No items marked <strong>' + cleanFate + '</strong> in your inventory.</p>'
    );
    return;
  }
  state.pendingFateReview = { fate: cleanFate, items: items, index: 0, reviewedCount: 0 };
  if (items.length === 1) {
    showFateReviewCurrentItem(state.pendingFateReview);
    return;
  }
  showFateReviewList(state.pendingFateReview);
}

function handleFateReviewAction(text) {
  var command = text.toLowerCase().trim();
  var review = state.pendingFateReview;

  // Handle back/cancel before null guard — menu shows Back without pendingFateReview set
  if (command === 'back' || command === 'cancel') {
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    if (review) { addBotMessage('Fate review cancelled.'); }
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  if (!review) { state.conversationStage = 'BOX_OPEN'; return; }
  // Number input from list: jump directly to that item
  if (/^\d+$/.test(command)) {
    var jumpIdx = parseInt(command, 10) - 1;
    if (jumpIdx >= 0 && jumpIdx < review.items.length) {
      review.index = jumpIdx;
      showFateReviewCurrentItem(review);
    } else {
      addBotMessage('No item ' + command + ' in the list.');
      setChips(['Item by item', 'Bulk action', 'Back']);
    }
    return;
  }
  if (command === 'item by item') {
    review.index = 0;
    showFateReviewCurrentItem(review);
    return;
  }
  if (command === 'bulk action') {
    state.conversationStage = 'AWAITING_FATE_REVIEW_BULK';
    addBotMessage(
      '<p>Apply a bulk action to all <strong>' + review.fate +
      '</strong> items (' + review.items.length + ')?</p>'
    );
    setChips(fateReviewBulkChips(review.fate));
    return;
  }
  if (command.startsWith('review ')) { handleFateReview(command.slice(7)); return; }
  handleFreeform(text, []);
}

function showFateReviewCurrentItem(review) {
  if (review.index >= review.items.length) {
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage('<p>Done reviewing all <strong>' + review.fate + '</strong> items.</p>');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }
  let entry = review.items[review.index];
  let item = null;
  let targetBox = state.boxes.find((box) => box.id === entry.boxId);
  if (targetBox) {
    item = targetBox.items.find((i) => i.id === entry.itemId);
  }
  if (!item) {
    review.index++;
    showFateReviewCurrentItem(review);
    return;
  }
  var progress = (review.index + 1) + ' of ' + review.items.length;
  var msg = '<p><strong>' + item.name + '</strong> (' + entry.boxPath + ') [' + progress + ']';
  if (item.notes) { msg += '</br>Notes: ' + item.notes; }
  msg += '</p><p>What would you like to do with this one?</p>';
  addBotMessage(msg);
  setChips(fateReviewChips(review.fate).concat(['Done reviewing']));
  state.conversationStage = 'AWAITING_FATE_REVIEW_ITEM';
}

function handleFateReviewItem(text) {
  var command = text.toLowerCase().trim();
  var review = state.pendingFateReview;
  if (!review) { state.conversationStage = 'BOX_OPEN'; return; }

  var entry = review.items[review.index];
  let box = null, item = null;
  box = state.boxes.find((b) => b.id === entry.boxId);
  if (box) {
    item = box.items.find((i) => i.id === entry.itemId);
  }

  if (command === 'done reviewing') {
    var reviewed = review.reviewedCount || 0;
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage('Stopped reviewing. ' + reviewed + ' of ' + review.items.length + ' items have been changed.');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  // skip does not increment reviewedCount
  if (command === 'skip') { review.index++; showFateReviewCurrentItem(review); return; }

  // Fate changes
  var newFate = null;
  if (command === 'keep') { newFate = 'keep'; }
  if (command === 'donate' || command === 'mark as donate') { newFate = 'donate'; }
  if (command === 'sell'   || command === 'mark as sell') { newFate = 'sell'; }
  if (command === 'move to unsure') { newFate = 'unsure'; }

  if (newFate && item) {
    item.fate = newFate;
    addBotMessage(
      '<p>Updated <strong>' + item.name + '</strong> to <strong>' +
      newFate + '</strong>.</p>'
    );
    review.index++;
    review.reviewedCount = (review.reviewedCount || 0) + 1;
    showFateReviewCurrentItem(review);
    return;
  }

  if (command === 'trash' && item) {
    item.fate = 'trash';
    state.activeItemId = item.id;
    state.activeBoxId = entry.boxId;
    var effPref = (boxTrashPreferences[entry.boxId]) || sessionTrashPreference;
    if (effPref === 'always') {
      deleteActiveItem();
      review.index++;
      showFateReviewCurrentItem(review);
      return;
    }
    if (effPref === 'never') {
      addBotMessage(disposalPrompt(item.name));
      state.conversationStage = 'AWAITING_DISPOSAL';
      setChips(['Skip disposal note', 'Done reviewing']);
      state.pendingFateReview._resumeAfterTrash = true;
      return;
    }
    addBotMessage(helpers.emoji.trashBin + ' <strong>' + item.name + '</strong> ' + helpers.emoji.emDash + ' delete now?');
    state.conversationStage = 'AWAITING_TRASH_DELETE';
    setChips(['Yes', 'No', 'Always this session', 'Never this session', 'Always for this box', 'Never for this box']);
    state.pendingFateReview._resumeAfterTrash = true;
    return;
  }

  if (command === 'delete' && item && box) {
    removeItem(box, item.id);
    addBotMessage(deletionLog(item.name));
    review.index++;
    review.reviewedCount = (review.reviewedCount || 0) + 1;
    showFateReviewCurrentItem(review);
    return;
  }

  if (command === 'disposal note' && item) {
    addBotMessage(disposalPrompt(item.name));
    state.activeItemId = item.id;
    state.activeBoxId = entry.boxId;
    state.conversationStage = 'AWAITING_DISPOSAL';
    setChips(['Skip disposal note', 'Done reviewing']);
    state.pendingFateReview._resumeAfterDisposal = true;
    return;
  }

  if ((command === 'add selling notes' || command === 'add donation destination') && item) {
    addBotMessage('<p>Enter notes for <strong>' + item.name + '</strong>:</p>');
    state.pendingFateReview._awaitingNotes = true;
    return;
  }

  if (review._awaitingNotes && item) {
    item.notes = item.notes ? item.notes + '. ' + text.trim() : text.trim();
    review._awaitingNotes = false;
    addBotMessage('Notes updated.');
    review.index++;
    review.reviewedCount = (review.reviewedCount || 0) + 1;
    showFateReviewCurrentItem(review);
    return;
  }

  if (command === 'change fate') {
    state.activeItemId = item.id;
    state.activeBoxId = entry.boxId;
    state.conversationStage = 'AWAITING_FATE';
    addBotMessage('<p>What should we do with <strong>' + item.name + '</strong>?</p>');
    setChips(['Trash', 'Return', 'Sell', 'Keep', 'Donate', 'Unsure']);
    state.pendingFateReview._resumeAfterFate = true;
    return;
  }

  if (command === 'add to kit') {
    addBotMessage('Kit assembly is on the punchlist ' + helpers.emoji.emDash + ' coming soon!');
    review.index++;
    showFateReviewCurrentItem(review);
    return;
  }

  showFateReviewCurrentItem(review);
}

function handleFateReviewBulk(text) {
  var command = text.toLowerCase().trim();
  var review = state.pendingFateReview;
  if (!review) { state.conversationStage = 'BOX_OPEN'; return; }

  if (command === 'cancel') { showFateReviewList(review); return; }

  let newFate;
  if (command === 'mark all keep')    { newFate = 'keep'; }
  if (command === 'mark all donate')  { newFate = 'donate'; }
  if (command === 'mark all trash')   { newFate = 'trash'; }
  if (command === 'mark all sell')    { newFate = 'sell'; }
  if (command === 'mark all return')  { newFate = 'return'; }
  if (command === 'mark all unsure')  { newFate = 'unsure'; }

  if (newFate) {
    let items = review.items
      .flatMap((reviewEntry) => {
        let box = state.boxes.find((b) => b.id === reviewEntry.boxId);
        let item = box ? box.items.find((i) => i.id === reviewEntry.itemId) : null;
        return item ? [item] : [];
      });

    items.forEach((item) => { item.fate = newFate; });

    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage(
      '<p>Updated <strong>' + items.length + '</strong> items to <strong>' +
      newFate + '</strong>.</p>'
    );
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  if (command === 'delete all') {
    // removeItem returns 1 when the item was removed, 0 otherwise,
    // so this deletes the items and generates the count in one pass.
    let deleteCount = review.items.reduce((sum, reviewEntry) => {
      let box = state.boxes.find((b) => b.id === reviewEntry.boxId);
      return sum + (box ? removeItem(box, reviewEntry.itemId) : 0);
    }, 0);
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage(
      '<p>' + deletionLog(deleteCount + ' items') + ' All <strong>' + review.fate
      + '</strong> items deleted.</p>'
    );
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  if (command === 'move all to unsure') {
    let items = review.items
      .flatMap((reviewEntry) => {
        let box = state.boxes.find((b) => b.id === reviewEntry.boxId);
        let item = box ? box.items.find((i) => i.id === reviewEntry.itemId) : null;
        return item ? [item] : [];
      });

    items.forEach((item) => { item.fate = 'unsure'; });
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage('<p>Moved <strong>' + items.length + '</strong> items to unsure.</p>');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  addBotMessage(
    '<p>Apply a bulk action to all <strong>' + review.fate +
    '</strong> items (' + review.items.length + ')?</p>'
  );
  setChips(fateReviewBulkChips(review.fate));
}

// ── SIDEBAR DRAG TO REORDER ───────────────────────────────────────────────────
// Order is session-only — not persisted. When the location model lands,
// this will be replaced with within-room drag ordering backed by state.
// The app does not promise to remember everything, just what matters.
// _dragSrcId is declared at module scope because initSidebarDrag uses event delegation with separate dragstart,
// dragover, and drop listeners that need to share the dragged element's id across events. It has to live outside the
// function so all three handlers can read and write it.
let _dragSrcId = null;

function initSidebarDrag() {
  if (typeof document === 'undefined') { return; }
  var sidebar = document.getElementById('sidebar-content');
  if (!sidebar) { return; }

  sidebar.addEventListener('dragstart', function(e) {
    let targetCard = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (!targetCard) { return; }
    _dragSrcId = targetCard.getAttribute('data-box-id');
    targetCard.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  });

  sidebar.addEventListener('dragend', function(e) {
    let targetCard = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (targetCard) { targetCard.style.opacity = ''; }
    // Remove all drag-over highlights
    let cards = Array.from(sidebar.querySelectorAll('[data-box-id]'));
    cards.forEach((card) => card.classList.remove('drag-over'));
  });

  sidebar.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var targetCard = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (!targetCard || targetCard.getAttribute('data-box-id') === _dragSrcId) return;
    let cards = Array.from(sidebar.querySelectorAll('[data-box-id]'));
    cards.forEach((card) => card.classList.remove('drag-over'));
    targetCard.classList.add('drag-over');
  });

  sidebar.addEventListener('drop', function(e) {
    e.preventDefault();
    var targetCard = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (!targetCard) { return; }
    var targetId = targetCard.getAttribute('data-box-id');
    if (!targetId || targetId === _dragSrcId) { return; }

    // Find source and target in state.boxes and reorder
    let sourceBox = state.boxes.find((box) => box.id === _dragSrcId);
    let targetBox = state.boxes.find((box) => box.id === targetId);
    let sourceIndex = sourceBox ? state.boxes.indexOf(sourceBox) : false;
    let targetIndex = targetBox ? state.boxes.indexOf(targetBox) : false;
    if ([sourceIndex, targetIndex].includes(false)) { return; }

    // Only reorder within the same parent level
    let sourceParent = state.boxes[sourceIndex].parentId || null;
    let targetParent = state.boxes[targetIndex].parentId || null;
    if (sourceParent !== targetParent) { return; }

    let moved = state.boxes.splice(sourceIndex, 1)[0];
    // Recalculate targetIndex after splice
    let targetBoxAfterSplice = state.boxes.find((box) => box.id === targetId);
    targetIndex = targetBoxAfterSplice ? state.boxes.indexOf(targetBoxAfterSplice) : -1;
    state.boxes.splice(targetIndex, 0, moved);
    renderSidebar();
    _dragSrcId = null;
  });
}

// Export core globals for Node.js testing
if (typeof module !== 'undefined') {
  module.exports = { state, FATES, LETTERS, uid, activeBox, activeItem, helpers, countFates, countFatesDeep,
    processInput, handleMove, handleBatchConfirm, handleBatchQty,
    commitBatch, handleFate, handleItemNotes, handleItemName, parseItemEntry,
    processMultilineItems,
    handleBoxName, handleBoxBatchConfirm, handleBoxBatchQty, handleBoxBatchLocation,
    singularize, singularizeLast, handleLocation, startNewBox, doneWithBox, reviewBox,
    recentLocations, locationPrompt,
    handleDeleteBox, handleDeleteBoxConfirm, handleDump, handleDumpTarget,
    groupItems, boxSummaryLine,
    handleNest, handleNestParent, getDescendantIds, childBoxes,
    renderBoxTree, sameProximity, locSegments,
    handleItemViewByNumber, handleItemViewAction, handleItemViewNotes, showItemDetail,
    promoteItemToBox, renderReviewLines,
    effectiveLocation, promoteLocationToBox, handlePromoteLocation,
    handleItemMoveTarget,
    addItem, removeItem,
    getBudgetItems: function(){ return _budgetItems; },
    mantra,
    MANTRAS,
    handleFinished,
    handleDeleteEmptyBox,
    handleEllipticalDeleteEmptyBox,
    maybeMantraOnItem,
    setMantrasEnabled: function(v){ _mantrasEnabled = v; },
    getMantrasEnabled: function(){ return _mantrasEnabled; },
    selectBox, toggleCollapse, toggleLocationCollapse,
    setLocationFilter, clearLocationFilter,
    renderBoxCard,
    inputHistory, historyDraft, getHistoryIndex: function(){ return historyIndex; },
    setHistoryIndex: function(v){ historyIndex = v; },
    handleKey,
    clearAll, handleResetConfirm, _doReset,
    importJSON,
    importCSV,
    handleHelp,
    saveState,
    setBoxOpenChips,
    updateContextBar,
    helpers,
    escapeCSV,
    exportCSV,
    parseCSV,
    parseCSVLine,
    escAttr,
    disposalPrompt, deletionLog, deleteActiveItem,
    trashAllItems, deleteAllItems, handleTrashAll, handleTrashAllConfirm, handleDeleteTrashedConfirm, handleDeleteBoxAfterTrashAllConfirm,
    handleTrashDelete, handleDisposal, handleTrashByNumber, handleDeleteByNumber,
    getBoxTrashPreferences: function(){ return boxTrashPreferences; },
    getSessionTrashPreference: function(){ return sessionTrashPreference; },
    setSessionTrashPreference: function(v){ sessionTrashPreference = v; },
    getSessionDeletedCount: function(){ return sessionDeletedCount; },
    resetSessionCounts: function(){ sessionDeletedCount=0; sessionTrashPreference=null; },
    _setChipsImpl: _setChipsImpl, _chipClickImpl: _chipClickImpl,
    _addBotMessageImpl: _addBotMessageImpl, _addUserMessageImpl: _addUserMessageImpl,
    handleFateReview: handleFateReview, handleFateReviewAction: handleFateReviewAction,
    handleFateReviewItem: handleFateReviewItem, handleFateReviewBulk: handleFateReviewBulk,
    showFateReviewList: showFateReviewList, collectFateItems: collectFateItems,
    buildFateReviewPath: buildFateReviewPath, handleFateReviewMenu: handleFateReviewMenu,
    fateReviewChips: fateReviewChips,
    showFateReviewCurrentItem: showFateReviewCurrentItem };
}
