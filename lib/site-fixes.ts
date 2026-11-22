// Reparații automate pentru site-urile generate, adăugate la servire (demo /p/ și site-ul final):
// 1. localStorage/sessionStorage sigure: în demo (iframe sandbox) accesul aruncă eroare și oprea scripturile
//    site-ului, iar secțiunile animate „la scroll” rămâneau invizibile (spațiu mare gol).
// 2. Conținut rămas invizibil: dacă un element ajuns pe ecran tot e transparent după 1,2 s, îl afișăm.
// 3. Antetul fix stă deasupra conținutului (titlurile nu mai trec peste meniu) și are fundal opac.

const HEAD = `<script data-site-fix>(function(){try{window.localStorage.getItem('x')}catch(e){var m={},s={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null},setItem:function(k,v){m[k]=String(v)},removeItem:function(k){delete m[k]},clear:function(){m={}},key:function(i){return Object.keys(m)[i]||null},get length(){return Object.keys(m).length}};try{Object.defineProperty(window,'localStorage',{value:s,configurable:true});Object.defineProperty(window,'sessionStorage',{value:s,configurable:true})}catch(_){}}})()</script>`

const BODY = `<script data-site-fix>(function(){
function header(){var h=document.querySelector('header')||document.querySelector('nav');if(!h)return;var c=getComputedStyle(h);if(c.position==='fixed'||c.position==='sticky'){h.style.setProperty('z-index','2147483000','important');if(c.backgroundColor==='rgba(0, 0, 0, 0)'||c.backgroundColor==='transparent'){var b=getComputedStyle(document.body).backgroundColor;h.style.setProperty('background-color',b&&b!=='rgba(0, 0, 0, 0)'?b:'#fff','important')}}}
function reveal(){var vh=window.innerHeight;var els=document.querySelectorAll('main *, section *, section, article, footer *');for(var i=0;i<els.length;i++){var el=els[i];if(el.closest('header,nav,dialog,[hidden],[aria-hidden="true"],#concept-banner'))continue;var r=el.getBoundingClientRect();if(r.top>vh*0.9||r.bottom<0||r.height===0)continue;var c=getComputedStyle(el);if(c.position==='fixed'||c.position==='absolute'||c.display==='none')continue;if(parseFloat(c.opacity)<0.05||c.visibility==='hidden'){if(!(el.textContent||'').trim()&&!el.querySelector('img,video,picture,svg'))continue;el.style.setProperty('opacity','1','important');el.style.setProperty('visibility','visible','important');el.style.setProperty('transform','none','important');el.style.setProperty('filter','none','important')}}}
var t;function later(){clearTimeout(t);t=setTimeout(reveal,1200)}
window.addEventListener('scroll',later,{passive:true});window.addEventListener('resize',later);
window.addEventListener('load',function(){header();setTimeout(reveal,1500)});setTimeout(function(){header();reveal()},3500);
})()</script>`

export function withSiteFixes(html: string): string {
  if (html.includes('data-site-fix')) return html
  let out = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, m => `${m}\n${HEAD}`) : HEAD + html
  out = /<\/body>/i.test(out) ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${BODY}\n</body>`) : out + BODY
  return out
}
