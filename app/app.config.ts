export default defineAppConfig({
  ui: {
    main: {
      base: 'h-[calc(100vh-var(--ui-header-height))]'
    },
    button: {
      slots: {
        base: "cursor-pointer",
      },
    },
  },
});
