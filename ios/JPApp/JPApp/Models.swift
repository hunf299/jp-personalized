import Foundation

private enum JSONDateFormatters {
    static let iso8601WithFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let iso8601Basic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static func parseString(_ value: String) -> Date? {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }

        if let date = iso8601WithFractional.date(from: trimmed) { return date }
        if let date = iso8601Basic.date(from: trimmed) { return date }

        let fallbackFormats = [
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss"
        ]

        for format in fallbackFormats {
            let formatter = DateFormatter()
            formatter.locale = Locale(identifier: "en_US_POSIX")
            formatter.timeZone = TimeZone(secondsFromGMT: 0)
            formatter.dateFormat = format
            if let date = formatter.date(from: trimmed) {
                return date
            }
        }

        if let numeric = Double(trimmed) {
            let seconds = numeric > 1_000_000_000_000 ? numeric / 1000 : numeric
            return Date(timeIntervalSince1970: seconds)
        }

        return nil
    }
}

enum JSONValue: Codable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case object([String: JSONValue])
    case array([JSONValue])
    case null

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else if let b = try? container.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? container.decode(Double.self) {
            self = .number(n)
        } else if let s = try? container.decode(String.self) {
            self = .string(s)
        } else if let array = try? container.decode([JSONValue].self) {
            self = .array(array)
        } else if let object = try? container.decode([String: JSONValue].self) {
            self = .object(object)
        } else {
            throw DecodingError.dataCorruptedError(in: container, debugDescription: "Unsupported JSON type")
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .bool(let value):
            try container.encode(value)
        case .number(let value):
            try container.encode(value)
        case .string(let value):
            try container.encode(value)
        case .array(let values):
            try container.encode(values)
        case .object(let values):
            try container.encode(values)
        case .null:
            try container.encodeNil()
        }
    }

    var stringValue: String? {
        switch self {
        case .string(let value):
            return value
        case .number(let value):
            if value.rounded(.down) == value {
                return String(Int(value))
            }
            return String(value)
        case .bool(let value):
            return value ? "true" : "false"
        default:
            return nil
        }
    }

    var intValue: Int? {
        switch self {
        case .number(let value):
            return Int(value)
        case .string(let value):
            return Int(value)
        default:
            return nil
        }
    }

    var doubleValue: Double? {
        switch self {
        case .number(let value):
            return value
        case .string(let value):
            return Double(value)
        default:
            return nil
        }
    }

    var boolValue: Bool? {
        switch self {
        case .bool(let value):
            return value
        case .number(let value):
            return value != 0
        case .string(let value):
            let lower = value.lowercased()
            if ["true", "t", "1", "yes", "y"].contains(lower) { return true }
            if ["false", "f", "0", "no", "n"].contains(lower) { return false }
            return nil
        default:
            return nil
        }
    }

    var arrayValue: [JSONValue]? {
        if case .array(let array) = self { return array }
        return nil
    }

    var objectValue: [String: JSONValue]? {
        if case .object(let object) = self { return object }
        return nil
    }

    var normalizedString: String {
        stringValue ?? ""
    }

    var stringList: [String] {
        switch self {
        case .string(let value):
            return value.split(whereSeparator: { ",;|".contains($0) }).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        case .array(let array):
            return array.compactMap { $0.stringValue?.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }
        default:
            return []
        }
    }

    func dateValue() -> Date? {
        switch self {
        case .string(let value):
            return JSONDateFormatters.parseString(value)
        case .number(let raw):
            let seconds = raw > 1_000_000_000_000 ? raw / 1000 : raw
            return Date(timeIntervalSince1970: seconds)
        default:
            return nil
        }
    }
}

struct DeckCard: Identifiable, Decodable, Hashable {
    let id: String
    let numericID: Int?
    let type: String
    let front: String
    let back: String?
    let category: String?
    let extra: [String: JSONValue]

    init(id: String, numericID: Int? = nil, type: String, front: String, back: String?, category: String? = nil, extra: [String: JSONValue] = [:]) {
        self.id = id
        self.numericID = numericID
        self.type = type
        self.front = front
        self.back = back
        self.category = category
        self.extra = extra
    }

