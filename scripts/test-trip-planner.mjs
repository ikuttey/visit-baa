import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findRoutes, minutesToTime, normalizePlace } from '../assets/js/route-planner.js';
import { datesInStay, nightsBetween } from '../assets/js/marketplace.js';
import { mergeTransportLocations } from '../assets/js/transport-locations.js';
import { calculateListingPrice, priceUnitsForCategory } from '../assets/js/pricing.js';
import { DEFAULT_ACTIVITY_TYPES, listingMatchesActivityType, normalizeActivityTypes } from '../assets/js/planner-catalogs.js';
import { preferenceMatch, roomComfortClass, stayLocationClass } from '../assets/js/manta-preferences.js';

globalThis.__tripPlannerTestDependencies={findRoutes,minutesToTime,normalizePlace,datesInStay,nightsBetween,mergeTransportLocations,calculateListingPrice,DEFAULT_ACTIVITY_TYPES,listingMatchesActivityType,normalizeActivityTypes,preferenceMatch,roomComfortClass,stayLocationClass};
const serviceSource=await readFile(new URL('../assets/js/trip-planner-service.js',import.meta.url),'utf8');
const testableSource=serviceSource
  .replace("import { requirePublicSupabase } from './supabase-client.js';","const requirePublicSupabase=()=>{throw new Error('Data loading is outside this pure test');};")
  .replace("import { findRoutes, normalizePlace } from './route-planner.js';","const {findRoutes,normalizePlace}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { datesInStay, nightsBetween } from './marketplace.js';","const {datesInStay,nightsBetween}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { mergeTransportLocations } from './transport-locations.js';","const {mergeTransportLocations}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { DEFAULT_ACTIVITY_TYPES, listingMatchesActivityType, normalizeActivityTypes } from './planner-catalogs.js';","const {DEFAULT_ACTIVITY_TYPES,listingMatchesActivityType,normalizeActivityTypes}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { calculateListingPrice } from './pricing.js';","const {calculateListingPrice}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { preferenceMatch, roomComfortClass, stayLocationClass } from './manta-preferences.js';","const {preferenceMatch,roomComfortClass,stayLocationClass}=globalThis.__tripPlannerTestDependencies;");
const {plannerDraftPayload,recalculateJourney,recommendedActivityIsland,searchTripJourney}=await import(`data:text/javascript;base64,${Buffer.from(testableSource).toString('base64')}`);

