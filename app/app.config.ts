export default defineAppConfig({
  ui: {
    main: {
      base: "min-h-[calc(100dvh-var(--ui-header-height))] flex-1 py-4 sm:py-6",
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
