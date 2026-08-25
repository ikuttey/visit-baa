// Compatibility bridge for the legacy owner dashboard.
// V2 allows a verified, active business to choose a new supported listing
// category. Supabase registers the matching business service before validating
// the draft, so the older UI must not disable categories based on services that
// were already registered before the draft existed.

const categorySelect=document.getElementById('listingCategory');

function verifiedBusinessSelected(){
  const status=(document.getElementById('businessStatus')?.textContent||'').trim().toLowerCase();
  return status.includes('verified');
}

function unlockCategories(){
  if(!categorySelect||!verifiedBusinessSelected())return;
  if(categorySelect.disabled)categorySelect.disabled=false;
  [...categorySelect.options].forEach((option)=>{if(option.disabled)option.disabled=false;});

  const field=categorySelect.closest('.field');
  if(field&&!document.getElementById('listingCategoryV2Help')){
    const help=document.createElement('small');
    help.id='listingCategoryV2Help';
    help.textContent='Choose any service this verified business provides. Visit Baa registers a new service automatically when the draft is saved.';
    field.append(help);
  }
}

function installCategoryUnlock(){
  if(!categorySelect)return;
  let repairing=false;
  const repair=()=>{
    if(repairing)return;
    repairing=true;
    unlockCategories();
    repairing=false;
  };

  const observer=new MutationObserver(()=>queueMicrotask(repair));
  observer.observe(categorySelect,{attributes:true,attributeFilter:['disabled'],childList:true,subtree:true});

  ['focus','pointerdown','keydown'].forEach((eventName)=>categorySelect.addEventListener(eventName,repair));
  document.getElementById('newListingButton')?.addEventListener('click',()=>setTimeout(repair,0));
  document.getElementById('listingTypeCards')?.addEventListener('click',()=>setTimeout(repair,0),true);
  document.getElementById('businessSwitcher')?.addEventListener('change',()=>setTimeout(repair,150));

  [0,50,200,600,1200].forEach((delay)=>setTimeout(repair,delay));
}

installCategoryUnlock();
