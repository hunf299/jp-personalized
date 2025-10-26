#if canImport(UserNotifications)
import Foundation
import UserNotifications

/// Quản lý lịch thông báo nhắc nhở ôn tập các thẻ đến hạn trong ngày.
final class DueReminderNotificationScheduler {
    static let shared = DueReminderNotificationScheduler()

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

        ReminderSlot.allCases.forEach { slot in
            let content = UNMutableNotificationContent()
            content.title = slot.title
            content.body = String(format: slot.bodyFormat, dueCount)
            content.sound = .default
            content.threadIdentifier = "due-reminder"

            var components = slot.scheduledTime
            components.calendar = Calendar.current
            components.timeZone = TimeZone.current

            let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: true)
            let request = UNNotificationRequest(identifier: slot.identifier, content: content, trigger: trigger)
            center.add(request, withCompletionHandler: nil)
        }
    }

    private func cancelAllDueReminders() {
        let identifiers = ReminderSlot.allCases.map { $0.identifier }
        center.removePendingNotificationRequests(withIdentifiers: identifiers)
    }
}
#endif