const listing=(id,category,title,price,unit='per_person')=>({id,business_name:`Operator ${id}`,title,island:'Maalhos',category,listing_kind:'standard',activity_type_slugs:[],price,currency:'USD',price_unit:unit,price_unit_confirmed:true,available_spaces:12,taxes_amount:0,fees_amount:0,promotions:[],is_verified:true});
const data={
  listings:[listing('out','transfer','Airport boat',20),listing('back','transfer','Return boat',20),listing('between','transfer','Maalhos to Kamadhoo',20),listing('stay','accommodation','Island stay',100,'per_room_per_night'),listing('snorkel','snorkelling','Reef snorkel',25)],
  routePoints:[{name:'Velana International Airport (MLE)',location_type:'airport',island_name:'Malé',aliases:['MLE']},{name:'Dharavandhoo Airport',location_type:'airport',island_name:'Dharavandhoo',aliases:['DRV']},{name:'Dharavandhoo',location_type:'island',island_name:'Dharavandhoo'},{name:'Maalhos',location_type:'island',island_name:'Maalhos'},{name:'Kamadhoo',location_type:'island',island_name:'Kamadhoo'}],
  rooms:[],policyMap:new Map(),transferRoutes:[
    {listing_id:'out',origin_name:'Dharavandhoo Airport',destination_name:'Maalhos',departure_time:'10:00',arrival_time:'10:30',operating_days:[0,1,2,3,4,5,6],pricing_model:'per_person',adult_price:20,child_price:10,currency:'USD',minimum_passengers:1,available_passengers:12},
    {listing_id:'back',origin_name:'Maalhos',destination_name:'Dharavandhoo Airport',departure_time:'15:00',arrival_time:'15:30',operating_days:[0,1,2,3,4,5,6],pricing_model:'per_person',adult_price:20,child_price:10,currency:'USD',minimum_passengers:1,available_passengers:12},
    {listing_id:'between',business_name:'Operator between',title:'Maalhos to Kamadhoo',origin_name:'Maalhos',destination_name:'Kamadhoo',departure_time:'12:00',arrival_time:'12:35',operating_days:[0,1,2,3,4,5,6],pricing_model:'per_person',adult_price:20,child_price:10,currency:'USD',minimum_passengers:1,available_passengers:12}
  ]
};
const availability={rooms:[],generic:[
  {id:'a-out',listing_id:'out',available_date:'2026-09-15',start_time:'10:00',remaining_spaces:8},
  {id:'a-back',listing_id:'back',available_date:'2026-09-18',start_time:'15:00',remaining_spaces:8},
  ...['2026-09-15','2026-09-16','2026-09-17'].map((available_date,index)=>({id:`stay-${index}`,listing_id:'stay',available_date,start_time:null,remaining_spaces:3})),
  {id:'a-snorkel',listing_id:'snorkel',available_date:'2026-09-16',start_time:'09:00',remaining_spaces:6}
]};
const answers={islands:['Maalhos'],activities:['snorkelling'],adults:2,children:0,rooms:1,startDate:'2026-09-15',endDate:'2026-09-18',flexible:false,nightsByIsland:{Maalhos:3},pickup:'Dharavandhoo Airport',dropoff:'Dharavandhoo Airport',budget:500};
const journey=searchTripJourney(data,answers,availability);
assert.equal(journey.complete,true);
assert.equal(journey.gaps.length,0);
assert.equal(journey.selectedItems.length,2);
assert.equal(journey.totals.get('USD'),350);
assert.equal(journey.selectedItems.some((item)=>item.itemKind==='transfer'),false);
assert.equal(journey.segments.some((segment)=>segment.kind==='transfer'),false);
assert.equal(journey.selectedItems.find((item)=>item.itemKind==='activity').date,'2026-09-16');
const draft=plannerDraftPayload(answers,journey);
assert.equal(draft.trip.draft_total,350);
assert.equal(draft.trip.pickup_point,null);
assert.equal(draft.trip.dropoff_point,null);
assert.equal(draft.items.length,2);
assert.equal(draft.items.some((item)=>item.item_kind==='transfer'),false);
assert.ok(draft.items.every((item)=>item.booking_status==='not_requested'));

const unavailable=searchTripJourney(data,answers,{rooms:[],generic:[]});
assert.equal(unavailable.complete,true,'published stays and activities remain requestable without configured inventory');
assert.equal(unavailable.confirmationRequired,2);
assert.equal(unavailable.totals.get('USD'),350);

const binfalhaa={...listing('binfalhaa','accommodation','binfalhaa guest house',50,'per_room'),island:'Dharavandhoo',price_unit_confirmed:false};
const binfalhaaData={...data,listings:[binfalhaa],transferRoutes:[]};
const binfalhaaAnswers={...answers,islands:['Dharavandhoo'],activities:[],nightsByIsland:{Dharavandhoo:3},pickup:'Dharavandhoo',dropoff:'Dharavandhoo'};
const binfalhaaJourney=searchTripJourney(binfalhaaData,binfalhaaAnswers,{rooms:[],generic:[]});
const binfalhaaItem=binfalhaaJourney.selectedItems.find((item)=>item.listingId==='binfalhaa');
assert.ok(binfalhaaItem,'Binfalhaa appears as a published request-based stay');
assert.equal(binfalhaaItem.availabilityMode,'request');
assert.equal(binfalhaaItem.price,null,'ambiguous per-room price is not multiplied across nights');
assert.equal(binfalhaaItem.publishedPrice,50);
assert.equal(binfalhaaItem.priceUnit,'per_room');
assert.match(binfalhaaItem.priceNote,/Final stay total requires operator confirmation/);
assert.equal(plannerDraftPayload(binfalhaaAnswers,binfalhaaJourney).items[0].draft_subtotal,null);
const legacyTransportAnswers={...binfalhaaAnswers,pickup:'Dharavandhoo Airport',dropoff:'Maalhos'};
const legacyTransportJourney=searchTripJourney(binfalhaaData,legacyTransportAnswers,{rooms:[],generic:[]});
assert.equal(legacyTransportJourney.segments.some((segment)=>segment.kind==='transfer'),false,'legacy pickup and drop-off answers must not create transport requirements');

