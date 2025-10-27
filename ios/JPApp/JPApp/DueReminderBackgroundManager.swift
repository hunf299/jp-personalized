#if canImport(BackgroundTasks)
import Foundation
import BackgroundTasks

/// Quản lý BGAppRefresh để tự động cập nhật thông báo nhắc ôn trong nền hằng ngày.
final class DueReminderBackgroundManager {
    static let shared = DueReminderBackgroundManager()

    private let fallbackIdentifier = "com.jppersonalized.app.refreshDueReminders"
    private let refreshHour = 0
    private let refreshMinute = 5

    private var taskIdentifier: String {
        if let bundleID = Bundle.main.bundleIdentifier, !bundleID.isEmpty {
            return "\(bundleID).refreshDueReminders"
        }
        return fallbackIdentifier
    }

    private init() {}

    // MARK: - Registration
    /// Gọi sớm (ví dụ trong AppDelegate didFinishLaunching) để đăng ký task.
    func register() {
        if #available(iOS 13.0, *) {
            BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
                guard let refreshTask = task as? BGAppRefreshTask else {
                    task.setTaskCompleted(success: false)
                    return
                }
                self.handleAppRefresh(task: refreshTask)
            }
        }
    }

    // MARK: - Scheduling
    /// Lên lịch chạy nền. Có thể truyền thời điểm sớm nhất; nếu không, hệ thống sẽ tự quyết định.
    func scheduleAppRefresh(earliestBeginDate: Date? = nil) {
        guard #available(iOS 13.0, *) else { return }
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        if let date = earliestBeginDate {
            request.earliestBeginDate = date
        }
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Có thể trùng lặp request; không sao, hệ thống sẽ quản lý.
            // print("BG submit error: \(error)")
        }
    }

    /// Tiện ích: Lên lịch cho khoảng đầu buổi sáng mỗi ngày (mặc định 06:00),
    /// nếu thời điểm đã qua thì tự động chuyển sang ngày hôm sau.
    func scheduleNextDaily(hour: Int = 6, minute: Int = 0) {
        guard #available(iOS 13.0, *) else { return }
        let cal = Calendar.current
        var next = cal.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
        if next <= Date() {
            next = cal.date(byAdding: .day, value: 1, to: next) ?? next.addingTimeInterval(24 * 60 * 60)
        }
        scheduleAppRefresh(earliestBeginDate: next)
    }

    /// Đảm bảo đã lên lịch chạy nền vào đầu mỗi ngày để cập nhật thông báo.
    func ensureDailyRefreshScheduled() {
        scheduleNextDaily(hour: refreshHour, minute: refreshMinute)
    }

    /// Thực hiện cập nhật thông báo ngay lập tức, sử dụng provider đã cấu hình.
    /// - Parameter reschedule: Nếu `true` sẽ lên lịch lại phiên chạy nền cho ngày kế tiếp sau khi hoàn tất.
    func refreshDueRemindersNow(reschedule: Bool = false) {
        #if canImport(UserNotifications)
        DueReminderNotificationScheduler.shared.refreshDueRemindersUsingProvider()
        if reschedule {
            ensureDailyRefreshScheduled()
        }
        #endif
    }

    // MARK: - Handling
    @available(iOS 13.0, *)
    private func handleAppRefresh(task: BGAppRefreshTask) {
        // Lên lịch lại ngay để đảm bảo lần sau vẫn chạy dù app bị kill sớm.
        ensureDailyRefreshScheduled()

        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1

        let op = BlockOperation {
            // Gọi scheduler để làm mới thông báo bằng provider do app cung cấp.
            self.refreshDueRemindersNow()
        }

        task.expirationHandler = {
            queue.cancelAllOperations()
        }

        op.completionBlock = {
            task.setTaskCompleted(success: !op.isCancelled)
        }

        queue.addOperation(op)
    }
}
#endif
