#if canImport(UserNotifications)
#if canImport(BackgroundTasks)
import BackgroundTasks
#endif
import Foundation
import UserNotifications

/// Schedules user notifications for due reminders and arranges a background pre-refresh 1 hour before each slot.
/// Integration notes:
/// - Call `DueReminderNotificationScheduler.registerBackgroundTasks()` at app launch (App/Scene delegate) to register BG tasks.
/// - The scheduler will submit BGAppRefreshTask requests automatically when reminders are (re)schedule.
/// - Optionally call `DueReminderNotificationScheduler.setupBackgroundPreRefreshOnLaunch()` to both register and schedule pre-refresh tasks at app launch.
/// - Optionally call `DueReminderNotificationScheduler.shared.applicationDidEnterBackgroundHook()` when app enters background to ensure BG tasks are submitted before suspension.
final class DueReminderNotificationScheduler {
    static let shared = DueReminderNotificationScheduler()

    private let storage = StoredCountsStorage()

    private enum ReminderSlot: CaseIterable {
        case morning
        case afternoon
        case evening

        var identifier: String {
            switch self {
            case .morning: return "due-reminder-morning"
            case .afternoon: return "due-reminder-afternoon"
            case .evening: return "due-reminder-evening"
            }
        }

        var scheduledTime: DateComponents {
            var components = DateComponents()
            components.hour = hour
            components.minute = minute
            return components
        }

        private var hour: Int {
            switch self {
            case .morning: return 8
            case .afternoon: return 16
            case .evening: return 19
            }
        }

        private var minute: Int { 0 }

        var title: String {
            switch self {
            case .morning: return "Nhắc ôn buổi sáng"
            case .afternoon: return "Nhắc ôn buổi chiều"
            case .evening: return "Nhắc ôn buổi tối"
            }
        }

        var bodyFormat: String {
            "Hôm nay có %d thẻ đến hạn chờ bạn ôn tập."
        }

        // Identifier for background pre-refresh (1 hour before the slot time)
        var preRefreshIdentifier: String {
            switch self {
            case .morning: return "due-reminder-refresh-morning"
            case .afternoon: return "due-reminder-refresh-afternoon"
            case .evening: return "due-reminder-refresh-evening"
            }
        }

        // Returns the date components for the pre-refresh time (1 hour before scheduledTime)
        func preRefreshDateComponents(calendar: Calendar) -> DateComponents {
            var components = scheduledTime
            if let hour = components.hour {
                components.hour = max(0, hour - 1)
            }
            return components
        }
    }

    private let center: UNUserNotificationCenter

