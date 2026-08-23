export const STAY_PREFERENCES=Object.freeze([
  {value:'none',label:'No preference',detail:'Show the strongest overall stay.'},
  {value:'beachfront',label:'Beachfront',detail:'Right on the beach.'},
  {value:'near_beach',label:'Near the beach',detail:'Easy beach access.'},
  {value:'inland',label:'Inland',detail:'A quieter village location.'}
]);

export const ROOM_PREFERENCES=Object.freeze([
  {value:'none',label:'No preference',detail:'Choose the best available room.'},
  {value:'budget',label:'Budget',detail:'Keep the room cost down.'},
  {value:'standard',label:'Standard',detail:'Simple and comfortable.'},
  {value:'comfort',label:'Comfort',detail:'More space or upgraded features.'},
  {value:'premium',label:'Premium',detail:'The best published room options.'}
]);

const clean=(value)=>String(value||'').trim().toLowerCase();
const terms=(...values)=>values.flatMap((value)=>Array.isArray(value)?value:[value]).map(clean).filter(Boolean).join(' ');

export function stayLocationClass(listing={}){
  const published=terms(listing.amenities,listing.property_type,listing.room_type);
  if(/beachfront|beach front|oceanfront|sea front|seafront/.test(published))return'beachfront';
  if(/private beach|beach access|near beach|beach area/.test(published))return'near_beach';
  return'inland';
}

export function roomComfortClass(room={},listing={},ratePlan={}){
  const published=terms(room.name,room.description,room.view_type,room.amenities,listing.room_type,ratePlan.name,ratePlan.meal_plan);
  if(/presidential|honeymoon|premium|luxury|executive|villa|suite/.test(published))return'premium';
  if(/deluxe|superior|comfort|ocean view|sea view|balcony|terrace/.test(published)||Number(room.room_size_sqm)>=32)return'comfort';
  if(/budget|economy|basic|dorm/.test(published))return'budget';
  return'standard';
}

export function preferenceMatch(item={},input={}){
  const stay=input.stayPreference||'none';
  const room=input.roomPreference||'none';
  const stayMatches=stay==='none'||item.stayLocationClass===stay;
  const roomMatches=room==='none'||item.roomComfortClass===room;
  return{
    requestedStayPreference:stay,
    requestedRoomPreference:room,
    stayMatches,
    roomMatches,
    score:(stay!=='none'&&stayMatches?2:0)+(room!=='none'&&roomMatches?2:0),
    hardMatch:(!input.stayPreferenceRequired||stayMatches)&&(!input.roomPreferenceRequired||roomMatches)
  };
}

function nextRoomPreference(current){
  const order=['budget','standard','comfort','premium'];
  if(current==='none')return'comfort';
  return order[Math.min(order.length-1,Math.max(0,order.indexOf(current))+1)];
}

export function applyMantaOverride(input,answers){
  const text=clean(input).replace(/[’]/g,"'");
  const changes=[];
  if(!text)return{applied:false,changes};
  if(/fewer (operators|providers)|less (operators|providers)|simpler trip/.test(text)){
    answers.recommendationMode='fewer_providers';changes.push('fewer operators');
  }else if(/cheaper|cheapest|lowest (price|total)|save money/.test(text)){
    answers.recommendationMode='lowest_total';changes.push('lower price');
  }else if(/best value|balanced/.test(text)){
    answers.recommendationMode='best_value';changes.push('best value');
  }
  if(/(beachfront|beach front).*(only|must)|(?:only|must).*(beachfront|beach front)/.test(text)){
    answers.stayPreference='beachfront';answers.stayPreferenceRequired=true;changes.push('beachfront only');
  }else if(/near (the )?beach/.test(text)){
    answers.stayPreference='near_beach';answers.stayPreferenceRequired=/only|must/.test(text);changes.push('near the beach');
  }else if(/(?:prefer |want )?inland/.test(text)&&!/don't mind|dont mind|do not mind/.test(text)){
    answers.stayPreference='inland';answers.stayPreferenceRequired=/only|must/.test(text);changes.push('inland stay');
  }else if(/don't mind inland|dont mind inland|do not mind inland|don't care (where|location)|no (stay |location )?preference/.test(text)){
    answers.stayPreference='none';answers.stayPreferenceRequired=false;changes.push('no stay location preference');
  }
  if(/don't care (about )?(the )?room|dont care (about )?(the )?room|no room preference|any room/.test(text)){
    answers.roomPreference='none';answers.roomPreferenceRequired=false;changes.push('no room preference');
  }else if(/better room|upgrade (the )?room/.test(text)){
    answers.roomPreference=nextRoomPreference(answers.roomPreference);answers.roomPreferenceRequired=false;changes.push(`${answers.roomPreference} room`);
  }else{
    const requested=['premium','comfort','standard','budget'].find((value)=>new RegExp(`\\b${value}\\b`).test(text));
    if(requested){answers.roomPreference=requested;answers.roomPreferenceRequired=/only|must/.test(text);changes.push(`${requested} room${answers.roomPreferenceRequired?' only':''}`);}
  }
  return{applied:changes.length>0,changes};
}

export function normalizeSimpleAnswers(saved={}){
  const island=Array.isArray(saved.islands)?saved.islands[0]:saved.island;
  return{
    ...saved,
    islands:island?[island]:[],
    activities:Array.isArray(saved.activities)?saved.activities:[],
    adults:Math.max(1,Number(saved.adults)||2),
    children:Math.max(0,Number(saved.children)||0),
    rooms:Math.max(1,Number(saved.rooms)||1),
    stayPreference:saved.stayPreference||'none',
    roomPreference:saved.roomPreference||'none',
    stayPreferenceRequired:Boolean(saved.stayPreferenceRequired),
    roomPreferenceRequired:Boolean(saved.roomPreferenceRequired),
    recommendationMode:saved.recommendationMode||'best_value',
    budget:saved.budget||null
  };
}
