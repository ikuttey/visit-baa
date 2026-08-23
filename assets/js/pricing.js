export const PRICE_UNIT_LABELS=Object.freeze({
  per_room_per_night:'Per room per night',per_property_per_night:'Per property per night',per_person_per_night:'Per person per night',fixed_stay:'Fixed stay total',
  per_person:'Per person',per_adult:'Per adult',per_child:'Per child',per_infant:'Per infant',per_group:'Per group',per_booking:'Per booking',
  per_trip:'Per trip',per_package:'Per package',per_boat:'Per boat',per_vehicle:'Per vehicle',per_direction:'Per direction',per_leg:'Per direction',
  per_hour:'Per hour',per_day:'Per day',per_night:'Per night',per_session:'Per session',per_dive:'Per dive',per_item:'Per item',per_set:'Per set',
  per_room:'Per room',fixed:'Fixed total',price_on_request:'Price on request',per_transfer:'Per transfer'
});

export const ALL_PRICE_UNITS=Object.freeze([
  'per_person','per_adult','per_child','per_infant','per_group','per_booking','per_trip','per_package','per_boat','per_vehicle',
  'per_direction','per_transfer','per_hour','per_day','per_night','per_session','per_dive','per_item','per_set','per_room','fixed','price_on_request'
]);

export const CATEGORY_PRICE_UNITS=Object.freeze({
  accommodation:['per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','per_room','per_night','per_day','price_on_request'],
  transfer:['per_person','per_adult','per_child','per_infant','per_booking','per_trip','per_boat','per_vehicle','per_direction','fixed','price_on_request'],
  activity:ALL_PRICE_UNITS
});

export const COMPONENT_PRESETS=Object.freeze([
  {type:'guide',name:'Guide'},{type:'transfer',name:'Transfer / Boat'},{type:'pickup',name:'Pickup'},{type:'ticket',name:'Entrance / Ticket'},
  {type:'snorkelling_equipment',name:'Snorkelling Equipment'},{type:'diving_equipment',name:'Diving Equipment'},
  {type:'fishing_equipment',name:'Fishing Equipment'},{type:'food_drink',name:'Food / Drink'},
  {type:'private_upgrade',name:'Private Upgrade'},{type:'custom',name:'Custom Charge'}
]);

export function priceUnitLabel(unit){return PRICE_UNIT_LABELS[unit]||String(unit||'Price unit').replaceAll('_',' ');}
export function priceUnitsForCategory(category){return CATEGORY_PRICE_UNITS[category==='accommodation'?'accommodation':category==='transfer'?'transfer':'activity'];}
const amount=(value)=>{const number=Number(value);return value!==null&&value!==''&&Number.isFinite(number)?number:null;};
const positive=(value,fallback=1)=>{const number=Number(value);return Number.isFinite(number)&&number>=0?number:fallback;};
const numberText=(value)=>new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value);

export function normalizePriceContext(context={}){
  const adults=positive(context.adults,1);const children=positive(context.children,0);const infants=positive(context.infants,0);
  return{adults,children,infants,people:adults+children+infants,rooms:positive(context.rooms,1),nights:positive(context.nights,1),
    bookings:positive(context.bookings,1),trips:positive(context.trips,1),packages:positive(context.packages,1),boats:positive(context.boats,1),
    vehicles:positive(context.vehicles,1),directions:positive(context.directions,1),hours:positive(context.hours,1),days:positive(context.days,1),
    sessions:positive(context.sessions,1),dives:positive(context.dives,1),items:positive(context.items,1),sets:positive(context.sets,1)};
}

export function quantityForPriceUnit(unit,context={},groupCapacity=null){
  const c=normalizePriceContext(context);
  return({per_person:c.people,per_adult:c.adults,per_child:c.children,per_infant:c.infants,
    per_group:groupCapacity?Math.ceil(c.people/Number(groupCapacity)):1,per_booking:c.bookings,per_trip:c.trips,per_package:c.packages,
    per_boat:c.boats,per_vehicle:c.vehicles,per_direction:c.directions,per_leg:c.directions,per_transfer:c.directions,
    per_hour:c.hours,per_day:c.days,per_night:c.nights,per_session:c.sessions,per_dive:c.dives,per_item:c.items,per_set:c.sets,
    per_room:c.rooms,per_room_per_night:c.rooms*c.nights,per_property_per_night:c.nights,per_person_per_night:c.people*c.nights,
    fixed_stay:1,fixed:1,price_on_request:0}[unit]??1);
}

function tierFor(component,people){return(component.tiers||[]).find((tier)=>people>=Number(tier.minimum_guests)&&people<=Number(tier.maximum_guests))||null;}

export function calculatePriceComponent(component,context={},selectedOptionalIds=[]){
  const c=normalizePriceContext(context);const status=component.charge_status||component.status||'required';
  const selected=status!=='optional'||selectedOptionalIds.includes(component.id);const unit=component.price_unit||component.unit||null;
  if(status==='included')return{...component,status,unit,quantity:0,rate:null,amount:0,selected:true,pending:false,tier:null};
  const tier=tierFor(component,c.people);const rate=amount(tier?.amount??component.amount??component.operator_price);
  const quantity=quantityForPriceUnit(unit,c,component.group_capacity);
  const pending=unit==='price_on_request'||rate===null;
  const calculated=pending?null:tier?.calculation_kind==='fixed_total'?rate:rate*quantity;
  return{...component,status,unit,quantity,rate,amount:calculated,selected,pending,tier};
}

