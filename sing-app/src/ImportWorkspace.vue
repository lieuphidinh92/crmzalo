<script setup>
import {computed,onMounted,reactive,ref,watch} from 'vue';
import Icon from './Icon.vue';
import MoneyField from './MoneyField.vue';
const props=defineProps({api:Object,products:Array,documents:Array,profile:Object,creating:Boolean,today:String});
const emit=defineEmits(['update:creating','saved','open']);
const suppliers=ref([]),error=ref(''),busy=ref(false),reviewing=ref(false),query=ref('');
const supplierFilter=ref(''),from=ref(''),to=ref(''),status=ref('');
const addingSupplier=ref(false),supplierName=ref(''),supplierPhone=ref('');
const blank=()=>({requestId:crypto.randomUUID(),counterparty:'',documentDate:props.today,invoiceNo:'',note:'',attachmentUrl:'',currency:'VND',exchangeRate:1,shipping:'',discountType:'amount',discount:'',vatRate:0,deposit:'',lines:[]});
const form=reactive(blank());
watch(()=>props.creating,value=>{if(value){Object.assign(form,blank());reviewing.value=false;error.value='';query.value='';addingSupplier.value=false;}});
const canImport=computed(()=>['admin','operator'].includes(props.profile.role)&&props.profile.seeCost);
const divisor=computed(()=>form.currency==='SGD'?100:1);
const minor=value=>Math.round(Number(value||0)*divisor.value);
const fmt=n=>new Intl.NumberFormat('vi-VN',{maximumFractionDigits:2}).format(Number(n)||0);
const money=(n,currency=form.currency)=>fmt(Number(n)/(currency==='SGD'?100:1))+' '+currency;
const date=s=>s?String(s).slice(0,10).split('-').reverse().join('/'):'—';
const matches=computed(()=>{const q=query.value.trim().toLowerCase();return q?props.products.filter(p=>(p.sku+' '+p.name).toLowerCase().includes(q)).slice(0,12):[];});
const supplierNames=computed(()=>[...new Set([...suppliers.value.map(s=>s.name),...props.documents.filter(d=>d.type==='import').map(d=>d.counterparty)])].sort((a,b)=>a.localeCompare(b,'vi')));
const selectedSupplier=computed(()=>suppliers.value.find(s=>s.name===form.counterparty));
const imports=computed(()=>props.documents.filter(d=>d.type==='import'&&(!status.value||d.status===status.value)&&(!supplierFilter.value||d.counterparty===supplierFilter.value)&&(!from.value||String(d.document_date).slice(0,10)>=from.value)&&(!to.value||String(d.document_date).slice(0,10)<=to.value)));
const goods=computed(()=>form.lines.reduce((sum,l)=>sum+Number(l.quantity||0)*minor(l.cost),0));
const ratio=(amount,rate,scale)=>Number.isSafeInteger(amount)&&amount>=0&&Number.isSafeInteger(rate)&&rate>=0?Number((BigInt(amount)*BigInt(rate)+BigInt(scale/2))/BigInt(scale)):0;
const discount=computed(()=>form.discountType==='percent'?ratio(goods.value,Math.round(Number(form.discount||0)*100),10000):minor(form.discount));
const vat=computed(()=>ratio(goods.value-discount.value,Number(form.vatRate),100));
const total=computed(()=>goods.value-discount.value+minor(form.shipping)+vat.value);
const balance=computed(()=>total.value-minor(form.deposit));
const totalQuantity=computed(()=>form.lines.reduce((sum,l)=>sum+Number(l.quantity||0),0));
onMounted(async()=>{if(props.profile.seeCost){try{suppliers.value=(await props.api.call('/suppliers')).suppliers;}catch(e){error.value=e.message;}}});
function add(p){if(form.lines.length>=100){error.value='Mỗi phiếu tối đa 100 dòng hàng.';return;}form.lines.push({key:crypto.randomUUID(),productId:p.id,sku:p.sku,name:p.name,packageSize:p.package_size,quantity:1,cost:'',batchCode:'',manufactureDate:'',expiryDate:''});query.value='';error.value='';}
function back(){if(busy.value)return;if(reviewing.value){reviewing.value=false;return;}if((form.lines.length||form.counterparty)&&!window.confirm('Bỏ thông tin phiếu nhập chưa lưu?'))return;emit('update:creating',false);}
async function saveSupplier(){
  if(busy.value)return;busy.value=true;error.value='';
  try{const s=await props.api.call('/suppliers',{name:supplierName.value,phone:supplierPhone.value});suppliers.value=(await props.api.call('/suppliers')).suppliers;form.counterparty=s.name;addingSupplier.value=false;}
  catch(e){error.value=e.message;}finally{busy.value=false;}
}
function payload(){
  if(!form.counterparty.trim()||!form.lines.length)throw new Error('Nhập nhà cung cấp và thêm ít nhất một sản phẩm.');
  if(form.documentDate>props.today)throw new Error('Ngày nhập không được ở tương lai.');
  if(form.currency==='SGD'&&(!Number.isFinite(Number(form.exchangeRate))||Number(form.exchangeRate)<=0))throw new Error('Nhập tỷ giá SGD hợp lệ.');
  const seen=new Set();
  const lines=form.lines.map(l=>{
    if(!l.batchCode.trim()||!Number.isSafeInteger(Number(l.quantity))||Number(l.quantity)<=0||!Number.isSafeInteger(minor(l.cost))||minor(l.cost)<=0)throw new Error('Mỗi dòng cần số lô thực tế, số lượng nguyên lớn hơn 0 và đơn giá lớn hơn 0.');
    if(l.expiryDate&&l.expiryDate<props.today)throw new Error('Không nhập lô đã hết hạn.');
    if(l.expiryDate&&l.manufactureDate&&l.expiryDate<l.manufactureDate)throw new Error('Hạn dùng không được trước ngày sản xuất.');
    const key=l.productId+':'+l.batchCode.trim();if(seen.has(key))throw new Error('Sản phẩm và lô bị trùng. Hãy gộp số lượng vào cùng một dòng.');seen.add(key);
    return {productId:l.productId,quantity:Number(l.quantity),unitCostMinor:minor(l.cost),batchCode:l.batchCode.trim(),manufactureDate:l.manufactureDate||null,expiryDate:l.expiryDate||null};
  });
  if(!Number.isSafeInteger(goods.value)||goods.value>1e12||discount.value<0||discount.value>goods.value||minor(form.shipping)<0||minor(form.deposit)<0||balance.value<0||total.value>1e12)throw new Error('Kiểm tra chiết khấu, phí vận chuyển và đặt cọc; không được âm hoặc vượt tổng phiếu.');
  if(form.discountType==='percent'&&(Number(form.discount)<0||Number(form.discount)>100))throw new Error('Chiết khấu phải từ 0 đến 100%.');
  return {requestId:form.requestId,type:'import',counterparty:form.counterparty.trim(),documentDate:form.documentDate,note:form.note,attachmentUrl:form.attachmentUrl,currency:form.currency,exchangeRate:Number(form.exchangeRate),lines,
    importDetails:{supplierId:selectedSupplier.value?.id||null,invoiceNo:form.invoiceNo,shippingMinor:minor(form.shipping),discountType:form.discountType,discountValue:form.discountType==='percent'?Number(form.discount||0):minor(form.discount),vatRate:Number(form.vatRate),depositMinor:minor(form.deposit)}};
}
async function submit(){
  if(busy.value)return;error.value='';
  try{const body=payload();if(!reviewing.value){reviewing.value=true;return;}busy.value=true;const result=await props.api.call('/documents',body);emit('update:creating',false);emit('saved',result.id);}
  catch(e){error.value=e.message;}finally{busy.value=false;}
}
</script>

