import { AdaptiveFrame } from '../hooks/useAdaptiveLayout';
import { LIQUID_MOTION_CSS } from '../ui/liquidMotion';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import SplashGate from './SplashGate';

/**
 * royalfurniture.ae renders every screen in Montserrat: the live site's <body>
 * carries the next/font module class and its stylesheet declares
 * `--font-montserrat`. The same typeface is pulled in here so the app's
 * typography matches the website. Weights 300-900 are requested so the existing
 * heading weights (700-900) still render properly.
 */
const FONT_STYLESHEET =
  'https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap';

/** Same stack as the site, plus the same font smoothing ("antialiased"). */
const FONT_CSS = [
  "html, body, #root { font-family: 'Montserrat', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; }",
  'body { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }',
  'input, textarea, select, button { font-family: inherit; }',
  '[data-testid="browse-navigation"] [role="button"]:focus-visible, [data-testid="category-explorer"] [role="button"]:focus-visible { outline: 2px solid #B61117; outline-offset: 2px; }',
  '[data-testid="category-explorer"] input:focus { outline: none; box-shadow: none; }',
  '[data-testid="category-search-field"]:focus-within { border-color: #8D4F46; }',
  '[data-testid="product-search-field"] input:focus { outline: none; box-shadow: none; }',
  '[data-testid="product-search-field"]:focus-within { box-shadow: inset 0 0 0 1px #8D4F46; }',
  '[data-testid="product-search-field"] input, [data-testid="category-search-field"] input { caret-color: #DA1921; cursor: text; }',
  '[data-testid="deals-search-field"] input:focus { outline: none; box-shadow: none; }',
  '[data-testid="deals-search-field"]:focus-within { box-shadow: inset 0 0 0 1px #8D4F46; }',
  '[data-testid="deals-search-field"] input { caret-color: #DA1921; cursor: text; }',
  '[data-testid="deals-filter-sheet"] [role="button"]:focus-visible, [data-testid="deals-filter-sheet"] [role="radio"]:focus-visible { outline: 2px solid #B61117; outline-offset: 2px; }',
  '[data-testid="customization-search-field"] input:focus { outline: none; box-shadow: none; }',
  '[data-testid="customization-search-field"]:focus-within { box-shadow: inset 0 0 0 1px #8D4F46; }',
  '[data-testid="customization-search-field"] input { caret-color: #DA1921; cursor: text; }',
  '[data-testid="adaptive-workspace"] [role="button"]:focus-visible, [data-testid="adaptive-workspace"] [role="tab"]:focus-visible, [data-testid="adaptive-workspace"] [role="radio"]:focus-visible, [data-testid="adaptive-workspace"] a:focus-visible { outline: 2px solid #B61117; outline-offset: 2px; }',
  LIQUID_MOTION_CSS,
].join('\n');

function useWebsiteFont() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined' || !document.head) return;
    if (document.head.querySelector('[data-royal-furniture-font]')) return;

    const style = document.createElement('style');
    style.setAttribute('data-royal-furniture-font', 'montserrat');
    style.appendChild(document.createTextNode(FONT_CSS));
    document.head.appendChild(style);

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.referrerPolicy = 'no-referrer';
    link.href = FONT_STYLESHEET;
    document.head.appendChild(link);
  }, []);
}

export default function RootLayout() {
  useFrameworkReady();
  useWebsiteFont();

  return (
    <>
      {/* The launch screen and the ambient glass backdrop wrap every route. */}
      <SplashGate>
        <AdaptiveFrame><Stack screenOptions={{ contentStyle: { backgroundColor: 'transparent' } }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack></AdaptiveFrame>
      </SplashGate>
      <StatusBar style="auto" />
    </>
  );
}
