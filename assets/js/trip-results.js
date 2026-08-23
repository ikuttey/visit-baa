import { applyRecommendationMode, loadPlannerAvailability, loadPlannerData, plannerDraftPayload, recalculateJourney, searchTripJourney } from './trip-planner-service.js';
import { applyMantaOverride, normalizeSimpleAnswers } from './manta-preferences.js';
import { requireSupabase } from './supabase-client.js';
import { signedPublicImageUrl } from './storage.js';

const SEARCH_KEY='baa_manta_search';
const DRAFT_KEY='baa_planner_draft';
const status=document.getElementById('tripResultsStatus');
const results=document.getElementById('mantaSearchResults');
const state={answers:null,journey:null,data:null,availability:null,showWhy:false,showAlternatives:false,openSegment:null};
const el=(tag,{className='',text='',attrs={},children=[]}={})=>{const node=document.createElement(tag);if(className)node.className=className;if(text!=='')node.textContent=text;Object.entries(attrs).forEach(([key,value])=>{if(value!==null&&value!==undefined)node.setAttribute(key,String(value));});children.filter(Boolean).forEach((child)=>node.append(child));return node;};

function button(text,handler,style='primary'){const node=el('button',{className:`manta-action ${style}`,text,attrs:{type:'button'}});node.addEventListener('click',handler);return node;}
function money(amount,currency){try{return new Intl.NumberFormat('en',{style:'currency',currency}).format(amount);}catch{return `${currency} ${Number(amount).toFixed(2)}`;}}
function candidateKey(candidate){return(candidate.items||[]).map((item)=>[item.listingId,item.roomId,item.ratePlanId].filter(Boolean).join(':')).join('|');}

function searchState(){
  for(const storage of [sessionStorage,localStorage]){
    try{const key=storage===sessionStorage?SEARCH_KEY:DRAFT_KEY;const saved=JSON.parse(storage.getItem(key)||'null');if(saved?.answers)return saved;}catch{}
  }
  return null;
}

function selections(){return Object.fromEntries(state.journey.segments.filter((segment)=>segment.selected!=null).map((segment)=>[segment.id,candidateKey(segment.candidates[segment.selected])]));}
function persistSearch(){sessionStorage.setItem(SEARCH_KEY,JSON.stringify({answers:state.answers,selections:selections(),createdAt:Date.now()}));}
async function setImage(image,path){if(!path)return;try{const url=await signedPublicImageUrl('listing-covers',path);if(url){image.src=url;image.classList.remove('fallback');}}catch{}}

function priceText(candidate,item){
  if(Number.isFinite(candidate.price))return money(candidate.price,candidate.currency);
  const published=Number(item?.publishedPrice);
  if(Number.isFinite(published)&&item?.priceUnit!=='price_on_request')return `${money(published,candidate.currency)} published reference`;
  return 'Price confirmation required';
}

function chooseCandidate(segment,index){
  const item=segment.candidates[index]?.items?.[0];
  if(item?.listingKind==='excursion_package'){
    const overlaps=state.journey.selectedItems.filter((selected)=>selected.itemKind==='activity'&&selected.date===item.date&&(item.matchedActivitySlugs||[]).includes(selected.activityTypeSlug));
    if(overlaps.length&&!window.confirm('This package may duplicate a selected activity. Choose OK to keep both, or Cancel to remove the duplicated individual service.')){
      const ids=new Set(overlaps.map((entry)=>`${entry.listingId}:${entry.date||''}`));
      state.journey.segments.forEach((entry)=>{const chosen=entry.selected==null?[]:entry.candidates[entry.selected]?.items||[];if(chosen.some((selected)=>ids.has(`${selected.listingId}:${selected.date||''}`)))entry.selected=null;});
    }
  }
  segment.selected=index;state.openSegment=null;refresh();
}

