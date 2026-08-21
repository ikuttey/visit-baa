export const PERMANENT_TRANSPORT_LOCATIONS = Object.freeze([
  { slug:'velana-international-airport', name:'Velana International Airport (MLE)', location_type:'airport', island_name:'Malé', aliases:['Velana International Airport','Velana Airport','MLE','Male Airport','Malé Airport'], is_permanent:true },
  { slug:'male', name:'Malé', location_type:'city', island_name:'Malé', aliases:['Male','Male City','Malé City'], is_permanent:true },
  { slug:'dharavandhoo-airport', name:'Dharavandhoo Airport', location_type:'airport', island_name:'Dharavandhoo', aliases:['DRV','Dharavandhoo Domestic Airport'], is_permanent:true },
  ...['Dharavandhoo','Dhonfanu','Eydhafushi','Fehendhoo','Fulhadhoo','Goidhoo','Hithaadhoo','Kamadhoo','Kendhoo','Kihaadhoo','Kudarikilu','Maalhos','Thulhaadhoo'].map((name)=>({slug:normalizeLocationKey(name),name,location_type:'island',island_name:name,aliases:name==='Dhonfanu'?['Dhonfan']:[],is_permanent:true}))
]);

export function normalizeLocationKey(value='') {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
}

export function locationGroup(location) {
  if (location.location_type==='airport') return 'Airports';
  if (location.location_type==='city') return 'City / transport hub';
  if (location.location_type==='island') return 'Baa Atoll islands';
  if (location.location_type==='accommodation') return 'Accommodation';
  return 'Other published pickup points';
}

export function mergeTransportLocations(...collections) {
  const byKey=new Map();
  const aliases=new Map();
  const add=(raw={})=>{
    const name=String(raw.name||'').trim(); if(!name)return;
    const candidate={id:raw.id||null,slug:raw.slug||normalizeLocationKey(name),name,location_type:raw.location_type||'route_point',island_name:raw.island_name||null,aliases:Array.isArray(raw.aliases)?raw.aliases:[],is_permanent:Boolean(raw.is_permanent),customer_selectable:raw.customer_selectable!==false,sort_order:Number(raw.sort_order)||100};
    const keys=[candidate.name,candidate.slug,...candidate.aliases].map(normalizeLocationKey).filter(Boolean);
    const existingKey=keys.map((key)=>aliases.get(key)).find(Boolean);
    if(existingKey){
      const existing=byKey.get(existingKey);
      if(candidate.is_permanent&&!existing.is_permanent)byKey.set(existingKey,{...candidate,aliases:[...new Set([...existing.aliases,...candidate.aliases,existing.name])]});
      return;
    }
    byKey.set(candidate.slug,candidate); keys.forEach((key)=>aliases.set(key,candidate.slug));
  };
  PERMANENT_TRANSPORT_LOCATIONS.forEach(add); collections.flat().filter(Boolean).forEach(add);
  return [...byKey.values()].filter((location)=>location.customer_selectable).map((location)=>({...location,group:locationGroup(location)})).sort((a,b)=>locationGroup(a).localeCompare(locationGroup(b))||a.sort_order-b.sort_order||a.name.localeCompare(b.name));
}

export function canonicalLocationName(value,locations=PERMANENT_TRANSPORT_LOCATIONS) {
  const key=normalizeLocationKey(value);
  const match=locations.find((location)=>[location.slug,location.name,...(location.aliases||[])].some((candidate)=>normalizeLocationKey(candidate)===key));
  return match?.name||String(value||'').trim();
}
