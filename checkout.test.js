const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const Stripe=require('stripe');
const {configuration,validateCart,createCheckout,orderStatus,webhook}=require('./lib/checkout');
const origin='https://figure.example.com';
const config={origin,countries:['US','GB'],allowedSizes:['XS','S','M','L','XL','XXL'],automaticTax:true};
const items=[{id:'001',size:'M',qty:2,price:1}];
const request=(body,site=origin)=>new Request(origin+'/api/checkout',{method:'POST',headers:{'Content-Type':'application/json',origin:site},body:JSON.stringify(body)});
test('server catalog enforces the confirmed set price and every size',()=>{
 for(const size of ['XS','S','M','L','XL','XXL'])assert.equal(validateCart([{id:'001',size,qty:1,price:1}])[0].price,22000);
 assert.deepEqual(require('./lib/shipping-countries.json'),['US']);
});
test('invalid products, sizes, quantities, and duplicate overflow are rejected',()=>{
  for(const value of [[],null,[{id:'nope',size:'M',qty:1}],[{id:'impact-short-set',size:'M',qty:1}],[{id:'linear-set',size:'M',qty:1}],[{id:items[0].id,size:'BAD',qty:1}],[{...items[0],qty:-1}],[{...items[0],qty:1.5}],[{...items[0],qty:21}],[{...items[0],qty:15},{...items[0],qty:10}]])assert.throws(()=>validateCart(value));
});
test('checkout stays closed without configuration and live approval',()=>{
  assert.throws(()=>configuration({}));
  const env={CHECKOUT_ENABLED:'true',STRIPE_SECRET_KEY:'sk_test_mock',STRIPE_WEBHOOK_SECRET:'whsec_mock',SITE_URL:origin};
  assert.equal(configuration(env).automaticTax,true);
  assert.throws(()=>configuration({...env,STRIPE_SECRET_KEY:'sk_live_mock'}));
  assert.equal(configuration({...env,STRIPE_SECRET_KEY:'sk_live_mock',LIVE_CHECKOUT_APPROVED:'true'}).live,true);
});
test('session creation includes sizes, fixed shipping, return links and stable retry parameters',async()=>{
  const calls=[];const client={checkout:{sessions:{create:async(params,options)=>{calls.push({params,options});return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
  const body={items,requestId:'request-1234567890123456'};
  assert.equal((await createCheckout(request(body),client,config)).status,200);
  assert.equal((await createCheckout(request(body),client,config)).status,200);
  assert.deepEqual(calls[0],calls[1]);
  const p=calls[0].params;
  assert.equal(p.line_items[0].price_data.unit_amount,22000);
  assert.equal(p.line_items[0].price_data.product_data.metadata.size,'M');
  assert.equal(p.line_items[0].price_data.product_data.name,'FIGURE 001 - Top & Bottom Set');
  assert.equal(p.line_items[0].price_data.product_data.description,'Size M. Top and bottom included.');

  assert.equal(p.shipping_options[0].shipping_rate_data.fixed_amount.amount,1000);
  assert.ok(p.success_url.includes('{CHECKOUT_SESSION_ID}'));
  assert.equal((await createCheckout(request(body,'https://other.example'),client,config)).status,403);
  assert.equal((await createCheckout(request({items:[],requestId:body.requestId}),client,config)).status,400);
  assert.equal(calls.length,2);
});
test('order status only confirms completed paid Stripe sessions and does not expose customer details',async()=>{
  const url=new Request(origin+'/api/order?session_id=cs_test_123456789012');
  for(const [status,payment_status,paid] of [['open','unpaid',false],['complete','unpaid',false],['complete','paid',true]]){
    const client={checkout:{sessions:{retrieve:async()=>({status,payment_status,metadata:{store:'figure',order_reference:'FIGURE-ABC'},customer_details:{email:'private@example.com'},amount_total:41000,currency:'usd',livemode:false})}}};
    const result=await (await orderStatus(url,client)).json();assert.equal(result.paid,paid);assert.ok(!JSON.stringify(result).includes('private@example.com'));
  }
});
test('signed webhook persists verification, is safe to retry, and rejects forged events',async()=>{
  const sdk=new Stripe('sk_test_mock');const calls=[];
  const client={webhooks:sdk.webhooks,paymentIntents:{update:async(...args)=>calls.push(args)}};
  const event={type:'checkout.session.completed',data:{object:{id:'cs_test_123456789012',payment_status:'paid',payment_intent:'pi_mock',metadata:{store:'figure'}}}};
  const payload=JSON.stringify(event),secret='whsec_test_secret';
  const signature=sdk.webhooks.generateTestHeaderString({payload,secret});
  const req=sig=>new Request(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':sig},body:payload});
  assert.equal((await webhook(req('invalid'),client,secret)).status,400);assert.equal(calls.length,0);
  assert.equal((await webhook(req(signature),client,secret)).status,200);
  assert.equal((await webhook(req(signature),client,secret)).status,200);
  assert.deepEqual(calls[0],calls[1]);assert.equal(calls[0][1].metadata.figure_payment_verified,'true');
  event.data.object.payment_status='unpaid';const unpaid=JSON.stringify(event);
  await webhook(new Request(origin+'/api/stripe-webhook',{method:'POST',headers:{'stripe-signature':sdk.webhooks.generateTestHeaderString({payload:unpaid,secret})},body:unpaid}),client,secret);
  assert.equal(calls.length,2);
});
test('unconfigured deployed endpoint responds gracefully',async()=>{
  const handler=(await import('./api/checkout.mjs')).default;
  const previous=process.env.CHECKOUT_ENABLED;delete process.env.CHECKOUT_ENABLED;
  try{assert.equal((await handler.fetch(request({items}))).status,503);}finally{if(previous!==undefined)process.env.CHECKOUT_ENABLED=previous;}
});

test('public price, allowed country, and status endpoint agree with server catalog',async()=>{
 const context={window:{}};vm.runInNewContext(fs.readFileSync('public/commerce-config.js','utf8'),context);
 assert.equal(context.window.FIGURE_COMMERCE.products['001'].price,require('./lib/catalog.json')[0].price);
 const handler=(await import('./api/checkout-status.mjs')).default;
 const previous=process.env.CHECKOUT_ENABLED;delete process.env.CHECKOUT_ENABLED;
 try{const response=await handler.fetch(new Request(origin+'/api/checkout-status'));const status=await response.json();assert.equal(status.enabled,false);assert.equal(status.shipping,1000);assert.deepEqual(status.countries,['US']);assert.ok(!JSON.stringify(status).includes('sk_'));}finally{if(previous!==undefined)process.env.CHECKOUT_ENABLED=previous;}
});

test('verified payment removes only purchased quantities, once; unpaid order preserves bag',async()=>{
 const elements=new Map(),storage=new Map([['figure-pending-cs_test_123456789012',JSON.stringify([{id:'001',size:'XXL',qty:2}])]]);let paid=false;
 const context=vm.createContext({URL,URLSearchParams,JSON,location:{hash:'#/order?session_id=cs_test_123456789012'},document:{addEventListener(){},querySelector(s){if(!elements.has(s))elements.set(s,{});return elements.get(s);}},sessionStorage:{getItem:k=>storage.get(k),removeItem:k=>storage.delete(k)},bag:[{id:'001',size:'XXL',qty:3},{id:'001',size:'XS',qty:1}],validBag:value=>value,save(){},fetch:async()=>({ok:true,json:async()=>({paid,reference:'FIGURE-ABC'})})});
 vm.runInContext(fs.readFileSync('public/checkout-ui.js','utf8'),context);
 await vm.runInContext('verifyOrder()',context);assert.equal(context.bag[0].qty,3);assert.equal(storage.size,1);
 paid=true;await vm.runInContext('verifyOrder()',context);await vm.runInContext('verifyOrder()',context);
 assert.equal(context.bag[0].qty,1);assert.equal(context.bag[1].qty,1);assert.equal(storage.size,0);
});

test('confirmed products are purchasable; unknown designs cannot be charged',()=>{
 assert.equal(validateCart([{id:'002',size:'M',qty:1}])[0].price,22000);
 assert.equal(validateCart([{id:'003',size:'M',qty:1}])[0].price,20000);
 assert.throws(()=>validateCart([{id:'007',size:'M',qty:1}]));
});
test('mixed-product checkout uses catalog prices and one shipping charge',async()=>{
 const products=require('./lib/catalog.json'),second=products.find(p=>p.id==='002');const old=second.price;second.price=12345;
 try{
  let params;const client={checkout:{sessions:{create:async p=>{params=p;return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
  const body={items:[{id:'001',size:'XXL',qty:2},{id:'002',size:'XS',qty:1,price:1}],requestId:'mixed-products-123456789012'};
  const response=await createCheckout(request(body),client,config);assert.equal(response.status,200);
  assert.equal(params.line_items.length,2);assert.equal(params.line_items[1].price_data.unit_amount,12345);
  assert.equal(params.line_items[1].price_data.product_data.metadata.product_id,'002');assert.equal(params.line_items[1].price_data.product_data.metadata.size,'XS');
  assert.equal(params.shipping_options.length,1);assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount,1000);
 }finally{second.price=old;}
});
test('every photographic view exists and catalog sync preserves product 002',()=>{
 const products=require('./lib/catalog.json');for(const p of products)for(const [view] of p.photos||[])assert.ok(fs.existsSync(`public/assets/${p.id}/${view}.png`));
 const context={window:{}};vm.runInNewContext(fs.readFileSync('public/commerce-config.js','utf8'),context);
 const product=context.window.FIGURE_CATALOG.find(p=>p.id==='002');assert.equal(product.photos.length,4);assert.equal(product.concept,false);assert.equal(context.window.FIGURE_COMMERCE.products['002'].price,22000);
 assert.ok(!fs.readFileSync('public/app.js','utf8').includes("line.id==='001'"));
});

test('all confirmed sets use top and bottom terminology in checkout',async()=>{
 const products=require('./lib/catalog.json');for(const id of ['001','002','003','004'])for(const size of ['XS','S','M','L','XL','XXL']){
 let params;const client={checkout:{sessions:{create:async p=>{params=p;return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
 await createCheckout(request({items:[{id,size,qty:1}],requestId:'terminology-test-123456789012'}),client,config);
 const data=params.line_items[0].price_data;assert.equal(data.unit_amount,['003','004'].includes(id)?20000:22000);assert.ok(data.product_data.name.includes('Top & Bottom Set'));assert.equal(data.product_data.description,`Size ${size}. Top and bottom included.`);
 }
 assert.ok(!/jacket|trouser/i.test(JSON.stringify(products)));
});

test('all three products share one shipping charge and preserve independent prices',async()=>{
 let params;const client={checkout:{sessions:{create:async p=>{params=p;return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
 const items=[{id:'001',size:'XS',qty:1},{id:'002',size:'M',qty:1},{id:'003',size:'XXL',qty:1,price:1}];
 assert.equal((await createCheckout(request({items,requestId:'three-products-123456789012'}),client,config)).status,200);
 assert.deepEqual(params.line_items.map(x=>x.price_data.unit_amount),[22000,22000,20000]);
 assert.equal(params.line_items.reduce((sum,x)=>sum+x.quantity*x.price_data.unit_amount,0)+params.shipping_options[0].shipping_rate_data.fixed_amount.amount,65000);
 assert.equal(params.line_items[2].price_data.product_data.images[0],origin+'/assets/003/cover-white.png');
});

test('product 004 uses the confirmed price and photos in mixed checkout',async()=>{
 let params;const client={checkout:{sessions:{create:async p=>{params=p;return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
 const items=[{id:'001',size:'M',qty:1},{id:'004',size:'XXL',qty:2,price:1}];
 assert.equal((await createCheckout(request({items,requestId:'fourth-product-123456789012'}),client,config)).status,200);
 const line=params.line_items.find(x=>x.price_data.product_data.metadata.product_id==='004');
 assert.equal(line.price_data.unit_amount,20000);assert.equal(line.quantity,2);assert.equal(line.price_data.product_data.images[0],origin+'/assets/004/cover-white.png');
 assert.equal(params.shipping_options.length,1);assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount,1000);
});

test('product 005 supports every size at $150 and combines with other products',async()=>{
 for(const size of ['XS','S','M','L','XL','XXL'])assert.equal(validateCart([{id:'005',size,qty:1,price:1}])[0].price,15000);
 let params;const client={checkout:{sessions:{create:async p=>{params=p;return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
 const items=[{id:'001',size:'M',qty:1},{id:'005',size:'XXL',qty:2}];
 assert.equal((await createCheckout(request({items,requestId:'fifth-product-123456789012'}),client,config)).status,200);
 const line=params.line_items.find(x=>x.price_data.product_data.metadata.product_id==='005');assert.equal(line.price_data.unit_amount,15000);assert.equal(line.quantity,2);
 assert.equal(line.price_data.product_data.description,'Size XXL. Top and bottom included.');assert.equal(line.price_data.product_data.images[0],origin+'/assets/005/cover-white.png');
 assert.equal(params.shipping_options.length,1);assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount,1000);
});

test('product 006 gallery is complete and pricing stays authoritative',()=>{
 const p=require('./lib/catalog.json').find(p=>p.id==='006');assert.equal(p.photos.length,4);assert.equal(p.concept,false);
 for(const [view] of p.photos)assert.ok(fs.existsSync(`public/assets/006/${view}.png`));
 if(p.price===null)assert.throws(()=>validateCart([{id:'006',size:'M',qty:1,price:1}]));
 else for(const size of ['XS','S','M','L','XL','XXL'])assert.equal(validateCart([{id:'006',size,qty:1,price:1}])[0].price,p.price);
});

test('product 006 charges $240 with correct included items and one shipping rate',async()=>{
 let params;const client={checkout:{sessions:{create:async p=>{params=p;return {id:'cs_test_123456789012',url:'https://checkout.stripe.com/c/pay/test'};}}}};
 const items=[{id:'005',size:'S',qty:1},{id:'006',size:'XXL',qty:2,price:1}];
 assert.equal((await createCheckout(request({items,requestId:'sixth-product-123456789012'}),client,config)).status,200);
 const line=params.line_items.find(x=>x.price_data.product_data.metadata.product_id==='006');assert.equal(line.price_data.unit_amount,24000);assert.equal(line.quantity,2);assert.equal(line.price_data.product_data.description,'Size XXL. Top and bottom included.');assert.equal(line.price_data.product_data.images[0],origin+'/assets/006/cover-white.png');assert.equal(params.shipping_options.length,1);assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount,1000);
});

test('homepage framing gives every model the same full-body span without distorting photos',()=>{
 const context=vm.createContext({});const source=fs.readFileSync('public/app.js','utf8');vm.runInContext(source.slice(source.indexOf('function tileFraming('),source.indexOf('function renderTiles(')),context);
 for(const product of require('./lib/catalog.json')){
 const style=context.tileFraming(product);const height=Number(style.match(/--tile-image-height:([\d.]+)%/)[1])/100;const top=Number(style.match(/--tile-image-top:([-\d.]+)%/)[1])/100;
 assert.ok(Math.abs(top+product.tileFraming.top*height-.05)<.00001);assert.ok(Math.abs(top+product.tileFraming.bottom*height-.95)<.00001);
 }
 assert.equal(context.tileFraming({}), '');
 const css=fs.readFileSync('public/style.css','utf8');assert.ok(css.includes('.products .photographic .art img{inset:auto;'));assert.ok(css.includes('width:auto;height:var(--tile-image-height,100%)'));
});

test('every product uses the cleaned cover and retains its original source',()=>{
 for(const product of require('./lib/catalog.json')){
 assert.equal(product.image,`assets/${product.id}/cover-white.png`);assert.equal(product.photos[0][0],'cover-white');
 assert.ok(fs.existsSync('public/'+product.image));assert.ok(fs.existsSync('public/'+product.originalCoverImage));
 }
});
