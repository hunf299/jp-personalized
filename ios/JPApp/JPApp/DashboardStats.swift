import Foundation

/// The JSON from the new API matches this schema:
/// {"total": Int, "kanji": Int, "particle": Int, "grammar": Int, "vocab": Int}
struct DashboardStats: Codable {
    private enum CodingKeys: String, CodingKey {
        case total
        case kanji
        case particle
        case grammar
        case vocab
    }

    let total: Int
    let kanji: Int
    let particle: Int
    let grammar: Int
    let vocab: Int

    init(total _total: Int, kanji: Int, particle: Int, grammar: Int, vocab: Int) {
        self.kanji = kanji
        self.particle = particle
        self.grammar = grammar
        self.vocab = vocab
        self.total = kanji + particle + grammar + vocab
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)

        let kanji = try container.decodeIfPresent(Int.self, forKey: .kanji) ?? 0
        let particle = try container.decodeIfPresent(Int.self, forKey: .particle) ?? 0
        let grammar = try container.decodeIfPresent(Int.self, forKey: .grammar) ?? 0
        let vocab = try container.decodeIfPresent(Int.self, forKey: .vocab) ?? 0

        self.kanji = kanji
        self.particle = particle
        self.grammar = grammar
        self.vocab = vocab
        self.total = kanji + particle + grammar + vocab
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(total, forKey: .total)
        try container.encode(kanji, forKey: .kanji)
        try container.encode(particle, forKey: .particle)
        try container.encode(grammar, forKey: .grammar)
        try container.encode(vocab, forKey: .vocab)
    }
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
