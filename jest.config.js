module.exports = {
  preset: 'jest-expo/ios',
  rootDir: '.',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // jest-expo's own default pattern (covers expo*) extended with the two
  // ESM-only RN packages this app pulls in.
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|react-native-svg|lucide-react-native))',
    '/node_modules/react-native-reanimated/plugin/',
  ],
  clearMocks: true,
};
