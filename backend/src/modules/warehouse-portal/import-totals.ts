const fail=(message:string):never=>{throw Object.assign(new Error(message),{statusCode:400});};
const money=(value:unknown,label:string):number=>{
  const n=value===undefined?0:value;
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<0||n>1e12)fail(`${label} không hợp lệ.`);
  return n as number;
};
export function importTotals(goodsMinor:number,raw:any={}){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('Thông tin phiếu nhập không hợp lệ.');
  money(goodsMinor,'Giá trị hàng');
  const shippingMinor=money(raw.shippingMinor,'Phí vận chuyển'),depositMinor=money(raw.depositMinor,'Đặt cọc');
  const discountType=raw.discountType??'amount',discountValue=raw.discountValue??0,vatRate=raw.vatRate??0;
  if(!['amount','percent'].includes(discountType))fail('Loại chiết khấu không hợp lệ.');
  let discountMinor:number;
  if(discountType==='percent'){
    if(typeof discountValue!=='number'||!Number.isFinite(discountValue)||discountValue<0||discountValue>100||Math.abs(discountValue*100-Math.round(discountValue*100))>1e-7)fail('Chiết khấu phải từ 0 đến 100%, tối đa 2 số thập phân.');
    discountMinor=Number((BigInt(goodsMinor)*BigInt(Math.round(discountValue*100))+5000n)/10000n);
  }else{discountMinor=money(discountValue,'Chiết khấu');}
  if(discountMinor>goodsMinor)fail('Chiết khấu vượt giá trị hàng.');
  if(typeof vatRate!=='number'||!Number.isInteger(vatRate)||vatRate<0||vatRate>100)fail('Thuế suất không hợp lệ.');
  const vatMinor=Number((BigInt(goodsMinor-discountMinor)*BigInt(vatRate)+50n)/100n);
  const grandTotalMinor=money(goodsMinor-discountMinor+shippingMinor+vatMinor,'Tổng tiền');
  if(depositMinor>grandTotalMinor)fail('Đặt cọc vượt tổng tiền phiếu.');
  const invoiceNo=raw.invoiceNo??'';
  if(typeof invoiceNo!=='string'||invoiceNo.trim().length>100)fail('Số hoá đơn NCC không hợp lệ.');
  const supplierId=raw.supplierId??null;
  if(supplierId!==null&&(typeof supplierId!=='string'||!supplierId||supplierId.length>100))fail('Nhà cung cấp không hợp lệ.');
  return {supplierId,invoiceNo:invoiceNo.trim(),goodsMinor,shippingMinor,discountType,discountValue,discountMinor,vatRate,vatMinor,grandTotalMinor,depositMinor,balanceMinor:grandTotalMinor-depositMinor};
}
