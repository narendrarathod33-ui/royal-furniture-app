/** Web-only liquid-inspired micro-motion, not the Framer LiquidMorph component.
 * Scoped to navigation controls: no continuous animation, filters or gesture handlers.
 * The browser's reduced-motion preference takes effect before JavaScript runs.
 */
export const LIQUID_MOTION_CSS = `
@keyframes royal-liquid-arrive {
  from { opacity: 0; transform: translateY(18px) scale(0.975); border-top-left-radius: 36px; border-top-right-radius: 36px; }
  to { opacity: 1; transform: translateY(0) scale(1); border-top-left-radius: 26px; border-top-right-radius: 26px; }
}
@keyframes royal-liquid-reveal {
  from { opacity: 0; transform: translateY(5px) scale(0.985); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
@media (prefers-reduced-motion: no-preference) {
  [data-testid="browse-navigation"] [role="button"],
  [data-testid="category-explorer"] [role="button"],
  [data-testid="liquid-control"] {
    transition: background-color 220ms ease, border-color 220ms ease, border-radius 260ms cubic-bezier(.2,.8,.2,1), box-shadow 220ms ease, transform 220ms cubic-bezier(.2,.8,.2,1);
  }
  [data-testid="browse-navigation"] [role="button"]:active,
  [data-testid="category-explorer"] [role="button"]:active,
  [data-testid="liquid-control"]:active {
    transform: scale(.97);
    border-radius: 20px;
  }
  [data-testid="category-explorer"] {
    transform-origin: bottom center;
    animation: royal-liquid-arrive 340ms cubic-bezier(.16,1,.3,1) both;
  }
  [data-testid="category-group-options"], [data-testid="browse-sort-options"] {
    transform-origin: top center;
    animation: royal-liquid-reveal 220ms cubic-bezier(.16,1,.3,1) both;
  }
}
@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference) {
  [data-testid="browse-navigation"] [role="button"]:not(:active):hover,
  [data-testid="liquid-control"]:not(:active):hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(66,42,44,.07);
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-testid="browse-navigation"] [role="button"],
  [data-testid="category-explorer"], [data-testid="category-explorer"] [role="button"],
  [data-testid="category-group-options"], [data-testid="browse-sort-options"],
  [data-testid="liquid-control"] {
    animation: none !important;
    transition: none !important;
  }
}
`;