function candidateCard(segment,candidate,index){
  const selected=segment.selected===index;
  const item=candidate.items[0]||{};
  const image=el('img',{className:'manta-result-image fallback',attrs:{src:'assets/images/manta-planner.png',alt:item.title||segment.title,loading:'lazy'}});setImage(image,item.imagePath);
  const context=[item.roomName,item.ratePlanName,item.mealPlan,item.island,item.date,item.endDate?`to ${item.endDate}`:'',item.time,item.availability].filter(Boolean).join(' · ');
  return el('article',{className:`manta-result-card${selected?' selected':''}${item.availabilityMode==='request'?' request':''}`,children:[image,el('div',{className:'manta-result-copy',children:[
    el('small',{text:`${item.verified?'✓ Verified · ':''}${item.businessName||'Provider unavailable'}`}),
    el('strong',{text:item.title||segment.title}),
    context?el('span',{text:context}):null,
    el('b',{text:priceText(candidate,item)}),
    el('div',{className:'manta-result-actions',children:[el('a',{text:'View listing',attrs:{href:`listing.html?id=${encodeURIComponent(item.listingId||'')}`}}),selected?button(state.openSegment===segment.id?'Hide choices':'Change this',()=>{state.openSegment=state.openSegment===segment.id?null:segment.id;render();},'secondary'):button('Use this instead',()=>chooseCandidate(segment,index))]})
  ]})]});
}

function gapCard(segment){return el('article',{className:'manta-gap-card',children:[el('strong',{text:segment.gapStatus||'No published match'}),el('p',{text:segment.gapMessage||'No published Visit Baa listing currently matches this part of your trip.'}),button('Edit trip details',editSearch,'secondary')]});}

function alternativesFor(segment){
  const alternatives=segment.candidates.map((candidate,index)=>({candidate,index})).filter(({index})=>index!==segment.selected);
  if(!alternatives.length)return el('p',{className:'manta-result-help',text:'No other published options currently match this part of the trip.'});
  return el('div',{className:'manta-page-option-grid',children:alternatives.map(({candidate,index})=>candidateCard(segment,candidate,index))});
}

function selectedGroup(segment){
  const section=el('section',{className:`manta-result-segment manta-selected-segment ${segment.kind}`,children:[el('h3',{text:segment.title})]});
  if(segment.selected!=null&&segment.candidates[segment.selected])section.append(candidateCard(segment,segment.candidates[segment.selected],segment.selected));else section.append(gapCard(segment));
  if(state.openSegment===segment.id)section.append(el('div',{className:'manta-inline-alternatives',children:[el('h4',{text:'Change only this item'}),alternativesFor(segment)]}));
  return section;
}

function explanationCard(segment){
  const explanation=segment.explanation;if(!explanation)return null;
  return el('article',{className:'manta-explanation-card',children:[el('h3',{text:segment.title}),el('p',{text:explanation.reason}),explanation.alternatives?.length?el('details',{children:[el('summary',{text:'View comparison'}),el('div',{className:'manta-explanation-alternatives',children:explanation.alternatives.map((alternative)=>el('p',{children:[el('strong',{text:alternative.name}),document.createTextNode(` · ${alternative.total==null?'Price pending':money(alternative.total,alternative.currency)}. ${alternative.reason}`)]}))})]}):null]});
}

function priceDetails(){
  const selected=state.journey.selectedItems||[];const pending=selected.filter((item)=>!Number.isFinite(item.price));
  const content=el('div',{className:'manta-totals trip-results-price-summary',children:[el('strong',{text:'Complete required pricing'})]});
  content.append(el('span',{text:`Selected services: ${selected.length}`}));
  state.journey.totals.forEach((amount,currency)=>content.append(el('span',{text:`Known ${currency} subtotal: ${money(amount,currency)}`})));
  if(!state.journey.totals.size)content.append(el('span',{text:'No selected service currently has a calculable total.'}));
  if(pending.length)content.append(el('span',{text:`${pending.length} selected price${pending.length===1?' is':'s are'} pending and not counted as free.`}));
  if(state.journey.missingPriceItems)content.append(el('span',{text:`Missing required services: ${state.journey.missingPriceItems}.`}));
  if(state.journey.confirmationRequired)content.append(el('span',{text:`Operator availability confirmation is required for ${state.journey.confirmationRequired} service${state.journey.confirmationRequired===1?'':'s'}.`}));
  content.append(el('span',{text:'Only published transport routes and explicitly included package pickup are counted.'}));
  return el('details',{className:'trip-price-details',children:[el('summary',{text:'Price details'}),content]});
}

function summaryChips(){
  const nights=Object.values(state.answers.nightsByIsland||{}).reduce((sum,value)=>sum+Number(value||0),0);
  const stay=state.answers.stayPreference==='none'?'Any stay location':state.answers.stayPreference.replaceAll('_',' ');
  const room=state.answers.roomPreference==='none'?'Any room':`${state.answers.roomPreference} room`;
  return el('div',{className:'trip-results-summary',children:[el('span',{text:state.answers.islands[0]}),el('span',{text:`${state.answers.startDate} to ${state.answers.endDate} · ${nights} nights`}),el('span',{text:`${state.answers.adults} adult${state.answers.adults===1?'':'s'} · ${state.answers.children} child${state.answers.children===1?'':'ren'} · ${state.answers.rooms} room${state.answers.rooms===1?'':'s'}`}),el('span',{text:stay}),el('span',{text:room})]});
}

