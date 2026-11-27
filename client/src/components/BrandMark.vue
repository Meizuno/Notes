<script setup lang="ts">
// Notes' mark — the favicon's little graph on its violet tile — inline, so it
// scales with its box and costs no request. Size it with a class (`size-7`).
import { useId } from "vue";

// Several marks can share a page; each needs its own gradient id.
const gradient = `brand-${useId()}`;
</script>

<template>
  <svg viewBox="0 0 180 180" fill="none" aria-hidden="true" class="shrink-0">
    <defs>
      <linearGradient :id="gradient" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#818cf8" />
        <stop offset="100%" stop-color="#5b21b6" />
      </linearGradient>
    </defs>
    <rect width="180" height="180" rx="44" :fill="`url(#${gradient})`" />
    <g stroke="#fff" stroke-width="6" stroke-linecap="round" opacity="0.55">
      <line x1="90" y1="90" x2="48" y2="48" />
      <line x1="90" y1="90" x2="132" y2="48" />
      <line x1="90" y1="90" x2="42" y2="132" />
      <line x1="90" y1="90" x2="138" y2="132" />
    </g>
    <g fill="#fff">
      <circle cx="48" cy="48" r="15" fill-opacity="0.92" />
      <circle cx="132" cy="48" r="15" fill-opacity="0.92" />
      <circle cx="42" cy="132" r="15" fill-opacity="0.92" />
      <circle cx="138" cy="132" r="15" fill-opacity="0.92" />
      <circle cx="90" cy="90" r="23" />
    </g>
  </svg>
</template>