const choiceData={...data,listings:[listing('expensive','accommodation','Higher priced guesthouse',100,'per_room_per_night'),listing('cheap','accommodation','Budget guesthouse',60,'per_room_per_night'),listing('pending','accommodation','Price pending guesthouse',null,'price_on_request')],transferRoutes:[]};
const choiceAnswers={...answers,activities:[],pickup:'Maalhos',dropoff:'Maalhos',budget:500};
const choiceJourney=searchTripJourney(choiceData,choiceAnswers,{rooms:[],generic:[]});
const stayChoices=choiceJourney.segments.find((segment)=>segment.kind==='accommodation');
assert.equal(stayChoices.candidates.length,3,'every matching guesthouse must remain selectable');
assert.equal(stayChoices.candidates[0].items[0].listingId,'cheap','the lowest known total must be Manta’s default choice');
assert.equal(stayChoices.recommended,0);
assert.equal(choiceJourney.totals.get('USD'),180);
stayChoices.selected=1;recalculateJourney(choiceJourney);
assert.equal(choiceJourney.totals.get('USD'),300,'replacing Manta’s choice must recalculate the trip total');
assert.equal(stayChoices.candidates.at(-1).items[0].listingId,'pending','unknown prices must not outrank calculable budget options');

const roomListing={...listing('rooms-stay','accommodation','Rooms guesthouse',80,'per_room_per_night'),amenities:['Beachfront'],room_type:'Double room'};
const roomData={...data,listings:[roomListing],rooms:[
  {id:'room-standard',listing_id:'rooms-stay',name:'Standard Double Room',maximum_guests:2,adult_capacity:2,child_capacity:0,base_price:70,currency:'USD',amenities:[]},
  {id:'room-premium',listing_id:'rooms-stay',name:'Premium Suite',maximum_guests:2,adult_capacity:2,child_capacity:0,base_price:90,currency:'USD',amenities:['Sea view']}
],ratePlans:[
  {id:'rate-standard',room_id:'room-standard',name:'Room only',nightly_price:70},
  {id:'rate-premium',room_id:'room-premium',name:'Breakfast included',nightly_price:90}
],transferRoutes:[]};
const roomAvailability={generic:[],rooms:['2026-09-15','2026-09-16','2026-09-17'].flatMap((available_date)=>[
  {room_id:'room-standard',available_date,available_quantity:1,price_override:null},
  {room_id:'room-premium',available_date,available_quantity:1,price_override:null}
])};
const premiumJourney=searchTripJourney(roomData,{...answers,activities:[],stayPreference:'beachfront',roomPreference:'premium'},roomAvailability);
const premiumStay=premiumJourney.segments.find((segment)=>segment.kind==='accommodation').candidates[0].items[0];
assert.equal(premiumStay.roomId,'room-premium','room preference must select the actual available premium room record');
assert.equal(premiumStay.ratePlanId,'rate-premium','room selection must retain its real published rate plan');
assert.equal(premiumStay.stayLocationClass,'beachfront');
const noPreferenceJourney=searchTripJourney(roomData,{...answers,activities:[],stayPreference:'none',roomPreference:'none'},roomAvailability);
assert.equal(noPreferenceJourney.segments.find((segment)=>segment.kind==='accommodation').candidates[0].items[0].roomId,'room-standard','no preference must add no hidden room penalty and keep the lowest valid room first');