    init(from decoder: Decoder) throws {
        let raw = try [String: JSONValue](from: decoder)
        extra = raw
        if let idValue = raw["id"] {
            if let uuid = idValue.stringValue, !uuid.isEmpty {
                id = uuid
            } else if let intValue = idValue.intValue {
                id = String(intValue)
            } else {
                id = UUID().uuidString
            }
            numericID = idValue.intValue
        } else {
            id = UUID().uuidString
            numericID = nil
        }
        type = raw["type"]?.stringValue ?? "vocab"
        front = raw["front"]?.stringValue ?? ""
        back = raw["back"]?.stringValue
        category = raw["category"]?.stringValue
    }

    var displayMeaning: String {
        back ?? extra["meaning"]?.stringValue ?? extra["hv"]?.stringValue ?? ""
    }

    var radicals: [String] {
        if let direct = extra["radicals"]?.stringList, !direct.isEmpty { return direct }
        if let category = category { return category.split(whereSeparator: { ",;".contains($0) }).map { $0.trimmingCharacters(in: .whitespaces) } }
        return []
    }

    var hanViet: String {
        let keys = ["hv", "hanviet", "han_viet", "han_viet_reading"]
        for key in keys {
            if let value = extra[key]?.stringValue, !value.isEmpty { return value }
        }
        return displayMeaning
    }

    var onReading: String {
        if let readings = extra["readings"]?.objectValue,
           let values = readings["on"]?.stringList,
           !values.isEmpty {
            return values.joined(separator: ", ")
        }
        if let value = extra["on"]?.stringValue, !value.isEmpty {
            return value
        }
        // Fallback: infer from katakana runs
        let generated = generatedReadings()
        if !generated.katakana.isEmpty {
            return generated.katakana.joined(separator: ", ")
        }
        // Final fallback: small built-in dictionary by kanji
        if type == "kanji", let first = front.first {
            let key = String(first)
            let dictVals = KanjiReadingsProvider.shared.onReadings(for: key)
            if !dictVals.isEmpty { return dictVals.joined(separator: ", ") }
        }
        return "—"
    }

    var kunReading: String {
        if let readings = extra["readings"]?.objectValue,
           let values = readings["kun"]?.stringList,
           !values.isEmpty {
            return values.joined(separator: ", ")
        }
        if let value = extra["kun"]?.stringValue, !value.isEmpty {
            return value
        }
        // Fallback: infer from hiragana runs
        let generated = generatedReadings()
        if !generated.hiragana.isEmpty {
            return generated.hiragana.joined(separator: ", ")
        }
        // Final fallback: small built-in dictionary by kanji
        if type == "kanji", let first = front.first {
            let key = String(first)
            let dictVals = KanjiReadingsProvider.shared.kunReadings(for: key)
            if !dictVals.isEmpty { return dictVals.joined(separator: ", ") }
        }
        return "—"
    }

    var relatedRules: [String] {
        if let arr = extra["related_rules"]?.stringList, !arr.isEmpty {
            return arr
        }
        if let value = extra["related_rules"]?.stringValue {
            return value.split(separator: ",").map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
        }
        return []
    }
}

extension DeckCard {
    var warmupLabel: String {
        if type == "kanji" {
            return "\(hanViet) · on: \(onReading) · kun: \(kunReading)"
        }
        return displayMeaning
    }
}

extension DeckCard {
    struct ExampleItem: Hashable {
        let front: String
        let back: String
        let spell: String
    }

    var exampleItems: [ExampleItem] {
        var results: [ExampleItem] = []

        func appendExample(front: String?, back: String?, spell: String?) {
            let trimmedFront = front?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let trimmedBack = back?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let trimmedSpell = spell?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            if trimmedFront.isEmpty && trimmedBack.isEmpty && trimmedSpell.isEmpty {
                return
            }
            let item = ExampleItem(front: trimmedFront, back: trimmedBack, spell: trimmedSpell)
            if !results.contains(item) {
                results.append(item)
            }
        }

        if let array = extra["examples"]?.arrayValue {
            for element in array {
                if let object = element.objectValue {
                    let front = object["front"]?.stringValue ?? object["question"]?.stringValue
                    let back = object["back"]?.stringValue ?? object["answer"]?.stringValue ?? object["meaning"]?.stringValue
                    let spell = object["spell"]?.stringValue ?? object["reading"]?.stringValue ?? object["hv"]?.stringValue
                    appendExample(front: front, back: back, spell: spell)
                } else if let text = element.stringValue {
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !trimmed.isEmpty else { continue }
                    let separators = ["→", "=>", "->", "｜", "|", "——", "—"]
                    var components: [String] = [trimmed]
                    for separator in separators {
                        let parts = trimmed.components(separatedBy: separator)
                        if parts.count >= 2 {
                            components = parts
                            break
                        }
                    }
                    let front = components.first
                    let back = components.dropFirst().joined(separator: " → ")
                    appendExample(front: front, back: back, spell: nil)
                }
            }
        }

        if results.isEmpty, let object = extra["examples"]?.objectValue {
            for (_, value) in object {
                if let entry = value.objectValue {
                    let front = entry["front"]?.stringValue ?? entry["question"]?.stringValue
                    let back = entry["back"]?.stringValue ?? entry["answer"]?.stringValue ?? entry["meaning"]?.stringValue
                    let spell = entry["spell"]?.stringValue ?? entry["reading"]?.stringValue ?? entry["hv"]?.stringValue
                    appendExample(front: front, back: back, spell: spell)
                }
            }
        }

        if results.isEmpty {
            let fallbackFront = extra["example_front"]?.stringValue ?? extra["example"]?.stringValue
            let fallbackBack = extra["example_back"]?.stringValue ?? extra["example_meaning"]?.stringValue
            let fallbackSpell = extra["example_spell"]?.stringValue ?? extra["example_reading"]?.stringValue
            appendExample(front: fallbackFront, back: fallbackBack, spell: fallbackSpell)
        }

        return results
    }

