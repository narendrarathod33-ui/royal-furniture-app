import { Redirect, useLocalSearchParams } from 'expo-router';

export default function Index() {
  const params = useLocalSearchParams<{ checkout?: string; session_id?: string }>();
  const checkout = ['success', 'cancelled'].includes(params.checkout || '') ? params.checkout : undefined;
  return <Redirect href={{ pathname: '/(tabs)', params: checkout ? { checkout, ...(typeof params.session_id === 'string' ? { session_id: params.session_id } : {}) } : {} }} />;
}
