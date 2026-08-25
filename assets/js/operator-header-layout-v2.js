// Shared operator header/layout bootstrap. Final partner styles are imported by
// operator-v2.css so the page does not flash from the old layout to the final layout.

if(!document.getElementById('operatorHeaderLayoutV5Styles')){
  const style=document.createElement('style');
  style.id='operatorHeaderLayoutV5Styles';
  style.textContent=`
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

if(document.body?.dataset?.operatorPage==='rates')queueMicrotask(()=>import('./operator-rates-anchor-v2.js?v=1').catch((error)=>console.error('Promotions anchor failed:',error)));
