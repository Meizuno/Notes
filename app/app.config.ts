export default defineAppConfig({
  ui: {
    main: {
      base: 'h-[calc(100vh-var(--ui-header-height))] py-2'
    },
    button: {
      slots: {
        base: "cursor-pointer",
      },
    },
  },
});
