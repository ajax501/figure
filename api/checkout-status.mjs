import checkout from '../lib/checkout.js';
export default {async fetch(request){
 if(request.method!=='GET')return checkout.json({error:'Method not allowed.'},405);
 try{const config=checkout.configuration();return checkout.json({enabled:true,test:!config.live,shipping:1000,currency:'usd',countries:['US']});}
 catch{return checkout.json({enabled:false,shipping:1000,currency:'usd',countries:['US']});}
}};
