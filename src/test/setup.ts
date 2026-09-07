// Component tests opt into jsdom per-file; only load DOM matchers when there is a DOM.
if (typeof document !== 'undefined') {
  await import('@testing-library/jest-dom/vitest');
}

export {};
