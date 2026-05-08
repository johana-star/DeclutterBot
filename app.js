// app.js — DeclutterBot core logic
// DOM-touching functions (addBotMessage, setChips, renderSidebar, etc.)
// are expected to be defined globally or stubbed before this file runs.

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
};
const FATES = ['keep','donate','sell','unsure','trash'];
function titleize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
const FATE_TITLES = FATES.map(titleize);
let collapsedBoxIds = [];
let sessionDeletedCount = 0;
let sessionTrashPreference = null; // null | 'always' | 'never'
let boxTrashPreferences = {}; // boxId -> 'always' | 'never'
function toggleCollapse(id) {
  var idx = collapsedBoxIds.indexOf(id);
  var collapsing = idx === -1;
  if (collapsing) collapsedBoxIds.push(id);
  else collapsedBoxIds.splice(idx, 1);
  var box = null;
  for (var i = 0; i < state.boxes.length; i++) {
    if (state.boxes[i].id === id) { box = state.boxes[i]; break; }
  }
  if (box) addUserMessage((collapsing ? 'collapse ' : 'expand ') + box.name, []);
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
          '**Storage full.** Delete items marked **trash** to continue, or export your inventory.' +
          '\n\nState is saved in memory until you refresh the page.'
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
    // Normalise parentId: undefined -> null for boxes saved before nesting was added
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].parentId === undefined) state.boxes[i].parentId = null;
    }
  } catch(e) {} }
}

function commitState() {
  saveState();
  renderSidebar();
  updateContextBar();
}

function uid() { return Math.random().toString(36).slice(2,9); }
function activeBox() {
  return state.boxes.find(function(box) { return box.id === state.activeBoxId; }) || null;
}
function activeItem() {
  var box = activeBox();
  if (!box || !state.activeItemId) return null;
  return box.items.find(function(item) { return item.id === state.activeItemId; }) || null;
}
function countFates(box) {
  var activeItems = box.items.filter(function(item) { return !item.deleted_at; });
  return activeItems.reduce(function(counts, item) {
    counts[item.fate] = (counts[item.fate] || 0) + 1;
    return counts;
  }, {});
}

function renderSidebar() {
  var el = document.getElementById('sidebar-content');
  var cnt = document.getElementById('box-count');
  cnt.textContent = state.boxes.length + ' box' + (state.boxes.length !== 1 ? 'es' : '');
  if (state.boxes.length===0) {
    el.innerHTML = '<div class="empty-sidebar">No boxes yet.<br/>Start chatting to<br/>begin sorting.</div>';
    return;
  }
  el.innerHTML = renderBoxTree(null, 0, collapsedBoxIds);
}

function renderBoxTree(boxId, depth, collapsedIds) {
  var html = '';
  // Treat undefined parentId same as null — boxes created before parentId was added
  var children = state.boxes.filter(function(b){
    var pid = (b.parentId == null) ? null : b.parentId;
    return pid === boxId;
  });
  for (var i = 0; i < children.length; i++) {
    var box = children[i];
    var fates = countFates(box);
    var tags = '';
    for (var j = 0; j < FATES.length; j++) {
      var f = FATES[j];
      if (fates[f] > 0) tags += '<span class="tag tag-' + f + '">' + f + ' ' + fates[f] + '</span>';
    }
    var total = box.items.filter(function(it) { return !it.deleted_at; }).length;
    var kidBoxes = state.boxes.filter(function(b){ return b.parentId === box.id; });
    var hasKids = kidBoxes.length > 0;
    var isCollapsed = collapsedIds && collapsedIds.indexOf(box.id) !== -1;
    var ac = box.id === state.activeBoxId ? ' active' : '';
    var indent = depth * 16;
    var caret = hasKids
      ? '<button class="sidebar-caret" onclick="event.stopPropagation();toggleCollapse(\'' + box.id + '\')">'
        + (isCollapsed ? '&#9654;' : '&#9660;') + '</button>'
      : '<span class="sidebar-caret-spacer"></span>';
    // Meta line: show own items + child box count if any
    var metaParts = [];
    if (total > 0) metaParts.push(total + ' item' + (total !== 1 ? 's' : ''));
    if (hasKids) metaParts.push(kidBoxes.length + ' box' + (kidBoxes.length !== 1 ? 'es' : ''));
    if (metaParts.length === 0) metaParts.push('empty');
    var metaStr = escHtml(box.location || 'location unknown') + ' &middot; ' + metaParts.join(', ');
    html += '<div class="box-card' + ac + '" draggable="true" data-box-id="' + box.id + '"'
      + ' style="margin-left:' + indent + 'px" onclick="selectBox(\'' + box.id + '\')">'
      + '<div class="box-card-header">' + caret
      + '<div class="box-card-body">'
      + '<div class="box-name">' + escHtml(box.name) + '</div>'
      + '<div class="box-meta">' + metaStr + '</div>'
      + (tags ? '<div class="box-counts">' + tags + '</div>' : '')
      + '</div></div></div>';
    if (!isCollapsed) {
      html += renderBoxTree(box.id, depth + 1, collapsedIds);
    }
  }
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
    if (inputHistory.length > 100) inputHistory.shift();
  }
  var summary = box.items.length > 0 ? boxSummaryLine(box) : 'empty';
  addBotMessage('Switched to **' + box.name + '**. Contents: ' + summary + '.\n\nWhat would you like to do?');
  setBoxOpenChips();
}

function updateContextBar() {
  var box = activeBox();
  var dot = document.getElementById('context-dot');
  var label = document.getElementById('context-label');
  if (box) {
    dot.style.background = '#6b8c6b';
    var item = activeItem();
    label.textContent = item
      ? 'Box: '+box.name+'  \u2192  Item: '+item.name
      : 'Active box: '+box.name+'  \u00b7  '+box.items.length+' items';
  } else {
    dot.style.background = '#c4a882';
    label.textContent = state.boxes.length === 0
      ? 'No active box \u2014 say hi to get started'
      : 'No active box \u2014 type "help" or "?" for commands';
  }
}

function updateBudgetDisplay(recalculating) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('storage-budget');
  if (!el) return;
  if (recalculating) {
    el.textContent = 'recalculating...';
    if (el.classList) el.classList.add('budget-recalculating');
    el.style.color = '';
    return;
  }
  if (el.classList) el.classList.remove('budget-recalculating');
  el.textContent = 'capacity: ' + _budgetItems.toLocaleString() + ' items';
  el.style.opacity = _budgetItems < 1000 ? '1' : '0.6';
  el.style.color = _budgetItems < 500 ? 'var(--rust)' : '';
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function renderMarkdown(s) {
  return s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/_(.+?)_/g,'<em>$1</em>').replace(/\n/g,'<br/>');
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
  if (!msgs) return;
  var div = document.createElement('div');
  div.className = 'msg bot';
  div.innerHTML = '<div class="msg-avatar">S</div><div class="msg-bubble"><p>'+renderMarkdown(text)+'</p></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function addUserMessage(text, photos) {
  var msgs = typeof document !== 'undefined' && document.getElementById('chat-messages');
  if (!msgs) return;
  var div = document.createElement('div');
  div.className = 'msg user';
  div.innerHTML = '<div class="msg-avatar">You</div><div class="msg-bubble"><p>'+escHtml(text)+'</p></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function _setChipsImpl(chips) {
  if (typeof document === 'undefined') return;
  var el = document.getElementById('quick-replies');
  var html = '';
  for (var i=0;i<chips.length;i++) {
    var c=chips[i];
    var fc = FATES.indexOf(c.toLowerCase())!==-1?' fate-'+c.toLowerCase():'';
    html += '<button class="chip'+fc+'" onclick="chipClick(\'' + escHtml(c) + '\')">'+escHtml(c)+'</button>';
  }
  el.innerHTML = html;
}

function _chipClickImpl(t) {
  if (t==='Move box') t='move';
  // Strip count suffix from fate review menu chips e.g. "Review keep (11)" -> "Review keep"
  var display = t.replace(/\s*\(\d+\)$/, '');
  document.getElementById('user-input').value=display;
  sendUserMessage();
  document.getElementById('user-input').focus();
}

function showTyping() {
  if (typeof document === 'undefined') return;
  document.getElementById('typing').classList.add('visible');
  document.getElementById('chat-messages').scrollTop=9999;
}

function hideTyping() {
  if (typeof document === 'undefined') return;
  document.getElementById('typing').classList.remove('visible');
}

function handleKey(e) {
  var input = document.getElementById('user-input');
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendUserMessage();
    return;
  }
  if (e.key === 'ArrowUp') {
    if (inputHistory.length === 0) return;
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
    if (historyIndex === -1) return;
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
  if (typeof document === 'undefined') return;
  var input = document.getElementById('user-input');
  var text = input.value.trim();
  if (!text) return;
  if (inputHistory.length === 0 || inputHistory[inputHistory.length - 1] !== text) {
    inputHistory.push(text);
    if (inputHistory.length > 100) inputHistory.shift();
  }
  historyIndex = -1;
  historyDraft = '';
  input.value = ''; input.style.height = 'auto';
  setChips([]);
  addUserMessage(text, []);
  showTyping();
  await new Promise(function(r){setTimeout(r,500);});
  hideTyping();
  processInput(text, []);
  commitState();
}

