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
  const key=`halo.warehouse.${warehouse}.session`;
  let token=sessionStorage.getItem(key)||'';
  const base=`/api/warehouse/v1/${warehouse}`;
  // Unique URLs also prevent stale fallback from a previously installed sale worker.
  const fresh=path=>base+path+(path.includes('?')?'&':'?')+'_wp_request='+crypto.randomUUID();
  async function call(path,body){
    const res=await fetch(fresh(path),{method:body===undefined?'GET':'POST',cache:'no-store',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await res.json().catch(()=>({error:'Máy chủ chưa sẵn sàng. Vui lòng thử lại.'}));
    if(!res.ok){if(res.status===401&&path!=='/login'){clear();onExpired();} throw new Error(data.error||'Chưa thể xử lý yêu cầu.');}return data;
  }
  function clear(){token='';sessionStorage.removeItem(key);void wipePortalCaches().catch(()=>{});}
  return {call,hasSession:()=>!!token,clear,async login(email,password){await wipePortalCaches();const result=await call('/login',{email,password});token=result.token;sessionStorage.setItem(key,token);return result.profile;},async logout(){try{await call('/logout',{});}finally{clear();await wipePortalCaches();}},async download(from,to){
    const res=await fetch(fresh(`/report.xlsx?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`),{cache:'no-store',headers:{Authorization:`Bearer ${token}`}});
    if(!res.ok)throw new Error('Chưa xuất được báo cáo. Hãy kiểm tra phiên đăng nhập.');
    const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download=`${warehouse}-${from}-${to}.xlsx`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }};
}
