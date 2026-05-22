<!--
  Sizing mirrors <pre> (the code-block component): `overflow-x-auto`
  + `max-w-full` + `min-w-0` makes the wrapper a scroll container
  that respects its grid/flex parent's width. Without `min-w-0` a
  table chunk inside `.kb-fold-block` (a grid container) can balloon
  past the column so the wrapper never overflows; this works the
  same way pre code blocks do in production.

  Cells get `whitespace-nowrap` (via td/th) so the table actually
  exceeds the wrapper's width when content is wide — same idea as
  <pre>'s `whitespace-pre`, just on the cell level since tables can't
  use `whitespace-pre` at the wrapper itself.
-->
<template>
  <div class="my-2 overflow-x-auto rounded-lg border border-default max-w-full min-w-0">
    <!-- Below md: table sits at content width and the wrapper scrolls
         horizontally when needed (cells are `whitespace-nowrap`, same
         pattern as the <pre> block).
         md+: `w-full` stretches the table to fill the wrapper; cells
         drop nowrap so they re-wrap and the table never overflows. -->
    <table class="text-sm sm:w-full">
      <slot />
    </table>
  </div>
</template>