function handleBoxOpen(command, photos) {
  if (/^\d+$/.test(command.trim()) && activeBox()) {
    handleItemViewByNumber(parseInt(command.trim(), 10));
  } else {
    handleItemName(command, photos);
  }
}

function handleAddItem() {
  if (!activeBox()) {
    addBotMessage('No active box — open a box first, or start a new one.');
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

// Returns true if the command was handled, false if processInput should continue.
function tryIntercept(command, photos) {
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
  if (command === 'delete...') { handleEllipticalAction('Delete', group => group.fate === 'trash');  return true; }
  if (command === 'donate...') { handleEllipticalAction('Donate', group => group.fate !== 'donate'); return true; }
  if (command === 'keep...')   { handleEllipticalAction('Keep',   group => group.fate !== 'keep');   return true; }
  if (command === 'sell...')   { handleEllipticalAction('Sell',   group => group.fate !== 'sell');   return true; }
  if (command === 'trash...')  { handleEllipticalAction('Trash',  group => group.fate !== 'trash');  return true; }
  if (command === 'unsure...') { handleEllipticalAction('Unsure', group => group.fate !== 'unsure'); return true; }

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

  // handleNest
  if (['nest box', 'put inside'].includes(command)) { handleNest(command); return true; }

  // import
  if (['import', 'import json'].includes(command)) {
    const importEl = document.getElementById('import-input');
    if (importEl) importEl.click();
    // Both button click and 'import' command trigger the same file input,
    // which fires onchange → handleImportJSON(). This ensures button and command
    // behave identically. There is a potential edge case where the command is not
    // intercepted correctly, which is why the default fallback encourages the user
    // to use the button path.
    else addBotMessage('Use the ↑ Import JSON button in the header to import a file.');
    return true;
  }

  // import csv
  if (['import csv'].includes(command)) {
    const importCSVEl = document.getElementById('import-csv-input');
    if (importCSVEl) importCSVEl.click();
    // Both button click and 'import csv' command trigger the same file input,
    // which fires onchange → handleImportCSV(). This ensures button and command
    // behave identically. There is a potential edge case where the command is not
    // intercepted correctly, which is why the default fallback encourages the user
    // to use the button path.
    else addBotMessage('Use the ↑ Import CSV button in the header to import a file.');
    return true;
  }

  // export csv
  if (['export csv', 'export'].includes(command)) {
    exportCSV();
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

  // no-ops — chips handled by init, ignore if replayed
  if (['start new box', 'start sorting'].includes(command)) { return true; }

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

  // trash N / delete N
  if (/^trash \d+$/.test(command)) { handleTrashByNumber(parseInt(command.slice(6), 10)); return true; }
  if (/^delete \d+$/.test(command)) { handleDeleteByNumber(parseInt(command.slice(7), 10)); return true; }

  // nest variants
  if (['nest', 'put inside', 'nest box'].includes(command)) { handleNest(command); return true; }
  if (['put', 'nest'].includes(command.split(' ')[0]) &&
      (command.indexOf(' inside ') !== -1 || command.indexOf(' in ') !== -1 || command.indexOf(' on ') !== -1)) {
    handleNest(command); return true;
  }

  // move command — exclude 'move to box' which is handled by the item view stage
  if (command !== 'move to box' && ['m', 'move'].includes(command.split(' ')[0])) {
    const loc = command.split(' ').slice(1).join(' ');
    handleMove(loc); return true;
  }

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
    case 'FINISHED':                     handleFinished(command);              break;
    default:                             handleFreeform(command, photos);
  }
}

function processInput(input, photos) {
  let command = input.toLowerCase().trim();

  // ── Aliases — must run first as they mutate command ──────────────────────────
  if (command === 'y') { command = 'yes'; }
  if (command === 'n') { command = 'no'; }

  if (tryIntercept(command, photos)) return;

  routeToHandler(state.conversationStage, command, photos);
}

function handleMove(loc) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to move. Open a box first.'); return; }
  if (!loc || !loc.trim()) {
    state.conversationStage = 'AWAITING_MOVE_LOCATION';
    addBotMessage('Where would you like to move **"' + box.name + '"**?');
    return;
  }
  var prev = box.location || 'unspecified';
  box.location = loc.trim();
  // Restore the stage we were in before the move command
  if (state.conversationStage === 'AWAITING_MOVE_LOCATION') {
    state.conversationStage = 'BOX_OPEN';
  }
  addBotMessage('Moved **"' + box.name + '"** from _' + prev + '_ to _' + box.location + '_.');
}

function handleDeleteByNumber(num) {
  // Immediate deletion for already-trashed items — no prompt
  var box = activeBox();
  if (!box) { addBotMessage('No active box. Open a box first.'); return; }
  var groups = groupItems(box.items);
  if (num < 1 || num > groups.length) {
    addBotMessage('No item ' + num + ' in the list. Use _"review items"_ to see the current list.');
    return;
  }
  var g = groups[num - 1];
  var name = g.name;
  var countLabel = g.count > 1 ? g.count + ' × ' : '';
  box.items = box.items.filter(function(it){ return !(it.name === g.name && it.fate === g.fate); });
  if (state.activeItemId) {
    var still = box.items.some(function(it){ return it.id === state.activeItemId; });
    if (!still) state.activeItemId = null;
  }
  state.conversationStage = 'BOX_OPEN';
  if (box.items.length === 0) {
    addBotMessage(deletionLog(countLabel + name) + ' The box is now empty.');
    setChips(['Add item', 'Move box', 'Done with this box', 'Delete box']);
  } else {
    var newGroups = groupItems(box.items);
    var lines = '';
    var chips = [];
    for (var i = 0; i < newGroups.length; i++) {
      var g2 = newGroups[i];
      var prefix = g2.count > 1 ? g2.count + ' × ' : '';
      lines += (i+1) + '. **' + prefix + g2.name + '** → ' + g2.fate + '\n';
      chips.push((g2.fate === 'trash' ? 'Delete ' : 'Trash ') + (i+1));
    }
    addBotMessage(deletionLog(countLabel + name) + ' Remaining in "' + box.name + '":\n' + lines.trim());
    setChips(chips.concat(['Add item', 'Move box', 'Done with this box']));
  }
}

function handleTrashByNumber(num) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box. Open a box first.'); return; }
  var groups = groupItems(box.items);
  if (num < 1 || num > groups.length) {
    addBotMessage('No item ' + num + ' in the list. Use _"review items"_ to see the current list.');
    return;
  }
  var g = groups[num - 1];
  // Mark ALL items in the group as trash, activate the first
  var firstId = null;
  for (var i = 0; i < box.items.length; i++) {
    if (box.items[i].name === g.name && box.items[i].fate === g.fate) {
      box.items[i].fate = 'trash';
      if (!firstId) { firstId = box.items[i].id; }
    }
  }
  state.activeItemId = firstId;
  // Trigger the trash delete prompt
  var boxPref = activeBox() ? boxTrashPreferences[activeBox().id] : null;
  var effectivePref = boxPref || sessionTrashPreference;
  if (effectivePref === 'always') { deleteActiveItem(); return; }
  if (effectivePref === 'never') {
    addBotMessage('\uD83D\uDDD1 **' + g.name + '** marked trash.\n\n' + disposalPrompt(g.name));
    state.conversationStage = 'AWAITING_DISPOSAL';
    setChips(['Skip disposal note', 'Done with this box']);
    return;
  }
  addBotMessage('\uD83D\uDDD1 **' + g.name + '** \u2014 delete now?');
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
function startNewBox() {
  state.activeBoxId=null; state.activeItemId=null;
  state.conversationStage='AWAITING_BOX_NAME';
  addBotMessage('Starting a new box. What would you like to call it?');
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
  if (irregulars[w]) return irregulars[w];
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
  // Check for batch: "five wooden boxes", "3 shelves"
  var parsed = parseQuantity(raw);
  if (parsed && parsed.qty >= 2 && parsed.qty <= 26) {
    var singular = singularizeLast(parsed.itemName);
    state.pendingBoxBatch = { qty: parsed.qty, baseName: singular };
    state.conversationStage = 'AWAITING_BOX_BATCH_CONFIRM';
    addBotMessage(
      'I see **' + parsed.qty + ' \u00d7 ' + singular + '**. Should I create ' + parsed.qty +
      ' boxes named **' + singular + ' A** through **' + singular + ' ' + LETTERS[parsed.qty - 1] + '**?'
    );
    setChips(['Yes, create ' + parsed.qty, 'No, just 1', 'Change quantity']);
    return;
  }
  var box = {id:uid(),name:raw,location:'',notes:'',parentId:null,createdAt:new Date().toISOString(),items:[]};
  state.boxes.push(box); state.activeBoxId=box.id;
  state.conversationStage='AWAITING_LOCATION';
  addBotMessage(
    'Got it \u2014 **"' + raw + '"**.\n\nWhere is this box located?' +
    ' (e.g. "spare bedroom", "garage shelf 2", "storage unit A")'
  );
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
    addBotMessage('Just the one **"'+batch.baseName+'"** then.\n\nWhere is this box located?');
    return;
  }
  if (command.includes('change') || command.includes('quantity')) {
    addBotMessage('How many **' + batch.baseName + '** boxes are there?');
    state.conversationStage = 'AWAITING_BOX_BATCH_QTY';
    return;
  }
  // Affirmative
  var numMatch = command.match(/\d+/);
  var qty = numMatch ? parseInt(numMatch[0], 10) : batch.qty;
  batch.qty = qty;
  state.conversationStage = 'AWAITING_BOX_BATCH_LOCATION';
  addBotMessage(
    'Where are all ' + qty + ' **' + batch.baseName + '** boxes located?' +
    ' (They\'ll share the same location)'
  );
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
    'Got it \u2014 **' + qty + ' \u00d7 ' + batch.baseName + '**. Create boxes **' +
    batch.baseName + ' A** through **' + batch.baseName + ' ' + LETTERS[qty - 1] + '**?'
  );
  setChips(['Yes, create ' + qty, 'No, just 1']);
}

