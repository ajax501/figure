/* FIGURE uses the selected black theme, including previously saved white previews. */
(function(){
 document.documentElement.dataset.theme='dark';
 const meta=document.querySelector('meta[name="theme-color"]');if(meta)meta.content='#000000';
 try{localStorage.removeItem('figure-theme');}catch{}
 const url=new URL(location.href);if(url.searchParams.has('theme')){url.searchParams.delete('theme');history.replaceState(null,'',url.pathname+url.search+url.hash);}
})();
