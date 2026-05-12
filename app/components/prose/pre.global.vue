<!--
  Custom <pre> wrapper. NO whitespace between the opening <pre> tag
  and <slot />: <pre> preserves whitespace, so a newline + template
  indentation here would render as literal characters before the
  first highlighted token. Keep the slot interpolation glued to the
  opening tag.

  Sizing notes:
    - `max-w-full` + `min-w-0` keep the block from expanding its
      parent on a narrow viewport. Without min-w-0, a flex / grid
      ancestor will let the pre push the layout sideways and the
      whole page scrolls horizontally instead of just the code.
    - `overflow-x-auto` (kept) makes the block itself scroll on
      mobile; `whitespace-pre` is explicit so a future global style
      can't accidentally enable wrapping inside code.
    - Padding is smaller (`p-2`) below sm and grows to `p-3` above,
      reclaiming a chunk of horizontal room on phones.
-->
<template>
  <pre class="my-2 p-2 sm:p-3 text-sm rounded-lg border border-default bg-muted overflow-x-auto max-w-full min-w-0 whitespace-pre"><slot /></pre>
</template>
