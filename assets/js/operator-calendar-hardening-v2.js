import { requireSupabase } from './supabase-client.js';

const client=requireSupabase();
const mode=document.getElementById('calendarMode');
const message=document.getElementById('pageMessage');
const form=document.getElementById('calendarForm');
const tableHost=document.getElementById('calendarTable');
let mobileStart=1;

function setMessage(text='',kind=''){if(!message)return;message.textContent=text;message.hidden=!text;message.className=`message${kind?` ${kind}`:''}`;}
function fieldFor(id){return document.getElementById(id)?.closest('.field')||document.getElementById(id)?.closest('[data-room-control]');}
function syncMode(){
  const schedule=mode?.value==='schedule';
  const hideWhenSchedule=['roomSelect','ratePlanSelect','rangeStart','rangeEnd','sellableQuantity','priceOverride','minimumStay','maximumStay','minAdvanceHours','maxAdvanceDays'];
  hideWhenSchedule.forEach((id)=>{const field=fieldFor(id);if(field)field.hidden=schedule;});
  document.querySelectorAll('#calendarForm .checkbox-grid').forEach((box)=>{box.closest('.field')?.toggleAttribute('hidden',schedule);});
  const save=document.getElementById('saveCalendarRange');if(save)save.hidden=schedule;
  const external=form?.querySelector('a[href="operator-availability.html"]');if(external)external.hidden=schedule;
  const head=document.querySelector('#calendarEditorCard .operator-work-card-head h2');if(head)head.textContent=schedule?'Service schedule setup':'Bulk room/rate update';
  const note=document.querySelector('#calendarEditorCard .operator-work-card-head p');if(note)note.textContent=schedule?'Choose the listing, add weekly recurring times and generate the next 12 months.':'Select a room or rate plan and apply one change across a date range.';
}
async function refreshCalendar(){document.getElementById('todayMonth')?.click();await new Promise((r)=>setTimeout(r,120));}
async function toggleRule(button){
  const id=button.dataset.ruleToggle;if(!id)return;
  const active=button.textContent.trim()==='Activate';button.disabled=true;const old=button.textContent;button.textContent=active?'Activating…':'Pausing…';
  try{const {error}=await client.rpc('operator_set_schedule_rule_state',{p_rule_id:id,p_active:active});if(error)throw error;setMessage(active?'Schedule activated and future sessions regenerated.':'Schedule paused and future generated sessions closed to new bookings.','success');await refreshCalendar();}
  catch(error){setMessage(error.message,'error');button.disabled=false;button.textContent=old;}
}
async function deleteRule(button){
  const id=button.dataset.ruleDelete;if(!id||!confirm('Delete this recurring schedule? Future generated sessions will be closed to new bookings. Existing confirmed bookings remain recorded.'))return;
  button.disabled=true;const old=button.textContent;button.textContent='Deleting…';
  try{const {error}=await client.rpc('operator_delete_schedule_rule',{p_rule_id:id});if(error)throw error;setMessage('Recurring schedule deleted. Future generated sessions were closed to new bookings.','success');await refreshCalendar();}
  catch(error){setMessage(error.message,'error');button.disabled=false;button.textContent=old;}
}
document.addEventListener('click',(event)=>{const toggle=event.target.closest('[data-rule-toggle]');if(toggle){event.preventDefault();event.stopImmediatePropagation();toggleRule(toggle);return;}const del=event.target.closest('[data-rule-delete]');if(del){event.preventDefault();event.stopImmediatePropagation();deleteRule(del);}},true);