const component=(id,name,amount,unit='per_trip')=>({id,name,component_type:'transfer',charge_status:'required',amount,currency:'USD',price_unit:unit,tiers:[]});
const providerStay={...listing('provider-stay','accommodation','Guesthouse A',45,'per_room_per_night'),business_id:'guesthouse-a',business_name:'Guesthouse A'};
const guesthouseExcursion={...listing('guesthouse-trip','snorkelling','Guesthouse reef trip',90),business_id:'guesthouse-a',business_name:'Guesthouse A',activity_type_slugs:['snorkelling']};
const excursionCentre={...listing('centre-trip','snorkelling','Excursion Centre reef trip',60),business_id:'centre-b',business_name:'Excursion Centre B',activity_type_slugs:['snorkelling']};
const cheapHeadline={...listing('cheap-headline','snorkelling','Cheap headline reef trip',30),business_id:'headline-c',business_name:'Headline Operator C',activity_type_slugs:['snorkelling'],price_components:[component('pickup-c','Required pickup',100)]};
const crossProviderData={...data,listings:[providerStay,guesthouseExcursion,excursionCentre,cheapHeadline],transferRoutes:[]};
const crossProviderAnswers={...answers,activities:['snorkelling'],pickup:'Maalhos',dropoff:'Maalhos',recommendationMode:'lowest_total'};
const crossProviderJourney=searchTripJourney(crossProviderData,crossProviderAnswers,{rooms:[],generic:[]});
const selectedStay=crossProviderJourney.selectedItems.find((item)=>item.itemKind==='accommodation');
const selectedExcursion=crossProviderJourney.selectedItems.find((item)=>item.itemKind==='activity');
assert.equal(selectedStay.businessName,'Guesthouse A','accommodation must be searched independently');
assert.equal(selectedExcursion.businessName,'Excursion Centre B','Manta must not lock the activity to the accommodation provider');
assert.equal(selectedExcursion.price,120,'Manta must compare the complete two-adult group total');
const excursionSegment=crossProviderJourney.segments.find((segment)=>segment.kind==='activity');
assert.equal(excursionSegment.candidates.find((candidate)=>candidate.items[0].listingId==='cheap-headline').price,160,'a USD 60 headline plus USD 100 required pickup must compare as USD 160');
assert.match(excursionSegment.explanation.title,/Excursion Centre B/);
assert.ok(excursionSegment.explanation.alternatives.some((alternative)=>alternative.name==='Guesthouse A'&&/more for the complete required total/.test(alternative.reason)),'explanations must identify why a major alternative lost');
assert.ok(excursionSegment.explanation.alternatives.some((alternative)=>alternative.name==='Headline Operator C'&&alternative.total===160),'the cheaper headline alternative must retain its real complete cost');
assert.match(crossProviderJourney.providerExplanation,/uses 2 providers/,'the full-trip explanation must acknowledge a mixed-provider plan');

const newlyPublished={...listing('new-operator-trip','snorkelling','New operator reef trip',50),business_id:'new-provider',business_name:'Newly Published Operator',activity_type_slugs:['snorkelling']};
const discoveredJourney=searchTripJourney({...crossProviderData,listings:[...crossProviderData.listings,newlyPublished]},crossProviderAnswers,{rooms:[],generic:[]});
assert.equal(discoveredJourney.selectedItems.find((item)=>item.itemKind==='activity').businessName,'Newly Published Operator','a newly published listing must be discovered from fixture data without hard-coded Manta changes');
assert.equal(discoveredJourney.selectedItems.find((item)=>item.itemKind==='activity').price,100);