    var spellVariants: [String] {
        var values: [String] = []

        func append(_ candidate: String?) {
            guard let candidate, !candidate.isEmpty else { return }
            let trimmed = candidate.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            if !values.contains(trimmed) {
                values.append(trimmed)
            }
        }

        for item in extra["spell"]?.stringList ?? [] {
            append(item)
        }
        append(extra["spell"]?.stringValue)

        if values.isEmpty {
            let readings = extra["readings"]?.objectValue
            if let onList = readings?["on"]?.stringList {
                for value in onList { append(value) }
            }
            if let kunList = readings?["kun"]?.stringList {
                for value in kunList { append(value) }
            }
        }

        if values.isEmpty {
            append(onReading == "—" ? nil : onReading)
            append(kunReading == "—" ? nil : kunReading)
        }

        return values
    }
}

extension DeckCard {
    // Attempt to generate readings from available text fields when explicit on/kun readings are missing.
    private var readingSourceTexts: [String] {
        var texts: [String] = []
        // Do NOT use `back` here because it contains Han-Viet only.
        texts.append(front)
        // Common keys that might store reading-like info
        let candidateKeys = [
            "reading", "readings", "kana", "furigana", "yomi", "ruby",
            "pronunciation", "pronounce", "reading_kana", "kana_reading"
        ]
        for key in candidateKeys {
            if let value = extra[key]?.stringValue, !value.isEmpty {
                texts.append(value)
            }
            if let arr = extra[key]?.arrayValue {
                let joined = arr.compactMap { $0.stringValue }.joined(separator: ", ")
                if !joined.isEmpty { texts.append(joined) }
            }
            if let obj = extra[key]?.objectValue {
                let joined = obj.values.compactMap { $0.stringValue }.joined(separator: ", ")
                if !joined.isEmpty { texts.append(joined) }
            }
        }
        return texts
    }

    private enum KanaKind { case hiragana, katakana, none }

    // Unicode helpers
    private func kanaKind(of scalar: Unicode.Scalar) -> KanaKind {
        switch scalar.value {
        case 0x3040...0x309F: // Hiragana block
            return .hiragana
        case 0x30A0...0x30FF: // Katakana block
            return .katakana
        case 0x31F0...0x31FF: // Katakana Phonetic Extensions
            return .katakana
        case 0xFF66...0xFF9F: // Halfwidth Katakana
            return .katakana
        default:
            return .none
        }
    }

    private func extractKanaRuns(from text: String) -> (hiragana: [String], katakana: [String]) {
        var hira: [String] = []
        var kata: [String] = []

        var current = String.UnicodeScalarView()
        var currentKind: KanaKind = .none

        func flush() {
            guard !current.isEmpty else { return }
            let s = String(String.UnicodeScalarView(current))
            switch currentKind {
            case .hiragana:
                hira.append(s)
            case .katakana:
                kata.append(s)
            case .none:
                break
            }
            current.removeAll()
            currentKind = .none
        }

        for scalar in text.unicodeScalars {
            let kind = kanaKind(of: scalar)
            if kind == .none {
                flush()
                continue
            }
            if currentKind == .none {
                currentKind = kind
                current.append(scalar)
            } else if currentKind == kind {
                current.append(scalar)
            } else {
                flush()
                currentKind = kind
                current.append(scalar)
            }
        }
        flush()

        func normalizeAndSplit(_ items: [String]) -> [String] {
            // Split by common separators inside a run just in case (・, ・, spaces, commas, slashes, semicolons, pipes)
            let seps = CharacterSet(charactersIn: "・・,;|/ ")
            return items
                .flatMap { $0.components(separatedBy: seps) }
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
        }

        let hiraN = Array(Set(normalizeAndSplit(hira))).sorted()
        let kataN = Array(Set(normalizeAndSplit(kata))).sorted()
        return (hiraN, kataN)
    }

