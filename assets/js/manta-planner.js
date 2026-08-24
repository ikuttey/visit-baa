import { nightsBetween } from './marketplace.js';
import { applyMantaOverride, normalizeSimpleAnswers, ROOM_PREFERENCES, STAY_PREFERENCES } from './manta-preferences.js';

const asset='assets/images/manta-planner.png?v=5';
const personalityCss='assets/css/manta-personality.css?v=1';
const steps=['island','dates','travelers','stayPreference','roomPreference','activities'];
const defaults={islands:[],activities:[],adults:2,children:0,rooms:1,startDate:'',endDate:'',flexible:false,nightsByIsland:{},activityPlan:{},stayPreference:'none',roomPreference:'none',stayPreferenceRequired:false,roomPreferenceRequired:false,recommendationMode:'best_value',budget:null};
const state={step:0,data:null,module:null,answers:{...defaults}};
const el=(tag,{className='',text='',attrs={},children=[]}={})=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=='')node.textContent=text;Object.entries(attrs).forEach(([key,value])=>{if(value!==null&&value!==undefined)node.setAttribute(key,String(value));});children.filter(Boolean).forEach((child)=>node.append(child));return node;};

if(!document.querySelector('link[data-manta-personality]')){
  const stylesheet=el('link',{attrs:{rel:'stylesheet',href:personalityCss,'data-manta-personality':'true'}});
  document.head.append(stylesheet);
}

const launch=el('button',{className:'manta-planner-launch',attrs:{type:'button','aria-label':'Open Visit Baa Trip Planner'},children:[el('img',{attrs:{src:asset,alt:''}}),el('span',{className:'manta-planner-tooltip',text:'Hi, I’m Manta — plan your Baa trip'})]});
const greetingText=el('span');
const greeting=el('aside',{className:'manta-planner-greeting',attrs:{'aria-live':'polite','aria-atomic':'true'},children:[greetingText]});
const drawer=el('dialog',{className:'manta-planner-drawer',attrs:{'aria-labelledby':'mantaPlannerTitle'}});
const close=el('button',{className:'manta-planner-close',text:'×',attrs:{type:'button','aria-label':'Close trip planner'}});
const title=el('header',{className:'manta-planner-titlebar',children:[el('img',{attrs:{src:asset,alt:''}}),el('div',{children:[el('strong',{text:'Visit Baa Trip Planner',attrs:{id:'mantaPlannerTitle'}}),el('small',{text:'Six quick choices'})]}),close]});
const progressText=el('span',{className:'manta-progress-text'});
const progressBar=el('span',{className:'manta-progress-bar',children:[el('i')]});
const back=el('button',{text:'Back',attrs:{type:'button'}});
const restart=el('button',{text:'Restart',attrs:{type:'button'}});
const question=el('section',{className:'manta-question'});
const footer=el('div',{className:'manta-question-footer'});
drawer.append(title,el('div',{className:'manta-planner-progress',children:[progressText,progressBar]}),el('div',{className:'manta-planner-controls',children:[back,restart]}),question,footer);
document.body.append(launch,greeting,drawer);

const personality={timers:[],bubbleTimer:null,stopped:false,closedPromptShown:false};

function clearPersonalityTimers(){personality.timers.forEach((id)=>clearTimeout(id));personality.timers=[];if(personality.bubbleTimer){clearTimeout(personality.bubbleTimer);personality.bubbleTimer=null;}}
function hideGreeting(){greeting.classList.remove('show');greeting.removeAttribute('data-tone');}
function animateLaunch(className,duration=900){launch.classList.remove(className);void launch.offsetWidth;launch.classList.add(className);window.setTimeout(()=>launch.classList.remove(className),duration);}
function personalityTimer(handler,delay){const id=window.setTimeout(()=>{personality.timers=personality.timers.filter((item)=>item!==id);if(personality.stopped||drawer.open||document.visibilityState==='hidden')return;handler();},delay);personality.timers.push(id);return id;}
function speak(text,duration=3800,tone=''){
  if(personality.stopped||drawer.open||document.visibilityState==='hidden')return;
  if(personality.bubbleTimer)clearTimeout(personality.bubbleTimer);
  greetingText.textContent=text;
  if(tone)greeting.dataset.tone=tone;else greeting.removeAttribute('data-tone');
  greeting.classList.add('show');
  animateLaunch('is-speaking',820);
  personality.bubbleTimer=window.setTimeout(()=>{hideGreeting();personality.bubbleTimer=null;},duration);
}
function stopPersonality(){personality.stopped=true;clearPersonalityTimers();hideGreeting();launch.classList.remove('manta-arrive','is-speaking','is-curious');}
function schedulePersonality(){
  if(new URLSearchParams(location.search).get('resumePlanner')==='1')return;
  personality.stopped=false;
  launch.classList.add('manta-arrive');
  window.setTimeout(()=>launch.classList.remove('manta-arrive'),1300);
  let lastSeen=0;
  try{lastSeen=Number(sessionStorage.getItem('baa_manta_intro_seen_at')||0);}catch{}
  const fresh=!lastSeen||Date.now()-lastSeen>30*60*1000;
  if(fresh){
    personalityTimer(()=>speak('Hi! 👋 I’m Manta.',2800,'hello'),1400);
    personalityTimer(()=>speak('I can help plan your Baa trip using real Visit Baa stays, activities and transfers.',3900),5200);
    personalityTimer(()=>speak('Tell me your island, dates and what you want to do — I’ll put the trip together.',4300),10800);
    personalityTimer(()=>animateLaunch('is-curious',2500),19000);
    personalityTimer(()=>{animateLaunch('is-curious',2500);speak('Ready when you are 🌊 Tap me to start planning.',4400,'ready');},27000);
    try{sessionStorage.setItem('baa_manta_intro_seen_at',String(Date.now()));}catch{}
  }else{
    personalityTimer(()=>speak('Need help planning your Baa trip? Tap me when you’re ready. 🌊',4200,'ready'),2800);
    personalityTimer(()=>animateLaunch('is-curious',2500),15000);
  }
}

