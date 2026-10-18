import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' }, tabBarStyle: { display: 'none' } }}>
      <Tabs.Screen name="index" options={{ href: null, title: 'Royal Furniture' }} />
    </Tabs>
  );
}
