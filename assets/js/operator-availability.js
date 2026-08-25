import { bindBusinessSwitcher, initializeOperatorPage, setPageMessage } from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,listings:[],rooms:[],externalBookings:[]};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const form=document.getElementById('externalBookingForm');
const listingSelect=document.getElementById('externalListing');
const roomSelect=document.getElementById('externalRoom');

function esc(value=''){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function sourceLabel(source){return ({booking_com:'Booking.com',agoda:'Agoda',direct:'Direct',walk_in:'Walk-in',other:'Other'})[source]||source||'Other';}
function dateText(value){return value?new Intl.DateTimeFormat('en',{day:'numeric',month:'short',year:'numeric'}).format(new Date(`${value}T12:00:00`)):'—';}
function listingName(id){return state.listings.find((x)=>x.id===id)?.title||'Accommodation';}
function roomRecord(id){return state.rooms.find((x)=>x.id===id)||null;}
function roomLabel(room){return room?`${listingName(room.listing_id)} · ${room.name}`:'Room';}

function fillListings(){
  const previous=listingSelect.value;listingSelect.replaceChildren();
  if(!state.listings.length){listingSelect.append(new Option('No accommodation listings',''));listingSelect.disabled=true;roomSelect.replaceChildren(new Option('No room types',''));roomSelect.disabled=true;form.querySelector('button[type="submit"]').disabled=true;return;}
  state.listings.forEach((item)=>listingSelect.append(new Option(item.title,item.id)));listingSelect.disabled=false;listingSelect.value=state.listings.some((x)=>x.id===previous)?previous:state.listings[0].id;fillRooms();
}
function fillRooms(){
  const previous=roomSelect.value;const rows=state.rooms.filter((x)=>x.listing_id===listingSelect.value&&x.is_active);roomSelect.replaceChildren();
  if(!rows.length){roomSelect.append(new Option('No room types configured',''));roomSelect.disabled=true;form.querySelector('button[type="submit"]').disabled=true;return;}
  rows.forEach((room)=>roomSelect.append(new Option(`${room.name} — ${room.quantity} total`,room.id)));roomSelect.disabled=false;roomSelect.value=rows.some((x)=>x.id===previous)?previous:rows[0].id;form.querySelector('button[type="submit"]').disabled=false;
}

function renderBookings(){
  const host=document.getElementById('externalBookingsTable');host.replaceChildren();
  if(!state.externalBookings.length){host.innerHTML='<div class="empty-state"><strong>No external bookings recorded</strong><span>Confirmed Booking.com, Agoda, direct and walk-in reservations will appear here.</span></div>';return;}
  host.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Source</th><th>Property / room</th><th>Stay</th><th>Rooms</th><th>Reference</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.externalBookings.map((booking)=>`<tr><td>${esc(sourceLabel(booking.source))}</td><td>${esc(roomLabel(roomRecord(booking.room_id)))}</td><td>${dateText(booking.check_in_date)} → ${dateText(booking.check_out_date)}</td><td>${Number(booking.rooms_booked)||1}</td><td>${esc(booking.external_reference||'—')}</td><td>${esc(booking.status||'active')}</td><td>${booking.status==='active'?`<button class="button small secondary" type="button" data-cancel="${booking.id}">Cancel / restore</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`;
  host.querySelectorAll('[data-cancel]').forEach((button)=>button.addEventListener('click',()=>cancelExternal(button.dataset.cancel)));
}

async function loadBusinessData(){
  if(!state.business){state.listings=[];state.rooms=[];state.externalBookings=[];fillListings();renderBookings();return;}
  setPageMessage(message,'Loading external bookings…','loading');
  try{
    const listings=await state.client.from('listings').select('id,title,category,status,is_active').eq('business_id',state.business.id).eq('category','accommodation').order('title');
    if(listings.error)throw listings.error;state.listings=listings.data||[];state.rooms=[];
    if(state.listings.length){const rooms=await state.client.from('accommodation_rooms').select('id,listing_id,name,quantity,is_active').in('listing_id',state.listings.map((x)=>x.id)).order('sort_order').order('name');if(rooms.error)throw rooms.error;state.rooms=rooms.data||[];}
    const bookings=await state.client.from('external_accommodation_bookings').select('*').eq('business_id',state.business.id).order('check_in_date',{ascending:true}).order('created_at',{ascending:false});
    if(bookings.error)throw bookings.error;state.externalBookings=bookings.data||[];fillListings();renderBookings();setPageMessage(message,state.listings.length?'':'Create an accommodation listing and room types before recording external bookings.','warning');
  }catch(error){setPageMessage(message,error.message||'Could not load external bookings.','error');}
}

async function saveExternal(event){
  event.preventDefault();
  const button=document.getElementById('saveExternalBooking');const checkIn=document.getElementById('externalCheckIn').value,checkOut=document.getElementById('externalCheckOut').value;
  if(!roomSelect.value)return setPageMessage(message,'Choose a room type.','error');
  if(!checkIn||!checkOut||checkOut<=checkIn)return setPageMessage(message,'Check-out must be after check-in.','error');
  button.disabled=true;button.textContent='Blocking inventory…';
  try{
    const {data,error}=await state.client.rpc('create_external_accommodation_booking',{p_room_id:roomSelect.value,p_source:document.getElementById('externalSource').value,p_check_in_date:checkIn,p_check_out_date:checkOut,p_rooms:Number(document.getElementById('externalRooms').value),p_external_reference:document.getElementById('externalReference').value.trim()||null,p_guest_name:document.getElementById('externalGuestName').value.trim()||null,p_notes:document.getElementById('externalNotes').value.trim()||null});
    if(error)throw error;document.getElementById('externalReference').value='';document.getElementById('externalGuestName').value='';document.getElementById('externalNotes').value='';setPageMessage(message,`External booking added. Visit Baa inventory was reduced for ${data.rooms_booked} room${Number(data.rooms_booked)===1?'':'s'}.`,'success');await loadBusinessData();
  }catch(error){setPageMessage(message,error.message,'error');}
  finally{button.disabled=false;button.textContent='Add booking & block inventory';}
}

async function cancelExternal(id){
  const booking=state.externalBookings.find((x)=>x.id===id);if(!booking)return;
  if(!confirm(`Cancel ${sourceLabel(booking.source)} ${booking.external_reference||'booking'} in Visit Baa and restore its room inventory?`))return;
  try{setPageMessage(message,'Restoring room inventory…','loading');const {error}=await state.client.rpc('cancel_external_accommodation_booking',{p_booking_id:id});if(error)throw error;await loadBusinessData();setPageMessage(message,'External booking cancelled and its room inventory was restored.','success');}
  catch(error){setPageMessage(message,error.message,'error');}
}

function bind(){listingSelect.addEventListener('change',fillRooms);form.addEventListener('submit',saveExternal);document.getElementById('refreshButton').addEventListener('click',loadBusinessData);}

async function init(){
  try{const base=await initializeOperatorPage('external');Object.assign(state,base);bindBusinessSwitcher(businessSwitcher,state,loadBusinessData);bind();const today=new Date();const local=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);document.getElementById('externalCheckIn').min=local;document.getElementById('externalCheckOut').min=local;await loadBusinessData();}
  catch(error){setPageMessage(message,error.message||'Could not open external bookings.','error');}
}
init();