function assistant(text){return el('div',{className:'manta-message assistant',children:[el('img',{attrs:{src:asset,alt:''}}),el('p',{text})]});}
function button(text,handler,style='primary'){const node=el('button',{className:`manta-action ${style}`,text,attrs:{type:'button'}});node.addEventListener('click',handler);return node;}
function setFooter(...nodes){footer.replaceChildren(...nodes);}
function showInline(text,type='warning'){let note=question.querySelector('.manta-inline');if(!note){note=el('p',{className:'manta-inline'});question.append(note);}note.className=`manta-inline ${type}`;note.textContent=text;}
function go(index){state.step=Math.max(0,Math.min(steps.length-1,index));render();}
function next(){go(state.step+1);}

function optionCards(options,selected,onSelect,{multiple=false}={}){
  const wrap=el('div',{className:'manta-choice-grid',attrs:{role:'group','aria-label':'Choose an option'}});
  options.forEach((option)=>{
    const active=multiple?selected.includes(option.value):selected===option.value;
    const card=el('button',{className:`manta-choice-card${active?' selected':''}`,attrs:{type:'button','aria-pressed':String(active)},children:[el('strong',{text:`${active?'✓ ':''}${option.label}`}),option.detail?el('small',{text:option.detail}):null]});
    card.addEventListener('click',()=>onSelect(option.value,!active));
    wrap.append(card);
  });
  return wrap;
}

function counter(label,key,min){
  const value=el('strong',{text:String(state.answers[key])});
  const change=(amount)=>{state.answers[key]=Math.max(min,state.answers[key]+amount);value.textContent=String(state.answers[key]);};
  return el('div',{className:'manta-counter',children:[el('span',{text:label}),el('div',{children:[button('−',()=>change(-1),'icon'),value,button('+',()=>change(1),'icon')]})]});
}

function quickChange(){
  const input=el('input',{className:'manta-quick-input',attrs:{type:'text',placeholder:'e.g. beachfront only, cheaper, better room','aria-label':'Tell Manta a quick change'}});
  const apply=()=>{const result=applyMantaOverride(input.value,state.answers);if(!result.applied)return showInline("I didn't recognise that change yet. Try “cheaper”, “fewer operators”, “beachfront only”, or “better room”.");input.value='';showInline(`Updated: ${result.changes.join(', ')}.`,'success');};
  input.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();apply();}});
  question.append(el('details',{className:'manta-quick-change',children:[el('summary',{text:'Tell Manta a quick change'}),el('p',{text:'You can change a preference in plain language at any step.'}),el('div',{children:[input,button('Apply',apply,'secondary')]})]}));
}

function renderIsland(){
  question.append(assistant('Which island would you like to stay on?'));
  if(!state.data.islands.length){question.append(el('p',{className:'manta-inline warning',text:'No islands currently have active published Visit Baa data.'}));return setFooter();}
  question.append(optionCards(state.data.islands.map((name)=>({value:name,label:name,detail:'Stay base'})),state.answers.islands[0]||'',(value)=>{state.answers.islands=[value];state.answers.nightsByIsland={};state.answers.activityPlan={};render();}));
  setFooter(button('Continue',()=>state.answers.islands.length?next():showInline('Choose one island to continue.')));
}

