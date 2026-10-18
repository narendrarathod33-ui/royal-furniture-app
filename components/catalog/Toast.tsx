import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { styles } from './kit';

// One toast host for the whole app. The message state lives HERE, not in the
// session component, so a 2.2s toast re-renders only this view instead of the
// entire screen tree (rails, grids, checkout).
let show: ((message: string) => void) | null = null;

/** Shows the shared toast. Safe to call from anywhere in the app. */
export function showToast(message: string) {
  show?.(message);
}

export function ToastHost() {
  const [message, setMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    show = (value: string) => {
      setMessage(value);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(''), 2200);
    };
    return () => {
      show = null;
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  if (!message) return null;
  return <View style={styles.toast}><Text style={styles.toastText}>{message}</Text></View>;
}
