const promotions=document.getElementById('promotionsTable')?.closest('.panel');
if(promotions){
  promotions.id='promotions';
  if(location.hash==='#promotions')setTimeout(()=>promotions.scrollIntoView({behavior:'smooth',block:'start'}),120);
}
