import { GLASS } from '../app/ui/glass';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

type Item = { productId: string; quantity: number };
export function SandboxCheckout({ items }: { items: Item[] }) {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let active = true;
    fetch('/api/payments/config').then((response) => response.ok ? response.json() : null)
      .then((config) => { if (active) setEnabled(config?.enabled === true); }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!enabled) return <View style={styles.panel}><Text style={styles.title}>Stripe sandbox not enabled</Text><Text style={styles.body}>You can still use local demo checkout below. Hosted payments need the configured sandbox server.</Text></View>;
  const checkout = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await fetch('/api/payments/session', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
      const result = await response.json();
      if (!response.ok) {
        setError(response.status === 400 ? 'This item or size is not available in the server sandbox catalog. Choose another size or product.' : response.status === 429 ? 'Too many attempts. Wait a minute before retrying.' : `Checkout could not start. Reference: ${result.correlationId || 'unavailable'}`);
        return;
      }
      const url = new URL(result.url);
      if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com') throw new Error();
      // Full-page hosted checkout: no card information is collected by our app.
      window.location.assign(url.href);
    } catch { setError('Sandbox checkout is unavailable. Try again later.'); }
    finally { setBusy(false); }
  };
  return <View style={styles.panel}>
    <Text style={styles.title}>Stripe sandbox</Text>
    <Text style={styles.body}>Test payments only—no real money and no fulfilment. Prices are checked by the server. Your in-memory bag resets after leaving this page. Use fictitious details on Stripe, not your real contact information.</Text>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={checkout} style={[styles.button, busy && { opacity: 0.6 }]}><Text style={styles.buttonText}>{busy ? 'Opening Stripe…' : 'Pay with Stripe · test mode'}</Text></Pressable>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

export function SandboxPaymentReturn() {
  const [state, setState] = useState('');
  const [reference, setReference] = useState('');
  const [session, setSession] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'cancelled') setState('cancelled');
    if (params.get('checkout') === 'success') {
      setState('pending'); setSession(params.get('session_id') || '');
    }
  }, []);
  useEffect(() => {
    if (!session) return;
    let active = true;
    let count = 0;
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      try {
        const response = await fetch(`/api/payments/status?session_id=${encodeURIComponent(session)}`, { credentials: 'same-origin' });
        const result = await response.json();
        if (!active) return;
        if (!response.ok) { setState('unknown'); setReference(result.correlationId || ''); return; }
        setState(result.state === 'paid' ? 'paid' : result.state === 'expired' ? 'expired' : 'pending');
        if (result.state === 'pending' && ++count < 15) timer = setTimeout(check, 2000);
      } catch { if (active) setState('unknown'); }
    };
    void check();
    return () => { active = false; clearTimeout(timer); };
  }, [session]);
  if (!state) return null;
  const messages: Record<string, string> = {
    paid: 'Test payment confirmed by the signed Stripe webhook. No real order will be fulfilled.',
    pending: 'Waiting for the signed Stripe webhook. The return URL alone does not prove payment. If this persists, check your webhook delivery in Stripe.',
    cancelled: 'You left Stripe Checkout. No payment has been confirmed by this screen. Your local bag may reset after leaving the app.',
    expired: 'This sandbox checkout expired. Start a new test from your bag.',
    unknown: `We cannot verify this session. It may have expired, been deleted, or the sandbox server restarted. Check Stripe before retrying. ${reference ? `Reference: ${reference}` : ''}`,
  };
  return <View style={styles.panel}><Text style={styles.title}>Sandbox payment</Text><Text accessibilityLiveRegion="polite" style={styles.body}>{messages[state]}</Text>
    {['pending', 'unknown'].includes(state) && <Pressable disabled={busy} accessibilityRole="button" onPress={async () => {
      setBusy(true);
      try {
        const response = await fetch(`/api/payments/status?session_id=${encodeURIComponent(session)}`);
        const result = await response.json();
        setState(response.ok && ['paid', 'pending', 'expired'].includes(result.state) ? result.state : 'unknown');
      } catch { setState('unknown'); } finally { setBusy(false); }
    }}><Text style={styles.link}>{busy ? 'Checking…' : 'Check again'}</Text></Pressable>}
    <Pressable accessibilityRole="button" onPress={() => { window.history.replaceState({}, '', window.location.pathname); setState(''); setSession(''); }}><Text style={styles.link}>Continue browsing</Text></Pressable>
  </View>;
}
const styles = StyleSheet.create({
  panel: { margin: 16, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#E3E3E5', backgroundColor: '#fff', ...GLASS.panelStrong },
  title: { color: '#282984', fontSize: 15, fontWeight: '800' },
  body: { color: '#444444', fontSize: 12, lineHeight: 18, marginTop: 6 },
  button: { backgroundColor: '#DA1921', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10, ...GLASS.accent },
  buttonText: { color: '#fff', fontWeight: '800', fontSize: 13 },
  error: { color: '#B61117', fontSize: 12, marginTop: 8 },
  link: { color: '#DA1921', fontSize: 12, fontWeight: '700', marginTop: 10 },
});
