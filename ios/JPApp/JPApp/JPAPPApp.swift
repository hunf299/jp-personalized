#if canImport(SwiftUI)
import SwiftUI

@available(iOS 14.0, *)
@main
struct JPAPPApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
#endif
