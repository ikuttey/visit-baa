// Keeps the V2 listing editor controls aligned with canonical database values.
// This module is loaded before the listing controller binds user actions.

function replaceOptions(id, options, fallback=''){
  const select=document.getElementById(id);
  if(!select)return;
  const current=select.value;
  select.replaceChildren(...options.map(([value,label])=>new Option(label,value)));
  const aliases={
    flexible:'free_cancellation',
    partial_penalty:'deadline',
    custom:'deadline',
    pay_direct:'pay_at_property',
    pay_on_arrival:'pay_at_property',
    required_extra:'extra_charge',
    optional_extra:'extra_charge'
  };
  const wanted=aliases[current]||current||fallback;
  select.value=[...select.options].some((option)=>option.value===wanted)?wanted:fallback;
}

replaceOptions('policyCancellationType',[
  ['legacy','Use listing cancellation text'],
  ['free_cancellation','Free cancellation'],
  ['deadline','Cancellation deadline / penalty'],
  ['non_refundable','Non-refundable']
],'legacy');

replaceOptions('policyPaymentCondition',[
  ['pay_at_property','Pay operator directly / on arrival'],
  ['deposit_required','Deposit required'],
  ['prepayment_required','Full prepayment required']
],'pay_at_property');

replaceOptions('pickupMode',[
  ['not_available','Not available'],
  ['included','Included'],
  ['extra_charge','Extra charge']
],'not_available');

function normalizeBeforeSave(){
  const payment=document.getElementById('policyPaymentCondition');
  if(payment&&!['pay_at_property','deposit_required','prepayment_required'].includes(payment.value))payment.value='pay_at_property';
  const cancellation=document.getElementById('policyCancellationType');
  const cancellationMap={flexible:'free_cancellation',partial_penalty:'deadline',custom:'deadline'};
  if(cancellationMap[cancellation?.value])cancellation.value=cancellationMap[cancellation.value];
  if(cancellation&&!['legacy','free_cancellation','deadline','non_refundable'].includes(cancellation.value))cancellation.value='legacy';
  const pickup=document.getElementById('pickupMode');
  if(['required_extra','optional_extra'].includes(pickup?.value))pickup.value='extra_charge';
  if(pickup&&!['not_available','included','extra_charge'].includes(pickup.value))pickup.value='not_available';
}

document.addEventListener('submit',normalizeBeforeSave,true);
['saveListing','submitListing'].forEach((id)=>document.getElementById(id)?.addEventListener('click',normalizeBeforeSave,{capture:true}));

// populatePolicy() in the older controller used the old `pay_direct` fallback.
// If that leaves the canonical select blank after a listing is opened, restore
// the safe direct-to-operator payment option automatically.
const repairDefaults=()=>{
  const payment=document.getElementById('policyPaymentCondition');
  if(payment&&!payment.value)payment.value='pay_at_property';
  const cancellation=document.getElementById('policyCancellationType');
  if(cancellation&&!cancellation.value)cancellation.value='legacy';
};
setTimeout(repairDefaults,0);
setInterval(repairDefaults,500);
