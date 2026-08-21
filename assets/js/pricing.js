export const PRICE_UNIT_LABELS=Object.freeze({
  per_room_per_night:'Per room per night',per_property_per_night:'Per property per night',per_person_per_night:'Per person per night',fixed_stay:'Fixed stay total',
  per_person:'Per person',per_child:'Per child',per_group:'Per group',per_trip:'Per trip',fixed:'Fixed total',per_boat:'Per boat',per_vehicle:'Per vehicle',per_leg:'Per leg',price_on_request:'Price on request',
  per_room:'Per room — confirmation required',per_night:'Per night — update required',per_transfer:'Per transfer — update required',per_session:'Per session — update required',per_hour:'Per hour — update required',per_adult:'Per adult — update required'
});

export const CATEGORY_PRICE_UNITS=Object.freeze({
  accommodation:['per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request'],
  transfer:['per_person','per_trip','per_boat','per_vehicle','per_leg','price_on_request'],
  activity:['per_person','per_child','per_group','per_trip','fixed','price_on_request']
});

export function priceUnitLabel(unit){return PRICE_UNIT_LABELS[unit]||String(unit||'Price unit').replaceAll('_',' ');}
export function priceUnitsForCategory(category){return CATEGORY_PRICE_UNITS[category==='accommodation'?'accommodation':category==='transfer'?'transfer':'activity'];}
const amount=(value)=>{const number=Number(value);return value!==null&&value!==''&&Number.isFinite(number)?number:null;};
const numberText=(value)=>new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(value);

export function calculateListingPrice(listing,{adults=1,children=0,rooms=1,nights=1}={}){
  const price=amount(listing.price);const unit=listing.price_unit;const confirmed=listing.price_unit_confirmed!==false;
  if(!confirmed||unit==='price_on_request'||price===null)return{total:null,math:'Price confirmation required',unitLabel:priceUnitLabel(unit),pending:true};
  const travelers=Math.max(1,Number(adults)||1)+Math.max(0,Number(children)||0);let total=null;let math='';
  if(listing.category==='accommodation'){
    if(unit==='per_room_per_night'){total=price*rooms*nights;math=`${numberText(price)} × ${rooms} room${rooms===1?'':'s'} × ${nights} night${nights===1?'':'s'}`;}
    else if(unit==='per_property_per_night'){total=price*nights;math=`${numberText(price)} × ${nights} night${nights===1?'':'s'}`;}
    else if(unit==='per_person_per_night'){
      const child=amount(listing.child_price);const nightly=price*adults+(child===null?0:child*children);total=nightly*nights;
      math=child===null?`${numberText(price)} × ${adults} chargeable adult${adults===1?'':'s'} × ${nights} night${nights===1?'':'s'}`:`(${numberText(price)} × ${adults} adults + ${numberText(child)} × ${children} children) × ${nights} nights`;
    }else if(unit==='fixed_stay'){total=price;math=`${numberText(price)} fixed stay total`;}
  }else if(listing.category==='transfer'){
    if(unit==='per_person'){total=price*travelers;math=`${numberText(price)} × ${travelers} traveler${travelers===1?'':'s'}`;}
    else if(['per_trip','per_boat','per_vehicle','per_leg','fixed'].includes(unit)){total=price;math=`${numberText(price)} ${priceUnitLabel(unit).toLowerCase()}`;}
  }else{
    if(unit==='per_person'){const child=amount(listing.child_price);total=price*adults+(child===null?price:child)*children;math=child===null?`${numberText(price)} × ${travelers} participant${travelers===1?'':'s'}`:`${numberText(price)} × ${adults} adults + ${numberText(child)} × ${children} children`;}
    else if(unit==='per_child'){total=price*children;math=`${numberText(price)} × ${children} child${children===1?'':'ren'}`;}
    else if(['per_trip','fixed'].includes(unit)){total=price;math=`${numberText(price)} ${priceUnitLabel(unit).toLowerCase()}`;}
    else if(unit==='per_group'){
      const capacity=Number(listing.group_capacity);if(Number.isInteger(capacity)&&capacity>0){const groups=Math.ceil(travelers/capacity);total=price*groups;math=`${numberText(price)} × ${groups} group${groups===1?'':'s'} (up to ${capacity} each)`;}
    }
  }
  return total===null?{total:null,math:'Price confirmation required',unitLabel:priceUnitLabel(unit),pending:true}:{total,math,unitLabel:priceUnitLabel(unit),pending:false};
}