    private func generatedReadings() -> (hiragana: [String], katakana: [String]) {
        var hira: [String] = []
        var kata: [String] = []
        for text in readingSourceTexts {
            let runs = extractKanaRuns(from: text)
            if !runs.hiragana.isEmpty { hira.append(contentsOf: runs.hiragana) }
            if !runs.katakana.isEmpty { kata.append(contentsOf: runs.katakana) }
        }
        // Deduplicate while preserving order
        func unique(_ array: [String]) -> [String] {
            var seen = Set<String>()
            var result: [String] = []
            for item in array where !item.isEmpty {
                if !seen.contains(item) {
                    seen.insert(item)
                    result.append(item)
                }
            }
            return result
        }
        return (unique(hira), unique(kata))
    }
}

struct MemorySnapshot: Decodable {
    let type: String?
    let total: Int
    let dist: [Int]
    let rows: [MemoryRow]

    enum CodingKeys: String, CodingKey {
        case type
        case total
        case dist
        case rows
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decodeIfPresent(String.self, forKey: .type)
        dist = try container.decodeIfPresent([Int].self, forKey: .dist) ?? Array(repeating: 0, count: 6)
        rows = try container.decodeIfPresent([MemoryRow].self, forKey: .rows) ?? []
        total = try container.decodeIfPresent(Int.self, forKey: .total) ?? rows.count
    }
}

extension MemorySnapshot {
    struct DueSummary {
        let overdue: Int
        let today: Int
        let upcoming: Int

        var dueTodayTotal: Int { overdue + today }
        var totalDueSoon: Int { overdue + today + upcoming }
    }

    func dueSummary(calendar: Calendar = .current) -> DueSummary {
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)

        guard let startOfTomorrow = calendar.date(byAdding: .day, value: 1, to: startOfToday),
              let upcomingLimit = calendar.date(byAdding: .day, value: 3, to: now) else {
            return DueSummary(overdue: 0, today: 0, upcoming: 0)
        }

        var overdue = 0
        var todayCount = 0
        var upcoming = 0

        for row in rows {
            guard let dueDate = row.due else { continue }

            if dueDate < startOfToday {
                overdue += 1
            } else if dueDate < startOfTomorrow {
                todayCount += 1
            }

            if dueDate > now && dueDate <= upcomingLimit {
                upcoming += 1
            }
        }

        return DueSummary(overdue: overdue, today: todayCount, upcoming: upcoming)
    }

    func dueCount(on date: Date, calendar: Calendar = .current) -> Int {
        let start = calendar.startOfDay(for: date)
        guard let end = calendar.date(byAdding: .day, value: 1, to: start) else {
            return 0
        }

        return rows.reduce(into: 0) { partialResult, row in
            guard let dueDate = row.due else { return }
            if dueDate >= start && dueDate < end {
                partialResult += 1
            }
        }
    }
}


struct MemoryRow: Identifiable, Decodable {
    let id: String
    let cardID: String
    let type: String?
    let level: Int
    let stability: Double?
    let difficulty: Double?
    let lastReviewedAt: Date?
    let due: Date?
    let front: String?
    let back: String?
    let leechCount: Int
    let isLeech: Bool

    init(from decoder: Decoder) throws {
        let raw = try [String: JSONValue](from: decoder)
        let cardValue = raw["card_id"] ?? raw["cardId"] ?? .null
        cardID = cardValue.stringValue ?? UUID().uuidString
        id = cardID
        type = raw["type"]?.stringValue
        level = raw["level"]?.intValue ?? 0
        stability = raw["stability"]?.doubleValue
        difficulty = raw["difficulty"]?.doubleValue
        lastReviewedAt = raw["last_reviewed_at"]?.dateValue()
        due = raw["due"]?.dateValue()
        front = raw["front"]?.stringValue
        back = raw["back"]?.stringValue
        leechCount = raw["leech_count"]?.intValue ?? 0
        isLeech = raw["is_leech"]?.boolValue ?? false
    }
}

