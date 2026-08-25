// Keeps the V2 listing editor aligned with canonical database values while
// older saved listings are still being upgraded. This is value compatibility,
// not a second listing form or save workflow.

function replaceOptions(id,options,fallback=''){
  const select=document.getElementById(id);if(!select)return;
  const current=select.value;
  select.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
  const aliases={flexible:'free_cancellation',partial_penalty:'deadline',custom:'deadline',pay_direct:'pay_at_property',pay_on_arrival:'pay_at_property',required_extra:'extra_charge',optional_extra:'extra_charge'};
  const wanted=aliases[current]||current||fallback;select.value=[...select.options].some((option)=>option.value===wanted)?wanted:fallback;
}
replaceOptions('policyCancellationType',[['legacy','Use listing cancellation text'],['free_cancellation','Free cancellation'],['deadline','Cancellation deadline / penalty'],['non_refundable','Non-refundable']],'legacy');
replaceOptions('policyPaymentCondition',[['pay_at_property','Pay operator directly / on arrival'],['deposit_required','Deposit required'],['prepayment_required','Full prepayment required']],'pay_at_property');
replaceOptions('pickupMode',[['not_available','Not available'],['included','Included'],['extra_charge','Extra charge']],'not_available');

function normalizeBeforeSave(){
  const payment=document.getElementById('policyPaymentCondition');if(payment&&!['pay_at_property','deposit_required','prepayment_required'].includes(payment.value))payment.value='pay_at_property';
  const cancellation=document.getElementById('policyCancellationType');const cancellationMap={flexible:'free_cancellation',partial_penalty:'deadline',custom:'deadline'};if(cancellationMap[cancellation?.value])cancellation.value=cancellationMap[cancellation.value];if(cancellation&&!['legacy','free_cancellation','deadline','non_refundable'].includes(cancellation.value))cancellation.value='legacy';
  const pickup=document.getElementById('pickupMode');if(['required_extra','optional_extra'].includes(pickup?.value))pickup.value='extra_charge';if(pickup&&!['not_available','included','extra_charge'].includes(pickup.value))pickup.value='not_available';
  canonicalTransferFields();
}
document.addEventListener('submit',normalizeBeforeSave,true);['saveListing','submitListing'].forEach((id)=>document.getElementById(id)?.addEventListener('click',normalizeBeforeSave,{capture:true}));

function canonicalTransferFields(){
  const service=document.getElementById('routeServiceType');
  if(service&&!service.dataset.canonicalV2){const current=service.value;service.replaceChildren(new Option('Shared','shared'),new Option('Private','private'));service.value=['shared','private'].includes(current)?current:'shared';service.dataset.canonicalV2='1';}
  const pricing=document.getElementById('routePricingModel');
  if(pricing&&!pricing.dataset.canonicalV2){const current=pricing.value;pricing.replaceChildren(new Option('Per person','per_person'),new Option('Private fixed price','private_fixed'));pricing.value=['per_person','private_fixed'].includes(current)?current:'per_person';pricing.dataset.canonicalV2='1';pricing.addEventListener('change',syncTransferPricing);}
  syncTransferPricing();
}
function syncTransferPricing(){
  const pricing=document.getElementById('routePricingModel'),privatePrice=document.getElementById('routePrivatePrice'),mainPrice=document.getElementById('listingPrice');if(!pricing||!privatePrice)return;
  const fixed=pricing.value==='private_fixed';privatePrice.required=fixed;privatePrice.closest('.field')?.classList.toggle('required-field',fixed);if(mainPrice)mainPrice.required=!fixed&&document.getElementById('listingPriceUnit')?.value!=='price_on_request';
  let help=document.getElementById('routePricingHelp');if(!help){help=document.createElement('small');help.id='routePricingHelp';pricing.closest('.field')?.append(help);}help.textContent=fixed?'Enter the full private-trip amount in Private price.':'The listing main price is used as the per-person adult fare.';
}

const repairDefaults=()=>{
  const payment=document.getElementById('policyPaymentCondition');if(payment&&!payment.value)payment.value='pay_at_property';
  const cancellation=document.getElementById('policyCancellationType');if(cancellation&&!cancellation.value)cancellation.value='legacy';canonicalTransferFields();
};
setTimeout(repairDefaults,0);
const domObserver=new MutationObserver(repairDefaults);domObserver.observe(document.body,{childList:true,subtree:true});

// Once a brand-new listing receives its UUID, remove the temporary :new browser
// recovery key so it cannot appear on the operator's next new listing.
const editorMessage=document.getElementById('editorMessage');
if(editorMessage)new MutationObserver(()=>{
  const text=(editorMessage.textContent||'').toLowerCase();const id=document.getElementById('listingId')?.value;const business=document.getElementById('businessSwitcher')?.value;
  if(id&&business&&/(draft saved|draft and pricing details saved)/.test(text))localStorage.removeItem(`visit_baa_listing_draft:${business}:new`);
}).observe(editorMessage,{childList:true,characterData:true,subtree:true});

queueMicrotask(()=>import('./operator-room-media-v2.js?v=1').catch((error)=>console.error('Room media manager failed:',error)));