const allActivitiesJourney=searchTripJourney(data,{...answers,activities:['snorkelling','marine-life']},availability);
assert.equal(allActivitiesJourney.segments.filter((segment)=>segment.kind==='activity').length,2,'every selected activity must be searched independently');
assert.ok(allActivitiesJourney.segments.some((segment)=>segment.activityTypeSlug==='snorkelling'&&segment.candidates.length));
assert.ok(allActivitiesJourney.segments.some((segment)=>segment.activityTypeSlug==='marine-life'&&!segment.candidates.length));

const splitData={...data,listings:[
  {...listing('stay-a','accommodation','Maalhos stay',90,'per_room_per_night'),island:'Maalhos'},
  {...listing('stay-b','accommodation','Kamadhoo stay',110,'per_room_per_night'),island:'Kamadhoo'},
  {...listing('snorkel-a','snorkelling','Maalhos reef snorkel',30),island:'Maalhos'},
  {...listing('snorkel-b','snorkelling','Kamadhoo reef snorkel',20),island:'Kamadhoo'}
]};
const splitAnswers={...answers,islands:['Maalhos','Kamadhoo'],activities:[],startDate:'2026-08-24',endDate:'2026-08-29',nightsByIsland:{Maalhos:2,Kamadhoo:3}};
const splitJourney=searchTripJourney(splitData,splitAnswers,{rooms:[],generic:[]});
assert.equal(splitJourney.segments.find((segment)=>segment.id==='stay-Maalhos').candidates[0].items[0].endDate,'2026-08-26');
assert.equal(splitJourney.segments.find((segment)=>segment.id==='stay-Kamadhoo').candidates[0].items[0].endDate,'2026-08-29');
const splitTransfer=splitJourney.segments.find((segment)=>segment.kind==='transfer');
assert.ok(splitTransfer,'an inter-island stay must create a transport segment');
assert.equal(splitTransfer.candidates.length,1,'only a real published route may satisfy the inter-island segment');
assert.equal(splitTransfer.selected,0);
assert.equal(splitTransfer.candidates[0].items[0].businessName,'Operator between');

const customActivityAnswers={...splitAnswers,activities:['snorkelling'],activityPlan:{snorkelling:{island:'Kamadhoo',unit:'trips',quantity:2,days:2}}};
assert.equal(recommendedActivityIsland(splitData,customActivityAnswers,'snorkelling'),'Kamadhoo','Manta should recommend the island with the lowest known activity estimate');
const customActivityJourney=searchTripJourney(splitData,customActivityAnswers,{rooms:[],generic:[
  {id:'kamadhoo-snorkel-1',listing_id:'snorkel-b',available_date:'2026-08-27',start_time:'09:00',remaining_spaces:6},
  {id:'kamadhoo-snorkel-2',listing_id:'snorkel-b',available_date:'2026-08-28',start_time:'09:00',remaining_spaces:6}
]});
const plannedActivities=customActivityJourney.segments.filter((segment)=>segment.kind==='activity');
assert.equal(plannedActivities.length,2,'the requested number of activity trips must create separate requirements');
assert.deepEqual(plannedActivities.map((segment)=>segment.island),['Kamadhoo','Kamadhoo']);
assert.deepEqual(plannedActivities.map((segment)=>segment.plannedDate),['2026-08-27','2026-08-28']);
assert.deepEqual(plannedActivities.map((segment)=>segment.activityFrequency),['trips','trips']);
assert.deepEqual(plannedActivities.map((segment)=>segment.activityOccurrence),[1,2]);
assert.match(plannedActivities[0].title,/Trip 1 of 2/);
assert.equal(customActivityJourney.totals.get('USD'),630,'each customized activity trip and the published inter-island route must update the total');
assert.equal(plannerDraftPayload(customActivityAnswers,customActivityJourney).items.filter((item)=>item.item_kind==='activity').length,2,'every customized activity trip must be saved');

