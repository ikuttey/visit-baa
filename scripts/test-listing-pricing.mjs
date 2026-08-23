import assert from 'node:assert/strict';
import { calculateListingPrice, calculatePriceBreakdown, quantityForPriceUnit, serializePriceSnapshot } from '../assets/js/pricing.js';

const included=(id,name,type='custom')=>({id,name,component_type:type,charge_status:'included',amount:null,currency:'USD',price_unit:null,tiers:[]});
const charge=(id,name,amount,priceUnit,status='required',extra={})=>({id,name,component_type:'custom',charge_status:status,amount,currency:'USD',price_unit:priceUnit,tiers:[],...extra});

const dolphin={id:'dolphin',business_id:'operator-a',title:'Dolphin Watching',category:'excursion',pricing_mode:'main_plus_components',price:50,currency:'USD',price_unit:'per_person',price_unit_confirmed:true,price_components:[included('guide','Guide','guide'),included('water','Drinking water','food_drink')]};
const dolphinPrice=calculatePriceBreakdown(dolphin,{adults:4,children:0});
assert.equal(dolphinPrice.requiredTotal,200,'USD 50 per person must total USD 200 for four adults');
assert.equal(dolphinPrice.included.length,2);
assert.ok(dolphinPrice.included.every((line)=>line.amount===0),'included components must never increase the total');

const hanifaru={id:'hanifaru',business_id:'operator-b',title:'Hanifaru Bay Snorkelling',category:'excursion',pricing_mode:'components_only',price:null,currency:'USD',price_unit:'per_person',price_unit_confirmed:true,price_components:[
  charge('transfer','Transfer',100,'per_trip'),charge('guide','Guide',15,'per_person'),charge('adult-ticket','Hanifaru Adult Ticket',30,'per_adult'),
  charge('child-ticket','Hanifaru Child Ticket',15,'per_child'),charge('kit','Snorkelling kit',10,'per_person','optional')
]};
const requiredOnly=calculatePriceBreakdown(hanifaru,{adults:4,children:0});
assert.equal(requiredOnly.requiredTotal,280,'component-only required total must match the Hanifaru example');
assert.equal(requiredOnly.finalTotal,280,'optional equipment must be excluded until selected');
assert.equal(requiredOnly.lines.some((line)=>line.isMain),false,'component-only listings must not invent a main price');
const withKit=calculatePriceBreakdown(hanifaru,{adults:4,children:0},['kit']);
assert.equal(withKit.optionalTotal,40);
assert.equal(withKit.finalTotal,320,'selected optional equipment must be added transparently');
const requestedExtra={...hanifaru,price_components:[...hanifaru.price_components,charge('private','Private upgrade',null,'price_on_request','optional')]};
const withRequestedExtra=calculatePriceBreakdown(requestedExtra,{adults:4},['private']);
assert.equal(withRequestedExtra.requiredTotal,280,'a pending optional extra must not hide the known required total');
assert.equal(withRequestedExtra.finalTotal,null,'a selected price-on-request extra must make the final total pending');

const tiered={...hanifaru,id:'tiered',price_components:[charge('boat','Private boat',200,'per_boat','required',{tiers:[
  {id:'small',minimum_guests:1,maximum_guests:4,amount:180,calculation_kind:'fixed_total'},
  {id:'large',minimum_guests:5,maximum_guests:8,amount:35,calculation_kind:'per_unit'}
]})]};
assert.equal(calculatePriceBreakdown(tiered,{adults:4}).requiredTotal,180,'fixed guest tiers must override the component price once');
assert.equal(calculatePriceBreakdown(tiered,{adults:6}).requiredTotal,35,'a per-unit tier on a per-boat component must use one boat');
assert.equal(quantityForPriceUnit('per_group',{adults:7},4),2,'group charges must use operator-entered group capacity');

for(const [unit,context,expected] of [
  ['per_person',{adults:2,children:1},3],['per_adult',{adults:2,children:1},2],['per_child',{adults:2,children:1},1],
  ['per_booking',{adults:4},1],['per_trip',{adults:4},1],['per_boat',{adults:4},1],['per_vehicle',{adults:4},1],
  ['per_direction',{directions:2},2],['per_hour',{hours:3},3],['per_day',{days:2},2],['per_session',{sessions:2},2],
  ['per_dive',{dives:3},3],['per_item',{items:4},4],['per_set',{sets:2},2],['fixed',{adults:8},1]
]) assert.equal(quantityForPriceUnit(unit,context),expected,`${unit} must have deterministic quantity math`);

const snapshot=serializePriceSnapshot(hanifaru,{adults:4,children:0},['kit']);
assert.equal(snapshot.required_total,requiredOnly.requiredTotal,'operator, public, trip and booking surfaces must serialize the same required total');
assert.equal(snapshot.final_total,withKit.finalTotal);
assert.equal(snapshot.provider_business_id,'operator-b');
assert.equal(snapshot.lines.find((line)=>line.component_id==='kit').selected,true);
assert.equal(calculateListingPrice(hanifaru,{adults:4,children:0}).total,280,'the compatibility API must use the same component engine');

console.log('Reusable activity/package pricing, optional extras, group tiers, and snapshots passed.');
