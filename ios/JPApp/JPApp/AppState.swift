import SwiftUI
import Combine
import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var stats: DashboardStats?
    @Published private(set) var cards: [DeckCard] = [] {
        didSet { rebuildCardLookup() }
    }
    @Published private(set) var sessionsByType: [String: [StudySession]] = [:]
    @Published private(set) var memorySnapshots: [String: MemorySnapshot] = [:]
    @Published private(set) var pomodoroState: PomodoroState?
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastError: String?
    @Published private(set) var lastUpdated: Date?
    @Published private(set) var leechBoards: [String: [LeechEntry]] = [:]
    @Published private(set) var leechErrors: [String: String] = [:]

    private let api: APIClient
    private var initialDataLoaded = false
    private var cardLookup: [String: DeckCard] = [:]

    init(api: APIClient = APIClient()) {
        self.api = api
        rebuildCardLookup()
    }

    func loadInitialDataIfNeeded() async {
        guard !initialDataLoaded else { return }
        initialDataLoaded = true
        await refreshAll()
    }

    func refreshAll() async {
        isRefreshing = true
        defer { isRefreshing = false }
        do {
            async let statsTask = api.fetchStats()
            async let cardsTask = api.fetchCards()
            async let pomodoroTask = api.fetchPomodoroState()

            let (statsValue, cardsValue, pomodoroValue) = try await (statsTask, cardsTask, pomodoroTask)
            stats = statsValue
            cards = cardsValue
            pomodoroState = pomodoroValue
            lastUpdated = Date()
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func refreshStats() async {
        do {
            stats = try await api.fetchStats()
            lastUpdated = Date()
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func refreshCards() async {
        do {
            cards = try await api.fetchCards()
            lastUpdated = Date()
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func sessions(for type: String?) -> [StudySession] {
        let key = normalizedKey(for: type)
        return sessionsByType[key] ?? []
    }

    func memorySnapshot(for type: String?) -> MemorySnapshot {
        let key = normalizedKey(for: type)
        return memorySnapshots[key] ?? .empty
    }

    func leechBoard(for type: String?) -> [LeechEntry] {
        let key = normalizedKey(for: type)
        return leechBoards[key] ?? []
    }

    func leechError(for type: String?) -> String? {
        let key = normalizedKey(for: type)
        return leechErrors[key]
    }

    func refreshProgress(for type: String?) async {
        let key = normalizedKey(for: type)
        do {
            async let snapshotTask = api.fetchMemorySnapshot(type: type)
            async let sessionTask = api.fetchSessions(type: type)
            let (snapshot, sessions) = try await (snapshotTask, sessionTask)
            memorySnapshots[key] = snapshot
            sessionsByType[key] = sessions
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func refreshLeechBoard(for type: String?) async {
        let key = normalizedKey(for: type)
        guard let rawType = type?.trimmingCharacters(in: .whitespacesAndNewlines), !rawType.isEmpty else {
            leechBoards[key] = []
            leechErrors[key] = "Thiếu loại thẻ hợp lệ."
            return
        }
        do {
            let entries = try await api.fetchLeechBoard(type: rawType)
            leechBoards[key] = entries
            leechErrors[key] = nil
        } catch {
            leechErrors[key] = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func logReview(for card: DeckCard, warmup: Int?, recall: Int?, final: Int?, quality: Int) async {
        do {
            try await api.logReview(cardID: card.id, type: card.type, front: card.front, back: card.back, warmup: warmup, recall: recall, final: final, quality: quality)
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func updateMemoryLevel(for card: DeckCard, baseLevel: Int?, finalLevel: Int) async throws {
        let normalizedFinal = max(0, min(5, finalLevel))
        do {
            _ = try await api.updateMemoryLevel(cardID: card.id,
                                               type: card.type,
                                               newLevel: normalizedFinal,
                                               baseLevel: baseLevel,
                                               autoActive: false,
                                               source: nil,
                                               final: normalizedFinal,
                                               quality: normalizedFinal)
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            throw error
        }
    }

    func saveSession(type: String, cards: [APIClient.SessionResultPayload], summary: APIClient.SessionSummaryPayload) async {
        do {
            try await api.saveSession(type: type, cards: cards, summary: summary)
            await refreshProgress(for: type)
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func deleteSession(id: String, type: String?) async {
        do {
            try await api.deleteSession(id: id)
            await refreshProgress(for: type)
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func fetchKanjiMeta(for character: String, includeSimilar: Bool = false) async throws -> KanjiMeta {
        try await api.fetchKanjiMeta(for: character, includeSimilarPool: includeSimilar)
    }

    func refreshPomodoro() async {
        do {
            pomodoroState = try await api.fetchPomodoroState()
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func updatePomodoro(phaseIndex: Int, secLeft: TimeInterval, paused: Bool, updatedBy: String?) async {
        do {
            pomodoroState = try await api.updatePomodoroState(phaseIndex: phaseIndex, secLeft: secLeft, paused: paused, updatedBy: updatedBy)
            lastError = nil
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    func deckCard(forID id: String) -> DeckCard? {
        cardLookup[id.lowercased()]
    }

    func deckCard(for row: MemoryRow) -> DeckCard? {
        if let matched = deckCard(forID: row.cardID) {
            return matched
        }
        let trimmedFront = row.front?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !trimmedFront.isEmpty else { return nil }
        let numeric = Int(row.cardID)
        return DeckCard(id: row.cardID, numericID: numeric, type: row.type ?? "vocab", front: trimmedFront, back: row.back, category: nil, extra: [:])
    }

    func deckCards(forIDs ids: [String]) -> [DeckCard] {
        var results: [DeckCard] = []
        var seen: Set<String> = []
        for id in ids {
            let key = id.lowercased()
            guard !seen.contains(key), let card = deckCard(forID: id) else { continue }
            results.append(card)
            seen.insert(key)
        }
        return results
    }

    func deckCards(from rows: [MemoryRow], limit: Int? = nil) -> [DeckCard] {
        var results: [DeckCard] = []
        var seen: Set<String> = []
        for row in rows {
            let key = row.cardID.lowercased()
            guard !seen.contains(key), let card = deckCard(for: row) else { continue }
            results.append(card)
            seen.insert(key)
            if let limit, results.count >= limit { break }
        }
        return results
    }

    private func normalizedKey(for type: String?) -> String {
        (type?.isEmpty ?? true) ? "__all__" : type!.lowercased()
    }

    private func rebuildCardLookup() {
        var index: [String: DeckCard] = [:]
        for card in cards {
            index[card.id.lowercased()] = card
            if let numeric = card.numericID {
                index[String(numeric).lowercased()] = card
            }
        }
        cardLookup = index
    }
}