export function listingPriceComponents(listing){
  const configured=Array.isArray(listing.price_components)?listing.price_components:Array.isArray(listing.listing_price_components)?listing.listing_price_components:[];
  const components=[];
  if((listing.pricing_mode||'main_plus_components')!=='components_only')components.push({id:'main',component_type:'main',name:'Main service charge',charge_status:'required',amount:listing.price,currency:listing.currency,price_unit:listing.price_unit,group_capacity:listing.group_capacity,isMain:true});
  return[...components,...configured];
}

export function calculatePriceBreakdown(listing,context={},selectedOptionalIds=[]){
  const c=normalizePriceContext(context);const lines=listingPriceComponents(listing).map((component)=>{
    if(component.isMain&&listing.category==='accommodation'&&component.price_unit==='per_person_per_night'&&amount(listing.child_price)!==null){
      const total=(amount(listing.price)*c.adults+amount(listing.child_price)*c.children+amount(listing.price)*c.infants)*c.nights;
      return{...calculatePriceComponent(component,c,selectedOptionalIds),quantity:c.people*c.nights,amount:total,rate:amount(listing.price),pending:false};
    }
    if(component.isMain&&['per_person','per_adult'].includes(component.price_unit)&&amount(listing.child_price)!==null){
      const infantRate=component.price_unit==='per_person'?amount(listing.price):0;const total=amount(listing.price)*c.adults+amount(listing.child_price)*c.children+infantRate*c.infants;
      return{...calculatePriceComponent(component,c,selectedOptionalIds),quantity:c.people,amount:total,rate:amount(listing.price),pending:false};
    }
    return calculatePriceComponent(component,c,selectedOptionalIds);
  });
  const required=lines.filter((line)=>line.status==='required');const included=lines.filter((line)=>line.status==='included');
  const optional=lines.filter((line)=>line.status==='optional');const selectedOptional=optional.filter((line)=>line.selected);
  const requiredPending=required.some((line)=>line.pending);const optionalPending=selectedOptional.some((line)=>line.pending);const requiredTotal=requiredPending?null:required.reduce((sum,line)=>sum+Number(line.amount||0),0);
  const optionalTotal=optionalPending?null:selectedOptional.reduce((sum,line)=>sum+Number(line.amount||0),0);const finalTotal=requiredTotal===null||optionalTotal===null?null:requiredTotal+optionalTotal;
  return{currency:listing.currency||lines[0]?.currency||'USD',context:c,lines,required,included,optional,selectedOptional,requiredTotal,optionalTotal,finalTotal,pending:requiredPending||optionalPending,requiredPending,optionalPending};
}

export function componentMath(line){
  if(line.status==='included')return'Included';if(line.pending)return'Price on request';
  if(line.tier?.calculation_kind==='fixed_total')return`${numberText(line.rate)} fixed total for ${line.tier.minimum_guests}–${line.tier.maximum_guests} guests`;
  return line.quantity===1?`${numberText(line.rate)} ${priceUnitLabel(line.unit).toLowerCase()}`:`${numberText(line.rate)} × ${numberText(line.quantity)}`;
}

export function calculateListingPrice(listing,context={}){
  if(listing.price_unit_confirmed===false&&(listing.pricing_mode||'main_plus_components')!=='components_only')return{total:null,math:'Price confirmation required',unitLabel:priceUnitLabel(listing.price_unit),pending:true,breakdown:null};
  const breakdown=calculatePriceBreakdown(listing,context,context.selectedOptionalIds||[]);
  const priced=breakdown.required.filter((line)=>!line.pending);const math=breakdown.pending?'Price confirmation required':priced.length===1?componentMath(priced[0]):`${priced.length} required charge${priced.length===1?'':'s'} included`;
  return{total:breakdown.requiredTotal,finalTotal:breakdown.finalTotal,math,unitLabel:priceUnitLabel(listing.price_unit),pending:breakdown.pending,breakdown};
}

export function serializePriceSnapshot(listing,context={},selectedOptionalIds=[]){
  const result=calculatePriceBreakdown(listing,context,selectedOptionalIds);
  return{version:1,listing_id:listing.id,provider_business_id:listing.business_id,currency:result.currency,party:result.context,
    lines:result.lines.map((line)=>({component_id:line.id==='main'?null:line.id,name:line.name,component_type:line.component_type,status:line.status,
      operator_price:line.rate,currency:line.currency||result.currency,unit:line.unit,quantity:line.quantity,calculated_amount:line.amount,selected:line.selected,
      tier_id:line.tier?.id||null,tier_calculation:line.tier?.calculation_kind||null})),required_total:result.requiredTotal,
    selected_optional_total:result.optionalTotal,final_total:result.finalTotal,price_pending:result.pending};
}