struct LeechEntry: Identifiable, Decodable {
    let id: String
    let cardID: String
    let front: String
    let back: String?
    let leechCount: Int
    let isLeech: Bool
    let level: Int?

    init(from decoder: Decoder) throws {
        let raw = try [String: JSONValue](from: decoder)
        let cardIdentifier = raw["card_id"]?.stringValue ?? raw["cardId"]?.stringValue ?? UUID().uuidString
        cardID = cardIdentifier
        id = cardIdentifier

        let cardFields = raw["cards"]?.objectValue
        let frontValue = raw["front"]?.stringValue
            ?? raw["card_front"]?.stringValue
            ?? cardFields?["front"]?.stringValue
            ?? ""
        front = frontValue.trimmingCharacters(in: .whitespacesAndNewlines)

        let backValue = raw["back"]?.stringValue
            ?? raw["card_back"]?.stringValue
            ?? cardFields?["back"]?.stringValue
        if let backValue = backValue?.trimmingCharacters(in: .whitespacesAndNewlines), !backValue.isEmpty {
            back = backValue
        } else {
            back = nil
        }

        if let levelValue = raw["level"]?.intValue ?? raw["liveLevel"]?.intValue ?? cardFields?["level"]?.intValue {
            level = levelValue
        } else {
            level = nil
        }

        leechCount = raw["leech_count"]?.intValue ?? raw["leechCount"]?.intValue ?? 0
        isLeech = raw["is_leech"]?.boolValue ?? raw["isLeech"]?.boolValue ?? false
    }
}

struct StudySession: Identifiable, Decodable {
    struct SessionSummary: Decodable {
        let total: Int
        let learned: Int
        let left: Int
        let distribution: [Int]

        init(from decoder: Decoder) throws {
            let raw = try [String: JSONValue](from: decoder)
            total = raw["total"]?.intValue ?? 0
            learned = raw["learned"]?.intValue ?? 0
            left = raw["left"]?.intValue ?? max(0, total - learned)
            if let array = raw["agg"]?.arrayValue?.compactMap({ $0.intValue }) {
                distribution = array
            } else {
                distribution = []
            }
        }

        init?(json: JSONValue) {
            guard let object = json.objectValue else { return nil }
            total = object["total"]?.intValue ?? 0
            learned = object["learned"]?.intValue ?? 0
            left = object["left"]?.intValue ?? max(0, total - learned)
            if let array = object["agg"]?.arrayValue?.compactMap({ $0.intValue }) {
                distribution = array
            } else {
                distribution = []
            }
        }

        init(total: Int, learned: Int, left: Int, distribution: [Int]) {
            self.total = total
            self.learned = learned
            self.left = left
            self.distribution = distribution
        }
    }

    struct SessionCard: Identifiable, Decodable {
        let id: String
        let cardID: String
        let front: String?
        let back: String?
        let warmup: Int?
        let recall: Int?
        let final: Int?

        init(from decoder: Decoder) throws {
            let raw = try [String: JSONValue](from: decoder)
            let identifier = raw["id"]?.stringValue ?? raw["card_id"]?.stringValue ?? UUID().uuidString
            id = identifier
            cardID = raw["card_id"]?.stringValue ?? identifier
            front = raw["front"]?.stringValue
            back = raw["back"]?.stringValue
            warmup = raw["warmup"]?.intValue
            recall = raw["recall"]?.intValue
            final = raw["final"]?.intValue
        }

        init?(json: JSONValue) {
            guard let object = json.objectValue else { return nil }
            let identifier = object["id"]?.stringValue ?? object["card_id"]?.stringValue ?? UUID().uuidString
            id = identifier
            cardID = object["card_id"]?.stringValue ?? identifier
            front = object["front"]?.stringValue
            back = object["back"]?.stringValue
            warmup = object["warmup"]?.intValue
            recall = object["recall"]?.intValue
            final = object["final"]?.intValue
        }
    }

    let id: String
    let type: String?
    let createdAt: Date?
    let summary: SessionSummary?
    let cards: [SessionCard]

    init(from decoder: Decoder) throws {
        let raw = try [String: JSONValue](from: decoder)
        if let identifier = raw["id"]?.stringValue {
            id = identifier
        } else if let intID = raw["id"]?.intValue {
            id = String(intID)
        } else {
            id = UUID().uuidString
        }
        type = raw["type"]?.stringValue
        createdAt = raw["created_at"]?.dateValue()
        summary = raw["summary"].flatMap { SessionSummary(json: $0) }
        if let cardsValue = raw["cards"]?.arrayValue {
            cards = cardsValue.compactMap { SessionCard(json: $0) }
        } else {
            cards = []
        }
    }
}

