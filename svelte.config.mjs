// Svelte's options for the page (ADR 0013, 0035). Vite's root is web/, so vite.config.mjs points the Svelte plugin here.
export default {
  // Every component uses runes; this keeps a component from falling back to Svelte 4's legacy syntax.
  compilerOptions: { runes: true },
};
