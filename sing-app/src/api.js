async function wipePortalCaches(){
  if(!('caches' in window))return;
  for(const name of await caches.keys()){
    const cache=await caches.open(name);
    for(const request of await cache.keys()){
      const url=new URL(request.url);
      if(url.origin===location.origin&&url.pathname.startsWith('/api/warehouse/'))await cache.delete(request);
    }
  }
}
export function warehouseApi(warehouse,onExpired){
  const key=`halo.warehouse.${warehouse}.session.v2`, pref=`halo.warehouse.${warehouse}.remember`;
  const active=()=>document.cookie.split(';').map(s=>s.trim()).find(s=>s.startsWith('wp_active='))?.slice(10)||'';
  let token=localStorage.getItem(key)||sessionStorage.getItem(key)||'';
  if(token&&active()!==warehouse){token='';localStorage.removeItem(key);sessionStorage.removeItem(key);}
  const base=`/api/warehouse/v1/${warehouse}`;
  // Unique URLs also prevent stale fallback from a previously installed sale worker.
  const fresh=path=>base+path+(path.includes('?')?'&':'?')+'_wp_request='+crypto.randomUUID();
  async function call(path,body){
    if(path!=='/login'&&token&&active()!==warehouse){clear();onExpired('Bạn đã đăng nhập kho khác hoặc phiên kho đã hết hạn.');throw new Error('Hãy đăng nhập lại đúng kho cần thao tác.');}
    const usedToken=token;
    const res=await fetch(fresh(path),{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await res.json().catch(()=>({error:'Máy chủ chưa sẵn sàng. Vui lòng thử lại.'}));
    if(!res.ok){if(res.status===401&&path!=='/login'&&token===usedToken){clear();onExpired();} throw new Error(data.error||'Chưa thể xử lý yêu cầu.');}
    if(path!=='/login'&&usedToken!==token)throw new Error('Phiên kho đã thay đổi. Hãy đăng nhập lại.');
    return data;
  }
  function clear(){token='';sessionStorage.removeItem(key);localStorage.removeItem(key);sessionStorage.removeItem(`halo.warehouse.${warehouse}.session`);void wipePortalCaches().catch(()=>{});}
  function preferences(){try{return JSON.parse(localStorage.getItem(pref)||'{"remember":true,"email":""}');}catch{return {remember:true,email:''};}}
  function rememberInfo(remember,email){localStorage.setItem(pref,JSON.stringify({remember,email:remember?email:''}));if(!remember)localStorage.removeItem(key);}
  const check=()=>{if(token&&active()!==warehouse){clear();onExpired('Đã tự đăng xuất vì trình duyệt đang chuyển sang kho khác hoặc phiên đã hết hạn.');}};
  const timer=setInterval(check,1000);
  const verify=()=>{check();if(token)void call('/profile').catch(()=>{});};
  const heartbeat=setInterval(verify,15000);
  window.addEventListener('focus',verify);
  return {call,hasSession:()=>!!token,clear,preferences,rememberInfo,dispose(){clearInterval(timer);clearInterval(heartbeat);window.removeEventListener('focus',verify);},async login(email,password,remember=true){await wipePortalCaches();const result=await call('/login',{email,password});clear();token=result.token;rememberInfo(remember,email);(remember?localStorage:sessionStorage).setItem(key,token);return result.profile;},async logout(){try{await call('/logout',{});}finally{clear();await wipePortalCaches();}},async download(from,to){
    check();if(!token)throw new Error('Hãy đăng nhập lại đúng kho để xuất báo cáo.');
    const res=await fetch(fresh(`/report.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
    if(!res.ok)throw new Error('Chưa xuất được báo cáo. Hãy kiểm tra phiên đăng nhập.');
    const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=`${warehouse}-${from}-${to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }};
}
