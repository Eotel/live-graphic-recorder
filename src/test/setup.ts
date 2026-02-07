/**
 * Test setup for bun:test with happy-dom
 */

import { Window } from "happy-dom";
import "@testing-library/jest-dom";
import { beforeEach } from "bun:test";

const window = new Window({ url: "http://localhost:3000" });

// Copy window properties to global for React Testing Library compatibility
Object.assign(globalThis, {
  window,
  document: window.document,
  navigator: window.navigator,
  location: window.location,
  history: window.history,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,

  // DOM APIs
  HTMLElement: window.HTMLElement,
  HTMLDivElement: window.HTMLDivElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLSpanElement: window.HTMLSpanElement,
  HTMLAnchorElement: window.HTMLAnchorElement,
  HTMLFormElement: window.HTMLFormElement,
  HTMLLabelElement: window.HTMLLabelElement,

  // Core DOM classes
  Element: window.Element,
  Node: window.Node,
  Text: window.Text,
  Comment: window.Comment,
  DocumentFragment: window.DocumentFragment,
  Document: window.Document,
  customElements: window.customElements,

  // Events
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent,
  FocusEvent: window.FocusEvent,
  InputEvent: window.InputEvent,
  UIEvent: window.UIEvent,

  // Observers
  MutationObserver: window.MutationObserver,
  ResizeObserver: window.ResizeObserver,
  IntersectionObserver: window.IntersectionObserver,

  // Other APIs
  DOMParser: window.DOMParser,
  XMLSerializer: window.XMLSerializer,
  Range: window.Range,
  Selection: window.Selection,
  NodeFilter: window.NodeFilter,

  // Animation
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),

  // Style
  getComputedStyle: window.getComputedStyle.bind(window),
  CSSStyleDeclaration: window.CSSStyleDeclaration,

  // Timing
  setTimeout: window.setTimeout.bind(window),
  clearTimeout: window.clearTimeout.bind(window),
  setInterval: window.setInterval.bind(window),
  clearInterval: window.clearInterval.bind(window),
});

const { i18n } = await import("../i18n/config");

beforeEach(async () => {
  localStorage.setItem("app_lang", "en");
  await i18n.changeLanguage("en");
});
