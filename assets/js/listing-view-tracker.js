import { requirePublicSupabase } from './supabase-client.js';

function visitorKey(){
  const storageKey='baa_listing_visitor_key';
  let value=localStorage.getItem(storageKey);
  if(!value){
    value=globalThis.crypto?.randomUUID?.()||`${Date.now()}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(storageKey,value);
  }
  return value;
}

async function track(){
  const listingId=new URLSearchParams(location.search).get('id');
  if(!listingId)return;
  try{
    const {error}=await requirePublicSupabase().rpc('track_listing_view',{p_listing_id:listingId,p_visitor_key:visitorKey()});
    if(error)console.debug('Listing view tracking skipped:',error.message);
  }catch(error){console.debug('Listing view tracking unavailable:',error?.message||error);}
}

track();
