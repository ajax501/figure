let checkoutAttempt=null;
async function beginCheckout(){
 const button=document.querySelector('#stripe-checkout'),result=document.querySelector('#checkout-result');
 if(!bag.length||!button||button.disabled)return;
 button.disabled=true;button.textContent='OPENING SECURE CHECKOUT…';result.textContent='';
 const snapshot=bag.map(({id,size,qty})=>({id,size,qty}));const fingerprint=JSON.stringify(snapshot);
 if(checkoutAttempt?.fingerprint!==fingerprint)checkoutAttempt={fingerprint,requestId:crypto.randomUUID()};
 try{
  const response=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:snapshot,requestId:checkoutAttempt.requestId})});
  const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to open checkout.');
  const target=new URL(data.url);if(target.protocol!=='https:'||target.hostname!=='checkout.stripe.com')throw Error('Unable to open secure checkout.');
  try{sessionStorage.setItem('figure-pending-'+data.id,JSON.stringify(snapshot));}catch{}
  location.assign(target.href);
 }catch(error){result.textContent=error.message||'Unable to connect. Please try again.';button.disabled=false;button.textContent='PAY WITH STRIPE';}
}
async function checkCheckoutReady(){
 const button=document.querySelector('#stripe-checkout'),result=document.querySelector('#checkout-result');if(!button)return;
 try{const response=await fetch('/api/checkout-status',{cache:'no-store'});if(!response.ok)throw Error();const data=await response.json();if(!document.contains(button))return;
  button.disabled=!data.enabled;button.textContent=data.enabled?(data.test?'OPEN TEST CHECKOUT':'PAY WITH STRIPE'):'CHECKOUT COMING SOON';
  result.textContent=data.enabled?(data.test?'Test mode. No real payment will be taken.':'Secure payment with Stripe.'):'Purchasing is not open yet. Your bag stays saved.';
 }catch{if(document.contains(button)){button.disabled=true;button.textContent='CHECKOUT UNAVAILABLE';result.textContent='Payment is temporarily unavailable. Your bag stays saved.';}}
}
function orderPage(){shell('YOUR ORDER','<div class="empty-store"><p id="order-status" role="status" aria-live="polite">Checking payment status…</p><p id="order-reference"></p><button class="primary" id="refresh-order">CHECK AGAIN</button><p><a href="#collection">CONTINUE SHOPPING →</a></p></div>');verifyOrder();}
async function verifyOrder(){
 const id=new URLSearchParams(location.hash.split('?')[1]||'').get('session_id');const element=document.querySelector('#order-status');if(!element)return;
 if(!/^cs_(test_|live_)?[A-Za-z0-9]{12,200}$/.test(id||'')){element.textContent='No valid order reference was provided.';return;}
 const button=document.querySelector('#refresh-order');button.disabled=true;
 try{
  const response=await fetch('/api/order?session_id='+encodeURIComponent(id),{cache:'no-store'});const data=await response.json();if(!response.ok)throw Error(data.error||'Unable to verify payment.');
  if(!location.hash.startsWith('#/order'))return;
  element.textContent=data.paid?(data.test?'Test payment successful. No real payment was taken.':'Payment received. Thank you for your order.'):(data.status==='expired'?'This checkout expired. Your bag is still saved.':'Payment is not confirmed yet. Check again before starting another payment.');
  document.querySelector('#order-reference').textContent=data.reference?'Order reference: '+data.reference:'';
  if(data.paid){try{const key='figure-pending-'+id;const purchased=validBag(JSON.parse(sessionStorage.getItem(key)||'[]'));for(const item of purchased){const current=bag.find(x=>x.id===item.id&&x.size===item.size);if(current)current.qty=Math.max(0,current.qty-item.qty);}bag=bag.filter(x=>x.qty>0);save();sessionStorage.removeItem(key);}catch{}button.hidden=true;}
 }catch(error){if(location.hash.startsWith('#/order'))element.textContent=error.message||'Unable to verify payment.';}finally{button.disabled=false;}
}
document.addEventListener('click',event=>{if(event.target.closest('#stripe-checkout'))beginCheckout();if(event.target.closest('#refresh-order'))verifyOrder();});
