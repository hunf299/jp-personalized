#if canImport(UIKit)
import UIKit

final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        #if canImport(BackgroundTasks)
        DueReminderBackgroundManager.shared.register()
        DueReminderBackgroundManager.shared.scheduleNextDaily(hour: 0, minute: 5)
        #endif
        #if canImport(UserNotifications)
        DueReminderNotificationScheduler.shared.refreshDueRemindersUsingProvider()
        #endif
        return true
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        #if canImport(BackgroundTasks)
        DueReminderBackgroundManager.shared.scheduleNextDaily(hour: 0, minute: 5)
        #endif
    }

    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        #if canImport(UserNotifications)
        DueReminderNotificationScheduler.shared.refreshDueRemindersUsingProvider()
        #endif
        completionHandler(.newData)
    }
}
#endif
