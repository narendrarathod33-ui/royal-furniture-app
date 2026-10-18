# Delivery runbook (P5)

Everything that could be prepared without an Expo account is in the repo;
the account-bound steps are marked. Nothing has been built or submitted from
the sandbox.

## One-time setup (needs your Expo account)

```bash
npm install -g eas-cli        # or use the npx eas-cli scripts as-is
npm run eas:init              # eas login + eas init
```

`eas init` writes `extra.eas.projectId` into `app.json` and fills
`updates.url` (`https://u.expo.dev/<projectId>`), which `expo-updates`
(OTA) needs. It also links the local project to the Expo project.

## App identity

`app.json` pins `com.royalfurniture.app` as both
`ios.bundleIdentifier` and `android.package` — change both **before** the
first build if you use a different domain (permanent once published). The
Maestro flows take the same value as `APP_ID`
(`native-flows/README.md`).

## Build profiles (`eas.json`)

| Profile | Purpose | Distribution | Notes |
|---|---|---|---|
| `development` | dev client for Maestro + daily work | internal (simulator/ad-hoc) | `developmentClient: true`, channel `development` |
| `preview` | shareable test build | internal | channel `preview` |
| `production` | store build | store | `autoIncrement: true`, channel `production` |

```bash
npm run build:native    # dev clients for both platforms (development profile)
npm run build:ios       # production iOS (IPA for App Store Connect)
npm run build:android   # production Android (AAB for Play Console)
npm run submit:ios      # store submission (after credentials are set up)
npm run submit:android
```

First `production` builds will ask for Apple/Google credentials — `eas-cli`
can generate and manage them (`--non-interactive` off for the first run).
Android note: add an `adaptiveIcon` entry in `app.json` before store
submission (a plain `icon` is currently set).

## OTA updates (JS-only changes)

`runtimeVersion` uses the `appVersion` policy: every JS-only change within
the same `app.json` `version` ships over the air; native changes need a new
build.

```bash
npm run ota:publish     # eas update --channel production --auto
```

Channels map 1:1 to build profiles, so a `preview` build only ever receives
`preview` updates.

## Prebuild verified in-sandbox

`npx expo prebuild --platform android` and `--platform ios` were both run and
inspected in the sandbox (applicationId / PRODUCT_BUNDLE_IDENTIFIER =
`com.royalfurniture.app`, Expo.plist updates keys emitted). The generated
`android/` and `ios/` folders are intentionally **not committed** — this
project stays on the managed (CNG) workflow: EAS Build regenerates them in
the cloud on every build, so `app.json` stays the single source of truth.
`react-native` is aligned to the exact SDK 54 expected version (0.81.5), and
the tracked lockfile is `bun.lock` only (kept in sync with `package.json` —
EAS will use bun); any local gitignored npm lockfile is sandbox-only.

## Native persistence (react-native-mmkv)

Installed and wired in P5 through the `stores/appStoragePlatform` split:
web → `localStorage` (unchanged, and MMKV never enters the web bundle),
native → MMKV (`rf-app-storage` instance) with an in-memory fallback for
jest and Expo Go. Autolinked by the EAS build — no extra native step.
Persists: bag, saved items, order history (`rf-cart-v1` / `rf-session-v1`).

## Offline

Deferred on purpose (plan §Phase 5): the app is online-only today — bundled
catalog, photo fallbacks, an offline PDP state, and local demo checkout
already cover the graceful paths. Revisit when a real offline requirement
exists (NetInfo + persisted query cache).

## RAM bundles / module splitting

Not needed: the dev web bundle is ~10.9 MB raw / ~1.7 MB gzip, far below the
plan's 2×-of-baseline revisit threshold.
