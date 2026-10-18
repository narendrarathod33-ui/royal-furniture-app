// Expo reads this file instead of app.json when present — it exists ONLY to
// keep app.json the single source of truth while letting the GitHub Pages
// export inject the web base path (the Pages project site serves the app at
// /royal-furniture-app/). Daily dev and the sandbox preview export without
// the env var and behave exactly as app.json alone would.
//
//   PAGES_BASE_PATH=/royal-furniture-app npm run build:web:pages
const appJson = require('./app.json');

module.exports = {
  ...appJson.expo,
  experiments: {
    ...appJson.expo.experiments,
    ...(process.env.PAGES_BASE_PATH ? { baseUrl: process.env.PAGES_BASE_PATH } : {}),
  },
};
