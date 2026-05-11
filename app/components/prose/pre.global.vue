<!--
  Custom <pre> wrapper. NO whitespace between the opening <pre> tag
  and <slot />: <pre> preserves whitespace, so a newline + template
  indentation here would render as literal characters before the
  first highlighted token. Keep the slot interpolation glued to the
  opening tag.
-->
<template>
  <pre class="my-2 p-3 text-sm rounded-lg border border-default bg-muted overflow-x-auto"><slot /></pre>
</template>