const packageListings=[
  {...listing('adventure','excursion','Baa Adventure Package',125),business_name:'Dharavandhoo Beach Guesthouse',listing_kind:'excursion_package',activity_type_slugs:['snorkelling','dolphin-watching','sandbank-trips','island-hopping']},
  {...listing('fishing-package','excursion','Night Fishing Package',150),business_name:'Baa Sea Transfers',listing_kind:'excursion_package',activity_type_slugs:['fishing','sunset-cruises']},
  {...listing('sunset-package','excursion','Sunset and Dolphin Package',175),business_name:'Baa Sea Transfers',listing_kind:'excursion_package',activity_type_slugs:['sunset-cruises','dolphin-watching']}
].map((item)=>({...item,package_maximum_guests:10,operating_days:[0,1,2,3,4,5,6]}));
const dolphin={...listing('dolphin','excursion','Individual dolphin tour',40),activity_type_slugs:['dolphin-watching']};
const packageData={...data,listings:[listing('package-stay','accommodation','Package test stay',100,'per_room_per_night'),dolphin,...packageListings],transferRoutes:[]};
const packageAnswers={...answers,activities:['snorkelling','dolphin-watching','sandbank-trips','island-hopping','fishing'],activityPlan:{snorkelling:{island:'Maalhos',unit:'times',quantity:1},'dolphin-watching':{island:'Maalhos',unit:'times',quantity:1},'sandbank-trips':{island:'Maalhos',unit:'times',quantity:1},'island-hopping':{island:'Maalhos',unit:'times',quantity:1},fishing:{island:'Maalhos',unit:'times',quantity:1}}};
const packageJourney=searchTripJourney(packageData,packageAnswers,{rooms:[],generic:[]});
const packageSegments=packageJourney.segments.filter((segment)=>segment.kind==='package');
assert.equal(packageSegments.length,3,'Manta must preserve every matching package as an independently selectable segment');
assert.match(packageSegments[0].candidates[0].detail,/Matches 4 of your 5 activities/,'packages must rank by structured activity overlap');
assert.equal(packageSegments[0].candidates[0].items[0].businessName,'Dharavandhoo Beach Guesthouse','the actual provider must remain attached to the package');
const beforePackages=packageJourney.totals.get('USD');
packageSegments.forEach((segment)=>{segment.selected=0;});
recalculateJourney(packageJourney);
assert.equal(packageJourney.totals.get('USD')-beforePackages,900,'three per-person package prices must each be counted once for two adults without expanding included activities into charges');
const packageDraftItems=plannerDraftPayload(packageAnswers,packageJourney).items.filter((item)=>item.item_kind==='package');
assert.equal(packageDraftItems.length,3,'multiple packages must remain separate booking items in one trip');
assert.equal(new Set(packageDraftItems.map((item)=>item.listing_id)).size,3,'adding a package must not overwrite another package');
const remotePackage={...packageListings[0],id:'remote-package',title:'Kamadhoo Ocean Package',island:'Kamadhoo',business_name:'Kamadhoo Excursions'};
const route=(id,from,to,time)=>({listing_id:id,business_name:'Route Provider',title:`${from} to ${to}`,origin_name:from,destination_name:to,departure_time:time,arrival_time:time==='08:00'?'08:40':'18:40',operating_days:[0,1,2,3,4,5,6],pricing_model:'per_person',adult_price:20,child_price:10,currency:'USD',minimum_passengers:1,available_passengers:12});
const remoteJourney=searchTripJourney({...packageData,listings:[...packageData.listings,remotePackage],transferRoutes:[route('remote-out','Maalhos','Kamadhoo','08:00'),route('remote-back','Kamadhoo','Maalhos','18:00')]},packageAnswers,{rooms:[],generic:[]});
const remoteItem=remoteJourney.segments.flatMap((segment)=>segment.candidates.flatMap((candidate)=>candidate.items)).find((item)=>item.listingId==='remote-package');
assert.equal(remoteItem?.transportRequired,true,'a package on another island may appear only when real outbound and return routes exist');
assert.match(remoteItem.detail,/published outbound and return route costs included in comparison/,'Manta must not silently assume remote-package transport is free');
const remoteCandidate=remoteJourney.segments.flatMap((segment)=>segment.candidates).find((candidate)=>candidate.items.some((item)=>item.listingId==='remote-package'));
assert.equal(remoteCandidate.price,330,'the remote package comparison must include its USD 250 service and USD 80 return transport');
assert.equal(remoteCandidate.items.filter((item)=>item.itemKind==='transfer').length,2,'required transport must remain explicit trip items');
for(const unit of ['days','times']){
  const frequencyJourney=searchTripJourney(splitData,{...customActivityAnswers,activityPlan:{snorkelling:{island:'Kamadhoo',unit,quantity:2}}},{rooms:[],generic:[
    {id:`${unit}-1`,listing_id:'snorkel-b',available_date:'2026-08-27',start_time:'09:00',remaining_spaces:6},
    {id:`${unit}-2`,listing_id:'snorkel-b',available_date:'2026-08-28',start_time:'09:00',remaining_spaces:6}
  ]});
  const occurrences=frequencyJourney.segments.filter((segment)=>segment.kind==='activity');
  assert.equal(occurrences.length,2,`${unit} quantity must create two separately priced activity occurrences`);
  assert.ok(occurrences.every((segment)=>segment.activityFrequency===unit),`${unit} frequency must be preserved in every segment`);
}