function editSearch(){localStorage.setItem(DRAFT_KEY,JSON.stringify({answers:state.answers,selections:selections(),requirements:plannerDraftPayload(state.answers,state.journey).requirements}));location.href='index (1).html?resumePlanner=1';}
function feedback(text,type='success'){const host=results.querySelector('.manta-page-feedback');if(!host)return;host.replaceChildren(el('p',{className:`manta-inline ${type}`,text}));host.scrollIntoView({behavior:'smooth',block:'nearest'});}

async function saveDraft(){
  const payload=plannerDraftPayload(state.answers,state.journey);let signedIn=false;
  try{
    const client=requireSupabase();const auth=await client.auth.getUser();if(auth.error)throw auth.error;if(!auth.data.user)throw new Error('SIGN_IN_REQUIRED');signedIn=true;
    let found=await client.from('trips').select('id').eq('user_id',auth.data.user.id).eq('status','draft').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(found.error)throw found.error;let trip=found.data;
    if(!trip){const id=crypto.randomUUID();const created=await client.from('trips').insert({id,user_id:auth.data.user.id,...payload.trip});if(created.error)throw created.error;const fetched=await client.from('trips').select('id').eq('id',id).eq('user_id',auth.data.user.id).maybeSingle();if(fetched.error||!fetched.data)throw fetched.error||new Error('Draft ownership validation failed');trip=fetched.data;}
    else{const updated=await client.from('trips').update(payload.trip).eq('id',trip.id).eq('user_id',auth.data.user.id);if(updated.error)throw updated.error;const removedItems=await client.from('trip_items').delete().eq('trip_id',trip.id).eq('booking_status','not_requested');if(removedItems.error)throw removedItems.error;const removedRequirements=await client.from('trip_requirements').delete().eq('trip_id',trip.id);if(removedRequirements.error&&!['PGRST205','42P01'].includes(removedRequirements.error.code))throw removedRequirements.error;}
    if(payload.items.length){const inserted=await client.from('trip_items').insert(payload.items.map((item)=>({...item,trip_id:trip.id})));if(inserted.error)throw inserted.error;}
    if(payload.requirements.length){const inserted=await client.from('trip_requirements').insert(payload.requirements.map((item)=>({...item,trip_id:trip.id})));if(inserted.error&&!['PGRST205','42P01'].includes(inserted.error.code))throw inserted.error;}
    localStorage.removeItem(DRAFT_KEY);feedback('Added to My Baa Trip as a draft. Nothing is reserved until operators confirm your requests.');
  }catch{
    localStorage.setItem(DRAFT_KEY,JSON.stringify({answers:state.answers,selections:selections(),requirements:payload.requirements}));
    if(signedIn)return feedback('Your trip remains saved on this device. Online saving is temporarily unavailable.','warning');
    localStorage.setItem('baa_after_auth_path','trip-results.html');const host=results.querySelector('.manta-page-feedback');host.replaceChildren(el('div',{className:'manta-auth-prompt',children:[el('strong',{text:'Your trip is preserved on this device.'}),el('p',{text:'Sign in or create a traveler account to add it to My Baa Trip. Nothing has been reserved.'}),el('a',{text:'Sign in',attrs:{href:'login.html?next=trip-results.html'}}),el('a',{text:'Create account',attrs:{href:'traveler-register.html'}})]}));
  }
}

function refine(mode,label){state.answers.recommendationMode=mode;state.journey.recommendationMode=mode;applyRecommendationMode(state.journey.segments,mode);state.openSegment=null;refresh();feedback(`Updated: ${label}.`);}
function quickOverride(){
  const input=el('input',{attrs:{type:'text',placeholder:'Try “beachfront only”, “cheaper”, or “better room”','aria-label':'Tell Manta a change'}});
  const apply=()=>{const parsed=applyMantaOverride(input.value,state.answers);if(!parsed.applied)return feedback("Try “cheaper”, “fewer operators”, “beachfront only”, “don’t care about the room”, or “better room”.",'warning');rerun().then(()=>feedback(`Updated: ${parsed.changes.join(', ')}.`)).catch(()=>feedback('That change could not be applied to current availability.','warning'));};
  input.addEventListener('keydown',(event)=>{if(event.key==='Enter'){event.preventDefault();apply();}});
  return el('div',{className:'trip-results-quick-change',children:[el('strong',{text:'Change the trip in your own words'}),el('div',{children:[input,button('Apply',apply,'secondary')]})]});
}

