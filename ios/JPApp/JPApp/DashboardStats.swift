import Foundation

/// The JSON from the new API matches this schema:
/// {"total": Int, "kanji": Int, "particle": Int, "grammar": Int, "vocab": Int}
struct DashboardStats: Codable {
    let total: Int
    let kanji: Int
    let particle: Int
    let grammar: Int
    let vocab: Int
}

extension DashboardStats {
    func asMetrics() -> [StudyCard.Metric] {
        return [
            StudyCard.Metric(label: "Tổng số", value: String(total)),
            StudyCard.Metric(label: "Kanji", value: String(kanji)),
            StudyCard.Metric(label: "Particle", value: String(particle)),
            StudyCard.Metric(label: "Grammar", value: String(grammar)),
            StudyCard.Metric(label: "Vocab", value: String(vocab))
        ]
    }
}
