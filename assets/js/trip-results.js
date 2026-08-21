import { loadPlannerAvailability, loadPlannerData, plannerDraftPayload, recalculateJourney, searchTripJourney } from './trip-planner-service.js';
import { requireSupabase } from './supabase-client.js';
import { signedPublicImageUrl } from './storage.js';

const SEARCH_KEY='baa_manta_search';
const DRAFT_KEY='baa_planner_draft';
const status=document.getElementById('tripResultsStatus');
const results=document.getElementById('mantaSearchResults');
const state={answers:null,journey:null};
const el=(tag,{className='',text='',attrs={},children=[]}={})=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=='')node.textContent=text;Object.entries(attrs).forEach(([key,value])=>{if(value!==null&&value!==undefined)node.setAttribute(key,String(value));});children.filter(Boolean).forEach((child)=>node.append(child));return node;};

function button(text,handler,style='primary'){
  const node=el('button',{className:`manta-action ${style}`,text,attrs:{type:'button'}});
  node.addEventListener('click',handler);
  return node;
}

function money(amount,currency){
  try{return new Intl.NumberFormat('en',{style:'currency',currency}).format(amount);}catch{return `${currency} ${Number(amount).toFixed(2)}`;}
}

function searchState(){
  for(const storage of [sessionStorage,localStorage]){
    try{
      const key=storage===sessionStorage?SEARCH_KEY:DRAFT_KEY;
      const saved=JSON.parse(storage.getItem(key)||'null');
      if(saved?.answers)return saved;
    }catch{}
  }
  return null;
}

function selections(){
  return Object.fromEntries(state.journey.segments.filter((segment)=>segment.selected!=null).map((segment)=>[segment.id,segment.candidates[segment.selected].items.map((item)=>item.listingId).join('|')]));
}

function persistSearch(){
  sessionStorage.setItem(SEARCH_KEY,JSON.stringify({answers:state.answers,selections:selections(),createdAt:Date.now()}));
}

async function setImage(image,path){
  if(!path)return;
  try{const url=await signedPublicImageUrl('listing-covers',path);if(url){image.src=url;image.classList.remove('fallback');}}catch{}
}

function priceText(candidate,item){
  if(Number.isFinite(candidate.price))return `Estimated trip cost: ${money(candidate.price,candidate.currency)}`;
  const published=Number(item?.publishedPrice);
  if(Number.isFinite(published)&&item?.priceUnit!=='price_on_request')return `Published reference: ${money(published,candidate.currency)} ${String(item?.priceUnit||'published unit').replaceAll('_',' ')} · excluded from subtotal until the rate basis is confirmed`;
  return 'Price confirmation required · not counted as zero';
}

function candidateCard(segment,candidate,index){
  const selected=segment.selected===index;
  const recommended=segment.recommended===index&&Number.isFinite(candidate.price);
  const item=candidate.items[0]||{};
  const request=item.availabilityMode==='request';
  const image=el('img',{className:'manta-result-image fallback',attrs:{src:'assets/images/manta-planner.png',alt:item.title||segment.title,loading:'lazy'}});
  setImage(image,item.imagePath);
  const operator=item.businessName||'Visit Baa operator';
  const payment=request?'No payment until the operator confirms availability and price':item.depositPercentage===100?'Full prepayment to the operator':item.depositPercentage?`${item.depositPercentage}% deposit paid to the operator`:'Pay the operator later / no deposit required';
  const context=[item.island,item.date,item.endDate?`until ${item.endDate}`:'',item.time,item.availability,item.meetingPoint?`Meeting point: ${item.meetingPoint}`:'',item.priceUnit?`Priced ${String(item.priceUnit).replaceAll('_',' ')}`:''].filter(Boolean).join(' · ');
  const description=item.summary||item.description||'Published Visit Baa service matching this part of your trip.';
  const detailItems=[...(item.includedItems||[]),...(item.amenities||[])].filter(Boolean).slice(0,6);
  const copy=el('div',{className:'manta-result-copy',children:[
    recommended?el('span',{className:'manta-budget-pick',text:"Manta's budget-friendly pick · lowest known suitable total"}):null,
    el('small',{text:`${item.verified?'✓ Verified · ':''}${operator}`}),
    el('strong',{text:item.title||segment.title}),
    el('span',{text:candidate.detail||segment.title}),
    el('span',{className:'manta-result-description',text:description}),
    context?el('span',{text:context}):null,
    detailItems.length?el('ul',{className:'manta-result-detail-list',children:detailItems.map((detail)=>el('li',{text:detail}))}):null,
    item.priceMath?el('span',{className:'manta-price-math',text:item.priceMath}):null,
    item.priceNote?el('span',{className:'manta-price-note',text:item.priceNote}):null,
    el('span',{text:payment}),
    el('b',{text:priceText(candidate,item)}),
    el('div',{className:'manta-result-actions',children:[
      el('a',{text:'View full listing',attrs:{href:`listing.html?id=${encodeURIComponent(item.listingId||'')}`}}),
      button(selected?'Selected':recommended?'Choose budget pick':'Choose this option',()=>{segment.selected=index;refresh();},selected?'secondary':'primary')
    ]})
  ]});
  return el('article',{className:`manta-result-card${selected?' selected':''}${request?' request':''}`,children:[image,copy]});
}

