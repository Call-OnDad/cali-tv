# Cali TV

A thin status screen for Android TV — clock, alerts, homelab health, weather,
and today's calendar, pulled live from a self-hosted home-assistant API
called Cali. It installs as its own tile on the TV's home screen, next to
Netflix/YouTube/the live TV guide — it doesn't replace or touch anything
already on the device.

Built and verified working on a real Android TV 11 box (JVC/MTC-branded,
MediaTek chipset) on 2026-10-31.

## What's in this repo

This repo holds the **standalone, device-side pieces** of the Cali TV build:

- `tv-bundle/` — the actual screen: `index.html` + `tv.js`. Plain JS, no
  framework, no build step. Fetches directly from a LAN API with no
  authentication (see "How it talks to Cali" below) and renders a few tiles
  with D-pad-focusable buttons.
- `android/capacitor.config.androidtv.json` — the [Capacitor](https://capacitorjs.com/)
  config for this build target: `webDir` points at `tv-bundle/`.

It does **not** include the actual Android/Capacitor project (Gradle build,
`AndroidManifest.xml`, native Java) — that lives in a separate private
monorepo alongside the phone/tablet builds of the same app, which this
build target shares a single Android project with. See **Wiring this into
an Android project** below for the exact changes that project needs.

## How it talks to Cali

`tv-bundle/tv.js` hardcodes a LAN API base URL
(`http://<your-home-server>:5000`) and fetches directly — no sign-in flow,
no API key. This only works because it's designed to run exclusively on the
home LAN, which the backing API trusts without authentication (the same way
a local dev server would). If you adapt this for a server that isn't
LAN-trusted, you'll need to add real auth.

## Wiring this into an Android project

This build target is additive: three small, explicitly-scoped changes to an
existing Capacitor Android project (phone/tablet already built from the
same project), none of which affect other build targets.

**1. `android/app/build.gradle`** — give the TV build its own application ID:

```gradle
def appIdSuffix = buildTarget == 'phone' ? '.phone' : (buildTarget == 'tablet' ? '.tablet' : (buildTarget == 'partner' ? '.partner' : (buildTarget == 'androidtv' ? '.androidtv' : '')))
```

**2. `android/app/src/main/AndroidManifest.xml`** — add a `LEANBACK_LAUNCHER`
intent-filter on the main activity, so Android TV's launcher shows it as a
tile (harmless on phone/tablet — only TV launchers ever query this category):

```xml
<intent-filter>
    <action android:name="android.intent.action.MAIN" />
    <category android:name="android.intent.category.LEANBACK_LAUNCHER" />
</intent-filter>
```

and, outside `<application>`:

```xml
<uses-feature android:name="android.hardware.touchscreen" android:required="false" />
<uses-feature android:name="android.software.leanback" android:required="false" />
```

> XML comments cannot contain `--` anywhere (not just at the boundary) — a
> stylistic double-hyphen in a new manifest comment broke the Gradle manifest
> merge with a cryptic `SAXParseException`. Don't use `--` in manifest
> comments.

**3. `MainActivity.java`** (or wherever your Capacitor `BridgeActivity`
subclass lives) — two runtime-only fixes, both gated on the TV build's
application ID so no other build target is affected:

```java
if (getPackageName().endsWith(".androidtv")) {
    // Some Android TV boxes' GPU drivers fail WebView's hardware-accelerated
    // compositing outright (logcat: "eglChooseConfig failed with error
    // EGL_BAD_ATTRIBUTE"). The page's JS runs fine and fetches real data,
    // but nothing ever gets painted, so the screen just stays black.
    // Forcing software rendering sidesteps the broken EGL path.
    getBridge().getWebView().setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null);
}
// Skip any blanket runtime-permission request (camera/mic/location/etc.)
// on the TV build -- tv-bundle's JS never calls those APIs at all, and a
// GrantPermissionsActivity dialog stack covering the WebView on first
// launch looks exactly like a black/broken screen.
if (!getPackageName().endsWith(".androidtv")) {
    requestMissingRuntimePermissions();
}
```

Build with your normal Capacitor flow, pointing at this config:

```bash
cp capacitor.config.androidtv.json android/capacitor.config.json
npx cap sync android
cd android && ./gradlew assembleDebug -PbuildTarget=androidtv
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Known device quirks

These bit us on the specific MediaTek-based box this was built against —
worth checking for on any new device before assuming something's broken in
the app itself:

- `adb shell screencap` / `adb shell screenrecord` can fail silently and
  return a fixed black image/clip regardless of real on-screen content
  (MediaTek capture driver bug, logged as `open mma dev failed`). Don't
  trust either for verifying a black-screen report on this kind of device —
  use [scrcpy](https://github.com/Genymobile/scrcpy) for live mirroring
  instead (`scrcpy -s <device-ip>:5555`), which uses a different capture
  path and worked where both of the above didn't.
- Android TV's Developer Options has a plain "Network debugging" toggle
  (opens `adb`'s usual port 5555) — unlike Android *phones*, there's no
  wireless-pairing-code UI on Android TV.
- The on-TV ADB authorization prompt needs accepting with the physical
  remote the first time a new computer connects.

## Where this sits relative to the full dashboard

This is deliberately a *thin, additive* screen — one tile among the TV's
existing apps, not a takeover. A separate, bigger piece of work — making
Cali the TV's actual home screen (replacing the stock launcher as the
default `HOME` app, with real tiles that launch Netflix/YouTube/the guide
via Android intents, with its own Daydream/idle screensaver, with a clear
fallback-to-stock-launcher safety net) — is scoped but not started. That
work would also touch the shared Android project and belongs there, not in
this repo.

## License

Not yet decided — personal project, treat as all-rights-reserved until a
LICENSE file says otherwise.