function handleBoxBatchLocation(text) {
  var batch = state.pendingBoxBatch;
  if (!batch) { state.conversationStage = 'AWAITING_BOX_NAME'; return; }
  var location = text.trim() || 'unspecified';
  var now = new Date().toISOString();
  var firstId = null;
  for (var i = 0; i < batch.qty; i++) {
    var name = batch.baseName + ' ' + LETTERS[i];
    var id = uid();
    if (i === 0) firstId = id;
    state.boxes.push({id:id,name:name,location:location,notes:'',parentId:null,createdAt:now,items:[]});
  }
  state.activeBoxId = firstId;
  state.pendingBoxBatch = null;
  state.conversationStage = 'BOX_OPEN';
  var names = [];
  for (var i = 0; i < batch.qty; i++) names.push(batch.baseName + ' ' + LETTERS[i]);
  addBotMessage(
    'Created **' + batch.qty + '** boxes in _' + location + '_:\n' + names.join(', ') +
    '.\n\nStarting with **' + names[0] + '**. Tell me about the first item you pick up.'
  );
  setChips(['Skip to next box','Review items','Done']);
}

function handleLocation(text) {
  var box=activeBox(); box.location=text.trim()||'unspecified';
  state.conversationStage='BOX_OPEN';
  addBotMessage(
    'Perfect. Box **"' + box.name + '"** is in _' + box.location + '_.' +
    '\n\nNow let\'s sort through it. Tell me about the **first item** you pick up \u2014 what is it?'
  );
  setChips(['Skip to next box','Review items','Done']);
}

const WORD_NUMBERS = {
  'a':1,'an':1,'one':1,'two':2,'three':3,'four':4,'five':5,'six':6,'seven':7,'eight':8,
  'nine':9,'ten':10,'eleven':11,'twelve':12,'thirteen':13,'fourteen':14,'fifteen':15,
  'sixteen':16,'seventeen':17,'eighteen':18,'nineteen':19,'twenty':20,
  'twenty-one':21,'twenty-two':22,'twenty-three':23,'twenty-four':24,'twenty-five':25,
  'thirty':30,'forty':40,'fifty':50,'sixty':60,'seventy':70,'eighty':80,'ninety':90,'hundred':100
};
function parseQuantity(text) {
  var t = text.trim();
  var dm = t.match(/^(\d+)\s+(.+)$/);
  if (dm) { var q=parseInt(dm[1],10); if(q>1) return {qty:q,itemName:dm[2].trim()}; }
  var words = t.toLowerCase().split(/\s+/);
  for (var len=2;len>=1;len--) {
    var cand = words.slice(0,len).join('-');
    var candP = words.slice(0,len).join(' ');
    var q2 = WORD_NUMBERS[cand]||WORD_NUMBERS[candP]||WORD_NUMBERS[words.slice(0,len).join('')];
    if (q2&&q2>1) { var iN=words.slice(len).join(' ').trim(); if(iN.length>0) return {qty:q2,itemName:iN}; }
  }
  return null;
}

function handleItemName(text, photos) {
  var box = activeBox();
  if(!box){
    startNewBox();
    return;
  }
  var parsed=parseQuantity(text);
  if (parsed) {
    state.pendingBatch= {
      qty: parsed.qty,
      itemName: parsed.itemName,
      photos: photos || []
    };
    state.conversationStage = 'AWAITING_BATCH_CONFIRM';
    addBotMessage('I see **' + parsed.qty + ' \u00d7 ' + parsed.itemName + '**. Should I log ' + parsed.qty +
      ' separate entries for these, all with the same fate?');
    setChips(['Yes, log ' + parsed.qty, 'No, just 1', 'Change quantity']);
    return;
  }
  var name = text.trim() || 'Unknown item';
  var item = {
    id: uid(),
    name: name,
    description: '',
    fate: 'unsure',
    notes: '',
    photos: photos || [],
    addedAt: new Date().toISOString(),
    deleted_at: null
  };
  addItem(box, item);
  state.activeItemId = item.id;
  state.conversationStage = 'AWAITING_FATE';
  addBotMessage('**' + name + '** \u2014 noted.\n\nWhat should we do with it?');
  setChips(FATE_TITLES);
}

function handleBatchConfirm(text, photos) {
  var command = text.toLowerCase().trim();
  var batch = state.pendingBatch;
  if (command.indexOf('change') !== -1 || command.indexOf('quantity') !== -1) {
    addBotMessage('How many **' + batch.itemName + '** are there?');
    state.conversationStage = 'AWAITING_BATCH_QTY';
    setChips([]);
    return;
  }
  if (command.startsWith('no') || command.indexOf('just 1') !== -1 || command === '1') {
    state.pendingBatch = null;
    var box = activeBox();
    var item = {
      id: uid(), name: batch.itemName, description: '', fate: 'unsure',
      notes: '', photos: batch.photos, addedAt: new Date().toISOString(),
      deleted_at: null
    };
    addItem(box, item); state.activeItemId = item.id;
    state.conversationStage = 'AWAITING_FATE';
    addBotMessage('Just the one **' + batch.itemName + '** then. What should we do with it?');
    setChips(FATE_TITLES);
    return;
  }
  if (command.startsWith('yes') || command.indexOf('log') !== -1 ||
      command.indexOf('confirm') !== -1 || command.match(/^\d+$/)) {
    var nm = command.match(/\d+/);
    var qty = nm ? parseInt(nm[0],10) : batch.qty;
    commitBatch(qty, batch.itemName, batch.photos); return;
  }
  addBotMessage('Log **' + batch.qty + ' \u00d7 ' + batch.itemName + '** as separate entries?');
  setChips(['Yes, log ' + batch.qty,'No, just 1','Change quantity']);
}

function handleBatchQty(text) {
  var batch=state.pendingBatch; if(!batch){state.conversationStage='BOX_OPEN';return;}
  var parsed=parseQuantity(text);
  var wordQty=WORD_NUMBERS[text.toLowerCase().trim()];
  var qty=wordQty||(parsed&&parsed.qty)||parseInt(text,10);
  if (!qty || isNaN(qty) || qty < 1) {
    addBotMessage('Sorry, I didn\'t catch a number. How many **' + batch.itemName + '** are there?');
    return;
  }
  batch.qty=qty; state.conversationStage='AWAITING_BATCH_CONFIRM';
  addBotMessage('Got it \u2014 **'+qty+' \u00d7 '+batch.itemName+'**. Log them all as separate entries?');
  setChips(['Yes, log '+qty,'No, just 1']);
}

function commitBatch(qty, itemName, photos) {
  var box = activeBox();
  var now = new Date().toISOString();
  var firstId = uid();
  for (var i = 0; i < qty; i++) {
    addItem(box, {
      id: i === 0 ? firstId : uid(),
      name: itemName,
      description: '',
      fate: 'unsure',
      notes: '',
      photos: i === 0 ? photos : [],
      addedAt:now,
      deleted_at: null
    });
  }
  state.activeItemId = firstId;
  state.pendingBatch = null;
  state.conversationStage = 'AWAITING_BATCH_FATE';
  addBotMessage('Logged **' + qty + ' \u00d7 ' + itemName + '**. What should we do with all of them?');
  setChips(FATE_TITLES.concat(['Mixed fates']));
}

function handleBatchFate(text, photos) {
  var box=activeBox(); var t=text.toLowerCase().trim();
  if (t.indexOf('mixed')!==-1) {
    addBotMessage('No problem \u2014 I\'ll ask about each one individually.');
    state.conversationStage='AWAITING_FATE'; setChips(FATE_TITLES);
    return;
  }
  var matched=null; for(var i=0;i<FATES.length;i++){if(t.indexOf(FATES[i])!==-1){matched=FATES[i];break;}}
  if (!matched) {
    addBotMessage('What should we do with all of them?');
    setChips(FATE_TITLES.concat(['Mixed fates']));
    return;
  }
  var anchor=activeItem();
  if (anchor) {
    for (var i = 0; i < box.items.length; i++) {
      if (box.items[i].name === anchor.name && box.items[i].addedAt === anchor.addedAt) {
        box.items[i].fate = matched;
      }
    }
  }
  var fm = {
    keep:   '\u2705 **Keep** \u2014 all going back home.',
    donate: '\uD83D\uDC99 **Donate** \u2014 great!',
    trash:  '\uD83D\uDDD1 **Trash** \u2014 out they go.',
    sell:   '\uD83D\uDCB0 **Sell** \u2014 nice haul!',
    unsure: '\uD83E\uDD37 **Unsure** \u2014 we\'ll revisit.'
  };
  state.activeItemId=null; state.conversationStage='BOX_OPEN';
  addBotMessage(fm[matched]+'\n\n**'+box.items.length+'** item(s) logged in "'+box.name+'". What\'s next?');
  setBoxOpenChips();
}

