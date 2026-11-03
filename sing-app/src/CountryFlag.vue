<script setup>
defineProps({singapore:Boolean});
</script>
<template>
  <svg v-if="singapore" viewBox="0 0 90 60" role="img" aria-label="Cờ Singapore" xmlns="http://www.w3.org/2000/svg">
    <defs><mask id="wp-crescent"><rect width="90" height="60" fill="white"/><circle cx="27" cy="15" r="10" fill="black"/></mask></defs>
    <path fill="#fff" d="M0 0h90v60H0z"/><path fill="#ef3340" d="M0 0h90v30H0z"/>
    <circle cx="23" cy="15" r="11" fill="#fff" mask="url(#wp-crescent)"/>
    <g fill="#fff"><path v-for="[x,y] in [[37,7],[44,12],[41,21],[33,21],[30,12]]" :key="x" :transform="`translate(${x} ${y})`" d="M0-3.2.75-.98 3.05-.98 1.18.37 1.9 2.6 0 1.22-1.9 2.6-1.18.37-3.05-.98-.75-.98Z"/></g>
  </svg>
  <svg v-else viewBox="0 0 90 60" role="img" aria-label="Cờ Việt Nam" xmlns="http://www.w3.org/2000/svg"><path fill="#da251d" d="M0 0h90v60H0z"/><path fill="#ff0" d="m45 12 4.04 12.44h13.08L51.54 32.1l4.04 12.44L45 36.86l-10.58 7.68 4.04-12.44-10.58-7.66h13.08Z"/></svg>
</template>
