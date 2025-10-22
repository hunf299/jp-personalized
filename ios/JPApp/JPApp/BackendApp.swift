#if canImport(SwiftUI)
import SwiftUI

@main
@MainActor
struct BackendApp: App {
    @StateObject private var appState = AppState()

    var body: some Scene {
        WindowGroup {
            if #available(iOS 16.0, *) {
                ContentView()
                    .environmentObject(appState)
            } else {
                UpgradeView()
            }
        }
    }
}

private struct UpgradeView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 48, weight: .bold))
                .foregroundColor(.orange)
            Text("Yêu cầu iOS 16 trở lên")
                .font(.headline)
            Text("Ứng dụng JP Personalized cần iOS 16 hoặc mới hơn để chạy giao diện SwiftUI mới.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
        }
        .padding()
    }
}
#endif