function handleItemDesc(text, photos) {
  var item=activeItem(); if(!item){state.conversationStage='BOX_OPEN';handleFreeform(text,photos);return;}
  item.description=text.trim();
  state.conversationStage='AWAITING_FATE';
  addBotMessage('Got it. What should we do with **'+item.name+'**?');
  setChips(FATE_TITLES);
}

function handleFate(text, photos) {
  var item=activeItem(); if(!item){state.conversationStage='BOX_OPEN';handleFreeform(text,photos);return;}
  var t=text.toLowerCase().trim();
  var matched=null; for(var i=0;i<FATES.length;i++){if(t.indexOf(FATES[i])!==-1){matched=FATES[i];break;}}
  if (!matched) {
    addBotMessage('I didn\'t catch that \u2014 what should we do with **'+item.name+'**?');
    setChips(FATE_TITLES);
    return;
  }
  item.fate=matched;
  var fm = {
    keep:   '\u2705 **Keep** \u2014 going back home.',
    donate: '\uD83D\uDC99 **Donate** \u2014 someone will love this.',
    trash:  '\uD83D\uDDD1 **Trash** \u2014 out it goes.',
    sell:   '\uD83D\uDCB0 **Sell** \u2014 make some money!',
    unsure: '\uD83E\uDD37 **Unsure** \u2014 we\'ll revisit it.'
  };
  if (matched === 'trash') {
    var boxPref = activeBox() ? boxTrashPreferences[activeBox().id] : null;
    var effectivePref = boxPref || sessionTrashPreference;
    if (effectivePref === 'always') { deleteActiveItem(); return; }
    if (effectivePref === 'never') {
      addBotMessage('\uD83D\uDDD1 **Trash** \u2014 noted.\n\n' + disposalPrompt(item.name));
      state.conversationStage = 'AWAITING_DISPOSAL';
      setChips(['Skip disposal note', 'Done with this box']);
      return;
    }
    addBotMessage('\uD83D\uDDD1 **Trash** \u2014 delete this item now?');
    state.conversationStage = 'AWAITING_TRASH_DELETE';
    setChips(['Yes', 'No', 'Always this session', 'Never this session', 'Always for this box', 'Never for this box']);
    return;
  }
  if (state.pendingFateReview && state.pendingFateReview._resumeAfterFate) {
    state.pendingFateReview._resumeAfterFate = false;
    addBotMessage(fm[matched]);
    state.pendingFateReview.index++;
    state.pendingFateReview.reviewedCount = (state.pendingFateReview.reviewedCount || 0) + 1;
    showFateReviewCurrentItem(state.pendingFateReview);
    return;
  }
  state.conversationStage='AWAITING_ITEM_NOTES';
  addBotMessage(
    fm[matched] + '\n\nAny notes about this one? (condition, value, destination)' +
    ' \u2014 or say _"next"_ to move on.'
  );
  setChips(['Next item','No notes','Done with this box']);
}

function handleItemNotes(text) {
  var item=activeItem(); var t=text.toLowerCase().trim();
  if(item&&t!=='next'&&t!=='next item'&&t!=='no notes'&&text.trim()) item.notes=text.trim();
  state.activeItemId=null; state.conversationStage='BOX_OPEN';
  var box=activeBox();
  addBotMessage('Got it. **'+box.items.length+'** item(s) logged in "'+box.name+'".\n\nWhat\'s the next item?');
  setBoxOpenChips();
}

function doneWithBox() {
  var box=activeBox(); if(!box){addBotMessage('No active box. Start a new one?');setChips(['New box']);return;}
  var fates=countFates(box); var parts=[];
  for(var i=0;i<FATES.length;i++){if(fates[FATES[i]])parts.push(fates[FATES[i]]+' to '+FATES[i]);}
  var summary=parts.length?parts.join(', '):'nothing yet';
  if (box) delete boxTrashPreferences[box.id];
  state.activeBoxId=null; state.activeItemId=null; state.conversationStage='FINISHED';
  addBotMessage(
    'Nice work on **"' + box.name + '"**!\n\nSummary: ' + summary +
    '.\n\nReady to tackle another box, or are you done for now?'
  );
  setChips(['New box','Done for now','Review all boxes','Review by fate']);
}

// Group items by name+fate, return array of {name, fate, count, notes}
function groupItems(items) {
  var groups = [];
  var seen = {};
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
  var activeItems = box.items.filter(function(it) { return !it.deleted_at; });
  if (activeItems.length === 0) return 'empty';
  var groups = groupItems(activeItems);
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
  if (eligible.length === 0) return [];
  if (eligible.length > 2) return [label + '...'];
  return eligible.map(function(itemNumber) { return label + ' ' + itemNumber; });
}

// Handles an elliptical chip click: sends reminder and prepopulates the input.
function handleEllipticalAction(label, filterFn) {
  var box = activeBox();
  if (!box) return;
  var groups = groupItems(box.items);
  var eligible = eligibleGroupNumbers(groups, filterFn);
  var verb = label.toLowerCase();
  addBotMessage('Which item? Type _' + verb + '_ followed by the number. Applies to: ' + eligible.join(', ') + '.');
  var input = document.getElementById('user-input');
  if (input) {
    input.value = verb + ' ';
    if (input.focus) input.focus();
  }
}

function reviewBox() {
  var box=activeBox();
  var activeItems = box ? box.items.filter(function(it) { return !it.deleted_at; }) : [];
  if (!box || activeItems.length === 0) {
    addBotMessage('This box has no items logged yet. Add some!');
    setBoxOpenChips();
    return;
  }
  var groups = groupItems(activeItems);
  var lines = '';
  var actionChips = [];

  for (var i = 0; i < groups.length; i++) {
    var g = groups[i];
    var prefix = g.count > 1 ? g.count + ' \u00d7 ' : '';
    lines += (i+1) + '. **' + prefix + g.name + '** \u2192 ' + g.fate + (g.notes ? ' (' + g.notes + ')' : '') + '\n';
  }

  // Action chips — elliptical when 3+ eligible groups, numbered when 1-2.
  // Order driven by FATES constant: Keep, Donate, Sell, Unsure, Trash, then Delete.
  const chips = FATES
    .flatMap(fate => buildActionChips(groups, fate[0].toUpperCase() + fate.slice(1), group => group.fate !== fate))
    .concat(buildActionChips(groups, 'Delete', group => group.fate === 'trash'));

  // Only show "Trash All" when there are 2+ items
  if (activeItems.length >= 2) {
    chips.push('Trash All');
  }

  var header = activeItems.length !== groups.length
    ? '**Items in "' + box.name + '" (' + activeItems.length + ' items, ' + groups.length + ' unique):**'
    : '**Items in "' + box.name + '":**';
  addBotMessage(header + '\n' + lines.trim());
  setChips(chips.concat(['Add item', 'Move box', 'Done with this box']));
  state.conversationStage = 'BOX_OPEN';
}

function handleFinished(text) {
  // Number input selects a box from the review all list
  if (/^\d+$/.test(text)) {
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
    for (var i = 0; i < state.boxes.length; i++) {
      total += state.boxes[i].items.length;
    };
    addBotMessage('Great session! You\'ve sorted **' + state.boxes.length + '** box(es) with **' + total +
      '** items total.\n\nYou can download your data anytime with the buttons at the top. \uD83D\uDCE6');
    setChips(['Start new box', 'Review by fate']);
  } else if(command.indexOf('review all') !==- 1) {
    var lines = '';
    for(var i = 0; i < state.boxes.length; i++) {
      var box = state.boxes[i];
      var loc = box.location ? ' (' + box.location + ')' : '';
      lines += (i+1) + '. **' + box.name + '**' + loc + ' — ' + boxSummaryLine(box) + '\n';
    }
    addBotMessage('**All boxes:**\n' + lines.trim());
    setChips(['New box','Done for now','Review by fate']);
  } else {
    handleFreeform(text,[]);
  }
}