function render(){
  const selectedList=el('div',{className:'manta-page-selected-list'});state.journey.segments.filter((segment)=>segment.kind!=='package'||segment.selected!=null).forEach((segment)=>selectedList.append(selectedGroup(segment)));
  const why=state.showWhy?el('section',{className:'manta-page-explanations',children:[el('h2',{text:'Why these options?'}),el('h3',{text:'Providers matching several parts of your trip'}),el('p',{text:state.journey.providerExplanation}),...state.journey.segments.map(explanationCard).filter(Boolean)]}):null;
  const alternatives=state.showAlternatives?el('section',{className:'manta-page-alternatives',children:[el('h2',{text:'Matching alternatives'}),...state.journey.segments.map((segment)=>el('section',{className:'manta-result-segment',children:[el('h3',{text:segment.title}),alternativesFor(segment)]}))]}):null;
  const actions=el('div',{className:'manta-page-actions manta-simple-actions',children:[button('Add This Trip',saveDraft),button(state.showWhy?'Hide Explanations':'Why These Options?',()=>{state.showWhy=!state.showWhy;render();},'secondary'),button(state.showAlternatives?'Hide Alternatives':'See Alternatives',()=>{state.showAlternatives=!state.showAlternatives;render();},'secondary')]});
  const refinements=el('div',{className:'manta-refinement-actions',children:[button('Best value',()=>refine('best_value','best value'),'secondary'),button('Make it cheaper',()=>refine('lowest_total','lower price'),'secondary'),button('Use fewer operators',()=>refine('fewer_providers','fewer operators'),'secondary')]});
  results.replaceChildren(el('div',{className:'page-wrap wrap manta-page-results-inner',children:[
    el('header',{className:'manta-page-results-head',children:[el('div',{children:[el('span',{className:'manta-page-eyebrow',text:'Your Manta trip'}),el('h2',{text:'A simple trip that fits your choices',attrs:{id:'mantaResultsTitle'}}),el('p',{text:'Available stays and activities are selected independently. You can change any one item without rebuilding the rest.'}),summaryChips()]}),button('Edit trip details',editSearch,'secondary')]}),
    !state.journey.complete?el('div',{className:'manta-incomplete',children:[el('strong',{text:'Some parts still need an operator match.'}),el('p',{text:'Missing services and pending prices are shown honestly and never counted as free.'})]}):null,
    el('section',{className:'manta-page-selected',children:[el('h2',{text:'Your selected trip'}),selectedList,priceDetails(),actions,refinements,quickOverride()]}),why,alternatives,el('div',{className:'manta-page-feedback',attrs:{role:'status','aria-live':'polite'}})
  ]}));results.hidden=false;status.hidden=true;
}

function refresh(){recalculateJourney(state.journey);persistSearch();render();}
async function rerun(){state.journey=searchTripJourney(state.data,state.answers,state.availability);refresh();}
function showError(message){status.className='page-wrap trip-results-status error';status.replaceChildren(el('div',{children:[el('strong',{text:'Manta could not show this trip.'}),el('span',{text:message}),el('a',{text:'Open the trip planner',attrs:{href:'index (1).html'}})]}));}

async function load(){
  const saved=searchState();if(!saved)return showError('Start a new search so Manta knows your island, dates, travelers, stay, and activities.');
  state.answers=normalizeSimpleAnswers(saved.answers);
  try{
    state.data=await loadPlannerData();state.availability=await loadPlannerAvailability(state.answers.startDate,state.answers.endDate);state.journey=searchTripJourney(state.data,state.answers,state.availability);
    Object.entries(saved.selections||{}).forEach(([segmentId,key])=>{const segment=state.journey.segments.find((item)=>item.id===segmentId);if(!segment)return;let match=segment.candidates.findIndex((candidate)=>candidateKey(candidate)===key);if(match<0)match=segment.candidates.findIndex((candidate)=>candidate.items.map((item)=>item.listingId).join('|')===key);if(match>=0)segment.selected=match;});
    refresh();
  }catch{showError('Current published availability could not be loaded. Please return to the planner and try again.');}
}

load();
