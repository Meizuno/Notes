export default defineAppConfig({
  ui: {
    main: {
      base: 'h-[calc(100vh-var(--ui-header-height))] p-4'
    },
    button: {
      slots: {
        base: "cursor-pointer",
      },
    },
  },
});