struct KanjiMeta: Decodable {
    let kanji: String
    let strokeCount: Int?
    let radicals: [String]
    let source: String?
    let similar: [SimilarKanji]

    struct SimilarKanji: Decodable, Identifiable {
        let id: String
        let kanji: String
        let score: Double
        let strokeCount: Int?

        enum CodingKeys: String, CodingKey {
            case kanji
            case score
            case strokeCount = "stroke_count"
        }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            kanji = try container.decode(String.self, forKey: .kanji)
            id = kanji
            score = try container.decodeIfPresent(Double.self, forKey: .score) ?? 0
            strokeCount = try container.decodeIfPresent(Int.self, forKey: .strokeCount)
        }
    }

    enum CodingKeys: String, CodingKey {
        case kanji
        case strokeCount = "stroke_count"
        case radicals
        case source
        case similar
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        kanji = try container.decode(String.self, forKey: .kanji)
        strokeCount = try container.decodeIfPresent(Int.self, forKey: .strokeCount)
        radicals = try container.decodeIfPresent([String].self, forKey: .radicals) ?? []
        similar = try container.decodeIfPresent([SimilarKanji].self, forKey: .similar) ?? []
        source = try container.decodeIfPresent(String.self, forKey: .source)
    }
}

struct PomodoroState: Decodable {
    struct Phase: Identifiable {
        enum Kind: String {
            case focus
            case breakTime
        }

        let id = UUID()
        let kind: Kind
        let cycle: Int
        let duration: TimeInterval
    }

    let phaseIndex: Int
    let secLeft: TimeInterval
    let paused: Bool
    let updatedBy: String?
    let updatedAt: Date?

    enum CodingKeys: String, CodingKey {
        case phaseIndex = "phase_index"
        case secLeft = "sec_left"
        case paused
        case updatedBy = "updated_by"
        case updatedAt = "updated_at"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        phaseIndex = try container.decodeIfPresent(Int.self, forKey: .phaseIndex) ?? 0
        secLeft = try container.decodeIfPresent(Double.self, forKey: .secLeft) ?? (50 * 60)
        paused = try container.decodeIfPresent(Bool.self, forKey: .paused) ?? true
        updatedBy = try container.decodeIfPresent(String.self, forKey: .updatedBy)
        if let rawDate = try container.decodeIfPresent(String.self, forKey: .updatedAt) {
            updatedAt = ISO8601DateFormatter().date(from: rawDate)
        } else {
            updatedAt = nil
        }
    }

    init(phaseIndex: Int, secLeft: TimeInterval, paused: Bool, updatedBy: String? = nil, updatedAt: Date? = nil) {
        self.phaseIndex = phaseIndex
        self.secLeft = secLeft
        self.paused = paused
        self.updatedBy = updatedBy
        self.updatedAt = updatedAt
    }
}

extension Dictionary where Key == String, Value == JSONValue {
    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self = try container.decode([String: JSONValue].self)
    }
}

extension MemorySnapshot {
    static var empty: MemorySnapshot {
        MemorySnapshot(type: nil, total: 0, dist: Array(repeating: 0, count: 6), rows: [])
    }

    private init(type: String?, total: Int, dist: [Int], rows: [MemoryRow]) {
        self.type = type
        self.total = total
        self.dist = dist
        self.rows = rows
    }
}

extension PomodoroState.Phase {
    static let schedule: [PomodoroState.Phase] = [
        PomodoroState.Phase(kind: .focus, cycle: 1, duration: 50 * 60),
        PomodoroState.Phase(kind: .breakTime, cycle: 1, duration: 10 * 60),
        PomodoroState.Phase(kind: .focus, cycle: 2, duration: 50 * 60),
        PomodoroState.Phase(kind: .breakTime, cycle: 2, duration: 10 * 60)
    ]
}

extension PomodoroState {
    var currentPhase: PomodoroState.Phase {
        let schedule = PomodoroState.Phase.schedule
        let index = max(0, min(schedule.count - 1, phaseIndex))
        return schedule[index]
    }

    var formattedTime: String {
        let value = Int(max(0, secLeft))
        let minutes = value / 60
        let seconds = value % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

