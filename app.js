// app.js — Sortie core logic
// DOM-touching functions (addBotMessage, setChips, renderSidebar, etc.)
// are expected to be defined globally or stubbed before this file runs.

var state = {
  boxes: [],
  activeBoxId: null,
  activeItemId: null,
  pendingBatch: null,
  pendingBoxBatch: null,
  pendingDeleteBoxId: null,
  pendingNest: null,
  conversationStage: 'WELCOME',
  conversationHistory: []
};
var FATES = ['keep','donate','trash','sell','unsure'];
var pendingPhotos = [];
var collapsedBoxIds = [];
function toggleCollapse(id) {
  var idx = collapsedBoxIds.indexOf(id);
  if (idx === -1) collapsedBoxIds.push(id);
  else collapsedBoxIds.splice(idx, 1);
  renderSidebar();
}

function saveState() { localStorage.setItem('sortie_state', JSON.stringify(state)); }
function loadState() {
  var raw = localStorage.getItem('sortie_state');
  if (raw) { try {
    state = JSON.parse(raw);
    // Normalise parentId: undefined -> null for boxes saved before nesting was added
    for (var i = 0; i < state.boxes.length; i++) {
      if (state.boxes[i].parentId === undefined) state.boxes[i].parentId = null;
    }
  } catch(e) {} }
}

function uid() { return Math.random().toString(36).slice(2,9); }
function activeBox() {
  for (var i=0;i<state.boxes.length;i++) { if (state.boxes[i].id===state.activeBoxId) return state.boxes[i]; }
  return null;
}
function activeItem() {
  var box = activeBox();
  if (!box || !state.activeItemId) return null;
  for (var i=0;i<box.items.length;i++) { if (box.items[i].id===state.activeItemId) return box.items[i]; }
  return null;
}
function countFates(box) {
  var c = {keep:0,donate:0,trash:0,sell:0,unsure:0};
  for (var i=0;i<box.items.length;i++) { var f=box.items[i].fate; if (c[f]!==undefined) c[f]++; }
  return c;
}

function renderSidebar() {
  var el = document.getElementById('sidebar-content');
  var cnt = document.getElementById('box-count');
  cnt.textContent = state.boxes.length + ' box' + (state.boxes.length!==1?'es':'');
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
    var total = box.items.length;
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
    html += '<div class="box-card' + ac + '" style="margin-left:' + indent + 'px" onclick="selectBox(\'' + box.id + '\')">'
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
  saveState(); renderSidebar(); updateContextBar();
  var box = activeBox();
  var summary = box.items.length > 0 ? boxSummaryLine(box) : 'empty';
  addBotMessage('Switched to **'+box.name+'**. Contents: '+summary+'.\n\nWhat would you like to do?');
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
    label.textContent = 'No active box \u2014 say hi to get started';
  }
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function renderMarkdown(s) {
  return s.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/_(.+?)_/g,'<em>$1</em>').replace(/\n/g,'<br/>');
}

if (typeof document !== 'undefined') {
function addBotMessage(text, photos) {
  var msgs = document.getElementById('chat-messages');
  var div = document.createElement('div');
  div.className = 'msg bot';
  var ph = '';
  if (photos && photos.length) for (var i=0;i<photos.length;i++) ph+='<img src="'+photos[i].dataUrl+'" class="chat-photo" alt="'+escHtml(photos[i].name)+'"/>';
  div.innerHTML = '<div class="msg-avatar">S</div><div class="msg-bubble"><p>'+renderMarkdown(text)+'</p>'+ph+'</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  state.conversationHistory.push({role:'assistant',content:text});
}

function addUserMessage(text, photos) {
  var msgs = document.getElementById('chat-messages');
  var div = document.createElement('div');
  div.className = 'msg user';
  var ph = '';
  if (photos && photos.length) for (var i=0;i<photos.length;i++) ph+='<img src="'+photos[i].dataUrl+'" class="chat-photo" alt="'+escHtml(photos[i].name)+'"/>';
  div.innerHTML = '<div class="msg-avatar">You</div><div class="msg-bubble"><p>'+escHtml(text)+'</p>'+ph+'</div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  state.conversationHistory.push({role:'user',content:text});
}

function setChips(chips) {
  var el = document.getElementById('quick-replies');
  var html = '';
  for (var i=0;i<chips.length;i++) {
    var c=chips[i];
    var fc = FATES.indexOf(c.toLowerCase())!==-1?' fate-'+c.toLowerCase():'';
    html += '<button class="chip'+fc+'" onclick="chipClick(\''+escHtml(c)+'\')">'+escHtml(c)+'</button>';
  }
  el.innerHTML = html;
}
function chipClick(t) {
  if (t==='Move box') t='move';
  document.getElementById('user-input').value=t; sendUserMessage();
}
function showTyping() { document.getElementById('typing').classList.add('visible'); document.getElementById('chat-messages').scrollTop=9999; }
function hideTyping() { document.getElementById('typing').classList.remove('visible'); }

function handleKey(e) { if (e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendUserMessage();} }
function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

function handlePhotoUpload(event) {
  var files = Array.from(event.target.files);
  for (var i=0;i<files.length;i++) {
    (function(file){
      var reader = new FileReader();
      reader.onload = function(e){ pendingPhotos.push({name:file.name,dataUrl:e.target.result}); };
      reader.readAsDataURL(file);
    })(files[i]);
  }
  addBotMessage('\uD83D\uDCF7 Got '+files.length+' photo(s). They\'ll be attached to the next item you log.');
  setChips([]);
}

async function sendUserMessage() {
  var input = document.getElementById('user-input');
  var text = input.value.trim();
  var photos = pendingPhotos.slice();
  pendingPhotos = [];
  document.getElementById('photo-input').value = '';
  if (!text && !photos.length) return;
  input.value = ''; input.style.height = 'auto';
  setChips([]);
  addUserMessage(text, photos);
  showTyping();
  await new Promise(function(r){setTimeout(r,500);});
  hideTyping();
  processInput(text, photos);
  renderSidebar(); updateContextBar(); saveState();
}

}

