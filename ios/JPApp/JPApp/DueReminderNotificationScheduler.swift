#if canImport(UserNotifications)
import Foundation
import UserNotifications

/// Quản lý lịch thông báo nhắc nhở ôn tập các thẻ đến hạn trong ngày.
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
            "Hôm nay vẫn còn %d thẻ đến hạn chờ bạn ôn tập."
        }
    }

    private let center: UNUserNotificationCenter

    private init(center: UNUserNotificationCenter = .current()) {
        self.center = center
    }

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
