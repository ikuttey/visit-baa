import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { findRoutes, minutesToTime, normalizePlace } from '../assets/js/route-planner.js';
import { datesInStay, nightsBetween } from '../assets/js/marketplace.js';
import { mergeTransportLocations } from '../assets/js/transport-locations.js';
import { calculateListingPrice, priceUnitsForCategory } from '../assets/js/pricing.js';
import { DEFAULT_ACTIVITY_TYPES, listingMatchesActivityType, normalizeActivityTypes } from '../assets/js/planner-catalogs.js';

globalThis.__tripPlannerTestDependencies={findRoutes,minutesToTime,normalizePlace,datesInStay,nightsBetween,mergeTransportLocations,calculateListingPrice,DEFAULT_ACTIVITY_TYPES,listingMatchesActivityType,normalizeActivityTypes};
const serviceSource=await readFile(new URL('../assets/js/trip-planner-service.js',import.meta.url),'utf8');
const testableSource=serviceSource
  .replace("import { requirePublicSupabase } from './supabase-client.js';","const requirePublicSupabase=()=>{throw new Error('Data loading is outside this pure test');};")
  .replace("import { normalizePlace } from './route-planner.js';","const {normalizePlace}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { datesInStay, nightsBetween } from './marketplace.js';","const {datesInStay,nightsBetween}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { mergeTransportLocations } from './transport-locations.js';","const {mergeTransportLocations}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { DEFAULT_ACTIVITY_TYPES, listingMatchesActivityType, normalizeActivityTypes } from './planner-catalogs.js';","const {DEFAULT_ACTIVITY_TYPES,listingMatchesActivityType,normalizeActivityTypes}=globalThis.__tripPlannerTestDependencies;")
  .replace("import { calculateListingPrice } from './pricing.js';","const {calculateListingPrice}=globalThis.__tripPlannerTestDependencies;");
const {plannerDraftPayload,recalculateJourney,recommendedActivityIsland,searchTripJourney}=await import(`data:text/javascript;base64,${Buffer.from(testableSource).toString('base64')}`);

const listing=(id,category,title,price,unit='per_person')=>({id,business_name:`Operator ${id}`,title,island:'Maalhos',category,price,currency:'USD',price_unit:unit,price_unit_confirmed:true,available_spaces:12,taxes_amount:0,fees_amount:0,promotions:[],is_verified:true});
const data={
  listings:[listing('out','transfer','Airport boat',20),listing('back','transfer','Return boat',20),listing('stay','accommodation','Island stay',100,'per_room_per_night'),listing('snorkel','snorkelling','Reef snorkel',25)],
  routePoints:[{name:'Velana International Airport (MLE)',location_type:'airport',island_name:'Malé',aliases:['MLE']},{name:'Dharavandhoo Airport',location_type:'airport',island_name:'Dharavandhoo',aliases:['DRV']},{name:'Dharavandhoo',location_type:'island',island_name:'Dharavandhoo'},{name:'Maalhos',location_type:'island',island_name:'Maalhos'},{name:'Kamadhoo',location_type:'island',island_name:'Kamadhoo'}],
  rooms:[],policyMap:new Map(),routes:[
    {listing_id:'out',origin_name:'Dharavandhoo Airport',destination_name:'Maalhos',departure_time:'10:00',arrival_time:'10:30',operating_days:[0,1,2,3,4,5,6],pricing_model:'per_person',adult_price:20,child_price:10,currency:'USD',minimum_passengers:1,available_passengers:12},
    {listing_id:'back',origin_name:'Maalhos',destination_name:'Dharavandhoo Airport',departure_time:'15:00',arrival_time:'15:30',operating_days:[0,1,2,3,4,5,6],pricing_model:'per_person',adult_price:20,child_price:10,currency:'USD',minimum_passengers:1,available_passengers:12}
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

const binfalhaa={...listing('binfalhaa','accommodation','binfalhaa guest house',50,'per_room'),island:'Dharavandhoo'};
const binfalhaaData={...data,listings:[binfalhaa],routes:[]};
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

const choiceData={...data,listings:[listing('expensive','accommodation','Higher priced guesthouse',100,'per_room_per_night'),listing('cheap','accommodation','Budget guesthouse',60,'per_room_per_night'),listing('pending','accommodation','Price pending guesthouse',null,'price_on_request')],routes:[]};
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
assert.equal(splitJourney.segments.some((segment)=>segment.kind==='transfer'),false);

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
assert.equal(customActivityJourney.totals.get('USD'),590,'each customized activity trip must update the total');
assert.equal(plannerDraftPayload(customActivityAnswers,customActivityJourney).items.filter((item)=>item.item_kind==='activity').length,2,'every customized activity trip must be saved');
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
assert.equal(calculateListingPrice(listing('boat','transfer','Private boat',250,'per_boat'),{adults:4,children:0}).total,250);
assert.equal(calculateListingPrice({...listing('group','excursion','Group activity',150,'per_group'),group_capacity:3},{adults:4,children:0}).total,300);
assert.equal(calculateListingPrice(listing('request','excursion','Request price',null,'price_on_request'),{adults:2,children:0}).total,null);
assert.equal(calculateListingPrice({...listing('legacy','accommodation','Legacy room',50,'per_room'),price_unit_confirmed:false},{rooms:1,nights:10}).total,null);
assert.deepEqual(priceUnitsForCategory('accommodation'),['per_room_per_night','per_property_per_night','per_person_per_night','fixed_stay','price_on_request']);
assert.equal(normalizeActivityTypes([]).length,15,'the customer activity catalog must remain complete without published listings');

const gapsJourney=searchTripJourney(data,{...answers,activities:['marine-life'],pickup:'Velana International Airport (MLE)'},availability);
assert.ok(gapsJourney.segments.some((segment)=>segment.kind==='activity'&&!segment.candidates.length),'an unmatched requested activity must remain as a gap card source');
assert.equal(gapsJourney.segments.some((segment)=>segment.kind==='transfer'),false,'transport must never be searched by Manta');
assert.ok(gapsJourney.missingPriceItems>=1);
const gapsDraft=plannerDraftPayload({...answers,activities:['marine-life'],pickup:'Velana International Airport (MLE)'},gapsJourney);
assert.equal(gapsDraft.requirements.length,1,'only the unmatched activity requirement is saved with the draft');
assert.equal(gapsDraft.requirements.some((requirement)=>requirement.requirement_kind==='transfer'),false);

console.log('Stay-and-activity manta trip planner tests passed.');