    #if canImport(BackgroundTasks)
    // Background task identifiers must also be registered at app launch.
    // Call `DueReminderNotificationScheduler.registerBackgroundTasks()` from App/Scene delegate.
    static func registerBackgroundTasks() {
        if #available(iOS 13.0, macOS 13.0, *) {
            ReminderSlot.allCases.forEach { slot in
                BGTaskScheduler.shared.register(forTaskWithIdentifier: slot.preRefreshIdentifier, using: nil) { task in
                    guard let appRefresh = task as? BGAppRefreshTask else {
                        task.setTaskCompleted(success: false)
                        return
                    }
                    // Handle refresh and reschedule next pre-refresh
                    shared.handlePreRefresh(appRefresh, for: slot)
                }
            }
        }
    }
    #endif

    private init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

    // MARK: - Pre-refresh scheduling (1 hour before slots)
    #if canImport(BackgroundTasks)
    @available(iOS 13.0, macOS 13.0, *)
    private func nextPreRefreshDate(for slot: ReminderSlot, now: Date = Date(), calendar: Calendar = .current) -> Date? {
        // Build today at slot time minus 1 hour
        let today = calendar.dateComponents([.year, .month, .day], from: now)
        var comps = DateComponents()
        comps.year = today.year
        comps.month = today.month
        comps.day = today.day
        comps.hour = slot.preRefreshDateComponents(calendar: calendar).hour
        comps.minute = slot.preRefreshDateComponents(calendar: calendar).minute
        comps.calendar = calendar
        comps.timeZone = TimeZone.current

        // Today pre-refresh time
        guard let todayPreRefresh = calendar.date(from: comps) else { return nil }
        if todayPreRefresh > now { return todayPreRefresh }

        // Otherwise schedule for tomorrow
        guard let tomorrow = calendar.date(byAdding: .day, value: 1, to: now) else { return nil }
        let tmr = calendar.dateComponents([.year, .month, .day], from: tomorrow)
        var tmrComps = DateComponents()
        tmrComps.year = tmr.year
        tmrComps.month = tmr.month
        tmrComps.day = tmr.day
        tmrComps.hour = slot.preRefreshDateComponents(calendar: calendar).hour
        tmrComps.minute = slot.preRefreshDateComponents(calendar: calendar).minute
        tmrComps.calendar = calendar
        tmrComps.timeZone = TimeZone.current
        return calendar.date(from: tmrComps)
    }

    /// Schedule BGAppRefreshTask one hour before each reminder slot.
    @available(iOS 13.0, macOS 13.0, *)
    private func schedulePreRefreshTasks(now: Date = Date()) {
        ReminderSlot.allCases.forEach { slot in
            guard let date = nextPreRefreshDate(for: slot, now: now) else { return }
            let request = BGAppRefreshTaskRequest(identifier: slot.preRefreshIdentifier)
            // Earliest begin date is our target pre-refresh time
            request.earliestBeginDate = date
            do {
                try BGTaskScheduler.shared.submit(request)
            } catch {
                // Ignore submission errors; system may throttle
            }
        }
    }

    /// Cancel all pre-refresh tasks (e.g., when canceling reminders).
    @available(iOS 13.0, macOS 13.0, *)
    private func cancelPreRefreshTasks() {
        let ids = ReminderSlot.allCases.map { $0.preRefreshIdentifier }
        ids.forEach { BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: $0) }
    }

    /// Convenience: Call at app launch to register and schedule pre-refresh tasks for the next slots.
    @available(iOS 13.0, macOS 13.0, *)
    static func setupBackgroundPreRefreshOnLaunch() {
        registerBackgroundTasks()
        shared.schedulePreRefreshTasks()
    }

    /// Public helper to (re)schedule pre-refresh tasks independently of notification scheduling.
    @available(iOS 13.0, macOS 13.0, *)
    func ensurePreRefreshScheduled() {
        schedulePreRefreshTasks()
    }

    /// Call this from AppDelegate/ScenePhase when the app enters background to ensure tasks are submitted.
    @available(iOS 13.0, macOS 13.0, *)
    func applicationDidEnterBackgroundHook() {
        schedulePreRefreshTasks()
    }

    /// Handle a fired BGAppRefreshTask: refresh counts and reschedule reminders and next pre-refresh.
    @available(iOS 13.0, macOS 13.0, *)
    private func handlePreRefresh(_ task: BGAppRefreshTask, for slot: ReminderSlot) {
        schedulePreRefreshTasks() // Schedule the next cycle early

        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1

        let op = BlockOperation { [weak self] in
            guard let self else { return }
            self.refreshDueRemindersUsingProvider()
        }

        task.expirationHandler = {
            queue.cancelAllOperations()
        }

        op.completionBlock = {
            task.setTaskCompleted(success: true)
        }

        queue.addOperation(op)
    }
    #endif

    // MARK: - Provider for background refresh
    /// A provider that returns today's due cards count when refreshing in background.
    typealias DueTodayCountProvider = () -> Int?

    /// Set this from your data layer so background refresh can obtain the latest due count.
    static var dueTodayCountProvider: DueTodayCountProvider? = {
        shared.storedDueCountForToday()
    }

    /// Refresh reminders using the provided count provider. If no count is available, cancels today's reminders.
    func refreshDueRemindersUsingProvider() {
        let providedCount = Self.dueTodayCountProvider?()
        let resolvedCount = providedCount ?? storedDueCountForToday()

        if let count = resolvedCount {
            updateDueReminders(forDueTodayCount: count)
        } else {
            cancelAllDueReminders()
        }
    }

    /// Lưu lại số lượng thẻ đến hạn cho hôm nay và ngày tiếp theo để phục vụ background refresh.
    /// - Parameters:
    ///   - todayCount: Số lượng thẻ đến hạn của ngày hiện tại.
    ///   - tomorrowCount: Số lượng thẻ đến hạn của ngày tiếp theo (nếu đã biết).
    ///   - referenceDate: Thời điểm làm chuẩn cho `todayCount`.
    func storeUpcomingDueCounts(todayCount: Int, tomorrowCount: Int?, referenceDate: Date = Date()) {
        storage.save(todayCount: todayCount, tomorrowCount: tomorrowCount, referenceDate: referenceDate)
    }

    /// Truy xuất số thẻ đến hạn đã lưu trữ cho ngày hiện tại (sử dụng cho background refresh/PushKit).
    /// - Returns: Số lượng thẻ đến hạn hoặc `nil` nếu không có dữ liệu phù hợp.
    func storedDueCountForToday(now: Date = Date()) -> Int? {
        storage.currentCount(for: now)
    }

    /// Yêu cầu quyền gửi thông báo nếu người dùng chưa cấp.
    func requestAuthorization() {
        center.requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
    }

    /// Cập nhật lại các thông báo nhắc nhở dựa trên số thẻ đến hạn hôm nay.
    /// - Parameter dueCount: Số lượng thẻ đến hạn trong ngày. Nếu bằng 0 sẽ hủy các lịch nhắc.
    func updateDueReminders(forDueTodayCount dueCount: Int) {
        if dueCount <= 0 {
            cancelAllDueReminders()
            return
        }

        center.getNotificationSettings { [weak self] settings in
            guard let self else { return }
            switch settings.authorizationStatus {
            case .authorized, .provisional, .ephemeral:
                self.scheduleReminders(for: dueCount)
                #if canImport(BackgroundTasks)
                if #available(iOS 13.0, macOS 13.0, *) {
                    self.schedulePreRefreshTasks()
                }
                #endif
            default:
                break
            }
        }
    }

    private func scheduleReminders(for dueCount: Int) {
        cancelAllDueReminders()

        let calendar = Calendar.current
        let now = Date()
        let today = calendar.dateComponents([.year, .month, .day], from: now)

        ReminderSlot.allCases.forEach { slot in
            // Build components for today at the slot time
            var components = DateComponents()
            components.year = today.year
            components.month = today.month
            components.day = today.day
            components.hour = slot.scheduledTime.hour
            components.minute = slot.scheduledTime.minute
            components.calendar = calendar
            components.timeZone = TimeZone.current

            // Create a date from components and skip if it's already passed today
            if let fireDate = calendar.date(from: components), fireDate <= now {
                return
            }

            let content = UNMutableNotificationContent()
            content.title = slot.title
            content.body = String(format: slot.bodyFormat, dueCount)
            content.sound = .default
            content.threadIdentifier = "due-reminder"

            // Do not repeat; we reschedule each day with the fresh count
            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
            let request = UNNotificationRequest(identifier: slot.identifier, content: content, trigger: trigger)
            center.add(request, withCompletionHandler: nil)
        }
    }

    private func cancelAllDueReminders() {
        let identifiers = ReminderSlot.allCases.map { $0.identifier }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
        #if canImport(BackgroundTasks)
        if #available(iOS 13.0, macOS 13.0, *) {
            cancelPreRefreshTasks()
        }
        #endif
    }
}

