export const DEFAULT_SERVICE_CATEGORIES=Object.freeze([
  {slug:'accommodation',name:'Accommodation / Guesthouse',listing_categories:['accommodation'],sort_order:10},
  {slug:'excursions',name:'Excursion Centre',listing_categories:['excursion','snorkelling'],sort_order:20},
  {slug:'diving',name:'Dive Centre',listing_categories:['diving','excursion'],sort_order:30},
  {slug:'transport',name:'Speedboat / Transport',listing_categories:['transfer','excursion'],sort_order:40},
  {slug:'private-charter',name:'Private Charter',listing_categories:['transfer','excursion','fishing'],sort_order:50},
  {slug:'fishing',name:'Fishing Operator',listing_categories:['fishing','excursion'],sort_order:60},
  {slug:'watersports',name:'Watersports',listing_categories:['watersports','excursion'],sort_order:70},
  {slug:'local-experiences',name:'Local Experiences',listing_categories:['community_experience','food_dining','other'],sort_order:80},
  {slug:'conservation',name:'Conservation Experiences',listing_categories:['conservation_experience','community_experience'],sort_order:90},
  {slug:'food-dining',name:'Food / Dining',listing_categories:['food_dining'],sort_order:100},
  {slug:'other',name:'Other eligible Visit Baa services',listing_categories:['other'],sort_order:110}
]);

export const LEGACY_OPERATOR_CATEGORY=Object.freeze({
  accommodation:'guesthouse_hotel',excursions:'snorkelling_excursion',diving:'dive_centre',transport:'speedboat_transfer',
  'private-charter':'speedboat_transfer',fishing:'fishing_operator',watersports:'watersports_provider',
  'local-experiences':'conservation_community',conservation:'conservation_community','food-dining':'restaurant_cafe',other:'other_tourism_service'
});

export function normalizeServiceCategories(rows=[]){
  return (rows.length?rows:DEFAULT_SERVICE_CATEGORIES).filter((item)=>item?.slug&&item?.name)
    .map((item)=>({...item,listing_categories:item.listing_categories||[]}))
    .sort((a,b)=>Number(a.sort_order||100)-Number(b.sort_order||100)||(a.name||a.slug).localeCompare(b.name||b.slug));
}

export function listingGroup(listing){
  if(listing.listing_kind==='excursion_package'||listing.is_package)return'Excursion Packages';
  if(listing.category==='accommodation')return'Accommodation';
  if(['excursion','snorkelling','diving','fishing','watersports','conservation_experience','community_experience'].includes(listing.category))return'Individual Excursions & Experiences';
  if(listing.category==='transfer')return'Transport';
  if(listing.category==='food_dining')return'Food & Dining';
  return'Other Services';
}

export function listingKindLabel(listing){
  if(listing.listing_kind==='excursion_package'||listing.is_package)return'Excursion package';
  return String(listing.category||'service').replaceAll('_',' ');
}
