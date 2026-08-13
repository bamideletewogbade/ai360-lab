/**
 * Runs before application chunks. If a rolling/self-hosted deployment leaves
 * the HTML and chunk set out of sync, retry once with a cache-busting URL and
 * then replace the indefinite loader with a usable recovery screen.
 */
export const ASSET_RECOVERY_SCRIPT = String.raw`
(function(){
  var key='ai360:asset-recovery:'+location.pathname;
  var patterns=/ChunkLoadError|Failed to load chunk|Loading chunk .* failed|dynamically imported module/i;
  function message(value){
    if(!value)return '';
    if(typeof value==='string')return value;
    return String(value.message||value.reason&&value.reason.message||value.reason||value);
  }
  function recoveryScreen(){
    function draw(){
      if(!document.body)return;
      document.body.innerHTML='<main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#f7f6f2;color:#101112;font-family:Arial,sans-serif"><section style="max-width:540px;padding:34px;border:1px solid #d8d4cc;border-radius:18px;background:white;box-shadow:0 22px 70px rgba(16,17,18,.09);text-align:center"><div style="margin:auto auto 18px;width:54px;height:54px;display:grid;place-items:center;border-radius:15px;background:#101112;color:white;font-weight:800">AI</div><h1 style="margin:0 0 10px;font-size:26px">The workspace needs a fresh copy</h1><p style="margin:0 auto 22px;color:#64676b;line-height:1.55">A new version was deployed while this page was open. Your saved work is safe.</p><button id="ai360-reload" style="padding:12px 20px;border:0;border-radius:10px;background:#101112;color:white;font-weight:700;cursor:pointer">Reload workspace</button><p style="margin:17px 0 0;font-size:12px"><a href="/" style="color:#64676b">Go to AI360 home</a></p></section></main>';
      document.getElementById('ai360-reload').onclick=function(){
        try{sessionStorage.removeItem(key)}catch(_){}
        var url=new URL(location.href);url.searchParams.set('_fresh',Date.now());location.replace(url.toString());
      };
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',draw,{once:true});else draw();
  }
  function recover(value){
    if(!patterns.test(message(value)))return;
    var previous=0;
    try{previous=Number(sessionStorage.getItem(key)||0)}catch(_){}
    if(!previous||Date.now()-previous>300000){
      try{sessionStorage.setItem(key,String(Date.now()))}catch(_){}
      var url=new URL(location.href);url.searchParams.set('_fresh',Date.now());location.replace(url.toString());
      return;
    }
    recoveryScreen();
  }
  addEventListener('error',function(event){
    var target=event.target;
    if(target&&target.tagName==='SCRIPT'&&/\/_next\/static\/.*\.js/i.test(target.src||'')){
      recover('ChunkLoadError');
      return;
    }
    recover(event.error||event.message);
  },true);
  addEventListener('unhandledrejection',function(event){recover(event.reason)});
})();`
