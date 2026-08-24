import {
  addDays,
  bindBusinessSwitcher,
  businessCan,
  debounce,
  formatMoney,
  initializeOperatorPage,
  localDateString,
  setPageMessage
} from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,items:[],page:0,pageSize:40,total:0,quick:'all',selected:null,messages:[],payments:[],history:[]};
const message=document.getElementById('pageMessage');
const drawer=document.getElementById('reservationDrawer');
const drawerMessage=document.getElementById('drawerMessage');

function esc(value=''){return String(value).replace(/[&<>'"]/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
function dateText(value){if(!value)return '—';return new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${String(value).slice(0,10)}T12:00:00`));}
function timeText(value){return value?String(value).slice(0,5):'Flexible';}
function statusClass(status){return ['confirmed','completed'].includes(status)?'badge-paid':['cancelled','declined','no_show'].includes(status)?'badge-unpaid':'badge-hold';}
function paymentClass(status){return status==='paid'?'badge-paid':['rejected','unpaid'].includes(status)?'badge-unpaid':'badge-hold';}
function paymentLabel(item){return String(item.payment_status||'unpaid').replaceAll('_',' ');}
function holdText(item){if(item.hold_status!=='active'||!item.hold_expires_at)return '';const ms=new Date(item.hold_expires_at)-Date.now();if(ms<=0)return 'Hold expired';return `Hold ${Math.ceil(ms/3600000)}h remaining`;}
function safeSearch(value){return String(value||'').replace(/[,()%]/g,' ').trim().slice(0,80);}
function canReservations(){return businessCan(state.business,'reservations');}
function canMessages(){return businessCan(state.business,'messages');}
function canFinance(){return businessCan(state.business,'finance')||canReservations();}

function applyPermissionUi(){
  const messageCard=document.getElementById('messageForm')?.closest('.operator-work-card');
  const noteCard=document.getElementById('internalNoteForm')?.closest('.operator-work-card');
  const historyCard=document.getElementById('bookingTimeline')?.closest('.operator-work-card');
  if(messageCard)messageCard.hidden=!canMessages();
  if(noteCard)noteCard.hidden=!canReservations();
  if(historyCard)historyCard.hidden=!canMessages();
}

function applyFilters(query){
  const status=document.getElementById('reservationStatus').value;
  const payment=document.getElementById('reservationPayment').value;
  const from=document.getElementById('reservationFrom').value;
  const to=document.getElementById('reservationTo').value;
  const search=safeSearch(document.getElementById('reservationSearch').value);
  const today=localDateString();
  if(status)query=query.eq('status',status);
  if(payment)query=query.eq('payment_status',payment);
  if(from)query=query.gte('requested_date',from);
  if(to)query=query.lte('requested_date',to);
  if(search)query=query.or(`guest_full_name.ilike.%${search}%,booking_reference.ilike.%${search}%,guest_email.ilike.%${search}%,guest_phone.ilike.%${search}%`);
  if(state.quick==='attention')query=query.in('status',['new','changes_requested']);
  if(state.quick==='today')query=query.eq('requested_date',today).in('status',['accepted','confirmed']);
  if(state.quick==='payment')query=query.neq('payment_status','paid').in('status',['accepted','confirmed','completed','no_show']);
  if(state.quick==='upcoming')query=query.gte('requested_date',today).in('status',['accepted','confirmed']);
  return query;
}

async function countQuery(builder){const result=await builder;return result.error?null:(result.count??0);}
async function loadMetrics(){
  if(!state.business)return;
  const b=state.business.id,today=localDateString();
  const base=()=>state.client.from('booking_enquiries').select('id',{count:'exact',head:true}).eq('business_id',b);
  const counts=await Promise.all([
    countQuery(base().eq('status','new')),
    countQuery(base().eq('status','accepted')),
    countQuery(base().in('status',['accepted','confirmed','completed','no_show']).neq('payment_status','paid')),
    countQuery(base().eq('requested_date',today).in('status',['accepted','confirmed'])),
    countQuery(base().gte('requested_date',today).eq('status','confirmed')),
    countQuery(base().eq('status','cancelled'))
  ]);
  ['metricNew','metricAccepted','metricAwaitingPayment','metricArrivals','metricConfirmed','metricCancelled'].forEach((id,index)=>{document.getElementById(id).textContent=counts[index]==null?'—':counts[index];});
}

async function loadReservations(){
  if(!state.business){state.items=[];state.total=0;renderList();return;}
  setPageMessage(message,'Loading reservations…','loading');
  try{
    let query=state.client.from('booking_enquiries').select('*,listings(title,category,listing_kind)',{count:'exact'}).eq('business_id',state.business.id);
    query=applyFilters(query).order('created_at',{ascending:false}).range(state.page*state.pageSize,state.page*state.pageSize+state.pageSize-1);
    const {data,error,count}=await query;if(error)throw error;
    state.items=data||[];state.total=count||0;renderList();await loadMetrics();setPageMessage(message,'');
    const requested=new URLSearchParams(location.search).get('id');
    if(requested){const item=state.items.find((x)=>x.id===requested);if(item)await openReservation(item);else await loadReservationById(requested);}
  }catch(error){setPageMessage(message,error.message||'Could not load reservations.','error');}
}

function renderList(){
  const box=document.getElementById('reservationList');box.replaceChildren();
  document.getElementById('reservationCount').textContent=`${state.total} reservation${state.total===1?'':'s'} found`;
  const pages=Math.max(1,Math.ceil(state.total/state.pageSize));document.getElementById('pageIndicator').textContent=`Page ${state.page+1} of ${pages}`;
  document.getElementById('previousPage').disabled=state.page===0;document.getElementById('nextPage').disabled=state.page+1>=pages;
  if(!state.items.length){box.innerHTML='<div class="empty-inline">No reservations match these filters.</div>';return;}
  state.items.forEach((item)=>{
    const row=document.createElement('article');row.className='reservation-row';row.tabIndex=0;
    const stay=item.check_out_date?`${dateText(item.requested_date)} → ${dateText(item.check_out_date)}`:`${dateText(item.requested_date)} · ${timeText(item.requested_time)}`;
    const hold=holdText(item);
    row.innerHTML=`<div><strong>${esc(item.guest_full_name)}</strong><small>${esc(item.booking_reference||item.id.slice(0,8))} · ${esc(item.guest_email)}</small></div><div><strong>${esc(item.listings?.title||'Listing')}</strong><small>${stay} · ${item.guest_count} guest${Number(item.guest_count)===1?'':'s'}${item.rooms_requested>1?` · ${item.rooms_requested} rooms`:''}</small></div><div><span class="reservation-price">${formatMoney(item.quoted_total,item.quote_currency||'USD')}</span><small>${esc(paymentLabel(item))}${hold?` · ${esc(hold)}`:''}</small></div><div class="reservation-status-stack"><span class="${statusClass(item.status)}">${esc(item.status.replaceAll('_',' '))}</span><span class="${paymentClass(item.payment_status||'unpaid')}">${esc(paymentLabel(item))}</span></div>`;
    row.addEventListener('click',()=>openReservation(item));row.addEventListener('keydown',(e)=>{if(e.key==='Enter')openReservation(item);});box.append(row);
  });
}

async function loadReservationById(id){
  if(!state.business)return;
  const {data,error}=await state.client.from('booking_enquiries').select('*,listings(title,category,listing_kind)').eq('id',id).eq('business_id',state.business.id).maybeSingle();
  if(error){setPageMessage(message,error.message,'error');return;}if(data)await openReservation(data);
}

async function openReservation(item){
  state.selected=item;drawer.hidden=false;document.body.style.overflow='hidden';history.replaceState(null,'',`${location.pathname}?id=${encodeURIComponent(item.id)}`);
  document.getElementById('drawerReference').textContent=item.booking_reference||'Reservation';document.getElementById('drawerSubtitle').textContent=`${item.guest_full_name} · ${item.listings?.title||'Listing'}`;
  document.getElementById('internalNote').value=item.internal_note||'';applyPermissionUi();renderSummary();renderActions();
  const tasks=[loadPayments()];if(canMessages())tasks.push(loadMessages(),loadHistory());await Promise.all(tasks);
}
function closeDrawer(){drawer.hidden=true;document.body.style.overflow='';state.selected=null;history.replaceState(null,'',location.pathname);}
function detail(label,value,full=false){return `<div class="detail-block${full?' full':''}"><label>${esc(label)}</label><div>${value||'—'}</div></div>`;}
function renderSummary(){
  const i=state.selected;if(!i)return;
  const stay=i.check_out_date?`${dateText(i.requested_date)} → ${dateText(i.check_out_date)}`:`${dateText(i.requested_date)} · ${timeText(i.requested_time)}`;const hold=holdText(i);
  document.getElementById('reservationSummary').innerHTML=detail('Guest',`${esc(i.guest_full_name)}<br>${esc(i.guest_email)}<br>${esc(i.guest_phone)}`)+detail('Reservation',`${esc(i.listings?.title||'Listing')}<br>${stay}`)+detail('Guests',`${i.adult_count||i.guest_count} adult(s) · ${i.child_count||0} child(ren)${i.rooms_requested?` · ${i.rooms_requested} room(s)`:''}`)+detail('Price',`${formatMoney(i.quoted_total,i.quote_currency||'USD')}<br><small>Subtotal ${formatMoney(i.quoted_subtotal,i.quote_currency||'USD')} · discount ${formatMoney(i.discount_amount,i.quote_currency||'USD')}</small>`)+detail('Status',`<span class="${statusClass(i.status)}">${esc(i.status.replaceAll('_',' '))}</span>${hold?`<br><small>${esc(hold)}</small>`:''}`)+detail('Payment',`<span class="${paymentClass(i.payment_status||'unpaid')}">${esc(paymentLabel(i))}</span>${i.balance_due!=null?`<br><small>Balance ${formatMoney(i.balance_due,i.quote_currency||'USD')}</small>`:''}`)+detail('Pickup / drop-off',`${esc(i.pickup_point_snapshot||'Not selected')} → ${esc(i.dropoff_point_snapshot||'Not selected')}`,true)+detail('Guest message',esc(i.guest_message||'No initial message'),true);
}

function actionButton(label,action,kind='secondary'){const b=document.createElement('button');b.type='button';b.className=`button ${kind}`;b.textContent=label;b.addEventListener('click',action);return b;}
function renderActions(){
  const box=document.getElementById('reservationActions');box.replaceChildren();const i=state.selected;if(!i)return;
  if(canReservations()){
    if(i.status==='new')box.append(actionButton('Accept & hold inventory',()=>changeStatus('accepted'),'aqua'),actionButton('Request changes',()=>changeStatus('changes_requested')),actionButton('Decline',()=>changeStatus('declined'),'danger'));
    if(['accepted','changes_requested'].includes(i.status))box.append(actionButton('Confirm booking',()=>changeStatus('confirmed'),'aqua'),actionButton('Cancel',()=>changeStatus('cancelled'),'danger'));
    if(i.status==='confirmed')box.append(actionButton('Complete',()=>changeStatus('completed'),'aqua'),actionButton('No-show',()=>changeStatus('no_show')),actionButton('Cancel',()=>changeStatus('cancelled'),'danger'));
  }
  if(canFinance()&&['confirmed','completed','no_show'].includes(i.status))box.append(actionButton(i.operator_payment_confirmed_at?'Payment received ✓':'Record service payment',()=>recordServicePayment(),i.operator_payment_confirmed_at?'secondary':'aqua'));
}

async function changeStatus(status){
  if(!canReservations())return;
  const response=status==='changes_requested'?prompt('What should the guest change?',''):(['declined','cancelled'].includes(status)?prompt('Optional reason:',''):null);if(response===null&&status==='changes_requested')return;
  try{setPageMessage(drawerMessage,'Updating reservation…','loading');const {data,error}=await state.client.rpc('operator_update_booking',{p_enquiry_id:state.selected.id,p_status:status,p_response:response||null});if(error)throw error;state.selected={...state.selected,...data};const idx=state.items.findIndex((x)=>x.id===state.selected.id);if(idx>=0)state.items[idx]=state.selected;renderSummary();renderActions();if(canMessages())await loadHistory();await loadMetrics();renderList();setPageMessage(drawerMessage,status==='accepted'?'Accepted. Inventory is held until confirmation or hold expiry.':'Reservation updated.','success');}catch(error){setPageMessage(drawerMessage,error.message,'error');}
}

async function recordServicePayment(){
  if(!canFinance())return;
  const received=!state.selected.operator_payment_confirmed_at;const note=prompt(received?'Optional payment note / reference:':'Reason for clearing the payment record:',state.selected.operator_payment_note||'');if(note===null)return;
  const {data,error}=await state.client.rpc('operator_record_service_payment',{p_enquiry_id:state.selected.id,p_received:received,p_note:note||null});if(error)return setPageMessage(drawerMessage,error.message,'error');state.selected={...state.selected,...data};renderSummary();renderActions();if(canMessages())await loadHistory();setPageMessage(drawerMessage,received?'Service payment recorded.':'Service payment record cleared.','success');
}

async function loadMessages(){
  if(!canMessages())return;
  const {data,error}=await state.client.from('enquiry_messages').select('id,sender_id,body,created_at').eq('enquiry_id',state.selected.id).order('created_at');if(error)throw error;state.messages=data||[];
  const box=document.getElementById('messageThread');box.replaceChildren();if(!state.messages.length){box.innerHTML='<div class="empty-inline">No messages yet.</div>';return;}
  state.messages.forEach((m)=>{const div=document.createElement('div');div.className='detail-block';div.style.marginBottom='8px';div.innerHTML=`<strong>${m.sender_id===state.user.id?'You':'Guest'}</strong><div>${esc(m.body)}</div><small>${new Date(m.created_at).toLocaleString()}</small>`;box.append(div);});
}
async function sendMessage(event){event.preventDefault();if(!canMessages())return;const body=document.getElementById('messageBody').value.trim();if(!body)return;const button=event.currentTarget.querySelector('button');button.disabled=true;try{const {error}=await state.client.from('enquiry_messages').insert({enquiry_id:state.selected.id,sender_id:state.user.id,body});if(error)throw error;document.getElementById('messageBody').value='';await loadMessages();}catch(error){setPageMessage(drawerMessage,error.message,'error');}finally{button.disabled=false;}}
async function saveInternalNote(event){event.preventDefault();if(!canReservations())return;const note=document.getElementById('internalNote').value;const {data,error}=await state.client.rpc('operator_update_booking_note',{p_enquiry_id:state.selected.id,p_note:note});if(error)return setPageMessage(drawerMessage,error.message,'error');state.selected={...state.selected,...data};if(canMessages())await loadHistory();setPageMessage(drawerMessage,'Internal note saved.','success');}

async function loadPayments(){
  const box=document.getElementById('paymentRecords');
  if(!canFinance()){state.payments=[];box.innerHTML='<div class="empty-inline">Your staff role does not include payment records.</div>';return;}
  const {data,error}=await state.client.from('payment_references').select('*').eq('booking_id',state.selected.id).order('created_at',{ascending:false});if(error)throw error;state.payments=data||[];renderPayments();
}
function renderPayments(){
  const box=document.getElementById('paymentRecords');box.replaceChildren();if(!state.payments.length){box.innerHTML='<div class="empty-inline">No payment references submitted yet.</div>';return;}
  state.payments.forEach((p)=>{const div=document.createElement('div');div.className='detail-block';div.style.marginBottom='10px';const controls=document.createElement('div');controls.className='form-actions';div.innerHTML=`<label>${esc(p.payment_method||'Payment')}</label><div><strong>${formatMoney(p.amount,p.currency)}</strong> · ${esc(p.payment_reference)}</div><small>${dateText(p.payment_date)} · ${esc(p.status)}</small>${p.customer_note?`<p>${esc(p.customer_note)}</p>`:''}`;if(p.proof_path)controls.append(actionButton('View proof',()=>viewPaymentProof(p)));if(['submitted','rejected'].includes(p.status)){controls.append(actionButton('Confirm',()=>reviewPayment(p,'confirmed'),'aqua'));if(p.status==='submitted')controls.append(actionButton('Reject',()=>reviewPayment(p,'rejected'),'danger'));}div.append(controls);box.append(div);});
}
async function reviewPayment(payment,status){if(!canFinance())return;const note=prompt(status==='confirmed'?'Optional confirmation note:':'Reason for rejecting reference:',payment.operator_note||'');if(note===null)return;const {data,error}=await state.client.rpc('operator_review_payment_reference',{p_reference_id:payment.id,p_status:status,p_note:note||null});if(error)return setPageMessage(drawerMessage,error.message,'error');Object.assign(payment,data);await loadPayments();await reloadSelected();if(canMessages())await loadHistory();setPageMessage(drawerMessage,`Payment reference ${status}.`,'success');}
async function viewPaymentProof(payment){const buckets=['payment-proofs','payment-proofs-private','payment-references'];for(const bucket of buckets){const {data}=await state.client.storage.from(bucket).createSignedUrl(payment.proof_path,300);if(data?.signedUrl){window.open(data.signedUrl,'_blank','noopener');return;}}setPageMessage(drawerMessage,'Payment proof could not be opened for this account.','error');}
async function reloadSelected(){const {data,error}=await state.client.from('booking_enquiries').select('*,listings(title,category,listing_kind)').eq('id',state.selected.id).single();if(!error&&data){state.selected=data;renderSummary();renderActions();}}

async function loadHistory(){
  if(!canMessages())return;
  const {data,error}=await state.client.from('booking_history').select('*').eq('enquiry_id',state.selected.id).order('created_at',{ascending:false}).limit(100);if(error)throw error;state.history=data||[];
  const box=document.getElementById('bookingTimeline');box.replaceChildren();if(!state.history.length){box.innerHTML='<div class="empty-inline">History starts with the next reservation update.</div>';return;}
  state.history.forEach((h)=>{const div=document.createElement('div');div.className='timeline-item';const label=h.event_type.replaceAll('_',' ');div.innerHTML=`<strong>${esc(label.charAt(0).toUpperCase()+label.slice(1))}</strong><time>${new Date(h.created_at).toLocaleString()}</time>${Object.keys(h.detail||{}).length?`<small>${esc(JSON.stringify(h.detail).replace(/[{}\"]/g,' ').replace(/,/g,' · '))}</small>`:''}`;box.append(div);});
}

function resetPage(){state.page=0;loadReservations();}
function bindFilters(){
  const refresh=debounce(resetPage,300);['reservationStatus','reservationPayment','reservationFrom','reservationTo'].forEach((id)=>document.getElementById(id).addEventListener('change',resetPage));document.getElementById('reservationSearch').addEventListener('input',refresh);
  document.querySelectorAll('#quickFilters [data-quick]').forEach((button)=>button.addEventListener('click',()=>{state.quick=button.dataset.quick;document.querySelectorAll('#quickFilters [data-quick]').forEach((item)=>item.classList.toggle('active',item===button));resetPage();}));
  document.getElementById('refreshReservations').addEventListener('click',loadReservations);document.getElementById('previousPage').addEventListener('click',()=>{if(state.page>0){state.page-=1;loadReservations();}});document.getElementById('nextPage').addEventListener('click',()=>{if((state.page+1)*state.pageSize<state.total){state.page+=1;loadReservations();}});
}
function bindDrawer(){document.getElementById('closeDrawer').addEventListener('click',closeDrawer);document.getElementById('drawerScrim').addEventListener('click',closeDrawer);document.addEventListener('keydown',(e)=>{if(e.key==='Escape'&&!drawer.hidden)closeDrawer();});document.getElementById('messageForm').addEventListener('submit',sendMessage);document.getElementById('internalNoteForm').addEventListener('submit',saveInternalNote);}

async function loadBusiness(){state.page=0;applyPermissionUi();await loadReservations();}
async function init(){
  try{
    const base=await initializeOperatorPage('reservations');Object.assign(state,base);bindBusinessSwitcher(document.getElementById('businessSwitcher'),state,loadBusiness);bindFilters();bindDrawer();applyPermissionUi();
    const today=localDateString();document.getElementById('reservationFrom').value=addDays(today,-30);document.getElementById('reservationTo').value=addDays(today,365);await loadReservations();
  }catch(error){setPageMessage(message,error.message||'Could not open reservations.','error');}
}
init();
