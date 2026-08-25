const lockState=new Set();
const formIds=new Set(['rateForm','promotionForm','responseForm','staffForm','notificationForm','arrivalForm','internalNoteForm','messageForm','quoteForm']);

function lock(node,label='Saving…'){
  if(!node||node.dataset.v2ActionLocked==='1')return false;
  node.dataset.v2ActionLocked='1';node.dataset.v2ActionText=node.textContent||'';node.disabled=true;
  if(node.tagName==='BUTTON'&&label)node.textContent=label;lockState.add(node);return true;
}
function unlock(node){if(!node)return;node.disabled=false;if(node.dataset.v2ActionText!=null&&node.tagName==='BUTTON')node.textContent=node.dataset.v2ActionText;delete node.dataset.v2ActionLocked;delete node.dataset.v2ActionText;lockState.delete(node);}
function unlockAll(){[...lockState].forEach(unlock);}
function observeMessage(id){const node=document.getElementById(id);if(!node)return;new MutationObserver(()=>{const text=node.textContent?.trim();const loading=node.classList.contains('loading');if(text&&!loading)unlockAll();}).observe(node,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['class','hidden']});}
observeMessage('pageMessage');observeMessage('drawerMessage');observeMessage('responseMessage');observeMessage('editorMessage');

document.addEventListener('submit',(event)=>{
  if(!formIds.has(event.target.id))return;
  const button=event.submitter||event.target.querySelector('button[type="submit"]');
  lock(button,button?.id==='saveQuote'?'Confirming…':button?.closest('#messageForm')?'Sending…':'Saving…');
  setTimeout(()=>{if(button?.dataset.v2ActionLocked==='1')unlock(button);},15000);
},true);

document.addEventListener('click',(event)=>{
  const button=event.target.closest('#reservationActions button');if(!button)return;
  if(button.dataset.v2ActionLocked==='1'){event.preventDefault();event.stopImmediatePropagation();return;}
  document.querySelectorAll('#reservationActions button').forEach((b)=>lock(b,b===button?'Working…':null));
  setTimeout(()=>document.querySelectorAll('#reservationActions button').forEach(unlock),15000);
},true);

document.addEventListener('change',(event)=>{
  const select=event.target.closest('[data-staff-role]');if(!select)return;if(select.dataset.v2ActionLocked==='1')return;select.dataset.v2ActionLocked='1';select.disabled=true;setTimeout(()=>{select.disabled=false;delete select.dataset.v2ActionLocked;},6000);
},true);
