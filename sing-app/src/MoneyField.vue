<script setup>
import {ref,watch} from 'vue';
const props=defineProps({modelValue:[String,Number],currency:{type:String,default:'VND'}});
const emit=defineEmits(['update:modelValue']);const display=ref('');let editing=false;
function format(){display.value=props.modelValue===''||props.modelValue==null?'':new Intl.NumberFormat('vi-VN',{minimumFractionDigits:props.currency==='SGD'?2:0,maximumFractionDigits:props.currency==='SGD'?2:0}).format(Number(props.modelValue));}
watch(()=>[props.modelValue,props.currency],()=>{if(!editing)format();},{immediate:true});
function input(e){display.value=e.target.value;const raw=display.value.trim();if(!raw){emit('update:modelValue','');return;}
 if(props.currency==='VND'){emit('update:modelValue',/^[\d.,\s]+$/.test(raw)?Number(raw.replace(/[^\d]/g,'')):'');}
 else {const canonical=raw.replace(',','.');emit('update:modelValue',/^\d+([.,]\d{0,2})?$/.test(raw)?Number(canonical):'');}
}
function focus(){editing=true;display.value=props.modelValue===''?'':String(props.modelValue??'').replace('.',',');}
function blur(){editing=false;format();}
</script>
<template><input :value="display" @input="input" @focus="focus" @blur="blur" type="text" :inputmode="currency==='VND'?'numeric':'decimal'" autocomplete="off" :placeholder="currency==='VND'?'Ví dụ 94.250':'Ví dụ 12,50 (SGD)'"></template>
