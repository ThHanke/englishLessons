import '@testing-library/jest-dom/vitest';

/** jsdom has no layout engine (every element measures 0x0) and no ResizeObserver.
 * @svar-ui/react-calendar's grid is size-driven — it virtualizes rows/cells off real pixel
 * measurements, so without a non-zero size it renders an empty shell. Faking a fixed content box
 * on both channels (ResizeObserver's callback and getBoundingClientRect, which the library reads
 * directly in places) is the standard workaround for testing virtualized components in jsdom. */
const FAKE_RECT: DOMRectReadOnly = {
  x: 0, y: 0, width: 1024, height: 600, top: 0, left: 0, right: 1024, bottom: 600,
  toJSON: () => ({}),
} as DOMRectReadOnly;

class ResizeObserverStub {
  #callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.#callback = callback;
  }
  observe(target: Element) {
    this.#callback([{ target, contentRect: FAKE_RECT } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}
// This setup file runs for every test (vitest.config.ts's global `setupFiles`), including the
// server/CLI suite under the default 'node' environment, where DOM globals don't exist at all —
// only patch them when jsdom actually provided one.
if (typeof Element !== 'undefined') {
  globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;
  Element.prototype.getBoundingClientRect = () => FAKE_RECT as DOMRect;
}