assert.equal(calculateListingPrice(listing('ten','accommodation','Ten nights',50,'per_room_per_night'),{adults:2,children:0,rooms:1,nights:10}).total,500);
assert.equal(calculateListingPrice(listing('two','accommodation','Two rooms',50,'per_room_per_night'),{adults:2,children:0,rooms:2,nights:10}).total,1000);
assert.equal(calculateListingPrice(listing('trip','excursion','Per trip',100,'per_trip'),{adults:2,children:0}).total,100);
assert.equal(calculateListingPrice(listing('person','excursion','Per person',100,'per_person'),{adults:2,children:0}).total,200);
assert.equal(calculateListingPrice({...listing('adult','excursion','Per adult',100,'per_adult'),child_price:25},{adults:2,children:1}).total,225);
assert.equal(calculateListingPrice(listing('boat','transfer','Private boat',250,'per_boat'),{adults:4,children:0}).total,250);
assert.equal(calculateListingPrice(listing('package-price','excursion','Whole package',375,'per_package'),{adults:6,children:2}).total,375);
assert.equal(calculateListingPrice({...listing('group','excursion','Group activity',150,'per_group'),group_capacity:3},{adults:4,children:0}).total,300);
assert.equal(calculateListingPrice(listing('request','excursion','Request price',null,'price_on_request'),{adults:2,children:0}).total,null);
assert.equal(calculateListingPrice({...listing('legacy','accommodation','Legacy room',50,'per_room'),price_unit_confirmed:false},{rooms:1,nights:10}).total,null);
assert.deepEqual(priceUnitsForCategory('accommodation'),['per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','per_room','per_night','per_day','price_on_request']);
assert.equal(normalizeActivityTypes([]).length,15,'the customer activity catalog must remain complete without published listings');

const gapsJourney=searchTripJourney(data,{...answers,activities:['marine-life'],pickup:'Velana International Airport (MLE)'},availability);
assert.ok(gapsJourney.segments.some((segment)=>segment.kind==='activity'&&!segment.candidates.length),'an unmatched requested activity must remain as a gap card source');
assert.equal(gapsJourney.segments.some((segment)=>segment.kind==='transfer'),false,'transport must never be searched by Manta');
assert.ok(gapsJourney.missingPriceItems>=1);
const gapsDraft=plannerDraftPayload({...answers,activities:['marine-life'],pickup:'Velana International Airport (MLE)'},gapsJourney);
assert.equal(gapsDraft.requirements.length,1,'only the unmatched activity requirement is saved with the draft');
assert.equal(gapsDraft.requirements.some((requirement)=>requirement.requirement_kind==='transfer'),false);

console.log('Stay-and-activity manta trip planner tests passed.');
