const fs=require('node:fs');
fs.mkdirSync('dist',{recursive:true});
fs.cpSync('public','dist',{recursive:true});
console.log('FIGURE static assets ready; Vercel deploys the api/ functions separately.');
