import { initializeOperatorPage, bindBusinessSwitcher, businessCan, localDateString, setPageMessage } from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,bookings:[],messages:[],selected:null};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const threads=document.getElementById('inboxThreads');
const messagesBox=document.getElementById('conversationMessages');
const replyForm=document.getElementById('replyForm');

function esc(value=''){return String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function dateText(value){if(!value)return '—';return new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`));}
function bookingTitle(item){return item.listings?.title||'Reservation';}
function bookingMessages(id){return state.messages.filter((m)=>m.enquiry_id===id).sort((a,b)=>String(a.created_at).localeCompare(String(b.created_at)));}
function lastActivity(item){const rows=bookingMessages(item.id);return rows.at(-1)?.created_at||item.created_at||`${item.requested_date}T00:00:00`}
function lastPreview(item){const rows=bookingMessages(item.id);return rows.at(-1)?.body||item.guest_message||'No messages yet';}
function selectedId(){return state.selected?.id||'';}

function filteredBookings(){
  const search=document.getElementById('inboxSearch').value.trim().toLowerCase();
  const filter=document.getElementById('inboxFilter').value;
  const today=localDateString();
  return state.bookings.filter((item)=>{
    if(search&&!`${item.guest_full_name} ${item.booking_reference||''} ${bookingTitle(item)}`.toLowerCase().includes(search))return false;
    if(filter==='upcoming'&&!(item.requested_date>=today&&['new','accepted','confirmed','changes_requested'].includes(item.status)))return false;
    if(filter==='active'&&!['new','accepted','confirmed','changes_requested'].includes(item.status))return false;
    if(filter==='past'&&!['completed','cancelled','declined','no_show'].includes(item.status))return false;
    return true;
  }).sort((a,b)=>String(lastActivity(b)).localeCompare(String(lastActivity(a))));
}

function renderThreads(){
  const rows=filteredBookings();
  document.getElementById('conversationCount').textContent=`${rows.length} conversation${rows.length===1?'':'s'}`;
  threads.replaceChildren();
  if(!rows.length){threads.innerHTML='<div class="empty-inline" style="margin:12px">No conversations match this view.</div>';return;}
  rows.forEach((item)=>{
    const button=document.createElement('button');button.type='button';button.className=`operator-inbox-thread${item.id===selectedId()?' active':''}`;
    button.innerHTML=`<strong>${esc(item.guest_full_name)}</strong><span>${esc(lastPreview(item))}</span><small>${esc(bookingTitle(item))} · ${esc(item.booking_reference||item.id.slice(0,8))} · ${dateText(item.requested_date)}</small>`;
    button.addEventListener('click',()=>openConversation(item));threads.append(button);
  });
}

function renderConversation(){
  const item=state.selected;
  const head=document.getElementById('conversationHead');
  if(!item){head.innerHTML='<strong>Select a conversation</strong><small class="help">Guest messages linked to reservations will appear here.</small>';messagesBox.innerHTML='<div class="empty-inline">Choose a guest conversation from the left.</div>';replyForm.hidden=true;return;}
  head.innerHTML=`<strong>${esc(item.guest_full_name)} · ${esc(bookingTitle(item))}</strong><small class="help">${esc(item.booking_reference||item.id.slice(0,8))} · ${dateText(item.requested_date)} · ${esc(String(item.status||'').replaceAll('_',' '))}</small>`;
  document.getElementById('openReservation').href=`operator-reservations.html?id=${encodeURIComponent(item.id)}`;
  const rows=bookingMessages(item.id);messagesBox.replaceChildren();
  if(item.guest_message&&!rows.length){const first=document.createElement('div');first.className='operator-inbox-message';first.innerHTML=`<div>${esc(item.guest_message)}</div><small>Booking request</small>`;messagesBox.append(first);}
  rows.forEach((row)=>{const div=document.createElement('div');div.className=`operator-inbox-message${row.sender_id===state.user.id?' mine':''}`;div.innerHTML=`<div>${esc(row.body)}</div><small>${row.sender_id===state.user.id?'You':'Guest'} · ${new Date(row.created_at).toLocaleString()}</small>`;messagesBox.append(div);});
  if(!rows.length&&!item.guest_message)messagesBox.innerHTML='<div class="empty-inline">No messages yet. You can send the first message below.</div>';
  replyForm.hidden=false;requestAnimationFrame(()=>{messagesBox.scrollTop=messagesBox.scrollHeight;});
}

function openConversation(item){state.selected=item;renderThreads();renderConversation();history.replaceState(null,'',`${location.pathname}?booking=${encodeURIComponent(item.id)}`);}

async function loadInbox(){
  if(!state.business){state.bookings=[];state.messages=[];state.selected=null;renderThreads();renderConversation();return;}
  if(!businessCan(state.business,'messages'))throw new Error('This staff role does not have guest-message access.');
  setPageMessage(message,'Loading inbox…','loading');
  try{
    const bookingResult=await state.client.from('booking_enquiries').select('id,guest_full_name,guest_email,booking_reference,requested_date,status,guest_message,created_at,listings(title)').eq('business_id',state.business.id).order('created_at',{ascending:false}).limit(150);
    if(bookingResult.error)throw bookingResult.error;state.bookings=bookingResult.data||[];state.messages=[];
    const ids=state.bookings.map((b)=>b.id);
    if(ids.length){const messageResult=await state.client.from('enquiry_messages').select('id,enquiry_id,sender_id,body,created_at').in('enquiry_id',ids).order('created_at',{ascending:true}).limit(1200);if(messageResult.error)throw messageResult.error;state.messages=messageResult.data||[];}
    const requested=new URLSearchParams(location.search).get('booking');
    const currentId=state.selected?.id||requested;
    state.selected=state.bookings.find((b)=>b.id===currentId)||null;
    renderThreads();renderConversation();setPageMessage(message,'');
  }catch(error){setPageMessage(message,error.message||'Could not load inbox.','error');}
}

async function sendReply(event){
  event.preventDefault();if(!state.selected||!businessCan(state.business,'messages'))return;
  const body=document.getElementById('replyBody').value.trim();if(!body)return;
  const button=replyForm.querySelector('button[type="submit"]');button.disabled=true;button.textContent='Sending…';
  try{
    const {error}=await state.client.from('enquiry_messages').insert({enquiry_id:state.selected.id,sender_id:state.user.id,body});if(error)throw error;
    document.getElementById('replyBody').value='';
    const result=await state.client.from('enquiry_messages').select('id,enquiry_id,sender_id,body,created_at').eq('enquiry_id',state.selected.id).order('created_at');if(result.error)throw result.error;
    state.messages=state.messages.filter((m)=>m.enquiry_id!==state.selected.id).concat(result.data||[]);renderThreads();renderConversation();
  }catch(error){setPageMessage(message,error.message||'Could not send message.','error');}
  finally{button.disabled=false;button.textContent='Send message';}
}

function bind(){
  document.getElementById('inboxSearch').addEventListener('input',renderThreads);
  document.getElementById('inboxFilter').addEventListener('change',renderThreads);
  document.getElementById('refreshInbox').addEventListener('click',()=>loadInbox().catch((e)=>setPageMessage(message,e.message,'error')));
  replyForm.addEventListener('submit',sendReply);
}

async function init(){
  try{const base=await initializeOperatorPage('inbox');Object.assign(state,base);bindBusinessSwitcher(businessSwitcher,state,loadInbox);bind();await loadInbox();}
  catch(error){setPageMessage(message,error.message||'Could not open inbox.','error');}
}
init();