function handleHelp() {
  if (state.boxes.length === 0) {
    addBotMessage(
      'Hello! I\'m **DeclutterBot**, your sorting companion.\n\nTell me what to call your first box to get started.'
    );
    state.conversationStage = 'AWAITING_BOX_NAME';
    setChips(['Start sorting']);
  } else {
    var box = activeBox();
    var lines = [
      'Here\'s what you can do:',
      '_"New box"_ — start a new box',
      '_"Review items"_ — list items in the active box, then type a number to view item detail',
      '_"Review all boxes"_ — summary of every box',
      '_"Review by fate"_ — review all items of a given fate across every box',
      '_"Move <location>"_ — move the active box to a new location',
      '_"Nest box"_ — put the active box inside another',
      '_"Dump into..."_ — transfer all items to another box',
      '_"Done with this box"_ — finish and summarise',
      '_"Remove <name or number>"_ — remove an item',
      '_"Import json"_ — load a saved inventory',
      '_"Move to box"_ — from item detail view, move an item to another box',
      '↑ / ↓ arrow keys — recall previous commands'
    ];
    addBotMessage(lines.join('\n'));
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
      addBotMessage('Hello! Ready to start sorting? Tell me what to call your first box.');
      state.conversationStage = 'AWAITING_BOX_NAME';
      setChips(['Start sorting']);
    } else {
      addBotMessage('Welcome back! You have **' + state.boxes.length + '** box(es). What would you like to do?');
      state.conversationStage = 'FINISHED';
      setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    }
    return;
  }
  addBotMessage(
    'I\'m not sure what you mean \u2014 try: _"New box"_, _"Add item"_, _"Done with this box"_, or _"Review items"_.'
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
      delete exported.photos;
      items.push(exported);
    }
    data.boxes.push(Object.assign({},box,{items:items}));
  }
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  dlBlob(blob,'inventory.json');
}

function escapeCSV(field) {
  if (field === null || field === undefined) return '';
  var str = String(field);
  if (str.indexOf(',') !== -1 || str.indexOf('"') !== -1 || str.indexOf('\n') !== -1) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function exportCSV() {
  var header = ['location,box name,item name,fate,notes'];
  var rows = state.boxes.reduce(function(acc, box) {
    var boxRows = box.items.map(function(item) {
      return [
        escapeCSV(box.location || ''),
        escapeCSV(box.name),
        escapeCSV(item.name),
        escapeCSV(item.fate),
        escapeCSV(item.notes || '')
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
  if (lines.length === 0) return [];

  var headerLine = lines[0];
  var headers = parseCSVLine(headerLine);

  var expectedHeaders = ['location', 'box name', 'item name', 'fate', 'notes'];
  var headerMatch = JSON.stringify(headers) === JSON.stringify(expectedHeaders);
  if (!headerMatch) {
    addBotMessage(
      'CSV format error: expected columns in order: location, box name, item name, fate, notes'
    );
    return null;
  }

  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '') continue; // skip empty lines
    var values = parseCSVLine(lines[i]);
    if (values.length !== 5) {
      addBotMessage('CSV format error on line ' + (i + 1) + ': expected 5 columns, got ' + values.length);
      return null;
    }
    rows.push({
      location: values[0] || '',
      boxName: values[1],
      itemName: values[2],
      fate: values[3],
      notes: values[4] || ''
    });
  }
  return rows;
}

function parseCSVLine(line) {
  var result = [];
  var current = '';
  var inQuotes = false;

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
  if (!rows) return;

  if (rows.length === 0) {
    addBotMessage('CSV is empty (no items to import).');
    return;
  }

  // Confirm if existing data would be overwritten
  if (state.boxes.length > 0) {
    if (!confirm(
      'Import will replace your current inventory (' + state.boxes.length + ' box(es)).' +
      ' This cannot be undone. Continue?'
    )) return;
  }

  // Clear existing inventory
  state.boxes = [];
  state.activeBoxId = null;
  state.activeItemId = null;

  // Group rows by (location, boxName)
  var boxMap = {};
  rows.forEach(function(row) {
    var boxKey = row.location + '|' + row.boxName;
    if (!boxMap[boxKey]) {
      boxMap[boxKey] = {
        location: row.location,
        name: row.boxName,
        items: []
      };
    }
    boxMap[boxKey].items.push({
      name: row.itemName,
      fate: FATES.indexOf(row.fate) !== -1 ? row.fate : 'unsure',
      notes: row.notes
    });
  });

  // Create boxes
  Object.keys(boxMap).forEach(function(boxKey) {
    var boxData = boxMap[boxKey];
    var box = {
      id: uid(),
      name: boxData.name,
      location: boxData.location,
      notes: '',
      parentId: null,
      createdAt: new Date().toISOString(),
      items: boxData.items.map(function(item) {
        return {
          id: uid(),
          name: item.name,
          description: '',
          fate: item.fate,
          notes: item.notes,
          photos: [],
          addedAt: new Date().toISOString(),
          deleted_at: null
        };
      })
    };
    state.boxes.push(box);
  });

  sessionDeletedCount = 0;
  sessionTrashPreference = null;
  boxTrashPreferences = {};

  commitState();

  var totalItems = state.boxes.reduce(function(sum, b) { return sum + b.items.length; }, 0);
  addBotMessage(
    '✅ Imported ' + state.boxes.length + ' box(es) with ' + totalItems + ' item(s).' +
    '\n\nReady to continue organizing?'
  );
  state.conversationStage = 'BOX_OPEN';
  setChips(['New box', 'Review all boxes', 'Review by fate']);
}

function importJSON(data) {
  // Validate structure
  if (!data || !Array.isArray(data.boxes)) {
    addBotMessage(
      'Import failed \u2014 the file does not look like a valid DeclutterBot inventory.' +
      ' Expected a JSON object with a "boxes" array.'
    );
    return;
  }
  // Confirm if existing data would be overwritten
  if (state.boxes.length > 0) {
    if (!confirm(
      'Import will replace your current inventory (' + state.boxes.length + ' box(es)).' +
      ' This cannot be undone. Continue?'
    )) return;
  }
  // Normalise and load
  var boxes = data.boxes;
  for (var i = 0; i < boxes.length; i++) {
    var box = boxes[i];
    if (box.parentId === undefined) box.parentId = null;
    if (!Array.isArray(box.items)) box.items = [];
    for (var j = 0; j < box.items.length; j++) {
      var it = box.items[j];
      if (!it.photos) it.photos = [];
      if (!it.notes)  it.notes  = '';
      if (!it.fate)   it.fate   = 'unsure';
    }
  }
  state.boxes           = boxes;
  state.activeBoxId     = null;
  state.activeItemId    = null;
  state.conversationStage = 'FINISHED';
  commitState();
  document.getElementById('chat-messages').innerHTML = '';
  document.getElementById('quick-replies').innerHTML = '';
  var totalItems = boxes.reduce(function(acc, b) { return acc + b.items.length; }, 0);
  addBotMessage('Imported **' + boxes.length + '** box(es) and **' + totalItems + '** item(s).' +
    (data.exportedAt ? ' Exported ' + new Date(data.exportedAt).toLocaleDateString() + '.' : '') +
    '\n\nWhat would you like to do?');
  setChips(['Review all boxes', 'Continue last box', 'New box']);
}

function handleImportJSON(event) {
  var file = event.target.files[0];
  event.target.value = ''; // reset so same file can be re-imported
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var data;
    try { data = JSON.parse(e.target.result); }
    catch(err) {
      addBotMessage('Import failed \u2014 could not parse the file as JSON. Is it a valid inventory export?');
      return;
    }
    importJSON(data);
  };
  reader.readAsText(file);
}

function handleImportCSV(event) {
  var file = event.target.files[0];
  event.target.value = ''; // reset so same file can be re-imported
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    importCSV(e.target.result);
  };
  reader.readAsText(file);
}


const WELCOME_MSG =
  'Hello! I\'m **DeclutterBot**, your decluttering companion. \uD83D\uDCE6\n\n' +
  'I\'ll walk you through your boxes one by one \u2014 naming each item and deciding its fate:' +
  ' **keep, donate, trash, sell,** or **unsure**.' +
  ' Add notes and export your inventory when you\'re done.\n\n' +
  'Ready to start? Tell me what to call your first box.';

function clearAll() {
  if(state.boxes.length>0&&!confirm('Reset all data? This cannot be undone.')) return;
  localStorage.removeItem('declutterbot_state');
  state = {
    boxes: [], activeBoxId: null, activeItemId: null,
    pendingBatch: null, pendingBoxBatch: null, pendingDeleteBoxId: null,
    pendingNest: null, activeItemViewGroup: null, pendingFateReview: null,
    conversationStage: 'WELCOME', storageFull: false
  };
  sessionDeletedCount=0; sessionTrashPreference=null; boxTrashPreferences={};
  document.getElementById('chat-messages').innerHTML='';
  document.getElementById('quick-replies').innerHTML='';
  commitState();
  setTimeout(function(){
    addBotMessage(WELCOME_MSG);
    state.conversationStage='AWAITING_BOX_NAME'; setChips(['Start sorting']);
  },100);
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
  if (document.activeElement === input) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Tab' || e.key === 'Escape') return;
  var isPrintable = e.key.length === 1;
  var isNavKey = e.key === 'ArrowUp' || e.key === 'ArrowDown' ||
                 e.key === 'Enter' || e.key === 'Backspace';
  if (!isPrintable && !isNavKey) return;
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

if(state.boxes.length===0){
  setTimeout(function(){
    addBotMessage(WELCOME_MSG);
    state.conversationStage='AWAITING_BOX_NAME'; setChips(['Start sorting']);
  },200);
} else {
  var _b=state.boxes.length;
  var _i=0; for(var _j=0;_j<state.boxes.length;_j++) _i+=state.boxes[_j].items.length;
  setTimeout(function(){
    addBotMessage(
      'Welcome back! You have **' + _b + ' box' + (_b !== 1 ? 'es' : '') + '**' +
      ' and **' + _i + ' item' + (_i !== 1 ? 's' : '') + '** logged so far.' +
      '\n\nPick up where you left off, or start a new box.'
    );
    state.conversationStage=state.activeBoxId?'BOX_OPEN':'FINISHED';
    setChips(['New box','Continue last box','Review all boxes']);
  },200);
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
  var extra = box && box.items.length > 0 ? 'Dump into...' : 'Delete box';
  setChips(['Add item', 'Review items', 'Move box', 'Nest box', extra, 'Review by fate', 'Done with this box']);
}

function handleDeleteBox() {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to delete. Open a box first.'); return; }
  var kids = childBoxes(box.id);
  if (kids.length > 0) {
    var kidNames = kids.map(function(b){ return '"' + b.name + '"'; }).join(', ');
    addBotMessage(
      '**"' + box.name + '"** contains ' + kids.length + ' box(es): ' + kidNames +
      '. Move or delete those first.'
    );
    setBoxOpenChips();
    return;
  }
  if (box.items.length > 0) {
    addBotMessage(
      '**"' + box.name + '"** still has ' + box.items.length + ' item(s).' +
      ' Empty the box first, or use _"dump into <box name>"_ to transfer all items to another box.'
    );
    setChips(['Review items', 'Dump into...', 'Done with this box']); // box has items
    return;
  }
  var prev = state.conversationStage;
  state.conversationStage = 'AWAITING_DELETE_BOX_CONFIRM';
  state.pendingDeleteBoxId = box.id;
  addBotMessage('Delete **"' + box.name + '"**? It is empty. This cannot be undone.');
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

  var idx = -1;
  for (var i = 0; i < state.boxes.length; i++) {
    if (state.boxes[i].id === boxId) { idx = i; break; }
  }
  if (idx === -1) { addBotMessage('Could not find that box.'); return; }

  var name = state.boxes[idx].name;
  state.boxes.splice(idx, 1);
  if (state.activeBoxId === boxId) {
    state.activeBoxId = null;
    state.activeItemId = null;
  }
  addBotMessage('Deleted **"' + name + '"**. ' + state.boxes.length + ' box(es) remaining.');
  setChips(['New box', 'Review all boxes', 'Done for now', 'Review by fate']);
}

function dumpChipLabel(source, target) {
  if (sameProximity(source.location, target.location)) return target.name;
  return target.location ? target.location + ' · ' + target.name : target.name;
}

function handleDump(text) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to dump. Open a box first.'); return; }
  if (box.items.length === 0) { addBotMessage('"' + box.name + '" is already empty — nothing to dump.'); return; }

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
      'Dump all ' + box.items.length + ' item(s) from **"' + box.name + '"** into which box?' +
      ' Type a new name to create one.'
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

  // Find target: exact name match first, then exact on stripped chip name,
  // then partial on box name only (not location, to avoid the location-segment bug)
  var target = null;
  for (var i = 0; i < state.boxes.length; i++) {
    var b = state.boxes[i];
    if (b.id === source.id) continue;
    if (b.name.toLowerCase() === command || b.name.toLowerCase() === chipBoxName) { target = b; break; }
  }
  if (!target) {
    for (var i = 0; i < state.boxes.length; i++) {
      var b = state.boxes[i];
      if (b.id === source.id) continue;
      // Partial match on box name only — NOT location
      if (b.name.toLowerCase().indexOf(chipBoxName) !== -1) { target = b; break; }
    }
  }

  // No match — create a new box with the typed name, then transfer
  if (!target) {
    var newBox = {
      id: uid(), name: text.trim(), location: '', notes: '',
      parentId: null, createdAt: new Date().toISOString(), items: []
    };
    state.boxes.push(newBox);
    target = newBox;
    // Transfer items to new box, then ask for its location
    var count = source.items.length;
    source.items.forEach(function(item) { target.items.push(item); });
    source.items = [];
    // Set new box as active and ask for location
    state.activeBoxId = target.id;
    state.conversationStage = 'AWAITING_LOCATION';
    addBotMessage(
      'Created **"' + target.name + '"** and dumped **' + count + '** item(s) into it.' +
      ' "' + source.name + '" is now empty.\n\nWhere is **"' + target.name + '"** located?'
    );
    return;
  }

  var count = source.items.length;
  source.items.forEach(function(item) { target.items.push(item); });
  source.items = [];
  // Re-parent direct children of source to target (preserving deeper ancestry)
  var reparented = 0;
  for (var i = 0; i < state.boxes.length; i++) {
    if (state.boxes[i].parentId === source.id) {
      state.boxes[i].parentId = target.id;
      reparented++;
    }
  }
  state.conversationStage = 'BOX_OPEN';
  var msg = 'Dumped **' + count + '** item(s) from **"' + source.name + '"** into **"' + target.name + '"**.'
    + (reparented ? ' Also moved ' + reparented + ' nested box(es).' : '')
    + ' "' + source.name + '" is now empty.';
  addBotMessage(msg);
  setChips(['Delete box', 'Add item', 'Done with this box']);
}

// ── NEST HELPERS ──────────────────────────────────────────────────────────────
function getDescendantIds(boxId) {
  // Return all descendant box IDs (children, grandchildren, etc.)
  var result = [];
  var queue = [boxId];
  while (queue.length) {
    var curr = queue.shift();
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].parentId === curr) {
        result.push(state.boxes[i].id);
        queue.push(state.boxes[i].id);
      }
    }
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
  if (!a.length || !b.length) return false;
  var shorter = a.length <= b.length ? a : b;
  var longer  = a.length <= b.length ? b : a;
  for (var i = 0; i < shorter.length; i++) {
    if (shorter[i] !== longer[i]) return false;
  }
  return true;
}
function nestChipLabel(source, candidate) {
  // Same or proximate location → just name; different → location · name
  if (sameProximity(source.location, candidate.location)) return candidate.name;
  return candidate.location ? candidate.location + ' · ' + candidate.name : candidate.name;
}

