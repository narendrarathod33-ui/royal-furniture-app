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
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" />
        </Stack>
      </SplashGate>
      <StatusBar style="auto" />
    </>
  );
}
