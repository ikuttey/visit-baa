import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyMantaOverride, normalizeSimpleAnswers, roomComfortClass, stayLocationClass } from '../assets/js/manta-preferences.js';

const planner=await readFile(new URL('../assets/js/manta-planner.js',import.meta.url),'utf8');
const results=await readFile(new URL('../assets/js/trip-results.js',import.meta.url),'utf8');

assert.match(planner,/const steps=\['island','dates','travelers','stayPreference','roomPreference','activities'\]/);
assert.match(planner,/Find My Baa Trip/);
assert.doesNotMatch(planner,/renderRecommendation|renderBudget|renderActivityPlan|renderNights/);
assert.match(results,/Add This Trip/);
assert.match(results,/Why These Options\?/);
assert.match(results,/See Alternatives/);
assert.match(results,/Make it cheaper/);
assert.match(results,/Use fewer operators/);
assert.match(results,/Change only this item/);
assert.match(results,/trip-price-details/);

const answers=normalizeSimpleAnswers({islands:['Maalhos','Kamadhoo'],adults:2,rooms:1});
assert.deepEqual(answers.islands,['Maalhos'],'the customer flow keeps one stay base');
assert.equal(answers.stayPreference,'none');
assert.equal(answers.roomPreference,'none');
assert.equal(answers.recommendationMode,'best_value');

let parsed=applyMantaOverride('Beachfront only',answers);
assert.equal(parsed.applied,true);
assert.equal(answers.stayPreference,'beachfront');
assert.equal(answers.stayPreferenceRequired,true);
applyMantaOverride("I don't care about the room",answers);
assert.equal(answers.roomPreference,'none');
applyMantaOverride('better room',answers);
assert.equal(answers.roomPreference,'comfort');
applyMantaOverride('make it cheaper',answers);
assert.equal(answers.recommendationMode,'lowest_total');
applyMantaOverride('use fewer operators',answers);
assert.equal(answers.recommendationMode,'fewer_providers');
applyMantaOverride("I don't mind inland",answers);
assert.equal(answers.stayPreference,'none');

assert.equal(stayLocationClass({amenities:['Beachfront']}),'beachfront');
assert.equal(stayLocationClass({amenities:['Private beach area']}),'near_beach');
assert.equal(stayLocationClass({amenities:['Garden']}),'inland');
assert.equal(roomComfortClass({name:'Budget Double Room'}),'budget');
assert.equal(roomComfortClass({name:'Deluxe Sea View Room'}),'comfort');
assert.equal(roomComfortClass({name:'Premium Suite'}),'premium');
assert.equal(roomComfortClass({name:'Double Room'}),'standard');

console.log('Simple Manta flow, preferences, overrides, and progressive results checks passed.');
