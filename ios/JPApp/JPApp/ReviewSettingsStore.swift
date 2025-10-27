import Foundation
import Combine

final class ReviewSettingsStore: ObservableObject {
    enum AutoFlipOption: String, CaseIterable, Identifiable {
        case off
        case seconds2Plus3 = "2+3"
        case seconds4Plus5 = "4+5"
        case seconds6Plus7 = "6+7"

        var id: String { rawValue }

        var title: String {
            switch self {
            case .off:
                return "Tắt"
            case .seconds2Plus3:
                return "2s (MCQ) + 3s (Điền)"
            case .seconds4Plus5:
                return "4s (MCQ) + 5s (Điền)"
            case .seconds6Plus7:
                return "6s (MCQ) + 7s (Điền)"
            }
        }
    }

    enum CardOrientation: String, CaseIterable, Identifiable {
        case normal
        case reversed

        var id: String { rawValue }

        var title: String {
            switch self {
            case .normal:
                return "Bình thường"
            case .reversed:
                return "Đảo mặt"
            }
        }
    }

    struct AutoFlipConfiguration {
        let warmupDelay: TimeInterval
        let recallDelay: TimeInterval
    }

    @Published var autoFlip: AutoFlipOption {
        didSet { persist() }
    }

    @Published var cardOrientation: CardOrientation {
        didSet { persist() }
    }

    private let defaults: UserDefaults

    private enum Keys {
        static let autoFlip = "jp.review.autoFlip"
        static let cardOrientation = "jp.review.cardOrientation"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        if let rawAuto = defaults.string(forKey: Keys.autoFlip),
           let option = AutoFlipOption(rawValue: rawAuto) {
            autoFlip = option
        } else {
            autoFlip = .off
        }

        if let rawOrientation = defaults.string(forKey: Keys.cardOrientation),
           let orientation = CardOrientation(rawValue: rawOrientation) {
            cardOrientation = orientation
        } else {
            cardOrientation = .normal
        }
    }

    var autoFlipConfiguration: AutoFlipConfiguration? {
        switch autoFlip {
        case .off:
            return nil
        case .seconds2Plus3:
            return AutoFlipConfiguration(warmupDelay: 2, recallDelay: 3)
        case .seconds4Plus5:
            return AutoFlipConfiguration(warmupDelay: 4, recallDelay: 5)
        case .seconds6Plus7:
            return AutoFlipConfiguration(warmupDelay: 6, recallDelay: 7)
        }
    }

    private func persist() {
        defaults.set(autoFlip.rawValue, forKey: Keys.autoFlip)
        defaults.set(cardOrientation.rawValue, forKey: Keys.cardOrientation)
    }
}
