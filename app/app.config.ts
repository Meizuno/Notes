// Nuxt UI theme config. `primary` and `neutral` accept any Tailwind
// palette name: red, orange, amber, yellow, lime, green, emerald,
// teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose.
//
// Sky is the closest Tailwind palette to Nord's deep "frost" blue
// (#5E81AC) — main.css then overrides `--ui-primary` to the exact
// Nord hex so buttons and accents match Obsidian Nord precisely.
// Slate stays as neutral — its cool blue-grey reads like Nord's
// "polar night" / "snow storm" base.

export default defineAppConfig({
  ui: {
    colors: {
      primary: 'sky',
      neutral: 'slate'
    }
  }
})
