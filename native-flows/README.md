# Native Maestro flows

Authored in P4 (E2E maturity) so the native money paths are pinned in the
repo, same as the Playwright web smoke. They are **not runnable in this
sandbox** — Maestro needs an iOS simulator / Android device and an app build.

## Running

1. Install Maestro: https://docs.maestro.dev/get-started/installing-maestro
2. Build / install the dev client (EAS build from P5) on a booted simulator
   or attached device.
3. Point the flows at the app id and run:

```bash
export APP_ID=<ios.bundleIdentifier or android.package>
maestro test native-flows/smoke.yaml
maestro test native-flows/search.yaml
maestro test native-flows/cart.yaml
```

`APP_ID` must match the app id in `app.json` — `com.royalfurniture.app` is
pinned for both platforms (P5). Change it **before** the first EAS build if
you use a different domain: the bundle id/package is permanent once an app
is published.

`npm run e2e:native` runs the whole directory (needs the `maestro` CLI and a
connected device/simulator). `cart.yaml` starts with `clearState: true`
because bag/orders now persist natively via react-native-mmkv — without it a
previous run's bag would shift the badge counts.

## Selectors

Flows target the app's **accessibilityLabels** (Maestro's `text` selector
matches visible text or a11y label, as a regular expression): tab names,
`Search products`, `Add to bag, <size>, AED <price>`, `Cart, N items`,
`Your name` / `Mobile number` / `Delivery address`, `Place order request`.
`scripts/maestro-flows.test.mjs` (part of `npm test`) lints the YAML and
fails if a flow references a label the app no longer ships — update the flow
in the same commit as the label change.

## Known device-only caveats

- `cart.yaml` taps checkout inputs at `index: 1` because the sheet shows a
  heading Text and the input label with identical copy — the heading renders
  first. If a real device orders them differently, flip the index.
- `hideKeyboard` steps assume the software keyboard is shown; on hardware-
  keyboard simulators Maestro skips them gracefully.
