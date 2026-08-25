import { addDays, bindBusinessSwitcher, fillBusinessSwitcher, formatMoney, initializeOperatorPage, localDateString, setPageMessage } from './operator-shell.js';

const state={client:null,user:null,businesses:[],business:null,listings:[],rooms:[],ratePlans:[],roomInventory:[],rateCalendar:[],sessions:[],scheduleRules:[],monthStart:null};
const message=document.getElementById('pageMessage');
const businessSwitcher=document.getElementById('businessSwitcher');
const listingSelect=document.getElementById('listingSelect');
const roomSelect=document.getElementById('roomSelect');
const ratePlanSelect=document.getElementById('ratePlanSelect');
const calendarMode=document.getElementById('calendarMode');

function dateOnly(date){return localDateString(date);}
function firstOfMonth(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-01`;}
function lastOfMonth(start){const d=new Date(`${start}T12:00:00`);d.setMonth(d.getMonth()+1);d.setDate(0);return dateOnly(d);}
function monthLabel(start){return new Intl.DateTimeFormat('en',{month:'long',year:'numeric'}).format(new Date(`${start}T12:00:00`));}
function daysInRange(start,end){const out=[];for(let cur=start;cur<=end;cur=addDays(cur,1))out.push(cur);return out;}
function selectedListing(){return state.listings.find((item)=>item.id===listingSelect.value)||null;}
function selectedRoom(){return state.rooms.find((item)=>item.id===roomSelect.value)||null;}
function selectedRate(){return state.ratePlans.find((item)=>item.id===ratePlanSelect.value)||null;}
function n(id){const raw=document.getElementById(id).value;return raw===''?null:Number(raw);}

async function loadBusiness(){
  if(!state.business){state.listings=[];renderSelectors();renderCalendar();return;}
  setPageMessage(message,'Loading calendar…','loading');
  const {data,error}=await state.client.from('listings').select('id,title,category,status,is_active,currency,price,max_capacity').eq('business_id',state.business.id).order('title');
  if(error)throw error;state.listings=data||[];
  const accommodationIds=state.listings.filter((x)=>x.category==='accommodation').map((x)=>x.id);
  state.rooms=[];state.ratePlans=[];
  if(accommodationIds.length){
    const rooms=await state.client.from('accommodation_rooms').select('*').in('listing_id',accommodationIds).eq('is_active',true).order('sort_order');
    if(rooms.error)throw rooms.error;state.rooms=rooms.data||[];
    if(state.rooms.length){const rates=await state.client.from('room_rate_plans').select('*').in('room_id',state.rooms.map((r)=>r.id)).eq('is_active',true).order('sort_order');if(rates.error)throw rates.error;state.ratePlans=rates.data||[];}
  }
  renderSelectors();await loadCalendarData();setPageMessage(message);
}

function renderSelectors(){
  const mode=calendarMode.value;
  const previous=listingSelect.value;
  const eligible=state.listings.filter((l)=>mode==='accommodation'?l.category==='accommodation':l.category!=='accommodation');
  listingSelect.replaceChildren();
  if(!eligible.length){listingSelect.append(new Option(mode==='accommodation'?'No accommodation listings':'No scheduled service listings',''));listingSelect.disabled=true;}else{eligible.forEach((l)=>listingSelect.append(new Option(`${l.title} — ${l.status.replaceAll('_',' ')}`,l.id)));listingSelect.disabled=false;listingSelect.value=eligible.some((l)=>l.id===previous)?previous:eligible[0].id;}
  refreshRoomRateSelectors();
  document.getElementById('roomField').hidden=mode!=='accommodation';document.getElementById('rateField').hidden=mode!=='accommodation';document.querySelectorAll('[data-room-control]').forEach((el)=>el.hidden=mode!=='accommodation');
  document.getElementById('scheduleRuleForm').hidden=mode==='accommodation';document.getElementById('scheduleRulesCard').hidden=mode==='accommodation';
  document.getElementById('calendarForm').querySelectorAll('input,select').forEach((input)=>{if(input.id!=='calendarMode'&&mode==='schedule'&&['roomSelect','ratePlanSelect','sellableQuantity','minimumStay','maximumStay','closedArrival','closedDeparture'].includes(input.id))input.disabled=true;else input.disabled=false;});
}

function refreshRoomRateSelectors(){
  const listing=selectedListing();const priorRoom=roomSelect.value;
  const rooms=state.rooms.filter((r)=>r.listing_id===listing?.id);
  roomSelect.replaceChildren();rooms.forEach((r)=>roomSelect.append(new Option(`${r.name} — ${r.quantity} total`,r.id)));roomSelect.disabled=!rooms.length;roomSelect.value=rooms.some((r)=>r.id===priorRoom)?priorRoom:(rooms[0]?.id||'');
  const room=selectedRoom();const priorRate=ratePlanSelect.value;ratePlanSelect.replaceChildren(new Option('Room inventory / base rate',''));
  state.ratePlans.filter((r)=>r.room_id===room?.id).forEach((r)=>ratePlanSelect.append(new Option(`${r.name} — ${r.pricing_mode==='fixed'?formatMoney(r.nightly_price,room?.currency):`${r.adjustment_value}${r.pricing_mode==='derived_percent'?'%':' amount'} adjustment`}`,r.id)));
  if([...ratePlanSelect.options].some((o)=>o.value===priorRate))ratePlanSelect.value=priorRate;
  const qty=document.getElementById('sellableQuantity');qty.max=room?.quantity??'';if(room&&qty.value==='')qty.value=room.quantity;
}

async function loadCalendarData(){
  const listing=selectedListing();if(!listing){state.roomInventory=[];state.sessions=[];state.scheduleRules=[];renderCalendar();return;}
  const start=state.monthStart;const end=lastOfMonth(start);
  if(calendarMode.value==='accommodation'){
    const rooms=state.rooms.filter((r)=>r.listing_id===listing.id);const roomIds=rooms.map((r)=>r.id);state.roomInventory=[];state.rateCalendar=[];
    if(roomIds.length){
      const [inv,rate]=await Promise.all([
        state.client.from('room_availability').select('*').in('room_id',roomIds).gte('available_date',start).lte('available_date',end).order('available_date'),
        state.client.from('room_rate_calendar').select('*').in('room_id',roomIds).gte('available_date',start).lte('available_date',end).order('available_date')
      ]);if(inv.error)throw inv.error;if(rate.error)throw rate.error;state.roomInventory=inv.data||[];state.rateCalendar=rate.data||[];
    }
  }else{
    const [sessions,rules]=await Promise.all([
      state.client.from('availability').select('*').eq('listing_id',listing.id).gte('available_date',start).lte('available_date',end).order('available_date').order('start_time'),
      state.client.from('listing_schedule_rules').select('*').eq('listing_id',listing.id).order('day_of_week').order('start_time')
    ]);if(sessions.error)throw sessions.error;if(rules.error)throw rules.error;state.sessions=sessions.data||[];state.scheduleRules=rules.data||[];
  }
  renderCalendar();renderScheduleRules();renderMetrics();
}

function effectiveRate(room,rate,day){
  const override=state.rateCalendar.find((x)=>x.room_id===room.id&&x.rate_plan_id===(rate?.id||null)&&x.available_date===day)?.price_override;
  const baseOverride=state.roomInventory.find((x)=>x.room_id===room.id&&x.available_date===day)?.price_override;
  if(override!=null)return Number(override);if(baseOverride!=null&&!rate)return Number(baseOverride);if(!rate)return Number(room.base_price);
  if(rate.pricing_mode==='fixed')return Number(rate.nightly_price);
  const parent=state.ratePlans.find((x)=>x.id===rate.parent_rate_plan_id);const base=Number(parent?.nightly_price??room.base_price);
  return rate.pricing_mode==='derived_percent'?Math.max(0,base*(1+Number(rate.adjustment_value)/100)):Math.max(0,base+Number(rate.adjustment_value));
}

function renderCalendar(){
  const container=document.getElementById('calendarTable');container.replaceChildren();document.getElementById('calendarTitle').textContent=`${monthLabel(state.monthStart)} availability`;
  const days=daysInRange(state.monthStart,lastOfMonth(state.monthStart));const table=document.createElement('table');table.className='calendar-grid';const thead=document.createElement('thead');const hr=document.createElement('tr');hr.append(Object.assign(document.createElement('th'),{textContent:'Room / session'}));days.forEach((day)=>{const th=document.createElement('th');const d=new Date(`${day}T12:00:00`);th.innerHTML=`${d.toLocaleDateString('en',{weekday:'short'})}<br><strong>${d.getDate()}</strong>`;if([0,6].includes(d.getDay()))th.classList.add('calendar-date-weekend');hr.append(th);});thead.append(hr);table.append(thead);const body=document.createElement('tbody');
  if(calendarMode.value==='accommodation'){
    const listing=selectedListing();const rooms=state.rooms.filter((r)=>r.listing_id===listing?.id);
    rooms.forEach((room)=>{
      const row=document.createElement('tr');const name=document.createElement('td');name.innerHTML=`<strong>${room.name}</strong><br><small>${room.quantity} total · ${formatMoney(room.base_price,room.currency)} base</small>`;row.append(name);
      days.forEach((day)=>{const inv=state.roomInventory.find((x)=>x.room_id===room.id&&x.available_date===day);const td=document.createElement('td');if(!inv){td.className='calendar-cell blocked';td.innerHTML='<strong>—</strong><small>Not open</small>';}else{const available=Number(inv.available_quantity);td.className=`calendar-cell ${inv.is_blocked||inv.stop_sell?'blocked':available===0?'sold':available<=1?'low':'open'}`;td.innerHTML=`<strong>${available}</strong><small>sell ${inv.sellable_quantity} · hold ${inv.held_quantity}</small><small>VB ${inv.booked_quantity} · ext ${inv.external_booked_quantity}</small><small>${formatMoney(effectiveRate(room,null,day),room.currency)}</small>`;}row.append(td);});body.append(row);
      state.ratePlans.filter((r)=>r.room_id===room.id).forEach((rate)=>{const rr=document.createElement('tr');const n=document.createElement('td');n.innerHTML=`↳ <strong>${rate.name}</strong><br><small>${rate.pricing_mode.replaceAll('_',' ')}</small>`;rr.append(n);days.forEach((day)=>{const cal=state.rateCalendar.find((x)=>x.room_id===room.id&&x.rate_plan_id===rate.id&&x.available_date===day);const td=document.createElement('td');td.className=`calendar-cell ${cal?.stop_sell?'blocked':''}`;td.innerHTML=`<strong>${formatMoney(effectiveRate(room,rate,day),room.currency)}</strong>${cal?.minimum_stay?`<small>min ${cal.minimum_stay} nights</small>`:''}${cal?.stop_sell?'<small>STOP SELL</small>':''}`;rr.append(td);});body.append(rr);});
    });
    if(!rooms.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=days.length+1;td.className='empty-inline';td.textContent='Create room types in Listings before managing accommodation inventory.';tr.append(td);body.append(tr);}
  }else{
    const listing=selectedListing();const grouped=new Map();state.sessions.forEach((s)=>{const key=s.start_time||'Flexible';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(s);});
    for(const [time,items] of grouped){const row=document.createElement('tr');const name=document.createElement('td');name.innerHTML=`<strong>${listing?.title||'Service'}</strong><br><small>${time==='Flexible'?'Flexible time':time.slice(0,5)}</small>`;row.append(name);days.forEach((day)=>{const s=items.find((x)=>x.available_date===day);const td=document.createElement('td');if(!s){td.className='calendar-cell blocked';td.innerHTML='<strong>—</strong><small>No session</small>';}else{const available=Number(s.remaining_spaces);td.className=`calendar-cell ${s.is_blocked||s.stop_sell?'blocked':available===0?'sold':available<=2?'low':'open'}`;td.innerHTML=`<strong>${available}</strong><small>of ${s.sellable_capacity??s.max_capacity}</small><small>${s.is_blocked||s.stop_sell?'Closed':'Open'}</small>`;}row.append(td);});body.append(row);}
    if(!grouped.size){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=days.length+1;td.className='empty-inline';td.textContent='No sessions generated for this month. Add a recurring schedule and generate the calendar.';tr.append(td);body.append(tr);}
  }
  table.append(body);container.append(table);
}

function renderMetrics(){const today=localDateString();let open=0,held=0,booked=0,external=0,blocked=0;if(calendarMode.value==='accommodation'){state.roomInventory.filter((x)=>x.available_date===today).forEach((x)=>{open+=Number(x.available_quantity||0);held+=Number(x.held_quantity||0);booked+=Number(x.booked_quantity||0);external+=Number(x.external_booked_quantity||0);if(x.is_blocked||x.stop_sell)blocked+=1;});}else{state.sessions.filter((x)=>x.available_date===today).forEach((x)=>{open+=Number(x.remaining_spaces||0);held+=Number(x.held_spaces||0);booked+=Number(x.booked_spaces||0);if(x.is_blocked||x.stop_sell)blocked+=1;});}document.getElementById('openToday').textContent=open;document.getElementById('heldToday').textContent=held;document.getElementById('bookedToday').textContent=booked;document.getElementById('externalToday').textContent=external;document.getElementById('blockedToday').textContent=blocked;}

function renderScheduleRules(){const box=document.getElementById('scheduleRules');box.replaceChildren();if(calendarMode.value==='accommodation')return;if(!state.scheduleRules.length){box.innerHTML='<div class="empty-inline">No recurring schedules yet.</div>';return;}const table=document.createElement('div');table.className='table-wrap';const dayNames=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];table.innerHTML=`<table><thead><tr><th>Day</th><th>Time</th><th>Capacity</th><th>Valid dates</th><th>Status</th><th>Action</th></tr></thead><tbody>${state.scheduleRules.map((r)=>`<tr><td>${dayNames[r.day_of_week]}</td><td>${r.start_time.slice(0,5)}${r.end_time?`–${r.end_time.slice(0,5)}`:''}</td><td>${r.capacity}</td><td>${r.valid_from}${r.valid_until?` → ${r.valid_until}`:' onward'}</td><td>${r.is_active?'Active':'Inactive'}</td><td><button class="button small secondary" data-rule-toggle="${r.id}">${r.is_active?'Pause':'Activate'}</button> <button class="button small danger" data-rule-delete="${r.id}">Delete</button></td></tr>`).join('')}</tbody></table>`;box.append(table);box.querySelectorAll('[data-rule-toggle]').forEach((b)=>b.addEventListener('click',()=>toggleRule(b.dataset.ruleToggle)));box.querySelectorAll('[data-rule-delete]').forEach((b)=>b.addEventListener('click',()=>deleteRule(b.dataset.ruleDelete)));}

async function saveCalendar(event){event.preventDefault();const listing=selectedListing();if(!listing)return;if(calendarMode.value!=='accommodation'){setPageMessage(message,'For scheduled services, use recurring schedule rules and then generate sessions.','warning');return;}const room=selectedRoom();if(!room)return setPageMessage(message,'Choose a room type.','error');const start=document.getElementById('rangeStart').value,end=document.getElementById('rangeEnd').value;if(!start||!end||end<start)return setPageMessage(message,'Choose a valid date range.','error');const button=document.getElementById('saveCalendarRange');button.disabled=true;try{const {error}=await state.client.rpc('operator_set_room_calendar_range',{p_room_id:room.id,p_rate_plan_id:ratePlanSelect.value||null,p_start_date:start,p_end_date:end,p_sellable_quantity:ratePlanSelect.value?null:n('sellableQuantity'),p_price_override:n('priceOverride'),p_minimum_stay:n('minimumStay'),p_maximum_stay:n('maximumStay'),p_min_advance_hours:n('minAdvanceHours'),p_max_advance_days:n('maxAdvanceDays'),p_closed_to_arrival:document.getElementById('closedArrival').checked,p_closed_to_departure:document.getElementById('closedDeparture').checked,p_stop_sell:document.getElementById('stopSell').checked,p_is_blocked:document.getElementById('blocked').checked});if(error)throw error;setPageMessage(message,'Calendar updated. Existing confirmed, held and external reservations were protected.','success');await loadCalendarData();}catch(error){setPageMessage(message,error.message,'error');}finally{button.disabled=false;}}

async function saveScheduleRule(event){
  event.preventDefault();const listing=selectedListing();if(!listing)return;
  const form=event.currentTarget;const button=form.querySelector('button[type="submit"]');if(button.disabled)return;
  const payload={listing_id:listing.id,day_of_week:Number(document.getElementById('scheduleDay').value),start_time:document.getElementById('scheduleStart').value,end_time:document.getElementById('scheduleEnd').value||null,capacity:Number(document.getElementById('scheduleCapacity').value),valid_from:document.getElementById('scheduleFrom').value,valid_until:document.getElementById('scheduleUntil').value||null,is_active:true};
  button.disabled=true;const original=button.textContent;button.textContent='Saving schedule…';
  try{const {error}=await state.client.from('listing_schedule_rules').insert(payload);if(error)throw error;form.reset();document.getElementById('scheduleFrom').value=localDateString();setPageMessage(message,'Recurring schedule added. Generate sessions to publish the next 12 months.','success');await loadCalendarData();}
  catch(error){const duplicate=error?.code==='23505'||/duplicate key|unique constraint/i.test(error?.message||'');setPageMessage(message,duplicate?'This recurring schedule already exists for the same listing, weekday, start time and valid-from date. Edit or delete the existing rule instead.':error.message,'error');}
  finally{button.disabled=false;button.textContent=original;}
}
async function generateSchedule(){const listing=selectedListing();if(!listing)return;const button=document.getElementById('generateSchedule');button.disabled=true;try{const start=localDateString(),end=addDays(start,365);const {data,error}=await state.client.rpc('operator_generate_listing_schedule',{p_listing_id:listing.id,p_start_date:start,p_end_date:end});if(error)throw error;setPageMessage(message,`${data||0} bookable sessions generated or updated for the next 12 months.`,'success');await loadCalendarData();}catch(error){setPageMessage(message,error.message,'error');}finally{button.disabled=false;}}
async function toggleRule(id){const rule=state.scheduleRules.find((r)=>r.id===id);if(!rule)return;const {error}=await state.client.from('listing_schedule_rules').update({is_active:!rule.is_active}).eq('id',id);if(error)return setPageMessage(message,error.message,'error');await loadCalendarData();}
async function deleteRule(id){if(!confirm('Delete this recurring schedule rule? Existing generated bookings remain unchanged.'))return;const {error}=await state.client.from('listing_schedule_rules').delete().eq('id',id);if(error)return setPageMessage(message,error.message,'error');await loadCalendarData();}

function shiftMonth(delta){const d=new Date(`${state.monthStart}T12:00:00`);d.setMonth(d.getMonth()+delta);const candidate=firstOfMonth(d);const todayMonth=firstOfMonth(new Date());const maxDate=new Date();maxDate.setMonth(maxDate.getMonth()+12);const maxMonth=firstOfMonth(maxDate);state.monthStart=candidate<todayMonth?todayMonth:candidate>maxMonth?maxMonth:candidate;loadCalendarData().catch((error)=>setPageMessage(message,error.message,'error'));}

async function init(){try{const base=await initializeOperatorPage('calendar');Object.assign(state,base);state.monthStart=firstOfMonth(new Date());fillBusinessSwitcher(businessSwitcher,state.businesses,state.business);bindBusinessSwitcher(businessSwitcher,state,loadBusiness);document.getElementById('rangeStart').value=localDateString();document.getElementById('rangeEnd').value=addDays(localDateString(),30);document.getElementById('scheduleFrom').value=localDateString();calendarMode.addEventListener('change',async()=>{renderSelectors();await loadCalendarData();});listingSelect.addEventListener('change',async()=>{refreshRoomRateSelectors();await loadCalendarData();});roomSelect.addEventListener('change',()=>{refreshRoomRateSelectors();renderCalendar();});ratePlanSelect.addEventListener('change',renderCalendar);document.getElementById('calendarForm').addEventListener('submit',saveCalendar);document.getElementById('scheduleRuleForm').addEventListener('submit',saveScheduleRule);document.getElementById('generateSchedule').addEventListener('click',generateSchedule);document.getElementById('previousMonth').addEventListener('click',()=>shiftMonth(-1));document.getElementById('nextMonth').addEventListener('click',()=>shiftMonth(1));document.getElementById('todayMonth').addEventListener('click',()=>{state.monthStart=firstOfMonth(new Date());loadCalendarData();});document.getElementById('toggleEditor').addEventListener('click',(e)=>{const body=document.getElementById('calendarEditorBody');body.hidden=!body.hidden;e.currentTarget.textContent=body.hidden?'Show editor':'Hide editor';});await loadBusiness();}catch(error){setPageMessage(message,error.message,'error');}}
init();