function handleNest(text) {
  var box = activeBox();

  // Parse "put <child> inside/in/on <parent>" inline — works with or without active box
  var command = text.toLowerCase().trim();
  var insideIdx = command.indexOf(' inside ');
  if (insideIdx === -1) insideIdx = command.indexOf(' in ');
  if (insideIdx === -1) insideIdx = command.indexOf(' on ');
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
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].name.toLowerCase() === childName.toLowerCase()) { child = state.boxes[i]; break; }
    }
    if (!child && childName) {
      // partial match
      for (var i = 0; i < state.boxes.length; i++) {
        if (state.boxes[i].name.toLowerCase().indexOf(childName.toLowerCase()) !== -1) {
          child = state.boxes[i]; break;
        }
      }
    }
    if (!child) child = box; // fall back to active box
    if (!child) { addBotMessage('Could not find a box named **"' + childName + '"**.'); return; }
    state.pendingNest = { childId: child.id };
    handleNestParent(parentName);
    return;
  }

  // Bare "nest" or "nest box" — needs an active box
  if (!box) { addBotMessage('No active box. Open a box first, then use _"nest"_ to put it inside another.'); return; }

  // "nest" or "nest box" — prompt for which child to nest (default active box)
  state.pendingNest = { childId: box.id };
  state.conversationStage = 'AWAITING_NEST_PARENT';
  var others = state.boxes.filter(function(b){
    return b.id !== box.id && getDescendantIds(box.id).indexOf(b.id) === -1;
  });
  if (others.length === 0) {
    addBotMessage('No other boxes to nest **"' + box.name + '"** inside. Create one first.');
    state.conversationStage = 'BOX_OPEN';
    return;
  }
  var chips = others.map(function(b){ return nestChipLabel(box, b); });
  addBotMessage('Put **"' + box.name + '"** inside which box?');
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
  for (var i = 0; i < state.boxes.length; i++) {
    var b = state.boxes[i];
    if (b.name.toLowerCase() === command || b.name.toLowerCase() === namePart) { parent = b; break; }
  }
  if (!parent) {
    for (var i = 0; i < state.boxes.length; i++) {
      var b = state.boxes[i];
      if (b.name.toLowerCase().indexOf(namePart) !== -1) { parent = b; break; }
    }
  }
  if (!parent) {
    addBotMessage('Could not find a box matching **"' + text + '"**. Try the full name.');
    return;
  }
  // Prevent circular nesting
  var descendants = getDescendantIds(nest.childId);
  if (parent.id === nest.childId || descendants.indexOf(parent.id) !== -1) {
    addBotMessage('Cannot nest a box inside itself or one of its children.');
    return;
  }

  var child = null;
  for (var i = 0; i < state.boxes.length; i++) {
    if (state.boxes[i].id === nest.childId) { child = state.boxes[i]; break; }
  }
  if (!child) { state.pendingNest = null; state.conversationStage = 'BOX_OPEN'; return; }

  child.parentId = parent.id;
  child.location = parent.location; // inherit parent's location on nest
  state.pendingNest = null;
  state.conversationStage = 'BOX_OPEN';
  renderSidebar();
  updateContextBar();
  addBotMessage('**"' + child.name + '"** is now inside **"' + parent.name + '"**.');
  setBoxOpenChips();
}

