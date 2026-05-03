// app.js — Sortie core logic
// DOM-touching functions (addBotMessage, setChips, renderSidebar, etc.)
// are expected to be defined globally or stubbed before this file runs.

var state = {
  boxes: [],
  activeBoxId: null,
  activeItemId: null,
  pendingBatch: null,
  conversationStage: 'WELCOME',
  conversationHistory: []
};
var FATES = ['keep','donate','trash','sell','unsure'];
var pendingPhotos = [];

function saveState() { localStorage.setItem('sortie_state', JSON.stringify(state)); }
function loadState() {
  var raw = localStorage.getItem('sortie_state');
  if (raw) { try { state = JSON.parse(raw); } catch(e) {} }
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
  var html = '';
  for (var i=0;i<state.boxes.length;i++) {
    var box = state.boxes[i];
    var fates = countFates(box);
    var tags = '';
    for (var j=0;j<FATES.length;j++) {
      var f=FATES[j];
      if (fates[f]>0) tags += '<span class="tag tag-'+f+'">'+f+' '+fates[f]+'</span>';
    }
    var total = box.items.length;
    var ac = box.id===state.activeBoxId?' active':'';
    html += '<div class="box-card'+ac+'" onclick="selectBox(\''+box.id+'\')">'
      +'<div class="box-name">'+escHtml(box.name)+'</div>'
      +'<div class="box-meta">'+escHtml(box.location||'location unknown')+' &middot; '+total+' item'+(total!==1?'s':'')+'</div>'
      +(tags?'<div class="box-counts">'+tags+'</div>':'')
      +'</div>';
  }
  el.innerHTML = html;
}

function selectBox(id) {
  state.activeBoxId = id;
  state.activeItemId = null;
  state.conversationStage = 'BOX_OPEN';
  saveState(); renderSidebar(); updateContextBar();
  var box = activeBox();
  addBotMessage('Switched to **'+box.name+'**. It has '+box.items.length+' item(s) logged.\n\nWhat would you like to do? Add a new item, review what\'s inside, or move on to another box?');
  setChips(['Add item','Review items','Move box','New box','Done with this box']);
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
  if (t==='done with this box'||t==='done') { doneWithBox(); return; }

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
    case 'AWAITING_BOX_NAME':     handleBoxName(text); break;
    case 'AWAITING_LOCATION':     handleLocation(text); break;
    case 'BOX_OPEN':              handleItemName(text,photos); break;
    case 'AWAITING_ITEM_NAME':    handleItemName(text,photos); break;
    case 'AWAITING_BATCH_CONFIRM':handleBatchConfirm(text,photos); break;
    case 'AWAITING_BATCH_QTY':    handleBatchQty(text); break;
    case 'AWAITING_BATCH_FATE':   handleBatchFate(text,photos); break;
    case 'AWAITING_ITEM_DESC':    handleItemDesc(text,photos); break;
    case 'AWAITING_FATE':         handleFate(text,photos); break;
    case 'AWAITING_ITEM_NOTES':   handleItemNotes(text); break;
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

function handleWelcome(text, photos) {
  addBotMessage('Welcome to **Sortie**! I\'ll help you sort through boxes, log what\'s inside, and decide what to do with each item.\n\nLet\'s start with your first box. What would you like to call it?');
  state.conversationStage = 'AWAITING_BOX_NAME';
}
function startNewBox() {
  state.activeBoxId=null; state.activeItemId=null;
  state.conversationStage='AWAITING_BOX_NAME';
  addBotMessage('Starting a new box. What would you like to call it?');
}
function handleBoxName(text) {
  var name = text.trim()||'Unnamed box';
  var box = {id:uid(),name:name,location:'',notes:'',createdAt:new Date().toISOString(),items:[]};
  state.boxes.push(box); state.activeBoxId=box.id;
  state.conversationStage='AWAITING_LOCATION';
  addBotMessage('Got it \u2014 **"'+name+'"**.\n\nWhere is this box located? (e.g. "spare bedroom", "garage shelf 2", "storage unit A")');
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
  setChips(['Add item','Review items','Move box','Done with this box']);
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
  setChips(['Add item','Review items','Move box','Done with this box']);
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

function reviewBox() {
  var box=activeBox();
  if(!box||box.items.length===0){addBotMessage('This box has no items logged yet. Add some!');return;}
  var lines='';
  for(var i=0;i<box.items.length;i++){
    var it=box.items[i];
    lines+=(i+1)+'. **'+it.name+'** \u2192 '+it.fate+(it.notes?' ('+it.notes+')':'')+'\n';
  }
  addBotMessage('**Items in "'+box.name+'":**\n'+lines.trim());
  setChips(['Add item','Review items','Move box','Done with this box']);
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
      var b=state.boxes[i]; var fates=countFates(b); var parts=[];
      for(var j=0;j<FATES.length;j++){if(fates[FATES[j]])parts.push(fates[FATES[j]]+' '+FATES[j]);}
      lines+='**'+b.name+'** ('+b.location+') \u2014 '+(parts.length?parts.join(', '):'no items')+'\n';
    }
    addBotMessage('**All boxes:**\n'+lines.trim()); setChips(['New box','Done for now']);
  } else { handleFreeform(text,[]); }
}

function handleFreeform(text, photos) {
  addBotMessage('I\'m not sure what you mean \u2014 try: _"New box"_, _"Add item"_, _"Done with this box"_, or _"Review items"_.');
  setChips(['Add item','Review items','Move box','New box','Done with this box']);
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
  state={boxes:[],activeBoxId:null,activeItemId:null,pendingBatch:null,conversationStage:'WELCOME',conversationHistory:[]};
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


// Export core globals for Node.js testing
if (typeof module !== 'undefined') {
  module.exports = { state, FATES, uid, activeBox, activeItem, countFates,
    processInput, handleMove, handleBatchConfirm, handleBatchQty,
    commitBatch, handleFate, handleItemNotes, handleItemName,
    handleBoxName, handleLocation, startNewBox, doneWithBox, reviewBox };
}
