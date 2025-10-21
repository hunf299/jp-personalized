import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case decodingFailed
    case network(Error)
    case missingData
    case server(String)

    var errorDescription: String? {
        switch self {
        case .invalidURL:
            return "Đường dẫn API không hợp lệ."
        case .decodingFailed:
            return "Không thể phân tích phản hồi từ máy chủ."
        case .network(let error):
            return error.localizedDescription
        case .missingData:
            return "Máy chủ không trả về dữ liệu."
        case .server(let message):
            return message
        }
    }
}

final class APIClient {
    private let session: URLSession
    private let baseURL: URL
    private let decoder: JSONDecoder

    init(session: URLSession = .shared, baseURL: URL = APIClient.defaultBaseURL) {
        self.session = session
        self.baseURL = baseURL
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        self.decoder = decoder
    }

    static var defaultBaseURL: URL {
        if let urlString = ProcessInfo.processInfo.environment["JP_BACKEND_URL"],
           let url = URL(string: urlString) {
            return url
        }

        // Fallback to production Vercel deployment
        return URL(string: "https://jp-personalized.vercel.app")!
    }

    func fetchStats() async throws -> DashboardStats {
        let data = try await request(path: "api/stats")
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return try decoder.decode(DashboardStats.self, from: data)
    }

    func fetchCards() async throws -> [DeckCard] {
        let data = try await request(path: "api/cards")
        return try decode([DeckCard].self, from: data)
    }

    func fetchMemorySnapshot(type: String?) async throws -> MemorySnapshot {
        var items: [URLQueryItem] = []
        if let type, !type.isEmpty {
            items.append(URLQueryItem(name: "type", value: type))
        }
        let data = try await request(path: "api/memory/all", queryItems: items)
        return try decode(MemorySnapshot.self, from: data)
    }

    func fetchSessions(type: String?) async throws -> [StudySession] {
        var items: [URLQueryItem] = []
        if let type, !type.isEmpty {
            items.append(URLQueryItem(name: "type", value: type))
        }
        let data = try await request(path: "api/sessions", queryItems: items)
        return try decode([StudySession].self, from: data)
    }

    func deleteSession(id: String) async throws {
        let body = try JSONSerialization.data(withJSONObject: ["id": id], options: [])
        _ = try await request(path: "api/sessions/delete", method: "POST", body: body)
    }

    struct SessionResultPayload: Encodable {
        let cardID: String
        let front: String?
        let back: String?
        let warmup: Int?
        let recall: Int?
        let final: Int?

        enum CodingKeys: String, CodingKey {
            case cardID = "card_id"
            case front
            case back
            case warmup
            case recall
            case final
        }
    }

    struct SessionSummaryPayload: Encodable {
        let total: Int
        let learned: Int
        let left: Int
        let distribution: [Int]

        enum CodingKeys: String, CodingKey {
            case total
            case learned
            case left
            case distribution = "agg"
        }
    }

    func saveSession(type: String, cards: [SessionResultPayload], summary: SessionSummaryPayload) async throws {
        let payload: [String: Any] = [
            "type": type,
            "cards": try cards.map { try JSONSerialization.jsonObject(with: JSONEncoder().encode($0)) },
            "summary": try JSONSerialization.jsonObject(with: JSONEncoder().encode(summary))
        ]
        let body = try JSONSerialization.data(withJSONObject: payload, options: [])
        _ = try await request(path: "api/sessions", method: "POST", body: body)
    }

    struct ReviewLogPayload: Encodable {
        let cardID: String
        let quality: Int
        let card: ReviewMeta

        struct ReviewMeta: Encodable {
            let id: String
            let type: String
            let front: String?
            let back: String?
            let warmup: Int?
            let recall: Int?
            let final: Int?

            enum CodingKeys: String, CodingKey {
                case id
                case type
                case front
                case back
                case warmup
                case recall
                case final
            }
        }

        enum CodingKeys: String, CodingKey {
            case cardID = "card_id"
            case quality
            case card
        }
    }

    func logReview(cardID: String, type: String, front: String?, back: String?, warmup: Int?, recall: Int?, final: Int?, quality: Int) async throws {
        let clippedQuality = max(0, min(5, quality))
        let meta = ReviewLogPayload.ReviewMeta(id: cardID, type: type, front: front, back: back, warmup: warmup, recall: recall, final: final)
        let payload = ReviewLogPayload(cardID: cardID, quality: clippedQuality, card: meta)
        let body = try JSONEncoder().encode(payload)
        _ = try await request(path: "api/review/log", method: "POST", body: body)
    }

    func fetchKanjiMeta(for character: String, includeSimilarPool: Bool = false) async throws -> KanjiMeta {
        var items = [URLQueryItem(name: "char", value: character)]
        if includeSimilarPool {
            items.append(URLQueryItem(name: "similarPool", value: "1"))
        }
        let data = try await request(path: "api/kanji/meta", queryItems: items)
        return try decode(KanjiMeta.self, from: data)
    }

    func fetchPomodoroState() async throws -> PomodoroState {
        let data = try await request(path: "api/pomodoro/state")
        return try decode(PomodoroState.self, from: data)
    }

    func updatePomodoroState(phaseIndex: Int, secLeft: TimeInterval, paused: Bool, updatedBy: String?) async throws -> PomodoroState {
        var payload: [String: Any] = [
            "phaseIndex": phaseIndex,
            "secLeft": Int(secLeft),
            "paused": paused
        ]
        if let updatedBy, !updatedBy.isEmpty {
            payload["updatedBy"] = updatedBy
        }
        let body = try JSONSerialization.data(withJSONObject: payload, options: [])
        let data = try await request(path: "api/pomodoro/state", method: "POST", body: body)
        return try decode(PomodoroState.self, from: data)
    }

    private func request(path: String, method: String = "GET", queryItems: [URLQueryItem] = [], body: Data? = nil) async throws -> Data {
        guard var components = URLComponents(url: baseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        if !queryItems.isEmpty {
            components.queryItems = queryItems
        }
        guard let url = components.url else { throw APIError.invalidURL }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.addValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.addValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        do {
            let (data, response) = try await session.data(for: request)
            if let http = response as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                if let message = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any],
                   let errorMessage = message["error"] as? String {
                    throw APIError.server(errorMessage)
                }
                throw APIError.server("Máy chủ trả về lỗi \(http.statusCode)")
            }
            return data
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error)
        }
    }

    private func decode<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }
}

