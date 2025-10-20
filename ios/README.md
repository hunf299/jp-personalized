# JPApp iOS Client

This directory contains the UIKit client for iOS 17+ that consumes the existing Next.js backend.

## Requirements

- Xcode 15 or newer
- iOS 17 simulator or device (the design references Apple's iOS 26 liquid glass aesthetic).
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) if you would like to regenerate the project file.

## Getting Started

1. Open `ios/JPApp/JPApp.xcodeproj` in Xcode.
2. In the **JPApp** target settings set your development team for code signing.
3. If you run the Next.js backend locally, start it with `npm run dev` from the project root.
4. Optionally set the `JP_BACKEND_URL` environment variable in the scheme's run configuration to point to your deployed backend.
5. Build and run the **JPApp** target.

The dashboard pulls featured study cards from `GET /api/stats` and renders them with a custom `LiquidGlassView` that mimics the liquid glass panels from Apple's latest design language.
