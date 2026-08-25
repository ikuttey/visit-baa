// Shared operator header/layout bootstrap. The actual operations navigation is
// rendered by operator-shell.js. This module keeps right-side account controls
// separated and loads the common partner-workspace styles on every V2 page.

function ensureStyle(href,key){if(document.querySelector(`link[data-${key}]`))return;const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset[key]='1';document.head.append(link);}
ensureStyle('assets/css/operator-partner-extranet.css?v=2','operatorPartnerStyle');
ensureStyle('assets/css/operator-audit-fixes-v2.css?v=1','operatorAuditStyle');

if (!document.getElementById('operatorHeaderLayoutV4Styles')) {
  const style = document.createElement('style');
  style.id = 'operatorHeaderLayoutV4Styles';
  style.textContent = `
    .app-header .app-header-inner{min-width:0}
    .app-header .app-nav{min-width:0;flex:1 1 auto;justify-content:flex-end}
    .app-header .operator-notification-center,
    .app-header .operator-account-link,
    .app-header #logoutButton{position:relative;z-index:4;flex:0 0 auto}
    .app-header .operator-notification-center{margin-left:2px}
    @media(max-width:760px){
      .app-header .app-header-inner{gap:7px}
      .app-header .app-nav{gap:3px}
      .app-header .operator-notification-toggle{padding-inline:8px}
    }
  `;
  document.head.append(style);
}

if(document.body?.dataset?.operatorPage==='rates'){
  queueMicrotask(()=>import('./operator-rates-anchor-v2.js?v=1').catch((error)=>console.error('Promotions anchor failed:',error)));
}
