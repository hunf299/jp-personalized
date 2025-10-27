#if canImport(SwiftUI)
import SwiftUI

@main
@MainActor
struct BackendApp: App {
#if canImport(UIKit)
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
#endif
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var appState = AppState()

    init() {
        #if canImport(UserNotifications)
        if DueReminderNotificationScheduler.dueTodayCountProvider == nil {
            DueReminderNotificationScheduler.dueTodayCountProvider = {
                DueReminderNotificationScheduler.shared.storedDueCountForToday()
            }
        }
        DueReminderNotificationScheduler.shared.requestAuthorization()
        #endif
    }

    var body: some Scene {
        WindowGroup {
            if #available(iOS 16.0, *) {
                ContentView()
                    .environmentObject(appState)
            } else {
                UpgradeView()
            }
        }
        .onChange(of: scenePhase) { newPhase in
            #if canImport(UserNotifications)
            if newPhase == .active {
                #if canImport(BackgroundTasks)
                DueReminderBackgroundManager.shared.refreshDueRemindersNow()
                #else
                DueReminderNotificationScheduler.shared.refreshDueRemindersUsingProvider()
                #endif
            }
            #endif
            #if canImport(BackgroundTasks)
            if newPhase == .background || newPhase == .active {
                DueReminderBackgroundManager.shared.ensureDailyRefreshScheduled()
            }
            #endif
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
