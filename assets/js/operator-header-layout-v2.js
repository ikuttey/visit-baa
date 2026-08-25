// Shared operator header/layout bootstrap. The actual operations navigation is
// rendered by operator-shell.js. This module keeps right-side account controls
// separated and loads the common partner-workspace stylesheet on every V2 page.

if (!document.querySelector('link[data-operator-partner-style]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/css/operator-partner-extranet.css?v=1';
  link.dataset.operatorPartnerStyle = '1';
  document.head.append(link);
}

if (!document.getElementById('operatorHeaderLayoutV3Styles')) {
  const style = document.createElement('style');
  style.id = 'operatorHeaderLayoutV3Styles';
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
