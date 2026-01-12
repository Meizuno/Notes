export default defineAppConfig({
  ui: {
    main: {
      base: "min-h-[calc(100dvh-var(--ui-header-height))] h-[calc(100dvh-var(--ui-header-height))] py-2",
    },
    button: {
      slots: {
        base: "cursor-pointer",
      },
    },
    input: {
      slots: {
        root: "w-full",
      },
    },
    select: {
      slots: {
        base: "w-full",
      },
    },
  },
});
