import Foundation

@MainActor
final class AppState: ObservableObject {
    @Published private(set) var stats: DashboardStats?
    @Published private(set) var cards: [DeckCard] = []
    @Published private(set) var sessionsByType: [String: [StudySession]] = [:]
    @Published private(set) var memorySnapshots: [String: MemorySnapshot] = [:]
    @Published private(set) var pomodoroState: PomodoroState?
    @Published private(set) var isRefreshing = false
    @Published private(set) var lastError: String?
    @Published private(set) var lastUpdated: Date?

    private let api: APIClient
    private var initialDataLoaded = false

    init(api: APIClient = APIClient()) {
        self.api = api
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

    func logReview(for card: DeckCard, warmup: Int?, recall: Int?, final: Int?, quality: Int) async {
        do {
            try await api.logReview(cardID: card.id, type: card.type, front: card.front, back: card.back, warmup: warmup, recall: recall, final: final, quality: quality)
        } catch {
            lastError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
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

    private func normalizedKey(for type: String?) -> String {
        (type?.isEmpty ?? true) ? "__all__" : type!.lowercased()
    }
}

