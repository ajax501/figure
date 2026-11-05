const fs=require('node:fs');
const products=require('./lib/catalog.json');
const ids=new Set();for(const p of products){if(!/^\d{3}$/.test(p.id)||ids.has(p.id))throw Error('Invalid or duplicate product ID');ids.add(p.id);if(p.price!==null&&(!Number.isInteger(p.price)||p.price<=0))throw Error('Invalid product price');for(const [view] of p.photos||[])if(!fs.existsSync(`public/assets/${p.id}/${view}.png`))throw Error('Missing product image');}
const config={currency:'USD',products:Object.fromEntries(products.map(p=>[p.id,{price:p.price}]))};
fs.writeFileSync('public/commerce-config.js','/* Generated from lib/catalog.json by sync-catalog.js. */\nwindow.FIGURE_CATALOG = '+JSON.stringify(products)+';\nwindow.FIGURE_COMMERCE = '+JSON.stringify(config)+';\n');
console.log('Synced storefront and checkout catalog: '+products.map(p=>p.id).join(', '));