<template>
  <section class="wp-import-workspace">
    <template v-if="!creating">
      <div class="wp-import-heading"><div><h1>Nhập kho</h1><p class="wp-muted">Quản lý phiếu nhập hàng từ nhà cung cấp · SINGAPORE</p></div><button v-if="canImport" class="wp-primary" @click="emit('update:creating',true)"><Icon name="plus"/>Tạo phiếu nhập</button></div>
      <div class="wp-import-card wp-import-filters">
        <div class="wp-import-grid"><label class="wp-supplier-filter"><span class="wp-sr-only">Lọc theo nhà cung cấp</span><select v-model="supplierFilter"><option value="">Tất cả nhà cung cấp</option><option v-for="name in supplierNames" :key="name">{{name}}</option></select></label><label>Từ ngày<input v-model="from" type="date" :max="to||today"></label><label>Đến ngày<input v-model="to" type="date" :min="from" :max="today"></label></div>
        <div class="wp-import-status"><button v-for="[value,label] in [['','Tất cả'],['draft','Nháp'],['confirmed','Đã chốt'],['cancelled','Đã huỷ']]" :key="value" :class="{active:status===value}" :aria-pressed="status===value" @click="status=value">{{label}}</button></div>
      </div>
      <p v-if="from&&to&&from>to" class="wp-error" role="alert">Ngày kết thúc phải từ ngày bắt đầu trở đi.</p>
      <div class="wp-import-list"><button class="wp-import-row" v-for="d in imports" :key="d.id" @click="emit('open',d.id)"><span class="wp-import-row-icon"><Icon name="in"/></span><span class="wp-import-row-info"><small>{{d.code}} <b class="wp-tag" :class="'wp-status-'+d.status">{{d.status==='confirmed'?'Đã chốt':d.status==='draft'?'Nháp':'Đã huỷ'}}</b></small><strong>{{d.counterparty}}</strong><small>{{date(d.document_date)}}</small></span><span class="wp-import-row-total"><strong v-if="profile.seeCost">{{money(d.import_details?.grandTotalMinor??d.goods_total_minor??0,d.currency)}}</strong><strong v-else>{{fmt(d.quantity)}} đơn vị</strong><small>{{profile.seeCost?'TỔNG TIỀN':'SỐ LƯỢNG'}}</small></span><Icon name="arrow"/></button></div>
      <div v-if="!imports.length" class="wp-import-card wp-empty"><Icon name="in"/><h3>Chưa có phiếu nhập phù hợp</h3><p>{{canImport?'Tạo phiếu nhập đầu tiên hoặc thay đổi bộ lọc.':'Tài khoản hiện tại chỉ được xem phiếu.'}}</p></div>
    </template>

    <form v-else @submit.prevent="submit">
      <button type="button" class="wp-text-button wp-import-back" @click="back" :disabled="busy">‹ Phiếu nhập</button>
      <div class="wp-import-heading"><div><h1>{{reviewing?'Xem lại phiếu nhập':'Tạo phiếu nhập'}}</h1><p class="wp-muted">Kho SINGAPORE · {{reviewing?'Kiểm tra thông tin trước khi lưu bản nháp':'Nhập đúng sản phẩm và lô thực tế'}}</p></div><span class="wp-tag">{{reviewing?'BƯỚC 2/2':'BƯỚC 1/2'}}</span></div>
      <div class="wp-context-note"><Icon name="shield"/><span>Kho nhập cố định: <strong>SINGAPORE</strong>. Lưu bản nháp chưa cộng tồn; chốt phiếu sau khi kiểm đếm và xác nhận kho.</span></div>
      <fieldset class="wp-import-fields" :disabled="reviewing||busy">
        <section class="wp-import-card"><h2>Thông tin phiếu</h2><div class="wp-import-grid wp-import-two">
          <label>Kho nhập <span class="wp-import-required">*</span><input value="SINGAPORE" readonly aria-label="Kho nhập cố định SINGAPORE"></label>
          <label>Nhà cung cấp <span class="wp-import-required">*</span><div class="wp-supplier-input"><input v-model="form.counterparty" list="wp-sg-suppliers" placeholder="Tìm hoặc nhập tên NCC…" required maxlength="300"><button v-if="profile.role==='admin'" type="button" class="wp-secondary" @click="addingSupplier=!addingSupplier;supplierName=form.counterparty;supplierPhone=''" aria-label="Thêm nhà cung cấp"><Icon name="plus"/></button></div><datalist id="wp-sg-suppliers"><option v-for="s in suppliers" :key="s.id" :value="s.name"/></datalist></label>
          <div v-if="addingSupplier" class="wp-import-supplier-create wp-full"><strong>Thêm nhà cung cấp tại Singapore</strong><div class="wp-import-grid wp-import-two"><label>Tên NCC<input v-model="supplierName" maxlength="200" placeholder="Tên gợi nhớ / công ty"></label><label>Điện thoại (nếu có)<input v-model="supplierPhone" maxlength="40"></label></div><div class="wp-button-group"><button type="button" class="wp-secondary" @click="addingSupplier=false">Đóng</button><button type="button" class="wp-primary" :disabled="busy||!supplierName.trim()" @click="saveSupplier">Lưu nhà cung cấp</button></div></div>
          <label>Ngày nhập<input v-model="form.documentDate" type="date" :max="today" required></label><label>Số hoá đơn NCC<input v-model="form.invoiceNo" maxlength="100" placeholder="VD: INV-SG-2607-A"></label>
          <label>Đồng tiền<select v-model="form.currency" :disabled="form.lines.length>0" @change="form.exchangeRate=form.currency==='VND'?1:'';form.shipping='';form.deposit='';form.discount=''"><option>VND</option><option>SGD</option></select></label><label v-if="form.currency==='SGD'">Tỷ giá 1 SGD = ? VND<input v-model="form.exchangeRate" type="number" inputmode="decimal" min="0.000001" max="1000000" step="0.000001" required></label>
          <label class="wp-full">Ghi chú<textarea v-model="form.note" rows="2" maxlength="2000" placeholder="Ghi chú cho phiếu nhập…"></textarea></label><label class="wp-full">Link chứng từ (nếu có)<input v-model="form.attachmentUrl" type="url" placeholder="https://…"></label>
        </div></section>
        <section class="wp-import-card"><h2>Sản phẩm nhập ({{form.lines.length}})</h2>
          <label v-if="!reviewing" class="wp-import-search"><span class="wp-sr-only">Tìm SKU hoặc tên sản phẩm để thêm</span><input v-model="query" placeholder="Tìm SKU / tên sản phẩm để thêm…" autocomplete="off"></label>
          <div v-if="query.trim()" class="wp-import-search-results"><button type="button" v-for="p in matches" :key="p.id" @click="add(p)"><strong>{{p.sku}}</strong><span>{{p.name}}</span><small>{{p.package_size}}</small><Icon name="plus"/></button><p v-if="!matches.length" class="wp-muted">Không tìm thấy sản phẩm trong danh mục Singapore.</p></div>
          <div v-if="!form.lines.length" class="wp-empty"><Icon name="box"/><p>Chưa có sản phẩm nào. Tìm ở ô trên để thêm.</p></div>
          <article v-for="(l,index) in form.lines" :key="l.key" class="wp-import-line"><header><div><small>{{l.sku}} · {{l.packageSize}}</small><h3>{{l.name}}</h3></div><button type="button" class="wp-icon-btn" @click="form.lines.splice(index,1)" :aria-label="'Xoá dòng '+l.sku"><Icon name="close"/></button></header><div class="wp-import-grid wp-import-three">
            <label>Số lượng<input v-model="l.quantity" type="number" min="1" max="1000000000" step="1" inputmode="numeric" required :aria-label="'Số lượng '+l.sku"></label><label>Đơn giá ({{form.currency}})<MoneyField v-model="l.cost" :currency="form.currency" required :aria-label="'Đơn giá '+l.sku"/></label><label>Số lô <span class="wp-import-required">*</span><input v-model="l.batchCode" required maxlength="100" placeholder="Mã lô in trên sản phẩm" :aria-label="'Số lô '+l.sku"></label><label>Ngày sản xuất<input v-model="l.manufactureDate" type="date" :max="l.expiryDate||undefined" :aria-label="'Ngày sản xuất '+l.sku"></label><label>Hạn sử dụng<input v-model="l.expiryDate" type="date" :min="l.manufactureDate>today?l.manufactureDate:today" :aria-label="'Hạn sử dụng '+l.sku"></label><p class="wp-import-line-total"><small>THÀNH TIỀN</small><strong>{{money(Number(l.quantity||0)*minor(l.cost))}}</strong></p>
          </div></article>
        </section>
        <section class="wp-import-card"><h2>Phí &amp; chiết khấu</h2><div class="wp-import-grid wp-import-two">
          <label>Chiết khấu<div class="wp-discount-input"><MoneyField v-if="form.discountType==='amount'" v-model="form.discount" :currency="form.currency"/><input v-else v-model="form.discount" type="number" min="0" max="100" step="0.01" inputmode="decimal"><select v-model="form.discountType" aria-label="Loại chiết khấu" @change="form.discount='' "><option value="amount">{{form.currency}}</option><option value="percent">%</option></select></div></label>
          <label>Thuế VAT / GST<select v-model="form.vatRate"><option v-for="rate in [0,5,8,9,10]" :key="rate" :value="rate">{{rate}}%</option></select></label><label>Phí vận chuyển ({{form.currency}})<MoneyField v-model="form.shipping" :currency="form.currency"/></label><label>Đặt cọc ({{form.currency}})<MoneyField v-model="form.deposit" :currency="form.currency"/></label>
        </div><div class="wp-import-summary"><p><span>Giá trị hàng</span><strong>{{money(goods)}}</strong></p><p v-if="discount"><span>Chiết khấu</span><strong>− {{money(discount)}}</strong></p><p v-if="vat"><span>Thuế VAT / GST</span><strong>{{money(vat)}}</strong></p><p v-if="minor(form.shipping)"><span>Phí vận chuyển</span><strong>{{money(minor(form.shipping))}}</strong></p><p><span>Tổng tiền phiếu</span><strong>{{money(total)}}</strong></p><p v-if="minor(form.deposit)"><span>Đã đặt cọc theo phiếu</span><strong>{{money(minor(form.deposit))}}</strong></p><p class="wp-import-grand"><span>Tạm tính cần thanh toán</span><strong>{{money(balance)}}</strong></p></div><p class="wp-small wp-muted wp-mt">{{form.lines.length}} SP · {{fmt(totalQuantity)}} đơn vị. Số tiền được kiểm tra lại khi lưu. Đặt cọc được ghi trên phiếu; khoản thanh toán đối soát riêng.</p></section>
      </fieldset>
      <p v-if="error" class="wp-error" role="alert">{{error}}</p><div class="wp-import-actions"><button type="button" class="wp-secondary" :disabled="busy" @click="back">{{reviewing?'Quay lại sửa':'Huỷ'}}</button><button class="wp-primary" :disabled="busy||!canImport">{{busy?'Đang lưu…':reviewing?'Lưu bản nháp':'Xem lại phiếu'}}<Icon name="arrow"/></button></div>
    </form>
    <p v-if="error&&!creating" class="wp-error" role="alert">{{error}}</p>
  </section>
</template>
