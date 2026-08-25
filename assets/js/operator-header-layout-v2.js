// Keep the operator workspace navigation and right-side controls in separate
// flex regions. The navigation may scroll horizontally, but it must never slide
// underneath the notification or logout controls.
if (!document.getElementById('operatorHeaderLayoutV2Styles')) {
  const style = document.createElement('style');
  style.id = 'operatorHeaderLayoutV2Styles';
  style.textContent = `
    .app-header .app-header-inner{min-width:0}
    .app-header .app-nav{min-width:0;flex:1 1 auto;justify-content:flex-end}
    .app-header .operator-v2-nav{flex:1 1 auto;min-width:0;max-width:100%;overflow-x:auto;overflow-y:hidden;scroll-padding-inline-end:16px;padding-right:8px}
    .app-header .operator-notification-center,.app-header #logoutButton{position:relative;z-index:3;flex:0 0 auto}
    .app-header .operator-notification-center{margin-left:2px}
    @media(max-width:900px){
      .app-header .app-header-inner{gap:10px}
      .app-header .app-nav{gap:7px}
      .app-header .operator-v2-nav{padding-right:5px}
    }
    @media(max-width:620px){
      .app-header .operator-v2-nav{max-width:calc(100vw - 170px)}
      .app-header .operator-notification-toggle{padding-inline:9px}
    }
  `;
  document.head.append(style);
}
