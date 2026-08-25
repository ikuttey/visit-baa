import { requireSupabase } from './supabase-client.js';
import { uploadImage, removeImage, signedImageUrl, validateImages } from './storage.js';

const client=requireSupabase();
const roomEditor=document.getElementById('roomEditor');
const roomId=document.getElementById('roomId');
const editorMessage=document.getElementById('editorMessage');
let currentRoom='';
let images=[];

function setMessage(text='',kind=''){if(!editorMessage)return;editorMessage.textContent=text;editorMessage.hidden=!text;editorMessage.className=`message${kind?` ${kind}`:''}`;}
function esc(value=''){return String(value??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

function install(){
  if(!roomEditor||document.getElementById('roomMediaManager'))return;
  const block=document.createElement('section');block.id='roomMediaManager';block.className='settings-section';block.style.marginTop='14px';
  block.innerHTML=`<div class="panel-head"><div><h4>Room photos</h4><p>Photos belong to this room type, not the general property gallery.</p></div></div><div id="roomMediaEmpty" class="help">Save this room type first, then reopen it to add photos.</div><div id="roomMediaControls" hidden><div class="field"><label for="roomMediaFiles">Add room photos</label><input id="roomMediaFiles" type="file" accept="image/jpeg,image/png,image/webp" multiple><small>JPG, PNG or WebP; maximum 5 MB each.</small></div><div class="form-actions"><button type="button" class="button secondary" id="uploadRoomMedia">Upload selected photos</button></div><div id="roomMediaGrid" class="media-v2-grid"></div></div>`;
  roomEditor.append(block);
  document.getElementById('uploadRoomMedia').addEventListener('click',uploadSelected);
}

async function load(room){
  currentRoom=room||'';images=[];
  const empty=document.getElementById('roomMediaEmpty'),controls=document.getElementById('roomMediaControls'),grid=document.getElementById('roomMediaGrid');
  if(!room){empty.hidden=false;controls.hidden=true;grid?.replaceChildren();return;}
  empty.hidden=true;controls.hidden=false;
  const {data,error}=await client.from('room_images').select('id,room_id,storage_path,caption,sort_order').eq('room_id',room).order('sort_order');
  if(error){setMessage(error.message,'error');return;}images=data||[];await render();
}
async function render(){
  const grid=document.getElementById('roomMediaGrid');if(!grid)return;grid.replaceChildren();
  if(!images.length){grid.innerHTML='<div class="empty-inline">No photos for this room type yet.</div>';return;}
  for(const [index,image] of images.entries()){
    const url=await signedImageUrl('room-gallery',image.storage_path);const card=document.createElement('article');card.className='media-v2-card';
    card.innerHTML=`${url?`<img src="${esc(url)}" alt="${esc(image.caption||'Room photo')}">`:''}<input value="${esc(image.caption||'')}" maxlength="300" aria-label="Room image caption"><div class="table-actions"><button type="button" class="button small secondary" data-up>↑</button><button type="button" class="button small secondary" data-down>↓</button><button type="button" class="button small danger" data-remove>Remove</button></div>`;
    const caption=card.querySelector('input');caption.addEventListener('change',async()=>{const {error}=await client.from('room_images').update({caption:caption.value.trim()||null}).eq('id',image.id);if(error)setMessage(error.message,'error');});
    card.querySelector('[data-up]').disabled=index===0;card.querySelector('[data-down]').disabled=index===images.length-1;
    card.querySelector('[data-up]').addEventListener('click',()=>move(index,-1));card.querySelector('[data-down]').addEventListener('click',()=>move(index,1));card.querySelector('[data-remove]').addEventListener('click',()=>remove(image));grid.append(card);
  }
}
async function uploadSelected(){
  if(!currentRoom)return setMessage('Save the room type first, then add its photos.','warning');
  const input=document.getElementById('roomMediaFiles');let files;try{files=validateImages(input.files);}catch(error){return setMessage(error.message,'error');}if(!files.length)return;
  const button=document.getElementById('uploadRoomMedia');button.disabled=true;button.textContent='Uploading…';
  try{
    let order=images.length;for(const file of files){const path=await uploadImage('room-gallery',file,(await client.auth.getUser()).data.user.id,currentRoom);const {error}=await client.from('room_images').insert({room_id:currentRoom,storage_path:path,caption:file.name,sort_order:order++});if(error){await removeImage('room-gallery',path);throw error;}}
    input.value='';await load(currentRoom);setMessage('Room photos uploaded.','success');
  }catch(error){setMessage(error.message,'error');}finally{button.disabled=false;button.textContent='Upload selected photos';}
}
async function move(index,direction){const target=index+direction;if(target<0||target>=images.length)return;[images[index],images[target]]=[images[target],images[index]];for(let i=0;i<images.length;i++){const {error}=await client.from('room_images').update({sort_order:i}).eq('id',images[i].id);if(error)return setMessage(error.message,'error');}await render();}
async function remove(image){if(!confirm('Remove this room photo?'))return;const {error}=await client.from('room_images').delete().eq('id',image.id);if(error)return setMessage(error.message,'error');await removeImage('room-gallery',image.storage_path);await load(currentRoom);setMessage('Room photo removed.','success');}

install();
if(roomEditor){new MutationObserver(()=>{if(!roomEditor.hidden){const id=roomId?.value||'';if(id!==currentRoom)load(id).catch((e)=>setMessage(e.message,'error'));}}).observe(roomEditor,{attributes:true,attributeFilter:['hidden']});}
