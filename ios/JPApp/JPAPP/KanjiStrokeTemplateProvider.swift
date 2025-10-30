import Foundation
import CoreGraphics

/// Cung cấp mẫu nét chữ (stroke templates) cho từng Kanji để so khớp và chấm điểm.
protocol KanjiStrokeTemplateProvider {
    /// Trả về danh sách nét (polyline) theo thứ tự vẽ chuẩn cho ký tự Kanji.
    func template(for kanji: String) -> [StrokeTemplate]?
}

/// Một nét chuẩn gồm danh sách điểm theo thứ tự vẽ và có thể kèm hướng tổng quát.
struct StrokeTemplate {
    let points: [CGPoint]
    let direction: CGVector?
}

/// Provider mặc định (placeholder). Bạn có thể mở rộng dần với các mẫu thật.
final class DefaultKanjiStrokeTemplateProvider: KanjiStrokeTemplateProvider {
    private let data: [String: [StrokeTemplate]]

    init() {
        // Ví dụ tối giản cho một ký tự: "一" (một nét ngang)
        // Lưu ý: các điểm ở đây chỉ minh họa; bạn nên thay bằng dữ liệu thật (KanjiVG hoặc bộ mẫu của bạn).
        let ichi: [StrokeTemplate] = [
            StrokeTemplate(points: [CGPoint(x: 10, y: 50), CGPoint(x: 90, y: 50)],
                           direction: CGVector(dx: 1, dy: 0))
        ]

        // Ví dụ cho "二" (hai nét ngang)
        let ni: [StrokeTemplate] = [
            StrokeTemplate(points: [CGPoint(x: 10, y: 40), CGPoint(x: 90, y: 40)], direction: CGVector(dx: 1, dy: 0)),
            StrokeTemplate(points: [CGPoint(x: 20, y: 70), CGPoint(x: 80, y: 70)], direction: CGVector(dx: 1, dy: 0))
        ]

        data = [
            "一": ichi,
            "二": ni
        ]
    }

    func template(for kanji: String) -> [StrokeTemplate]? {
        data[kanji]
    }
}