function gapCard(segment){
  return el('article',{className:'manta-gap-card',children:[
    el('strong',{text:segment.gapStatus||'No published match'}),
    el('p',{text:segment.gapMessage||'No published Visit Baa listing currently matches this part of your trip.'}),
    button('Edit trip search',editSearch,'secondary')
  ]});
}

function selectedGroup(segment){
  const section=el('section',{className:`manta-result-segment manta-selected-segment ${segment.kind}`,children:[el('h3',{text:segment.title})]});
  if(segment.selected!=null&&segment.candidates[segment.selected])section.append(candidateCard(segment,segment.candidates[segment.selected],segment.selected),button('Remove selected service',()=>{segment.selected=null;refresh();},'text'));
  else if(segment.candidates.length)section.append(el('p',{className:'manta-result-help',text:'Nothing is selected for this part of the trip. Choose an option from the list below.'}));
  else section.append(gapCard(segment));
  return section;
}

function alternativeGroup(segment){
  const alternatives=segment.candidates.map((candidate,index)=>({candidate,index})).filter(({index})=>index!==segment.selected);
  if(!alternatives.length)return null;
  const grid=el('div',{className:'manta-page-option-grid'});
  alternatives.forEach(({candidate,index})=>grid.append(candidateCard(segment,candidate,index)));
  return el('section',{className:`manta-result-segment manta-alternative-segment ${segment.kind}`,children:[
    el('h3',{text:segment.title}),
    segment.kind==='accommodation'?el('p',{className:'manta-result-help',text:'All other matching guesthouses are shown here. Choosing one updates your selected trip and totals immediately.'}):null,
    grid
  ]});
}

function totals(){
  const total=el('div',{className:'manta-totals trip-results-price-summary',children:[el('strong',{text:'Selected trip pricing'})]});
  const selected=state.journey.selectedItems||[];
  const pending=selected.filter((item)=>!Number.isFinite(item.price));
  const priced=selected.length-pending.length;
  total.append(el('span',{text:`Selected services: ${selected.length}`}),el('span',{text:`Included in known subtotal: ${priced}`}));
  state.journey.totals.forEach((amount,currency)=>total.append(el('span',{text:`Known ${currency} subtotal: ${money(amount,currency)}`})));
  if(!state.journey.totals.size)total.append(el('span',{text:'No selected item currently has a confirmed calculable total.'}));
  if(pending.length)total.append(el('div',{className:'trip-results-pending-prices',children:[
    el('strong',{text:`Price not included for ${pending.length} selected service${pending.length===1?'':'s'}:`}),
    ...pending.map((item)=>{const published=Number(item.publishedPrice);const reference=Number.isFinite(published)?`${money(published,item.currency)} ${String(item.priceUnit||'published unit').replaceAll('_',' ')}`:'price on request';const reason=item.category==='accommodation'&&item.priceUnitConfirmed===false?'The stay operator must choose whether this is per room per night, per person per night, per property per night, or a fixed stay total.':'The operator must confirm the price basis.';return el('span',{text:`${item.title} — published reference ${reference}. ${reason}`});})
  ]}));
  if(state.journey.missingPriceItems)total.append(el('span',{text:`Missing services: ${state.journey.missingPriceItems}`}));
  if(pending.length||state.journey.missingPriceItems)total.append(el('span',{text:'Complete estimated total pending. Unconfirmed prices are never treated as free.'}));
  if(state.journey.confirmationRequired)total.append(el('span',{text:`Availability confirmation required for ${state.journey.confirmationRequired} selected service${state.journey.confirmationRequired===1?'':'s'}.`}));
  const usd=state.journey.totals.get('USD');
  if(state.answers.budget&&Number.isFinite(usd)&&!(state.journey.pendingPriceItems||state.journey.missingPriceItems))total.append(el('span',{text:usd<=state.answers.budget?`Within your USD ${state.answers.budget} budget.`:`${money(usd-state.answers.budget,'USD')} above your selected budget.`}));
  return total;
}

