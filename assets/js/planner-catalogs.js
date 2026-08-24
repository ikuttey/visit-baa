export const DEFAULT_ACTIVITY_TYPES=Object.freeze([
  {slug:'snorkelling',name:'Snorkelling',listing_categories:['snorkelling'],match_terms:['snorkel','reef'],requires_term_match:false,sort_order:10},
  {slug:'diving',name:'Diving',listing_categories:['diving'],match_terms:['dive','diving'],requires_term_match:false,sort_order:20},
  {slug:'marine-life',name:'Manta and marine-life experiences',listing_categories:['excursion','snorkelling','diving'],match_terms:['manta','marine life','whale shark','turtle'],requires_term_match:true,sort_order:30},
  {slug:'fishing',name:'Fishing',listing_categories:['fishing'],match_terms:['fishing'],requires_term_match:false,sort_order:40},
  {slug:'watersports',name:'Watersports',listing_categories:['watersports'],match_terms:['kayak','paddle','jet ski','watersport'],requires_term_match:false,sort_order:50},
  {slug:'boat-excursions',name:'Boat excursions',listing_categories:['excursion'],match_terms:['boat','cruise','excursion'],requires_term_match:false,sort_order:60},
  {slug:'island-hopping',name:'Island hopping',listing_categories:['excursion'],match_terms:['island hopping','island tour'],requires_term_match:true,sort_order:70},
  {slug:'sandbank-trips',name:'Sandbank trips',listing_categories:['excursion'],match_terms:['sandbank'],requires_term_match:true,sort_order:80},
  {slug:'sunset-cruises',name:'Sunset cruises',listing_categories:['excursion'],match_terms:['sunset'],requires_term_match:true,sort_order:90},
  {slug:'dolphin-watching',name:'Dolphin watching',listing_categories:['excursion'],match_terms:['dolphin'],requires_term_match:true,sort_order:100},
  {slug:'conservation',name:'Conservation experiences',listing_categories:['conservation_experience'],match_terms:['conservation','restoration','research'],requires_term_match:false,sort_order:110},
  {slug:'community',name:'Community experiences',listing_categories:['community_experience'],match_terms:['community'],requires_term_match:false,sort_order:120},
  {slug:'local-culture',name:'Local culture',listing_categories:['community_experience'],match_terms:['culture','heritage','craft'],requires_term_match:true,sort_order:130},
  {slug:'local-food',name:'Local food and dining',listing_categories:['food_dining'],match_terms:['local food','dining','cooking'],requires_term_match:false,sort_order:140},
  {slug:'beach-relaxation',name:'Beach and relaxation',listing_categories:['other','excursion'],match_terms:['beach','relaxation','picnic'],requires_term_match:true,sort_order:150}
]);

export function normalizeActivityTypes(rows=[]){
  const source=rows.length?rows:DEFAULT_ACTIVITY_TYPES;
  return source.filter((item)=>item?.slug&&item?.name).map((item)=>({...item,listing_categories:item.listing_categories||[],match_terms:item.match_terms||[]})).sort((a,b)=>Number(a.sort_order||100)-Number(b.sort_order||100)||a.name.localeCompare(b.name));
}

export function listingMatchesActivityType(listing,type){
  const structured=Array.isArray(listing.activity_type_slugs)?listing.activity_type_slugs.filter(Boolean):[];
  // New listings have explicit activity tags. When they exist, treat them as
  // authoritative so a sandbank trip is not also reused as a generic boat
  // excursion merely because both share the broad `excursion` category.
  if(structured.length)return structured.includes(type.slug);
  // Legacy listings without structured tags still use category/text fallback.
  if(!(type.listing_categories||[]).includes(listing.category))return false;
  if(!type.requires_term_match)return true;
  const searchable=[listing.title,listing.summary,listing.description,...(listing.amenities||[]),...(listing.included_items||[])].filter(Boolean).join(' ').toLowerCase();
  return(type.match_terms||[]).some((term)=>searchable.includes(String(term).toLowerCase()));
}
