(function(){
 const key='figure-theme';
 const root=document.documentElement;
 function apply(theme){
  root.dataset.theme=theme==='light'?'light':'dark';
  const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content=theme==='light'?'#ffffff':'#000000';
  const button=document.querySelector('#theme-toggle');if(button){button.textContent=theme==='light'?'View black theme':'View white theme';button.setAttribute('aria-pressed',String(theme==='light'));}
 }
 let theme='dark';try{theme=localStorage.getItem(key)==='light'?'light':'dark';}catch{}
 const requested=new URLSearchParams(location.search).get('theme');if(requested==='light'||requested==='dark')theme=requested;
 apply(theme);
 document.addEventListener('DOMContentLoaded',function(){
  apply(root.dataset.theme);
  document.querySelector('#theme-toggle').addEventListener('click',function(){
   const next=root.dataset.theme==='light'?'dark':'light';apply(next);try{localStorage.setItem(key,next);}catch{}
   const url=new URL(location.href);url.searchParams.delete('theme');history.replaceState(null,'',url.pathname+url.search+url.hash);
  });
 });
})();