function processInput(text, photos) {
  var t = text.toLowerCase().trim();
  if (t==='y') { t='yes'; text='yes'; }
  if (t==='n') { t='no';  text='no';  }
  if (t==='reset'||t==='start over') { clearAll(); return; }
  if (t==='review items'&&activeBox()) { reviewBox(); return; }
  if (t==='new box') { startNewBox(); return; }
  if (t==='done with this box'||t==='done'||t==='skip to next box') { doneWithBox(); return; }
  if (t==='add item') {
    if (!activeBox()) {
      addBotMessage('No active box \u2014 open a box first, or start a new one.');
      setChips(['New box', 'Continue last box', 'Review all boxes']);
    } else {
      state.conversationStage='BOX_OPEN';
      addBotMessage('What\'s the item?');
    }
    return;
  }
  if (t==='start sorting'||t==='start new box') { return; } // chips handled by init, ignore if replayed
  if (t==='continue last box') {
    if (state.activeBoxId && activeBox()) { selectBox(state.activeBoxId); }
    else if (state.boxes.length > 0) { selectBox(state.boxes[state.boxes.length - 1].id); }
    else { startNewBox(); }
    return;
  }
  if (t==='delete box') { handleDeleteBox(); return; }
  if (t==='nest box' || t==='put inside') { handleNest(text); return; }
  if (t==='dump into...') { handleDump('dump'); return; }
  if (t==='done for now') { handleFinished('done'); return; }
  if (t==='review all boxes') { handleFinished('review all'); return; }

  // Delete box command: "delete box" or "delete this box"
  if (t === 'delete box' || t === 'delete this box') { handleDeleteBox(); return; }
  // Confirm delete box
  if (state.conversationStage === 'AWAITING_DELETE_BOX_CONFIRM') { handleDeleteBoxConfirm(text); return; }

  // Dump command: "dump into <box name>" or "dump"
  if (t === 'dump' || t.startsWith('dump into ') || t.startsWith('dump ')) { handleDump(text); return; }
  if (state.conversationStage === 'AWAITING_DUMP_TARGET') { handleDumpTarget(text); return; }

  // Remove command: "remove <name or number>" or "delete <name or number>"
  if (t === 'remove' || t === 'delete' || t.startsWith('remove ') || t.startsWith('delete ')) {
    var removeArg = t.startsWith('remove ') ? text.slice(7).trim()
                  : t.startsWith('delete ') ? text.slice(7).trim()
                  : '';
    handleRemove(removeArg); return;
  }

  // Nest command: "nest", "put <box> inside <box>", "put inside"
  if (t === 'nest' || t === 'put inside' || t === 'nest box') { handleNest(text); return; }
  // "put X inside/in/on Y" or "nest X inside/in/on Y" — require a preposition
  if ((t.startsWith('put ') || t.startsWith('nest ')) &&
      (t.indexOf(' inside ') !== -1 || t.indexOf(' in ') !== -1 || t.indexOf(' on ') !== -1)) {
    handleNest(text); return;
  }
  if (state.conversationStage === 'AWAITING_NEST_CHILD') { handleNestChild(text); return; }
  if (state.conversationStage === 'AWAITING_NEST_PARENT') { handleNestParent(text); return; }

  // Move command: "move [location]" or "m [location]"
  if (t==='m'||t==='move'||t.startsWith('move ')||t.startsWith('m ')) {
    var loc = t.startsWith('move ') ? text.slice(5).trim()
            : t.startsWith('m ')    ? text.slice(2).trim()
            : '';
    handleMove(loc); return;
  }
  // Response to awaiting move location
  if (state.conversationStage==='AWAITING_MOVE_LOCATION') { handleMove(text); return; }

  switch(state.conversationStage) {
    case 'WELCOME':               handleWelcome(text,photos); break;
    case 'AWAITING_BOX_NAME':         handleBoxName(text); break;
    case 'AWAITING_BOX_BATCH_CONFIRM': handleBoxBatchConfirm(text); break;
    case 'AWAITING_BOX_BATCH_QTY':     handleBoxBatchQty(text); break;
    case 'AWAITING_BOX_BATCH_LOCATION': handleBoxBatchLocation(text); break;
    case 'AWAITING_LOCATION':           handleLocation(text); break;
    case 'BOX_OPEN':              handleItemName(text,photos); break;
    case 'AWAITING_ITEM_NAME':    handleItemName(text,photos); break;
    case 'AWAITING_BATCH_CONFIRM':handleBatchConfirm(text,photos); break;
    case 'AWAITING_BATCH_QTY':    handleBatchQty(text); break;
    case 'AWAITING_BATCH_FATE':   handleBatchFate(text,photos); break;
    case 'AWAITING_ITEM_DESC':    handleItemDesc(text,photos); break;
    case 'AWAITING_FATE':         handleFate(text,photos); break;
    case 'AWAITING_ITEM_NOTES':   handleItemNotes(text); break;
    case 'AWAITING_NEST_CHILD':    handleNestChild(text); break;
    case 'AWAITING_NEST_PARENT':   handleNestParent(text); break;
    case 'FINISHED':              handleFinished(text); break;
    default: handleFreeform(text,photos);
  }
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

function handleRemove(arg) {
  var box = activeBox();
  if (!box) { addBotMessage('No active box. Open a box first.'); return; }
  if (!arg || !arg.trim()) {
    addBotMessage('What would you like to remove? Say _"remove <item name>"_ or _"remove <number>"_ (use "review items" to see the list).');
    return;
  }

  // Build groups (same as reviewBox uses) so Remove N maps to group N
  var groups = groupItems(box.items);
  var num = parseInt(arg, 10);
  var removedName = null;
  var removedCount = 0;

  if (!isNaN(num) && num >= 1 && num <= groups.length) {
    // Remove by group number — remove ALL items in that group
    var g = groups[num - 1];
    removedName = g.name;
    removedCount = g.count;
    var key = g.name + '|' + g.fate;
    box.items = box.items.filter(function(it) {
      return !(it.name === g.name && it.fate === g.fate);
    });
    if (state.activeItemId) {
      var still = box.items.some(function(it){ return it.id === state.activeItemId; });
      if (!still) state.activeItemId = null;
    }
  } else {
    // Remove by name — remove ALL items matching the name
    var argLower = arg.toLowerCase();
    var matchName = null;
    for (var i = 0; i < box.items.length; i++) {
      if (box.items[i].name.toLowerCase() === argLower) { matchName = box.items[i].name; break; }
    }
    if (!matchName) {
      for (var i = 0; i < box.items.length; i++) {
        if (box.items[i].name.toLowerCase().indexOf(argLower) !== -1) { matchName = box.items[i].name; break; }
      }
    }
    if (!matchName) {
      addBotMessage('Could not find **"' + arg + '"** in "' + box.name + '". Use _"review items"_ to see the list, then _"remove <number>"_ to delete one.');
      return;
    }
    removedName = matchName;
    removedCount = box.items.filter(function(it){ return it.name === matchName; }).length;
    box.items = box.items.filter(function(it){ return it.name !== matchName; });
    if (state.activeItemId) {
      var still = box.items.some(function(it){ return it.id === state.activeItemId; });
      if (!still) state.activeItemId = null;
    }
  }

  state.conversationStage = 'BOX_OPEN';
  var countLabel = removedCount > 1 ? removedCount + ' \u00d7 ' : '';

  if (box.items.length === 0) {
    addBotMessage('Removed **"' + countLabel + removedName + '"** from "' + box.name + '". The box is now empty.');
    setChips(['Add item', 'Move box', 'Done with this box', 'Delete box']);
  } else {
    // Re-show grouped list
    var newGroups = groupItems(box.items);
    var lines = '';
    var removeChips = [];
    for (var i = 0; i < newGroups.length; i++) {
      var g = newGroups[i];
      var prefix = g.count > 1 ? g.count + ' \u00d7 ' : '';
      lines += (i+1) + '. **' + prefix + g.name + '** \u2192 ' + g.fate + '\n';
      removeChips.push('Remove ' + (i+1));
    }
    addBotMessage('Removed **"' + countLabel + removedName + '"**. Remaining in "' + box.name + '":\n' + lines.trim());
    setChips(removeChips.concat(['Add item', 'Move box', 'Done with this box']));
  }
}

function handleWelcome(text, photos) {
  addBotMessage('Welcome to **Sortie**! I\'ll help you sort through boxes, log what\'s inside, and decide what to do with each item.\n\nLet\'s start with your first box. What would you like to call it?');
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
  return w; // already singular or unrecognised
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

var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function handleBoxName(text) {
  var raw = text.trim() || 'Unnamed box';
  // Check for batch: "five wooden boxes", "3 shelves"
  var parsed = parseQuantity(raw);
  if (parsed && parsed.qty >= 2 && parsed.qty <= 26) {
    var singular = singularizeLast(parsed.itemName);
    state.pendingBoxBatch = { qty: parsed.qty, baseName: singular };
    state.conversationStage = 'AWAITING_BOX_BATCH_CONFIRM';
    addBotMessage('I see **' + parsed.qty + ' \u00d7 ' + singular + '**. Should I create ' + parsed.qty + ' boxes named **' + singular + ' A** through **' + singular + ' ' + LETTERS[parsed.qty-1] + '**?');
    setChips(['Yes, create ' + parsed.qty, 'No, just 1', 'Change quantity']);
    return;
  }
  var box = {id:uid(),name:raw,location:'',notes:'',parentId:null,createdAt:new Date().toISOString(),items:[]};
  state.boxes.push(box); state.activeBoxId=box.id;
  state.conversationStage='AWAITING_LOCATION';
  addBotMessage('Got it \u2014 **"'+raw+'"**.\n\nWhere is this box located? (e.g. "spare bedroom", "garage shelf 2", "storage unit A")');
}

function handleBoxBatchConfirm(text) {
  var t = text.toLowerCase().trim();
  var batch = state.pendingBoxBatch;
  if (!batch) { state.conversationStage = 'AWAITING_BOX_NAME'; return; }

  if (t.startsWith('no') || t.includes('just 1') || t === '1') {
    state.pendingBoxBatch = null;
    var box = {id:uid(),name:batch.baseName,location:'',notes:'',parentId:null,createdAt:new Date().toISOString(),items:[]};
    state.boxes.push(box); state.activeBoxId=box.id;
    state.conversationStage='AWAITING_LOCATION';
    addBotMessage('Just the one **"'+batch.baseName+'"** then.\n\nWhere is this box located?');
    return;
  }
  if (t.includes('change') || t.includes('quantity')) {
    addBotMessage('How many **' + batch.baseName + '** boxes are there?');
    state.conversationStage = 'AWAITING_BOX_BATCH_QTY';
    return;
  }
  // Affirmative
  var numMatch = t.match(/\d+/);
  var qty = numMatch ? parseInt(numMatch[0], 10) : batch.qty;
  batch.qty = qty;
  state.conversationStage = 'AWAITING_BOX_BATCH_LOCATION';
  addBotMessage('Where are all ' + qty + ' **' + batch.baseName + '** boxes located? (They\'ll share the same location)');
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
  addBotMessage('Got it \u2014 **' + qty + ' \u00d7 ' + batch.baseName + '**. Create boxes **' + batch.baseName + ' A** through **' + batch.baseName + ' ' + LETTERS[qty-1] + '**?');
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
  addBotMessage('Created **' + batch.qty + '** boxes in _' + location + '_:\n' + names.join(', ') + '.\n\nStarting with **' + names[0] + '**. Tell me about the first item you pick up.');
  setChips(['Skip to next box','Review items','Done']);
}

function handleLocation(text) {
  var box=activeBox(); box.location=text.trim()||'unspecified';
  state.conversationStage='BOX_OPEN';
  addBotMessage('Perfect. Box **"'+box.name+'"** is in _'+box.location+'_.\n\nNow let\'s sort through it. Tell me about the **first item** you pick up \u2014 what is it?');
  setChips(['Skip to next box','Review items','Done']);
}

var WORD_NUMBERS = {
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
  var box=activeBox(); if(!box){startNewBox();return;}
  var parsed=parseQuantity(text);
  if (parsed) {
    state.pendingBatch={qty:parsed.qty,itemName:parsed.itemName,photos:photos||[]};
    state.conversationStage='AWAITING_BATCH_CONFIRM';
    addBotMessage('I see **'+parsed.qty+' \u00d7 '+parsed.itemName+'**. Should I log '+parsed.qty+' separate entries for these, all with the same fate?');
    setChips(['Yes, log '+parsed.qty,'No, just 1','Change quantity']);
    return;
  }
  var name=text.trim()||'Unknown item';
  var item={id:uid(),name:name,description:'',fate:'unsure',notes:'',photos:photos||[],addedAt:new Date().toISOString()};
  box.items.push(item); state.activeItemId=item.id;
  state.conversationStage='AWAITING_FATE';
  addBotMessage('**'+name+'** \u2014 noted.\n\nWhat should we do with it?');
  setChips(['Keep','Donate','Trash','Sell','Unsure']);
}

function handleBatchConfirm(text, photos) {
  var t=text.toLowerCase().trim(); var batch=state.pendingBatch;
  if (t.indexOf('change')!==-1||t.indexOf('quantity')!==-1) {
    addBotMessage('How many **'+batch.itemName+'** are there?');
    state.conversationStage='AWAITING_BATCH_QTY'; setChips([]); return;
  }
  if (t.startsWith('no')||t.indexOf('just 1')!==-1||t==='1') {
    state.pendingBatch=null;
    var box=activeBox();
    var item={id:uid(),name:batch.itemName,description:'',fate:'unsure',notes:'',photos:batch.photos,addedAt:new Date().toISOString()};
    box.items.push(item); state.activeItemId=item.id;
    state.conversationStage='AWAITING_FATE';
    addBotMessage('Just the one **'+batch.itemName+'** then. What should we do with it?');
    setChips(['Keep','Donate','Trash','Sell','Unsure']); return;
  }
  if (t.startsWith('yes')||t.indexOf('log')!==-1||t.indexOf('confirm')!==-1||t.match(/^\d+$/)) {
    var nm=t.match(/\d+/); var qty=nm?parseInt(nm[0],10):batch.qty;
    commitBatch(qty,batch.itemName,batch.photos); return;
  }
  addBotMessage('Log **'+batch.qty+' \u00d7 '+batch.itemName+'** as separate entries?');
  setChips(['Yes, log '+batch.qty,'No, just 1','Change quantity']);
}

function handleBatchQty(text) {
  var batch=state.pendingBatch; if(!batch){state.conversationStage='BOX_OPEN';return;}
  var parsed=parseQuantity(text);
  var wordQty=WORD_NUMBERS[text.toLowerCase().trim()];
  var qty=wordQty||(parsed&&parsed.qty)||parseInt(text,10);
  if (!qty||isNaN(qty)||qty<1) { addBotMessage('Sorry, I didn\'t catch a number. How many **'+batch.itemName+'** are there?'); return; }
  batch.qty=qty; state.conversationStage='AWAITING_BATCH_CONFIRM';
  addBotMessage('Got it \u2014 **'+qty+' \u00d7 '+batch.itemName+'**. Log them all as separate entries?');
  setChips(['Yes, log '+qty,'No, just 1']);
}

function commitBatch(qty, itemName, photos) {
  var box=activeBox(); var now=new Date().toISOString(); var firstId=uid();
  for (var i=0;i<qty;i++) {
    box.items.push({id:i===0?firstId:uid(),name:itemName,description:'',fate:'unsure',notes:'',photos:i===0?photos:[],addedAt:now,batchSize:qty});
  }
  state.activeItemId=firstId; state.pendingBatch=null;
  state.conversationStage='AWAITING_BATCH_FATE';
  addBotMessage('Logged **'+qty+' \u00d7 '+itemName+'**. What should we do with all of them?');
  setChips(['Keep','Donate','Trash','Sell','Unsure','Mixed fates']);
}

function handleBatchFate(text, photos) {
  var box=activeBox(); var t=text.toLowerCase().trim();
  if (t.indexOf('mixed')!==-1) {
    addBotMessage('No problem \u2014 I\'ll ask about each one individually.');
    state.conversationStage='AWAITING_FATE'; setChips(['Keep','Donate','Trash','Sell','Unsure']); return;
  }
  var matched=null; for(var i=0;i<FATES.length;i++){if(t.indexOf(FATES[i])!==-1){matched=FATES[i];break;}}
  if (!matched) { addBotMessage('What should we do with all of them?'); setChips(['Keep','Donate','Trash','Sell','Unsure','Mixed fates']); return; }
  var anchor=activeItem();
  if (anchor) { for(var i=0;i<box.items.length;i++){if(box.items[i].name===anchor.name&&box.items[i].addedAt===anchor.addedAt)box.items[i].fate=matched;} }
  var fm={keep:'\u2705 **Keep** \u2014 all going back home.',donate:'\uD83D\uDC99 **Donate** \u2014 great!',trash:'\uD83D\uDDD1 **Trash** \u2014 out they go.',sell:'\uD83D\uDCB0 **Sell** \u2014 nice haul!',unsure:'\uD83E\uDD37 **Unsure** \u2014 we\'ll revisit.'};
  state.activeItemId=null; state.conversationStage='BOX_OPEN';
  addBotMessage(fm[matched]+'\n\n**'+box.items.length+'** item(s) logged in "'+box.name+'". What\'s next?');
  setBoxOpenChips();
}

function handleItemDesc(text, photos) {
  var item=activeItem(); if(!item){state.conversationStage='BOX_OPEN';handleFreeform(text,photos);return;}
  item.description=text.trim();
  if(photos&&photos.length) for(var i=0;i<photos.length;i++) item.photos.push(photos[i]);
  state.conversationStage='AWAITING_FATE';
  addBotMessage('Got it. What should we do with **'+item.name+'**?');
  setChips(['Keep','Donate','Trash','Sell','Unsure']);
}

function handleFate(text, photos) {
  var item=activeItem(); if(!item){state.conversationStage='BOX_OPEN';handleFreeform(text,photos);return;}
  var t=text.toLowerCase().trim();
  var matched=null; for(var i=0;i<FATES.length;i++){if(t.indexOf(FATES[i])!==-1){matched=FATES[i];break;}}
  if (!matched) { addBotMessage('I didn\'t catch that \u2014 what should we do with **'+item.name+'**?'); setChips(['Keep','Donate','Trash','Sell','Unsure']); return; }
  item.fate=matched;
  if(photos&&photos.length) for(var i=0;i<photos.length;i++) item.photos.push(photos[i]);
  var fm={keep:'\u2705 **Keep** \u2014 going back home.',donate:'\uD83D\uDC99 **Donate** \u2014 someone will love this.',trash:'\uD83D\uDDD1 **Trash** \u2014 out it goes.',sell:'\uD83D\uDCB0 **Sell** \u2014 make some money!',unsure:'\uD83E\uDD37 **Unsure** \u2014 we\'ll revisit it.'};
  state.conversationStage='AWAITING_ITEM_NOTES';
  addBotMessage(fm[matched]+'\n\nAny notes about this one? (condition, value, destination) \u2014 or say _"next"_ to move on.');
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
  state.activeBoxId=null; state.activeItemId=null; state.conversationStage='FINISHED';
  addBotMessage('Nice work on **"'+box.name+'"**!\n\nSummary: '+summary+'.\n\nReady to tackle another box, or are you done for now?');
  setChips(['New box','Done for now','Review all boxes']);
}

// Group items by name+fate, return array of {name, fate, count, notes}
function groupItems(items) {
  var groups = [];
  var seen = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    var key = it.name + '|' + it.fate;
    if (seen[key] !== undefined) {
      groups[seen[key]].count++;
    } else {
      seen[key] = groups.length;
      groups.push({ name: it.name, fate: it.fate, count: 1, notes: it.notes });
    }
  }
  return groups;
}

// One-line summary of a box's contents, grouped
function boxSummaryLine(box) {
  if (box.items.length === 0) return 'empty';
  var groups = groupItems(box.items);
  return groups.map(function(g) {
    return (g.count > 1 ? g.count + ' × ' : '') + g.name + ' → ' + g.fate;
  }).join(', ');
}

function reviewBox() {
  var box=activeBox();
  if(!box||box.items.length===0){addBotMessage('This box has no items logged yet. Add some!');return;}
  var groups = groupItems(box.items);
  var lines='';
  var removeChips=[];
  for(var i=0;i<groups.length;i++){
    var g=groups[i];
    var prefix = g.count > 1 ? g.count + ' \u00d7 ' : '';
    lines+=(i+1)+'. **'+prefix+g.name+'** \u2192 '+g.fate+(g.notes?' ('+g.notes+')':'')+'\n';
    removeChips.push('Remove '+(i+1));
  }
  var header = box.items.length !== groups.length
    ? '**Items in "'+box.name+'" ('+box.items.length+' items, '+groups.length+' unique):**'
    : '**Items in "'+box.name+'":**';
  addBotMessage(header+'\n'+lines.trim());
  setChips(removeChips.concat(['Add item','Move box','Done with this box']));
  state.conversationStage='BOX_OPEN';
}

function handleFinished(text) {
  var t=text.toLowerCase();
  if(t.indexOf('new box')!==-1||t.indexOf('another')!==-1){startNewBox();}
  else if(t.indexOf('done')!==-1||t.indexOf('stop')!==-1){
    var total=0; for(var i=0;i<state.boxes.length;i++) total+=state.boxes[i].items.length;
    addBotMessage('Great session! You\'ve sorted **'+state.boxes.length+'** box(es) with **'+total+'** items total.\n\nYou can download your data anytime with the buttons at the top. \uD83D\uDCE6');
    setChips(['Start new box']);
  } else if(t.indexOf('review all')!==-1){
    var lines='';
    for(var i=0;i<state.boxes.length;i++){
      var b=state.boxes[i];
      var loc = b.location ? ' (' + b.location + ')' : '';
      lines+='**'+b.name+'**'+loc+' \u2014 '+boxSummaryLine(b)+'\n';
    }
    addBotMessage('**All boxes:**\n'+lines.trim()); setChips(['New box','Done for now']);
  } else { handleFreeform(text,[]); }
}

function handleFreeform(text, photos) {
  var t = text.toLowerCase().trim();
  var greetings = ['hi','hello','hey','help','?','list boxes','inventory','start'];
  if (greetings.indexOf(t) !== -1 || !activeBox()) {
    if (state.boxes.length === 0) {
      addBotMessage('Hello! Ready to start sorting? Tell me what to call your first box.');
      state.conversationStage = 'AWAITING_BOX_NAME';
      setChips(['Start sorting']);
    } else {
      addBotMessage('Welcome back! You have **' + state.boxes.length + '** box(es). What would you like to do?');
      state.conversationStage = 'FINISHED';
      setChips(['New box', 'Continue last box', 'Review all boxes']);
    }
    return;
  }
  addBotMessage('I\'m not sure what you mean \u2014 try: _"New box"_, _"Add item"_, _"Done with this box"_, or _"Review items"_.');
  setBoxOpenChips();
}

function exportJSON() {
  var data={exportedAt:new Date().toISOString(),boxes:[]};
  for(var i=0;i<state.boxes.length;i++){
    var box=state.boxes[i]; var items=[];
    for(var j=0;j<box.items.length;j++){
      var it=box.items[j]; var photos=[];
      for(var k=0;k<it.photos.length;k++) photos.push({name:it.photos[k].name});
      items.push(Object.assign({},it,{photos:photos}));
    }
    data.boxes.push(Object.assign({},box,{items:items}));
  }
  var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  dlBlob(blob,'sortie-inventory.json');
}

async function exportZip() {
  var zip=new JSZip();
  var data={exportedAt:new Date().toISOString(),boxes:[]};
  for(var i=0;i<state.boxes.length;i++){
    var box=state.boxes[i]; var items=[];
    for(var j=0;j<box.items.length;j++){
      var it=box.items[j]; var photos=[];
      for(var k=0;k<it.photos.length;k++) photos.push({name:it.photos[k].name});
      items.push(Object.assign({},it,{photos:photos}));
    }
    data.boxes.push(Object.assign({},box,{items:items}));
  }
  zip.file('inventory.json',JSON.stringify(data,null,2));
  for(var i=0;i<state.boxes.length;i++){
    var box=state.boxes[i];
    for(var j=0;j<box.items.length;j++){
      var it=box.items[j];
      for(var k=0;k<it.photos.length;k++){
        var p=it.photos[k];
        if(p.dataUrl){var b64=p.dataUrl.split(',')[1];var ext=p.name.split('.').pop()||'jpg';zip.file('photos/'+box.name+'/'+it.name+'_'+(k+1)+'.'+ext,b64,{base64:true});}
      }
    }
  }
  var content=await zip.generateAsync({type:'blob'});
  dlBlob(content,'sortie-export.zip');
}

function dlBlob(blob,name){var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();URL.revokeObjectURL(a.href);}

function clearAll() {
  if(state.boxes.length>0&&!confirm('Reset all data? This cannot be undone.')) return;
  localStorage.removeItem('sortie_state');
  state={boxes:[],activeBoxId:null,activeItemId:null,pendingBatch:null,pendingBoxBatch:null,pendingDeleteBoxId:null,pendingNest:null,conversationStage:'WELCOME',conversationHistory:[]};
  pendingPhotos=[];
  document.getElementById('chat-messages').innerHTML='';
  document.getElementById('quick-replies').innerHTML='';
  renderSidebar(); updateContextBar();
  setTimeout(function(){
    addBotMessage('Hello! I\'m **Sortie**, your decluttering companion. \uD83D\uDCE6\n\nI\'ll walk you through your boxes one by one \u2014 naming each item and deciding its fate: **keep, donate, trash, sell,** or **unsure**. You can attach photos, add notes, and export everything when you\'re done.\n\nReady to start? Tell me what to call your first box.');
    state.conversationStage='AWAITING_BOX_NAME'; setChips(['Start sorting']);
  },100);
}


// Init — only runs in browser, not in Node test environment
if (typeof window !== 'undefined') {

loadState(); renderSidebar(); updateContextBar();

if(state.boxes.length===0){
  setTimeout(function(){
    addBotMessage('Hello! I\'m **Sortie**, your decluttering companion. \uD83D\uDCE6\n\nI\'ll walk you through your boxes one by one \u2014 naming each item and deciding its fate: **keep, donate, trash, sell,** or **unsure**. You can attach photos, add notes, and export everything when you\'re done.\n\nReady to start? Tell me what to call your first box.');
    state.conversationStage='AWAITING_BOX_NAME'; setChips(['Start sorting']);
  },200);
} else {
  var _b=state.boxes.length;
  var _i=0; for(var _j=0;_j<state.boxes.length;_j++) _i+=state.boxes[_j].items.length;
  setTimeout(function(){
    addBotMessage('Welcome back! You have **'+_b+' box'+(_b!==1?'es':'')+'** and **'+_i+' item'+(_i!==1?'s':'')+'** logged so far.\n\nPick up where you left off, or start a new box.');
    state.conversationStage=state.activeBoxId?'BOX_OPEN':'FINISHED';
    setChips(['New box','Continue last box','Review all boxes']);
  },200);
}
}

// In Node, alias global stubs into local scope so logic functions can call them
if (typeof window === 'undefined' && typeof global !== 'undefined') {
  var addBotMessage    = global.addBotMessage    || function(){};
  var setChips         = global.setChips         || function(){};
  var addUserMessage   = global.addUserMessage   || function(){};
  var renderSidebar    = global.renderSidebar    || function(){};
  var updateContextBar = global.updateContextBar || function(){};
  var showTyping       = global.showTyping       || function(){};
  var hideTyping       = global.hideTyping       || function(){};
  var saveState        = global.saveState        || function(){};
}


function setBoxOpenChips() {
  var box = activeBox();
  var extra = box && box.items.length > 0 ? 'Dump into...' : 'Delete box';
  setChips(['Add item', 'Review items', 'Move box', 'Nest box', extra, 'Done with this box']);
}

function handleDeleteBox() {
  var box = activeBox();
  if (!box) { addBotMessage('No active box to delete. Open a box first.'); return; }
  var kids = childBoxes(box.id);
  if (kids.length > 0) {
    var kidNames = kids.map(function(b){ return '"' + b.name + '"'; }).join(', ');
    addBotMessage('**"' + box.name + '"** contains ' + kids.length + ' box(es): ' + kidNames + '. Move or delete those first.');
    setBoxOpenChips();
    return;
  }
  if (box.items.length > 0) {
    addBotMessage('**"' + box.name + '"** still has ' + box.items.length + ' item(s). Empty the box first, or use _"dump into <box name>"_ to transfer all items to another box.');
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
  var t = text.toLowerCase().trim();
  var boxId = state.pendingDeleteBoxId;
  state.pendingDeleteBoxId = null;
  state.conversationStage = 'FINISHED';

  if (t === 'no' || t === 'no, keep it' || t.startsWith('no')) {
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
  setChips(['New box', 'Review all boxes', 'Done for now']);
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
  var t = text.toLowerCase().trim();
  var targetName = '';
  if (t.startsWith('dump into ')) targetName = text.slice(10).trim();
  else if (t.startsWith('dump ') && t !== 'dump') targetName = text.slice(5).trim();

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
    addBotMessage('Dump all ' + box.items.length + ' item(s) from **"' + box.name + '"** into which box? Type a new name to create one.');
    setChips(chips);
  }
}

function handleDumpTarget(text) {
  var source = activeBox();
  if (!source) { state.conversationStage = 'BOX_OPEN'; return; }

  // Strip location prefix from chip labels: "dining room · top shelf" -> try "top shelf" too
  var t = text.toLowerCase().trim();
  var chipBoxName = t.indexOf(' · ') !== -1 ? t.slice(t.indexOf(' · ') + 3).trim() : t;

  // Find target: exact name match first, then exact on stripped chip name,
  // then partial on box name only (not location, to avoid the location-segment bug)
  var target = null;
  for (var i = 0; i < state.boxes.length; i++) {
    var b = state.boxes[i];
    if (b.id === source.id) continue;
    if (b.name.toLowerCase() === t || b.name.toLowerCase() === chipBoxName) { target = b; break; }
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
    var newBox = { id: uid(), name: text.trim(), location: '', notes: '', parentId: null, createdAt: new Date().toISOString(), items: [] };
    state.boxes.push(newBox);
    target = newBox;
    // Transfer items to new box, then ask for its location
    var count = source.items.length;
    for (var i = 0; i < source.items.length; i++) { target.items.push(source.items[i]); }
    source.items = [];
    // Set new box as active and ask for location
    state.activeBoxId = target.id;
    state.conversationStage = 'AWAITING_LOCATION';
    addBotMessage('Created **"' + target.name + '"** and dumped **' + count + '** item(s) into it. "' + source.name + '" is now empty.\n\nWhere is **"' + target.name + '"** located?');
    return;
  }

  var count = source.items.length;
  for (var i = 0; i < source.items.length; i++) { target.items.push(source.items[i]); }
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
  var t = text.toLowerCase().trim();
  var insideIdx = t.indexOf(' inside ');
  if (insideIdx === -1) insideIdx = t.indexOf(' in ');
  if (insideIdx === -1) insideIdx = t.indexOf(' on ');
  if (insideIdx !== -1 && (t.startsWith('put ') || t.startsWith('nest '))) {
    var pfxLen = t.startsWith('put ') ? 4 : 5;
    // find which preposition matched
    var prep = ' inside ';
    if (t.indexOf(' inside ') === -1) prep = t.indexOf(' in ') !== -1 ? ' in ' : ' on ';
    var splitIdx = t.indexOf(prep);
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
        if (state.boxes[i].name.toLowerCase().indexOf(childName.toLowerCase()) !== -1) { child = state.boxes[i]; break; }
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

  var t = text.toLowerCase().trim();
  // Strip location prefix from chip labels
  var namePart = t.indexOf(' · ') !== -1 ? t.slice(t.indexOf(' · ') + 3).trim() : t;

  var parent = null;
  // Search all boxes including the child itself so we can give a specific circular error
  for (var i = 0; i < state.boxes.length; i++) {
    var b = state.boxes[i];
    if (b.name.toLowerCase() === t || b.name.toLowerCase() === namePart) { parent = b; break; }
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

// Export core globals for Node.js testing
if (typeof module !== 'undefined') {
  module.exports = { state, FATES, LETTERS, uid, activeBox, activeItem, countFates,
    processInput, handleMove, handleRemove, handleBatchConfirm, handleBatchQty,
    commitBatch, handleFate, handleItemNotes, handleItemName,
    handleBoxName, handleBoxBatchConfirm, handleBoxBatchQty, handleBoxBatchLocation,
    singularize, singularizeLast, handleLocation, startNewBox, doneWithBox, reviewBox,
    handleDeleteBox, handleDeleteBoxConfirm, handleDump, handleDumpTarget,
    groupItems, boxSummaryLine,
    handleNest, handleNestParent, getDescendantIds, childBoxes,
    renderBoxTree, groupItems, sameProximity, locSegments };
}