private final class StoredCountsStorage {
    private struct Snapshot: Codable {
        var referenceDate: Date
        var todayCount: Int
        var tomorrowCount: Int?
    }

    private let defaults: UserDefaults
    private let queue = DispatchQueue(label: "due-reminder-counts", qos: .utility)
    private let storageKey = "jp.dueReminder.storedCounts"

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func save(todayCount: Int, tomorrowCount: Int?, referenceDate: Date, calendar: Calendar = .current) {
        let startOfDay = calendar.startOfDay(for: referenceDate)
        let snapshot = Snapshot(referenceDate: startOfDay, todayCount: todayCount, tomorrowCount: tomorrowCount)
        queue.sync {
            guard let data = try? JSONEncoder().encode(snapshot) else { return }
            self.defaults.set(data, forKey: self.storageKey)
        }
    }

    func currentCount(for date: Date, calendar: Calendar = .current) -> Int? {
        queue.sync {
            guard var snapshot = loadSnapshot() else { return nil }

            let requestedDay = calendar.startOfDay(for: date)
            let storedDay = calendar.startOfDay(for: snapshot.referenceDate)

            if storedDay == requestedDay {
                return snapshot.todayCount
            }

            guard let nextDay = calendar.date(byAdding: .day, value: 1, to: storedDay),
                  calendar.startOfDay(for: nextDay) == requestedDay,
                  let tomorrowCount = snapshot.tomorrowCount else {
                return nil
            }

            snapshot.referenceDate = requestedDay
            snapshot.todayCount = tomorrowCount
            snapshot.tomorrowCount = nil
            saveSnapshot(snapshot)
            return tomorrowCount
        }
    }

    private func loadSnapshot() -> Snapshot? {
        guard let data = defaults.data(forKey: storageKey) else { return nil }
        return try? JSONDecoder().decode(Snapshot.self, from: data)
    }

    private func saveSnapshot(_ snapshot: Snapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        defaults.set(data, forKey: storageKey)
    }
}
#endif

