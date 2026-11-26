Understood. The vendor application will target:

- **Windows desktop**
- **Android for Google Play**
- **iOS for the App Store**

The refreshed Rust installation is working correctly.

## Recommended implementation

Use the same Next.js vendor frontend with:

- **Tauri 2 for Windows desktop**
- **Capacitor for Android and iOS**

This is the practical choice because the mobile application needs Firebase push notifications, GPS, permissions, deep links and reliable Play Store/App Store support. Capacitor already handles these requirements well and matches the customer and rider applications. Tauri remains valuable for the lightweight Windows desktop app.

Trying to force every target through Tauri would add time around Firebase push notifications and mobile plugins without providing a clear benefit.

## Machine status

Android Studio and the Android SDK are installed, including:

- Android API 36
- Android API 37
- Build Tools 35
- Build Tools 36
- Java 21

Two Android configuration items remain:

- Android SDK environment variables are not configured.
- Android NDK is not currently installed, though the proposed Capacitor mobile path does not require it.

We can configure the SDK path during integration.

## iOS limitation

The iOS project and Capacitor configuration can be prepared from this shared codebase, but Apple requires **macOS with Xcode** for the final iOS compilation, signing, simulator testing and App Store submission. The eventual options are:

- Use a physical Mac.
- Rent a cloud Mac.
- Use a macOS CI service such as GitHub Actions or Codemagic.

The frontend code, Firebase setup and native project configuration can still be shared across Android and iOS.

Yes. **Capacitor and Tauri can coexist in the vendor repository without conflicting** when each uses separate native directories and build commands.

```text
Vendor Next.js frontend
├── src/                 Shared frontend
├── android/             Capacitor Android project
├── ios/                 Capacitor iOS project
└── src-tauri/           Tauri Windows project
```

## Target responsibilities

| Platform | Wrapper | Output |
|---|---|---|
| Web | Next.js | Website |
| Windows | Tauri | `.exe` / `.msi` |
| Android | Capacitor | `.aab` / `.apk` |
| iOS | Capacitor | Xcode archive / `.ipa` |

Google Play receives only the Capacitor Android `.aab`. Apple receives only the Capacitor iOS archive. The `src-tauri` directory is never included in either mobile submission.

## How conflicts are avoided

We will provide separate commands:

```json
{
  "scripts": {
    "build": "next build",
    "mobile:android": "npm run mobile:prepare && cap sync android",
    "mobile:ios": "npm run mobile:prepare && cap sync ios",
    "desktop:dev": "tauri dev",
    "desktop:build": "tauri build"
  }
}
```

Each target can also receive its own environment configuration:

```text
NEXT_PUBLIC_APP_PLATFORM=web
NEXT_PUBLIC_APP_PLATFORM=mobile
NEXT_PUBLIC_APP_PLATFORM=desktop
```

That allows us to control platform-specific features such as:

- Firebase push notifications on mobile
- Windows notifications through Tauri
- GPS and permissions through Capacitor
- External browser and payment handling
- Mobile layouts and desktop window behavior

## Important architectural requirement

The current vendor dashboard relies on Next.js server rewrites for `/api` and `/v1`. Before packaging it, the native builds need a controlled API client that calls the staging or production HTTPS backend directly.

We must also configure:

- Backend CORS for Capacitor and Tauri origins
- Bearer-token authentication for native builds
- Deep links and payment callbacks
- Android and iOS application identifiers
- Firebase configuration
- Separate staging and production backend URLs

With these boundaries, Capacitor and Tauri can operate together safely from the same vendor codebase and will not cause Play Store or App Store deployment conflicts.