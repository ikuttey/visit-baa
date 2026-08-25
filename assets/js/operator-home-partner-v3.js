const head=document.querySelector('.operator-v2-page-head');
if(head){
  const h1=head.querySelector('h1');if(h1)h1.textContent='Home';
  const eyebrow=head.querySelector('.eyebrow');if(eyebrow)eyebrow.textContent='Partner home';
  const p=head.querySelector('p');if(p)p.textContent='See what needs attention today, upcoming reservations and your recent performance.';
}

// Partner extranets lead with tasks/attention before performance totals.
const attention=document.getElementById('attentionList')?.closest('.panel');
const metrics=document.querySelector('.operator-v2-page-head + #pageMessage')?.nextElementSibling||document.querySelector('.operator-metric-grid');
if(attention&&metrics&&attention.parentElement===metrics.parentElement)metrics.before(attention);

function rebuildQuickActions(){
  const host=document.getElementById('overviewActions');if(!host)return;
  const allowed=(href)=>Boolean(document.querySelector(`.operator-v2-nav a[href="${CSS.escape(href)}"],.operator-nav-menu-popup a[href="${CSS.escape(href)}"]`));
  const wanted=[
    ['operator-reservations.html','Reservations'],
    ['operator-calendar.html','Rates & availability'],
    ['operator-inbox.html','Inbox'],
    ['operator-dashboard.html?tab=business','Property'],
    ['operator-rates.html#promotions','Promotions'],
    ['operator-analytics.html','Analytics']
  ].filter(([href])=>allowed(href));
  const signature=wanted.map(([href])=>href).join('|');
  if(host.dataset.partnerSignature===signature)return;
  host.dataset.partnerSignature=signature;host.replaceChildren();
  wanted.forEach(([href,label],index)=>{const a=document.createElement('a');a.href=href;a.className=`button ${index===0?'aqua':'secondary'}`;a.textContent=label;host.append(a);});
}

rebuildQuickActions();
const quick=document.getElementById('overviewActions');
if(quick)new MutationObserver(rebuildQuickActions).observe(quick,{childList:true});
setTimeout(rebuildQuickActions,250);setTimeout(rebuildQuickActions,900);