function installQuickActions(){
  if(!form||document.getElementById('quickCloseDates'))return;const actions=form.querySelector('.form-actions');if(!actions)return;
  const close=document.createElement('button');close.type='button';close.id='quickCloseDates';close.className='button secondary';close.textContent='Close selected dates';
  const open=document.createElement('button');open.type='button';open.id='quickOpenDates';open.className='button secondary';open.textContent='Open selected dates';
  close.addEventListener('click',()=>{document.getElementById('stopSell').checked=true;document.getElementById('blocked').checked=true;form.requestSubmit(document.getElementById('saveCalendarRange'));});
  open.addEventListener('click',()=>{document.getElementById('stopSell').checked=false;document.getElementById('blocked').checked=false;form.requestSubmit(document.getElementById('saveCalendarRange'));});
  actions.prepend(open);actions.prepend(close);
}
function monthFromTitle(){const text=(document.getElementById('calendarTitle')?.textContent||'').replace(/\s+availability$/i,'').trim();const d=new Date(`${text} 1, 12:00:00`);return Number.isNaN(d.getTime())?null:d;}
function dateForCell(td){const month=monthFromTitle();if(!month)return null;const day=td.cellIndex;if(day<1)return null;const d=new Date(month.getFullYear(),month.getMonth(),day,12);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function selectRoomFromRow(td){const row=td.closest('tr');const label=row?.cells?.[0]?.querySelector('strong')?.textContent?.trim();const select=document.getElementById('roomSelect');if(!label||!select)return;const option=[...select.options].find((o)=>o.textContent.startsWith(label));if(option){select.value=option.value;select.dispatchEvent(new Event('change',{bubbles:true}));}}
tableHost?.addEventListener('click',(event)=>{if(mode?.value!=='accommodation')return;const td=event.target.closest('td.calendar-cell');if(!td)return;const date=dateForCell(td);if(!date)return;selectRoomFromRow(td);document.getElementById('rangeStart').value=date;document.getElementById('rangeEnd').value=date;document.getElementById('calendarEditorBody').hidden=false;document.getElementById('toggleEditor').textContent='Hide editor';document.getElementById('calendarEditorCard').scrollIntoView({behavior:'smooth',block:'start'});setMessage(`${date} selected. Change availability/rate fields and apply the update.`,'success');});

function installMobileWeek(){
  const header=document.querySelector('#calendarTitle')?.closest('.operator-work-card-head');if(!header||document.getElementById('mobileWeekControls'))return;
  const controls=document.createElement('div');controls.id='mobileWeekControls';controls.className='form-actions mobile-week-controls';controls.innerHTML='<button class="button small secondary" type="button" id="mobilePrevWeek">← 7 days</button><button class="button small secondary" type="button" id="mobileNextWeek">7 days →</button><button class="button small secondary" type="button" id="mobileFullMonth">Full month</button>';header.append(controls);
  document.getElementById('mobilePrevWeek').addEventListener('click',()=>{mobileStart=Math.max(1,mobileStart-7);applyMobileWeek();});document.getElementById('mobileNextWeek').addEventListener('click',()=>{mobileStart+=7;applyMobileWeek();});document.getElementById('mobileFullMonth').addEventListener('click',()=>{tableHost?.classList.toggle('show-full-mobile');applyMobileWeek();});
}
function applyMobileWeek(){
  const table=tableHost?.querySelector('.calendar-grid');if(!table)return;const mobile=innerWidth<=780&&!tableHost.classList.contains('show-full-mobile');table.classList.toggle('mobile-week-grid',mobile);const max=Math.max(1,(table.rows[0]?.cells.length||2)-1);mobileStart=Math.min(mobileStart,Math.max(1,max-6));[...table.rows].forEach((row)=>[...row.cells].forEach((cell,index)=>{if(index===0){cell.style.display='';return;}cell.style.display=mobile&&(index<mobileStart||index>mobileStart+6)?'none':'';}));const controls=document.getElementById('mobileWeekControls');if(controls)controls.hidden=innerWidth>780;
}
const style=document.createElement('style');style.textContent='@media(max-width:780px){.calendar-grid.mobile-week-grid{min-width:0;width:100%}.calendar-grid.mobile-week-grid th,.calendar-grid.mobile-week-grid td{min-width:72px}.calendar-grid.mobile-week-grid th:first-child,.calendar-grid.mobile-week-grid td:first-child{min-width:132px}.mobile-week-controls{width:100%;justify-content:flex-start}}';document.head.append(style);
mode?.addEventListener('change',()=>{syncMode();mobileStart=1;});window.addEventListener('resize',applyMobileWeek);if(tableHost)new MutationObserver(()=>{mobileStart=1;applyMobileWeek();}).observe(tableHost,{childList:true,subtree:true});
installQuickActions();installMobileWeek();syncMode();setTimeout(applyMobileWeek,150);
