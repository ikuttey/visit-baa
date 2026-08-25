import { initializeOperatorPage, bindBusinessSwitcher, businessCan, localDateString, setPageMessage } from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,bookings:[],messages:[],selected:null,limit:60,total:0,channel:null};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const threads=document.getElementById('inboxThreads');
const messagesBox=document.getElementById('conversationMessages');
const replyForm=document.getElementById('replyForm');

function esc(value=''){return String(value).replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function dateText(value){if(!value)return '—';return new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`));}
function bookingTitle(item){return item.listings?.title||'Reservation';}
function bookingMessages(id){return state.messages.filter((m)=>m.enquiry_id===id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));}
function lastActivity(item){const rows=bookingMessages(item.id);return rows.at(-1)?.created_at||item.created_at||`${item.requested_date}T00:00:00`;}
function lastPreview(item){const rows=bookingMessages(item.id);return rows.at(-1)?.body||item.guest_message||'No messages yet';}
function selectedId(){return state.selected?.id||'';}
function senderLabel(row,item){if(row.sender_id===state.user.id)return'You';if(item?.traveler_id&&row.sender_id===item.traveler_id)return'Guest';return'Team';}

function filteredBookings(){
  const search=document.getElementById('inboxSearch').value.trim().toLowerCase();const filter=document.getElementById('inboxFilter').value;const today=localDateString();
  return state.bookings.filter((item)=>{if(search&&!`${item.guest_full_name} ${item.booking_reference||''} ${bookingTitle(item)}`.toLowerCase().includes(search))return false;if(filter==='upcoming'&&!(item.requested_date>=today&&['new','accepted','confirmed','changes_requested'].includes(item.status)))return false;if(filter==='active'&&!['new','accepted','confirmed','changes_requested'].includes(item.status))return false;if(filter==='past'&&!['completed','cancelled','declined','no_show'].includes(item.status))return false;return true;}).sort((a,b)=>String(lastActivity(b)).localeCompare(String(lastActivity(a))));
}

function renderThreads(){
  const rows=filteredBookings();document.getElementById('conversationCount').textContent=`${rows.length} conversation${rows.length===1?'':'s'} shown`;
  threads.replaceChildren();if(!rows.length){threads.innerHTML='<div class="empty-inline" style="margin:12px">No conversations match this view.</div>';return;}
  rows.forEach((item)=>{const button=document.createElement('button');button.type='button';button.className=`operator-inbox-thread${item.id===selectedId()?' active':''}`;button.innerHTML=`<strong>${esc(item.guest_full_name)}</strong><span>${esc(lastPreview(item))}</span><small>${esc(bookingTitle(item))} · ${esc(item.booking_reference||item.id.slice(0,8))} · ${dateText(item.requested_date)}</small>`;button.addEventListener('click',()=>openConversation(item));threads.append(button);});
  if(state.bookings.length<state.total){const more=document.createElement('button');more.type='button';more.className='button secondary';more.style.margin='12px';more.textContent=`Load older conversations (${state.total-state.bookings.length} more)`;more.addEventListener('click',async()=>{more.disabled=true;state.limit+=60;await loadInbox({preserve:true});});threads.append(more);}
}

function installTemplates(){
  if(document.getElementById('messageTemplates'))return;const actions=replyForm.querySelector('.form-actions');if(!actions)return;const wrap=document.createElement('div');wrap.id='messageTemplates';wrap.className='operator-section-tabs';wrap.style.width='100%';wrap.innerHTML='<button type="button" data-template="welcome">Welcome</button><button type="button" data-template="arrival">Arrival instructions</button><button type="button" data-template="payment">Payment reminder</button>';actions.before(wrap);wrap.querySelectorAll('[data-template]').forEach((b)=>b.addEventListener('click',()=>applyTemplate(b.dataset.template)));
}
async function applyTemplate(kind){
  if(!state.selected)return;const area=document.getElementById('replyBody');
  if(kind==='welcome')area.value=`Hello ${state.selected.guest_full_name}, thank you for your reservation with ${bookingTitle(state.selected)}. We look forward to welcoming you.`;
  if(kind==='payment')area.value=`Hello ${state.selected.guest_full_name}, a quick reminder to complete the agreed payment directly with the operator and submit the payment reference in Visit Baa once it is sent.`;
  if(kind==='arrival'){
    const {data}=await state.client.from('listing_arrival_guides').select('check_in_instructions,airport_meeting_point,jetty_pickup,directions,emergency_contact').eq('listing_id',state.selected.listing_id).maybeSingle();
    const parts=[data?.check_in_instructions,data?.airport_meeting_point?`Airport meeting point: ${data.airport_meeting_point}`:null,data?.jetty_pickup?`Jetty / harbor pickup: ${data.jetty_pickup}`:null,data?.directions?`Directions: ${data.directions}`:null,data?.emergency_contact?`Arrival contact: ${data.emergency_contact}`:null].filter(Boolean);area.value=parts.length?`Hello ${state.selected.guest_full_name}, here are your arrival details:\n\n${parts.join('\n\n')}`:`Hello ${state.selected.guest_full_name}, please let us know your arrival time so we can confirm your pickup and check-in arrangements.`;
  }
  area.focus();
}

function renderConversation(){
  const item=state.selected;const head=document.getElementById('conversationHead');
  if(!item){head.innerHTML='<strong>Select a conversation</strong><small class="help">Guest messages linked to reservations will appear here.</small>';messagesBox.innerHTML='<div class="empty-inline">Choose a guest conversation from the left.</div>';replyForm.hidden=true;return;}
  head.innerHTML=`<strong>${esc(item.guest_full_name)} · ${esc(bookingTitle(item))}</strong><small class="help">${esc(item.booking_reference||item.id.slice(0,8))} · ${dateText(item.requested_date)} · ${esc(String(item.status||'').replaceAll('_',' '))}</small>`;document.getElementById('openReservation').href=`operator-reservations.html?id=${encodeURIComponent(item.id)}`;
  const rows=bookingMessages(item.id);messagesBox.replaceChildren();if(item.guest_message&&!rows.length){const first=document.createElement('div');first.className='operator-inbox-message';first.innerHTML=`<div>${esc(item.guest_message)}</div><small>Guest · booking request</small>`;messagesBox.append(first);}
  rows.forEach((row)=>{const label=senderLabel(row,item);const div=document.createElement('div');div.className=`operator-inbox-message${label==='You'?' mine':label==='Team'?' team':''}`;div.innerHTML=`<div>${esc(row.body)}</div><small>${label} · ${new Date(row.created_at).toLocaleString()}</small>`;messagesBox.append(div);});if(!rows.length&&!item.guest_message)messagesBox.innerHTML='<div class="empty-inline">No messages yet. You can send the first message below.</div>';replyForm.hidden=false;installTemplates();requestAnimationFrame(()=>{messagesBox.scrollTop=messagesBox.scrollHeight;});
}
function openConversation(item){state.selected=item;renderThreads();renderConversation();history.replaceState(null,'',`${location.pathname}?booking=${encodeURIComponent(item.id)}`);}

async function loadInbox({preserve=false}={}){
  if(!state.business){state.bookings=[];state.messages=[];state.selected=null;state.total=0;renderThreads();renderConversation();return;}if(!businessCan(state.business,'messages'))throw new Error('This staff role does not have guest-message access.');setPageMessage(message,'Loading inbox…','loading');
  try{
    const bookingResult=await state.client.from('booking_enquiries').select('id,listing_id,traveler_id,guest_full_name,guest_email,booking_reference,requested_date,status,guest_message,created_at,listings(title)',{count:'exact'}).eq('business_id',state.business.id).order('created_at',{ascending:false}).range(0,state.limit-1);if(bookingResult.error)throw bookingResult.error;state.bookings=bookingResult.data||[];state.total=bookingResult.count??state.bookings.length;state.messages=[];
    const ids=state.bookings.map((b)=>b.id);if(ids.length){const messageResult=await state.client.from('enquiry_messages').select('id,enquiry_id,sender_id,body,created_at').in('enquiry_id',ids).order('created_at',{ascending:true}).limit(Math.max(1200,state.limit*20));if(messageResult.error)throw messageResult.error;state.messages=messageResult.data||[];}
    const requested=new URLSearchParams(location.search).get('booking');const currentId=preserve?state.selected?.id:(state.selected?.id||requested);state.selected=state.bookings.find((b)=>b.id===currentId)||null;renderThreads();renderConversation();setPageMessage(message,'');subscribeRealtime();
  }catch(error){setPageMessage(message,error.message||'Could not load inbox.','error');}
}

async function sendReply(event){event.preventDefault();if(!state.selected||!businessCan(state.business,'messages'))return;const body=document.getElementById('replyBody').value.trim();if(!body)return;const button=replyForm.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Sending…';try{const {data,error}=await state.client.from('enquiry_messages').insert({enquiry_id:state.selected.id,sender_id:state.user.id,body}).select('id,enquiry_id,sender_id,body,created_at').single();if(error)throw error;document.getElementById('replyBody').value='';if(data&&!state.messages.some((m)=>m.id===data.id))state.messages.push(data);renderThreads();renderConversation();}catch(error){setPageMessage(message,error.message||'Could not send message.','error');}finally{button.disabled=false;button.textContent='Send message';}}

function subscribeRealtime(){
  if(state.channel){state.client.removeChannel?.(state.channel);state.channel=null;}if(!state.business)return;
  state.channel=state.client.channel(`operator-inbox-${state.business.id}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'enquiry_messages'},(payload)=>{const row=payload.new;if(!row?.id||!state.bookings.some((b)=>b.id===row.enquiry_id)||state.messages.some((m)=>m.id===row.id))return;state.messages.push(row);renderThreads();if(state.selected?.id===row.enquiry_id)renderConversation();}).on('postgres_changes',{event:'UPDATE',schema:'public',table:'booking_enquiries',filter:`business_id=eq.${state.business.id}`},(payload)=>{const index=state.bookings.findIndex((b)=>b.id===payload.new.id);if(index>=0){state.bookings[index]={...state.bookings[index],...payload.new};if(state.selected?.id===payload.new.id)state.selected=state.bookings[index];renderThreads();renderConversation();}}).subscribe();
}

function bind(){document.getElementById('inboxSearch').addEventListener('input',renderThreads);document.getElementById('inboxFilter').addEventListener('change',renderThreads);document.getElementById('refreshInbox').addEventListener('click',()=>loadInbox({preserve:true}).catch((e)=>setPageMessage(message,e.message,'error')));replyForm.addEventListener('submit',sendReply);}
async function init(){try{const base=await initializeOperatorPage('inbox');Object.assign(state,base);bindBusinessSwitcher(businessSwitcher,state,()=>{state.limit=60;return loadInbox();});bind();await loadInbox();}catch(error){setPageMessage(message,error.message||'Could not open inbox.','error');}}
window.addEventListener('beforeunload',()=>{if(state.channel)state.client?.removeChannel?.(state.channel);});
init();
