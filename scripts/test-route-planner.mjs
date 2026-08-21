import assert from 'node:assert/strict';
import { findRoutes, routeDestinations, routeOperatesOn, routePrice } from '../assets/js/route-planner.js';
import { canonicalLocationName, mergeTransportLocations } from '../assets/js/transport-locations.js';

const monday = '2026-08-24';
const leg = (overrides={}) => ({listing_id:crypto.randomUUID(),title:'Published transfer',origin_name:'Dharavandhoo Airport',destination_name:'Maalhos',departure_time:'09:00:00',arrival_time:'09:30:00',estimated_duration_minutes:30,operating_days:[1],adult_price:20,child_price:10,infant_price:0,currency:'USD',pricing_model:'per_person',minimum_passengers:1,available_passengers:8,...overrides});

assert.equal(routeOperatesOn(leg(),monday),true);
assert.equal(routeOperatesOn(leg(),'2026-08-25'),false);
assert.equal(routePrice(leg(),{adults:2,children:1,infants:1}),50);
assert.deepEqual(routeDestinations([leg()]),['Dharavandhoo Airport','Maalhos']);
assert.equal(findRoutes([leg()],{from:'Dharavandhoo Airport',to:'Maalhos',date:monday,adults:2})[0].total_price,40);
assert.equal(findRoutes([leg()],{from:'Maalhos',to:'Dharavandhoo Airport',date:monday,adults:2}).length,0,'direction must never be inferred');

const connected=[leg({destination_name:'Eydhafushi',arrival_time:'09:30:00'}),leg({origin_name:'Eydhafushi',destination_name:'Kamadhoo',departure_time:'10:15:00',arrival_time:'10:45:00'})];
assert.equal(findRoutes(connected,{from:'Dharavandhoo Airport',to:'Kamadhoo',date:monday,adults:2})[0].legs.length,2);
assert.equal(findRoutes(connected.map((item,index)=>index?{...item,departure_time:'10:14:00'}:item),{from:'Dharavandhoo Airport',to:'Kamadhoo',date:monday,adults:2}).length,0,'connections need a 45 minute buffer');
assert.equal(findRoutes([leg({available_passengers:1})],{from:'Dharavandhoo Airport',to:'Maalhos',date:monday,adults:2}).length,0,'capacity is enforced');

const locations=mergeTransportLocations([{name:'MLE',location_type:'route_point'},{name:'New Published Jetty',location_type:'meeting_point'}]);
assert.ok(locations.some((item)=>item.name==='Velana International Airport (MLE)'));
assert.ok(locations.some((item)=>item.name==='Malé'));
assert.ok(locations.some((item)=>item.name==='Dharavandhoo Airport'));
assert.equal(locations.filter((item)=>/^(MLE|Velana)/i.test(item.name)).length,1,'Velana aliases must not create duplicates');
assert.equal(canonicalLocationName('Male Airport',locations),'Velana International Airport (MLE)');
assert.equal(canonicalLocationName('Male',locations),'Malé','Malé city must remain separate from Velana airport');
assert.equal(locations.find((item)=>item.name==='Dharavandhoo Airport').island_name,'Dharavandhoo','airports must retain their parent island');

console.log('Directional transfer route planner tests passed.');