function renderDates(){
  question.append(assistant('When will you arrive and leave?'));
  const today=new Date().toISOString().slice(0,10);
  const start=el('input',{attrs:{type:'date',min:today,value:state.answers.startDate,'aria-label':'Arrival date'}});
  const end=el('input',{attrs:{type:'date',min:state.answers.startDate||today,value:state.answers.endDate,'aria-label':'Departure date'}});
  const nights=el('strong',{className:'manta-nights'});
  const update=()=>{state.answers.startDate=start.value;state.answers.endDate=end.value;end.min=start.value||today;const count=nightsBetween(start.value,end.value);nights.textContent=count?`${count} night${count===1?'':'s'}`:'';};
  start.addEventListener('change',update);end.addEventListener('change',update);
  const flexible=el('input',{attrs:{type:'checkbox'}});flexible.checked=state.answers.flexible;flexible.addEventListener('change',()=>{state.answers.flexible=flexible.checked;});
  question.append(el('div',{className:'manta-date-grid',children:[el('label',{text:'Arrival / check-in',children:[start]}),el('label',{text:'Departure / check-out',children:[end]})]}),nights,el('label',{className:'manta-check',children:[flexible,document.createTextNode(' My dates are flexible')]}));
  update();
  setFooter(button('Continue',()=>{const count=nightsBetween(state.answers.startDate,state.answers.endDate);if(!state.answers.startDate||!state.answers.endDate||state.answers.startDate<today||count<1)return showInline('Choose future dates with departure after arrival.');next();}));
}

function renderTravelers(){question.append(assistant('Who is travelling?'),counter('Adults','adults',1),counter('Children','children',0),counter('Rooms','rooms',1));setFooter(button('Continue',next));}

function renderStayPreference(){
  question.append(assistant('Where would you prefer to stay?'),el('p',{className:'manta-question-support',text:'This guides the ranking. It will not hide an otherwise good match unless you say “only”.'}));
  question.append(optionCards(STAY_PREFERENCES,state.answers.stayPreference,(value)=>{state.answers.stayPreference=value;state.answers.stayPreferenceRequired=false;render();}));
  setFooter(button('Continue',next));
}

function renderRoomPreference(){
  question.append(assistant('What kind of room would suit you?'),el('p',{className:'manta-question-support',text:'Manta checks real available room types and rates for your group.'}));
  question.append(optionCards(ROOM_PREFERENCES,state.answers.roomPreference,(value)=>{state.answers.roomPreference=value;state.answers.roomPreferenceRequired=false;render();}));
  setFooter(button('Continue',next));
}

function renderActivities(){
  question.append(assistant('What would you like to do?'),el('p',{className:'manta-question-support',text:'Choose any that interest you. Manta will plan one matching option for each.'}));
  const choices=state.module.activityChoices(state.data);
  if(choices.length)question.append(optionCards(choices,state.answers.activities,(value,add)=>{state.answers.activities=add?[...state.answers.activities,value]:state.answers.activities.filter((item)=>item!==value);render();},{multiple:true}));
  else question.append(el('p',{className:'manta-inline',text:'No activities are currently published. You can still find a stay.'}));
  setFooter(button('Find My Baa Trip',search));
}

function render(){
  question.replaceChildren();
  progressText.textContent=`Step ${state.step+1} of ${steps.length}`;
  progressBar.firstElementChild.style.width=`${(state.step+1)/steps.length*100}%`;
  back.disabled=state.step===0;
  ({island:renderIsland,dates:renderDates,travelers:renderTravelers,stayPreference:renderStayPreference,roomPreference:renderRoomPreference,activities:renderActivities}[steps[state.step]])();
  quickChange();
}

function search(){
  const island=state.answers.islands[0];
  const nights=nightsBetween(state.answers.startDate,state.answers.endDate);
  if(!island)return go(0);
  if(!nights)return go(1);
  state.answers.nightsByIsland={[island]:nights};
  state.answers.activityPlan=Object.fromEntries(state.answers.activities.map((slug)=>[slug,{island,unit:'times',quantity:1,days:1}]));
  sessionStorage.setItem('baa_manta_search',JSON.stringify({answers:state.answers,selections:{},createdAt:Date.now()}));
  location.href='trip-results.html';
}

async function load(){
  if(state.data)return;
  question.replaceChildren(assistant('Loading current published Visit Baa services…'));
  state.module=await import('./trip-planner-service.js');
  state.data=await state.module.loadPlannerData();
  if(new URLSearchParams(location.search).get('resumePlanner')==='1'){
    try{const saved=JSON.parse(localStorage.getItem('baa_planner_draft')||'null');if(saved?.answers)state.answers=normalizeSimpleAnswers({...defaults,...saved.answers});}catch{localStorage.removeItem('baa_planner_draft');}
  }
  render();
}

launch.addEventListener('click',async()=>{stopPersonality();drawer.showModal();launch.hidden=true;try{await load();}catch{question.replaceChildren(el('p',{className:'manta-inline warning',text:'Current Visit Baa services could not be loaded. Please try again.'}));setFooter();}});
close.addEventListener('click',()=>drawer.close());
drawer.addEventListener('close',()=>{launch.hidden=false;if(!personality.closedPromptShown){personality.closedPromptShown=true;personality.stopped=false;personalityTimer(()=>speak('I’ll be right here if you want to keep planning. 🌊',4200,'ready'),900);}});
back.addEventListener('click',()=>go(state.step-1));
restart.addEventListener('click',()=>{state.answers={...defaults,islands:[],activities:[],nightsByIsland:{},activityPlan:{}};go(0);});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')hideGreeting();});
if(new URLSearchParams(location.search).get('resumePlanner')==='1'&&localStorage.getItem('baa_planner_draft'))launch.click();else schedulePersonality();