// ── UPDATED RENDERSIDEBAR (tree-aware) ────────────────────────────────────────
// ── UPDATED DELETE GUARD ──────────────────────────────────────────────────────
// (handleDeleteBox already exists — we patch it below via replace)

// ── UPDATED DUMP WITH CHILDREN ────────────────────────────────────────────────
// (handleDumpTarget patched below)

function showItemDetail(group, groupIndex) {
  var box = activeBox();
  var lines = [];
  lines.push('**' + (group.count > 1 ? group.count + ' × ' : '') + group.name + '**');
  lines.push('Fate: ' + group.fate);
  if (group.notes) lines.push('Notes: ' + group.notes);

  state.conversationStage = 'AWAITING_ITEM_VIEW';
  state.activeItemViewGroup = groupIndex;
  addBotMessage(lines.join('\n'));
  var actionChip = (group && group.fate === 'trash') ? 'Delete' : 'Trash';
  setChips(['Change fate', 'Edit notes', actionChip, 'Move to box', 'Back to list']);
}

function handleItemViewByNumber(num) {
  var box = activeBox();
  if (!box) return;
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
    for (var i = 0; i < box.items.length; i++) {
      if (box.items[i].name === group.name && box.items[i].fate === group.fate) {
        state.activeItemId = box.items[i].id;
        break;
      }
    }
    state.conversationStage = 'AWAITING_FATE';
    state.activeItemViewGroup = null;
    addBotMessage('What should we do with **' + group.name + '**?');
    setChips(FATE_TITLES);
    return;
  }
  if (command === 'move to box') {
    if (!group) { state.conversationStage = 'BOX_OPEN'; return; }
    state.conversationStage = 'AWAITING_ITEM_MOVE_TARGET';
    var boxNames = state.boxes
      .filter(function(b){ return b.id !== (box ? box.id : null); })
      .map(function(b){ return b.name; });
    addBotMessage('Move **' + group.name + '** to which box?');
    setChips(boxNames.concat(['Cancel']));
    return;
  }
  if (command === 'edit notes') {
    if (!group) { state.conversationStage = 'BOX_OPEN'; return; }
    state.conversationStage = 'AWAITING_ITEM_VIEW_NOTES';
    addBotMessage('Current notes: ' + (group.notes || '_none_') + '\n\nEnter new notes for **' + group.name + '**:');
    setChips(['Clear notes', 'Cancel']);
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
      if (it.name === group.name && it.fate === group.fate) it.notes = newNotes;
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
    if (group) { showItemDetail(group, groupIdx); }
    else { state.conversationStage = 'BOX_OPEN'; reviewBox(); }
    return;
  }

  // Find target box by name (case-insensitive)
  var target = null;
  for (var i = 0; i < state.boxes.length; i++) {
    if (state.boxes[i].name.toLowerCase() === command &&
        state.boxes[i].id !== (box ? box.id : null)) {
      target = state.boxes[i];
      break;
    }
  }

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
  var label = count > 1 ? count + ' × ' + group.name : '**' + group.name + '**';
  addBotMessage('Moved ' + label + ' to **' + target.name + '**.');
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
  if (!_mantrasEnabled || typeof addBotMessage === 'undefined') return;
  var pool = MANTRAS[context] || MANTRAS.load;
  var text = pool[Math.floor(Math.random() * pool.length)];
  addBotMessage('_' + text + '_');
}

function maybeMantraOnItem() {
  return; // no-op until copy is approved.
  _mantraItemCount++;
  if (_mantraItemCount % 7 === 0) mantra('itemAdded');
}

// ── TRASH / DISPOSAL HELPERS ──────────────────────────────────────────────────

function disposalPrompt(itemName) {
  var n = (itemName||'').toLowerCase();
  // Batteries — more accessible drop-offs than general e-waste
  if (n.match(/batter|aa|aaa|9v|lithium/)) {
    return 'Batteries can be dropped off at many libraries, hardware stores, or e-waste facilities' +
      ' \u2014 where will you take this?';
  }
  // E-waste
  var ewastePattern1 = /laptop|phone|computer|monitor|printer|cable|charger|keyboard|mouse|\btv\b/;
  var ewastePattern2 = /tablet|speaker|headphone|camera|router|hard drive|ssd|ram|cpu|gpu/;
  if (n.match(ewastePattern1) || n.match(ewastePattern2)) {
    return 'E-waste needs a special drop-off \u2014 where will you take it?';
  }
  // Clothing / textiles
  if (n.match(/shirt|dress|coat|shoe|jacket|jean|trouser|pant|sock|underwear|fabric|textile|cloth|scarf|hat|glove/)) {
    return 'Clothing can be donated or textile-recycled \u2014 where will you drop this off?';
  }
  // Hazardous / chemicals
  if (n.match(/paint|bleach|oil|chemical|pesticide|solvent|cleaner|acid|flammable|hazard/)) {
    return 'Hazardous material \u2014 where can you safely dispose of this?';
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
  if (sessionDeletedCount !== todayCount) parts.push(sessionDeletedCount + ' this session');
  return '\uD83D\uDDD1 Deleted **' + itemName + '**. ' + parts.join(', ') + '.';
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
  if (!box) return 0;
  var count = 0;
  box.items.forEach(function(item) {
    if (!item.deleted_at) { item.fate = 'trash'; count++; }
  });
  return count;
}

function deleteAllItems(box) {
  if (!box) return 0;
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
  var activeItems = box.items.filter(function(it) { return !it.deleted_at; });
  if (activeItems.length === 0) {
    addBotMessage('No items to trash.');
    reviewBox();
    return;
  }
  state.conversationStage = 'AWAITING_TRASH_ALL_CONFIRM';
  addBotMessage('Delete all **' + activeItems.length + '** item(s)?');
  setChips(['Yes', 'No']);
}

function handleTrashAllConfirm(text) {
  var command = text.toLowerCase().trim();
  var box = activeBox();
  if (!box) { state.conversationStage = 'BOX_OPEN'; return; }
  var activeItems = box.items.filter(function(it) { return !it.deleted_at; });

  if (command === 'yes' || command === 'y') {
    // Mark all active items as trash
    trashAllItems(box);
    var trashCount = activeItems.length;
    state.conversationStage = 'AWAITING_DELETE_TRASHED_CONFIRM';
    addBotMessage('Marked **' + trashCount + '** item(s) as trash.\n\nDelete all trashed items in this box?');
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
    var summary = 'Deleted **' + deletedCount + '** item(s).';
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
    'Kept **' + (item ? item.name : 'item') + '** in "' + (box ? box.name : 'box') + '".' +
    '\n\nWhat\'s the next item?' :
    'Noted. What\'s the next item?'
  addBotMessage(botMsg);
  setBoxOpenChips();
}

// ── FATE REVIEW ───────────────────────────────────────────────────────────────

function buildFateReviewPath(box) {
  var path = [box.name];
  var current = box;
  var safety = 0;
  while (current.parentId && safety < 10) {
    var parent = null;
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].id === current.parentId) { parent = state.boxes[i]; break; }
    }
    if (!parent) break;
    path.unshift(parent.name);
    current = parent;
    safety++;
  }
  return path.join(' > ');
}

function collectFateItems(fate) {
  var results = [];
  for (var b = 0; b < state.boxes.length; b++) {
    var box = state.boxes[b];
    var boxPath = buildFateReviewPath(box);
    for (var i = 0; i < box.items.length; i++) {
      var item = box.items[i];
      if (item.fate === fate) {
        results.push({ itemId: item.id, boxId: box.id, itemName: item.name, boxPath: boxPath });
      }
    }
  }
  return results;
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
    case 'unsure': return ['Mark all keep', 'Mark all donate', 'Mark all trash', 'Mark all sell', 'Cancel'];
    case 'sell':   return ['Mark all donate', 'Cancel'];
    case 'donate': return ['Mark all sell', 'Cancel'];
    case 'keep':   return ['Cancel'];
    default:       return ['Cancel'];
  }
}

function showFateReviewList(review) {
  var lines = 'Items marked **' + review.fate + '** (' + review.items.length + '):\n';
  for (var i = 0; i < review.items.length; i++) {
    var entry = review.items[i];
    lines += (i + 1) + '. **' + entry.itemName + '** (' + entry.boxPath + ')\n';
  }
  addBotMessage(lines.trim() + '\n\nWhat would you like to do?');
  setChips(['Item by item', 'Bulk action', 'Back']);
  state.conversationStage = 'AWAITING_FATE_REVIEW_ACTION';
}

