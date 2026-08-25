import { requireSupabase } from './supabase-client.js';

const client=requireSupabase();
const form=document.getElementById('externalBookingForm');
const message=document.getElementById('pageMessage');
const table=document.getElementById('externalBookingsTable');
let editId='';
let cancelButton=null;

function setMessage(text='',kind=''){if(!message)return;message.textContent=text;message.hidden=!text;message.className=`message${kind?` ${kind}`:''}`;}
function submitButton(){return document.getElementById('saveExternalBooking');}
function resetEdit(){editId='';const button=submitButton();if(button){button.textContent='Add booking & block inventory';button.disabled=false;}cancelButton?.remove();cancelButton=null;form?.reset();const today=new Date();const local=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);document.getElementById('externalCheckIn').min=local;document.getElementById('externalCheckOut').min=local;document.getElementById('externalListing')?.dispatchEvent(new Event('change',{bubbles:true}));}

async function startEdit(id){
  const {data,error}=await client.from('external_accommodation_bookings').select('*').eq('id',id).maybeSingle();if(error)throw error;if(!data)throw new Error('External booking not found.');
  editId=id;document.getElementById('externalSource').value=data.source;document.getElementById('externalListing').value=data.listing_id;document.getElementById('externalListing').dispatchEvent(new Event('change',{bubbles:true}));await new Promise((r)=>setTimeout(r,0));document.getElementById('externalRoom').value=data.room_id;document.getElementById('externalCheckIn').value=data.check_in_date;document.getElementById('externalCheckOut').value=data.check_out_date;document.getElementById('externalRooms').value=data.rooms_booked;document.getElementById('externalReference').value=data.external_reference||'';document.getElementById('externalGuestName').value=data.guest_name||'';document.getElementById('externalNotes').value=data.notes||'';
  const button=submitButton();button.textContent='Save changes & recalculate inventory';
  if(!cancelButton){cancelButton=document.createElement('button');cancelButton.type='button';cancelButton.className='button secondary';cancelButton.textContent='Cancel edit';cancelButton.addEventListener('click',resetEdit);button.insertAdjacentElement('afterend',cancelButton);}
  form.scrollIntoView({behavior:'smooth',block:'start'});setMessage('Editing external booking. Inventory will be recalculated safely when you save.','success');
}

async function saveEdit(event){
  if(!editId)return;
  event.preventDefault();event.stopImmediatePropagation();
  const button=submitButton();const checkIn=document.getElementById('externalCheckIn').value,checkOut=document.getElementById('externalCheckOut').value;
  if(!checkIn||!checkOut||checkOut<=checkIn)return setMessage('Check-out must be after check-in.','error');
  const room=document.getElementById('externalRoom').value;if(!room)return setMessage('Choose a room type.','error');
  button.disabled=true;button.textContent='Checking inventory…';
  try{
    const {error}=await client.rpc('operator_update_external_accommodation_booking',{p_booking_id:editId,p_room_id:room,p_source:document.getElementById('externalSource').value,p_check_in_date:checkIn,p_check_out_date:checkOut,p_rooms:Number(document.getElementById('externalRooms').value),p_external_reference:document.getElementById('externalReference').value.trim()||null,p_guest_name:document.getElementById('externalGuestName').value.trim()||null,p_notes:document.getElementById('externalNotes').value.trim()||null});if(error)throw error;
    const refresh=document.getElementById('refreshButton');resetEdit();refresh?.click();setMessage('External booking updated and room inventory recalculated.','success');
  }catch(error){button.disabled=false;button.textContent='Save changes & recalculate inventory';setMessage(error.message,'error');}
}
form?.addEventListener('submit',saveEdit,true);

function enhanceRows(){
  table?.querySelectorAll('[data-cancel]').forEach((cancel)=>{
    const cell=cancel.closest('td');if(!cell||cell.querySelector('[data-edit-external]'))return;
    const edit=document.createElement('button');edit.type='button';edit.className='button small secondary';edit.dataset.editExternal=cancel.dataset.cancel;edit.textContent='Edit';edit.style.marginRight='6px';edit.addEventListener('click',()=>startEdit(edit.dataset.editExternal).catch((e)=>setMessage(e.message,'error')));cell.prepend(edit);
  });
}
if(table)new MutationObserver(enhanceRows).observe(table,{childList:true,subtree:true});enhanceRows();