function summaryChips(){
  const nights=Object.values(state.answers.nightsByIsland||{}).reduce((sum,value)=>sum+Number(value||0),0);
  return el('div',{className:'trip-results-summary',children:[
    el('span',{text:state.answers.islands.join(' · ')}),
    el('span',{text:`${state.answers.startDate} to ${state.answers.endDate}${nights?` · ${nights} nights`:''}`}),
    el('span',{text:`${state.answers.adults} adult${state.answers.adults===1?'':'s'} · ${state.answers.children} child${state.answers.children===1?'':'ren'} · ${state.answers.rooms} room${state.answers.rooms===1?'':'s'}`}),
    state.answers.budget?el('span',{text:`Budget: USD ${state.answers.budget}`}):el('span',{text:'No fixed budget'})
  ]});
}

function editSearch(){
  localStorage.setItem(DRAFT_KEY,JSON.stringify({answers:state.answers,selections:selections(),requirements:plannerDraftPayload(state.answers,state.journey).requirements}));
  location.href='index (1).html?resumePlanner=1';
}

function feedback(text,type='success'){
  const host=results.querySelector('.manta-page-feedback');
  if(!host)return;
  host.replaceChildren(el('p',{className:`manta-inline ${type}`,text}));
  host.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function saveDraft(){
  const payload=plannerDraftPayload(state.answers,state.journey);
  let signedIn=false;
  try{
    const client=requireSupabase();
    const auth=await client.auth.getUser();
    if(auth.error)throw auth.error;
    if(!auth.data.user)throw new Error('SIGN_IN_REQUIRED');
    signedIn=true;
    let found=await client.from('trips').select('id').eq('user_id',auth.data.user.id).eq('status','draft').order('updated_at',{ascending:false}).limit(1).maybeSingle();
    if(found.error)throw found.error;
    let trip=found.data;
    if(!trip){
      const id=crypto.randomUUID();
      const created=await client.from('trips').insert({id,user_id:auth.data.user.id,...payload.trip});
      if(created.error)throw created.error;
      const fetched=await client.from('trips').select('id').eq('id',id).eq('user_id',auth.data.user.id).maybeSingle();
      if(fetched.error||!fetched.data)throw fetched.error||new Error('Draft ownership validation failed');
      trip=fetched.data;
    }else{
      const updated=await client.from('trips').update(payload.trip).eq('id',trip.id).eq('user_id',auth.data.user.id);
      if(updated.error)throw updated.error;
      const removedItems=await client.from('trip_items').delete().eq('trip_id',trip.id).eq('booking_status','not_requested');
      if(removedItems.error)throw removedItems.error;
      const removedRequirements=await client.from('trip_requirements').delete().eq('trip_id',trip.id);
      if(removedRequirements.error&&!['PGRST205','42P01'].includes(removedRequirements.error.code))throw removedRequirements.error;
    }
    if(payload.items.length){const inserted=await client.from('trip_items').insert(payload.items.map((item)=>({...item,trip_id:trip.id})));if(inserted.error)throw inserted.error;}
    if(payload.requirements.length){const inserted=await client.from('trip_requirements').insert(payload.requirements.map((item)=>({...item,trip_id:trip.id})));if(inserted.error&&!['PGRST205','42P01'].includes(inserted.error.code))throw inserted.error;}
    localStorage.removeItem(DRAFT_KEY);
    feedback('Your selected trip is saved as a draft. Nothing is reserved until the operators confirm your booking requests.');
  }catch{
    localStorage.setItem(DRAFT_KEY,JSON.stringify({answers:state.answers,selections:selections(),requirements:payload.requirements}));
    if(signedIn)return feedback('Your selections remain saved on this device. Online saving is temporarily unavailable.','warning');
    localStorage.setItem('baa_after_auth_path','trip-results.html');
    const host=results.querySelector('.manta-page-feedback');
    host.replaceChildren(el('div',{className:'manta-auth-prompt',children:[
      el('strong',{text:'Your selected trip is preserved on this device.'}),
      el('p',{text:'Sign in or create a traveler account to add it to My Baa Trip. Nothing has been reserved yet.'}),
      el('a',{text:'Sign in',attrs:{href:'login.html?next=trip-results.html'}}),
      el('a',{text:'Create account',attrs:{href:'traveler-register.html'}})
    ]}));
    host.scrollIntoView({behavior:'smooth',block:'nearest'});
  }
}

function render(){
  const selectedList=el('div',{className:'manta-page-selected-list'});
  state.journey.segments.forEach((segment)=>selectedList.append(selectedGroup(segment)));
  const otherList=el('div',{className:'manta-page-alternatives-list'});
  state.journey.segments.forEach((segment)=>{const group=alternativeGroup(segment);if(group)otherList.append(group);});
  if(!otherList.children.length)otherList.append(el('p',{className:'manta-page-empty',text:'No additional published alternatives currently match this trip.'}));
  const actions=el('div',{className:'manta-page-actions',children:[button('Edit trip details',editSearch,'secondary'),button('Add selected services to My Baa Trip',saveDraft)]});
  const incomplete=!state.journey.complete?el('div',{className:'manta-incomplete',children:[el('strong',{text:'Some parts of this itinerary still need an operator match.'}),el('p',{text:'Missing services and pending prices are shown honestly and are not counted as free.'})]}):null;
  results.replaceChildren(el('div',{className:'page-wrap wrap manta-page-results-inner',children:[
    el('header',{className:'manta-page-results-head',children:[el('div',{children:[el('span',{className:'manta-page-eyebrow',text:'Detailed search results'}),el('h2',{text:'Your budget-friendly trip selection',attrs:{id:'mantaResultsTitle'}}),el('p',{text:'The lowest known suitable option is preselected wherever a calculable published price is available.'}),summaryChips()]}),actions]}),
    el('p',{className:'manta-transport-note',text:'Transportation is arranged directly by your selected guesthouse and is not included in these planner totals.'}),
    incomplete,
    el('section',{className:'manta-page-selected',attrs:{'aria-labelledby':'mantaSelectedTitle'},children:[el('div',{className:'manta-page-section-head',children:[el('span',{text:'1'}),el('div',{children:[el('h2',{text:'Manta’s selected stays and activities',attrs:{id:'mantaSelectedTitle'}}),el('p',{text:'Budget-friendly published options are selected first. Change any service and the totals update immediately.'})]})]}),selectedList,totals()]}),
    el('section',{className:'manta-page-alternatives',attrs:{'aria-labelledby':'mantaAlternativesTitle'},children:[el('div',{className:'manta-page-section-head',children:[el('span',{text:'2'}),el('div',{children:[el('h2',{text:'All other matching options',attrs:{id:'mantaAlternativesTitle'}}),el('p',{text:'Review detailed alternatives for each island, stay, and activity.'})]})]}),otherList]}),
    el('div',{className:'manta-page-feedback',attrs:{role:'status','aria-live':'polite'}})
  ]}));
  results.hidden=false;
  status.hidden=true;
}

function refresh(){
  const scrollPosition=window.scrollY;
  recalculateJourney(state.journey);
  persistSearch();
  render();
  requestAnimationFrame(()=>window.scrollTo(0,scrollPosition));
}

function showError(message){
  status.className='page-wrap trip-results-status error';
  status.replaceChildren(el('div',{children:[el('strong',{text:'Manta could not show this trip.'}),el('span',{text:message}),el('a',{text:'Open the trip planner',attrs:{href:'index (1).html'}})]}));
}

async function load(){
  const saved=searchState();
  if(!saved)return showError('Start a new search so Manta knows your islands, dates, travelers, stays, and activities.');
  state.answers=saved.answers;
  try{
    const data=await loadPlannerData();
    const availability=await loadPlannerAvailability(state.answers.startDate,state.answers.endDate);
    state.journey=searchTripJourney(data,state.answers,availability);
    Object.entries(saved.selections||{}).forEach(([segmentId,listingIds])=>{
      const segment=state.journey.segments.find((item)=>item.id===segmentId);
      if(!segment)return;
      const match=segment.candidates.findIndex((candidate)=>candidate.items.map((item)=>item.listingId).join('|')===listingIds);
      if(match>=0)segment.selected=match;
    });
    recalculateJourney(state.journey);
    persistSearch();
    render();
  }catch(error){
    showError('Current published availability could not be loaded. Please return to the planner and try again.');
  }
}

load();