function handleFateReviewMenu() {
  var counts = {};
  for (var b = 0; b < state.boxes.length; b++) {
    for (var i = 0; i < state.boxes[b].items.length; i++) {
      var fate = state.boxes[b].items[i].fate;
      counts[fate] = (counts[fate] || 0) + 1;
    }
  }
  var chips = [];
  var fateOrder = ['unsure', 'trash', 'sell', 'donate', 'keep'];
  for (var f = 0; f < fateOrder.length; f++) {
    var fate = fateOrder[f];
    if (counts[fate]) chips.push('Review ' + fate + ' (' + counts[fate] + ')');
  }
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
    addBotMessage('No items marked **' + cleanFate + '** in your inventory.');
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
    if (review) addBotMessage('Fate review cancelled.');
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
    addBotMessage('Apply a bulk action to all **' + review.fate + '** items (' + review.items.length + ')?');
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
    addBotMessage('Done reviewing all **' + review.fate + '** items.');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }
  var entry = review.items[review.index];
  var item = null;
  for (var b = 0; b < state.boxes.length; b++) {
    if (state.boxes[b].id !== entry.boxId) continue;
    for (var i = 0; i < state.boxes[b].items.length; i++) {
      if (state.boxes[b].items[i].id === entry.itemId) { item = state.boxes[b].items[i]; break; }
    }
  }
  if (!item) {
    review.index++;
    showFateReviewCurrentItem(review);
    return;
  }
  var progress = (review.index + 1) + ' of ' + review.items.length;
  var msg = '**' + item.name + '** (' + entry.boxPath + ') [' + progress + ']';
  if (item.notes) msg += '\nNotes: ' + item.notes;
  msg += '\n\nWhat would you like to do with this one?';
  addBotMessage(msg);
  setChips(fateReviewChips(review.fate).concat(['Done reviewing']));
  state.conversationStage = 'AWAITING_FATE_REVIEW_ITEM';
}

function handleFateReviewItem(text) {
  var command = text.toLowerCase().trim();
  var review = state.pendingFateReview;
  if (!review) { state.conversationStage = 'BOX_OPEN'; return; }

  var entry = review.items[review.index];
  var box = null, item = null;
  for (var b = 0; b < state.boxes.length; b++) {
    if (state.boxes[b].id === entry.boxId) {
      box = state.boxes[b];
      for (var i = 0; i < box.items.length; i++) {
        if (box.items[i].id === entry.itemId) { item = box.items[i]; break; }
      }
      break;
    }
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
  if (command === 'keep')                     newFate = 'keep';
  if (command === 'donate' || command === 'mark as donate') newFate = 'donate';
  if (command === 'sell'   || command === 'mark as sell')   newFate = 'sell';
  if (command === 'move to unsure')           newFate = 'unsure';

  if (newFate && item) {
    item.fate = newFate;
    addBotMessage('Updated **' + item.name + '** to **' + newFate + '**.');
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
    addBotMessage('\uD83D\uDDD1 **' + item.name + '** \u2014 delete now?');
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
    addBotMessage('Enter notes for **' + item.name + '**:');
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
    addBotMessage('What should we do with **' + item.name + '**?');
    setChips(['Keep', 'Donate', 'Trash', 'Sell', 'Unsure']);
    state.pendingFateReview._resumeAfterFate = true;
    return;
  }

  if (command === 'add to kit') {
    addBotMessage('Kit assembly is on the punchlist \u2014 coming soon!');
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

  var newFate = null;
  if (command === 'mark all keep')   newFate = 'keep';
  if (command === 'mark all donate') newFate = 'donate';
  if (command === 'mark all trash')  newFate = 'trash';
  if (command === 'mark all sell')   newFate = 'sell';

  if (newFate) {
    var updateCount = 0;
    for (var i = 0; i < review.items.length; i++) {
      var reviewEntry = review.items[i];
      for (var b = 0; b < state.boxes.length; b++) {
        if (state.boxes[b].id !== reviewEntry.boxId) continue;
        for (var j = 0; j < state.boxes[b].items.length; j++) {
          if (state.boxes[b].items[j].id === reviewEntry.itemId) {
            state.boxes[b].items[j].fate = newFate;
            updateCount++;
          }
        }
      }
    }
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage('Updated **' + updateCount + '** items to **' + newFate + '**.');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  if (command === 'delete all') {
    var deleteCount = 0;
    for (var i = 0; i < review.items.length; i++) {
      var reviewEntry = review.items[i];
      for (var b = 0; b < state.boxes.length; b++) {
        if (state.boxes[b].id !== reviewEntry.boxId) continue;
        var before = state.boxes[b].items.length;
        deleteCount += removeItem(state.boxes[b], reviewEntry.itemId);
      }
    }
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage(deletionLog(deleteCount + ' items') + ' All **' + review.fate + '** items deleted.');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  if (command === 'move all to unsure') {
    var moveCount = 0;
    for (var i = 0; i < review.items.length; i++) {
      var reviewEntry = review.items[i];
      for (var b = 0; b < state.boxes.length; b++) {
        if (state.boxes[b].id !== reviewEntry.boxId) continue;
        for (var j = 0; j < state.boxes[b].items.length; j++) {
          if (state.boxes[b].items[j].id === reviewEntry.itemId) {
            state.boxes[b].items[j].fate = 'unsure';
            moveCount++;
          }
        }
      }
    }
    state.pendingFateReview = null;
    state.conversationStage = 'FINISHED';
    addBotMessage('Moved **' + moveCount + '** items to unsure.');
    setChips(['New box', 'Continue last box', 'Review all boxes', 'Review by fate']);
    return;
  }

  addBotMessage('Apply a bulk action to all **' + review.fate + '** items (' + review.items.length + ')?');
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
  if (typeof document === 'undefined') return;
  var sidebar = document.getElementById('sidebar-content');
  if (!sidebar) return;

  sidebar.addEventListener('dragstart', function(e) {
    var card = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (!card) return;
    _dragSrcId = card.getAttribute('data-box-id');
    card.style.opacity = '0.5';
    e.dataTransfer.effectAllowed = 'move';
  });

  sidebar.addEventListener('dragend', function(e) {
    var card = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (card) card.style.opacity = '';
    // Remove all drag-over highlights
    var cards = sidebar.querySelectorAll('[data-box-id]');
    for (var i = 0; i < cards.length; i++) cards[i].classList.remove('drag-over');
  });

  sidebar.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    var card = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (!card || card.getAttribute('data-box-id') === _dragSrcId) return;
    var cards = sidebar.querySelectorAll('[data-box-id]');
    for (var i = 0; i < cards.length; i++) cards[i].classList.remove('drag-over');
    card.classList.add('drag-over');
  });

  sidebar.addEventListener('drop', function(e) {
    e.preventDefault();
    var card = e.target.closest ? e.target.closest('[data-box-id]') : null;
    if (!card) return;
    var targetId = card.getAttribute('data-box-id');
    if (!targetId || targetId === _dragSrcId) return;

    // Find source and target in state.boxes and reorder
    var srcIdx = -1, tgtIdx = -1;
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].id === _dragSrcId) srcIdx = i;
      if (state.boxes[i].id === targetId)   tgtIdx = i;
    }
    if (srcIdx === -1 || tgtIdx === -1) return;

    // Only reorder within the same parent level
    var srcParent = state.boxes[srcIdx].parentId || null;
    var tgtParent = state.boxes[tgtIdx].parentId || null;
    if (srcParent !== tgtParent) return;

    var moved = state.boxes.splice(srcIdx, 1)[0];
    // Recalculate tgtIdx after splice
    tgtIdx = -1;
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].id === targetId) { tgtIdx = i; break; }
    }
    state.boxes.splice(tgtIdx, 0, moved);
    renderSidebar();
    _dragSrcId = null;
  });
}

// Export core globals for Node.js testing
if (typeof module !== 'undefined') {
  module.exports = { state, FATES, LETTERS, uid, activeBox, activeItem, countFates,
    processInput, handleMove, handleBatchConfirm, handleBatchQty,
    commitBatch, handleFate, handleItemNotes, handleItemName,
    handleBoxName, handleBoxBatchConfirm, handleBoxBatchQty, handleBoxBatchLocation,
    singularize, singularizeLast, handleLocation, startNewBox, doneWithBox, reviewBox,
    handleDeleteBox, handleDeleteBoxConfirm, handleDump, handleDumpTarget,
    groupItems, boxSummaryLine,
    handleNest, handleNestParent, getDescendantIds, childBoxes,
    renderBoxTree, groupItems, sameProximity, locSegments,
    handleItemViewByNumber, handleItemViewAction, handleItemViewNotes, showItemDetail,
    handleItemMoveTarget,
    addItem, removeItem,
    getBudgetItems: function(){ return _budgetItems; },
    mantra,
    MANTRAS,
    handleFinished,
    maybeMantraOnItem,
    setMantrasEnabled: function(v){ _mantrasEnabled = v; },
    getMantrasEnabled: function(){ return _mantrasEnabled; },
    selectBox, toggleCollapse,
    inputHistory, historyDraft, getHistoryIndex: function(){ return historyIndex; },
    setHistoryIndex: function(v){ historyIndex = v; },
    handleKey,
    importJSON,
    importCSV,
    handleImportCSV,
    handleHelp,
    saveState,
    escapeCSV,
    exportCSV,
    parseCSV,
    parseCSVLine,
    importCSV,
    handleImportCSV,
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
