import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case decodingFailed
    case network(Error)
    case missingData
    case serverMessage(String)

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
        case .serverMessage(let message):
            return message
        }
    }
}

final class APIClient {
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
    }

    private enum HTTPMethod: String {
        case get = "GET"
        case post = "POST"
    }

    private struct ReviewLogPayload: Encodable {
        struct Card: Encodable {
            let id: String
            let type: String
            let front: String?
            let back: String?
            let warmup: Int?
            let recall: Int?
            let final: Int?
        }

        let card: Card
        let quality: Int
    }

    private struct ReviewLogResponse: Decodable {
        let ok: Bool?
        let error: String?
    }

    private struct SaveSessionPayload: Encodable {
        let type: String
        let cards: [SessionResultPayload]
        let summary: SessionSummaryPayload
    }

    private struct SaveSessionResponse: Decodable {
        let id: Int?
        let error: String?
    }

    private struct DeleteSessionPayload: Encodable {
        let id: String
    }

    private struct DeleteSessionResponse: Decodable {
        let ok: Bool?
        let error: String?
    }

    private struct LeechBoardResponse: Decodable {
        let ok: Bool?
        let rows: [LeechEntry]?
        let items: [LeechEntry]?
        let error: String?
    }

    private struct UpdatePomodoroPayload: Encodable {
        let phaseIndex: Int
        let secLeft: Int
        let paused: Bool
        let updatedBy: String?
    }

    private struct PomodoroUpdateResponse: Decodable {
        let ok: Bool?
        let state: PomodoroState?
        let error: String?
    }

    private let session: URLSession
    private let baseURL: URL
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    init(session: URLSession = .shared, baseURL: URL = APIClient.defaultBaseURL) {
        self.session = session
        self.baseURL = baseURL

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        self.decoder = decoder

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .useDefaultKeys
        self.encoder = encoder
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
        let data = try await sendRequest(path: "api/stats")
        return try decodeResponse(DashboardStats.self, from: data)
    }

    func fetchCards() async throws -> [DeckCard] {
        let data = try await sendRequest(path: "api/cards")
        return try decodeResponse([DeckCard].self, from: data)
    }

    func fetchMemorySnapshot(type: String?) async throws -> MemorySnapshot {
        var queryItems: [URLQueryItem] = []
        if let type = type, !type.trimmingCharacters(in: .whitespaces).isEmpty {
            queryItems.append(URLQueryItem(name: "type", value: type))
        }
        let data = try await sendRequest(path: "api/memory/all", queryItems: queryItems)
        return try decodeResponse(MemorySnapshot.self, from: data)
    }

    func fetchSessions(type: String?) async throws -> [StudySession] {
        var queryItems: [URLQueryItem] = []
        if let type = type, !type.trimmingCharacters(in: .whitespaces).isEmpty {
            queryItems.append(URLQueryItem(name: "type", value: type))
        }
        let data = try await sendRequest(path: "api/sessions", queryItems: queryItems)
        return try decodeResponse([StudySession].self, from: data)
    }

    func fetchLeechBoard(type: String) async throws -> [LeechEntry] {
        let queryItems = [URLQueryItem(name: "type", value: type)]
        let data = try await sendRequest(path: "api/leech/top", queryItems: queryItems)
        let response = try decodeResponse(LeechBoardResponse.self, from: data)
        if let error = response.error, !(error.isEmpty) {
            throw APIError.serverMessage(error)
        }
        if response.ok == false {
            throw APIError.serverMessage("Không thể tải danh sách leech.")
        }
        if let rows = response.rows, !rows.isEmpty {
            return rows
        }
        if let items = response.items {
            return items
        }
        return []
    }

    func logReview(cardID: String, type: String, front: String, back: String?, warmup: Int?, recall: Int?, final: Int?, quality: Int) async throws {
        let card = ReviewLogPayload.Card(id: cardID, type: type, front: front, back: back, warmup: warmup, recall: recall, final: final)
        let payload = ReviewLogPayload(card: card, quality: quality)
        let body = try encoder.encode(payload)
        let data = try await sendRequest(path: "api/review/log", method: .post, body: body)
        let response = try decodeResponse(ReviewLogResponse.self, from: data)
        if response.ok == false {
            throw APIError.serverMessage(response.error ?? "Không thể ghi log ôn tập.")
        }
    }

    func saveSession(type: String, cards: [SessionResultPayload], summary: SessionSummaryPayload) async throws {
        let payload = SaveSessionPayload(type: type, cards: cards, summary: summary)
        let body = try encoder.encode(payload)
        let data = try await sendRequest(path: "api/sessions", method: .post, body: body)
        let response = try decodeResponse(SaveSessionResponse.self, from: data)
        if let error = response.error {
            throw APIError.serverMessage(error)
        }
    }

    func deleteSession(id: String) async throws {
        let payload = DeleteSessionPayload(id: id)
        let body = try encoder.encode(payload)
        let data = try await sendRequest(path: "api/sessions/delete", method: .post, body: body)
        let response = try decodeResponse(DeleteSessionResponse.self, from: data)
        if response.ok == false {
            throw APIError.serverMessage(response.error ?? "Không thể xoá session.")
        }
    }

    func fetchKanjiMeta(for character: String, includeSimilarPool: Bool) async throws -> KanjiMeta {
        var queryItems = [URLQueryItem(name: "char", value: character)]
        if includeSimilarPool {
            queryItems.append(URLQueryItem(name: "similarPool", value: "1"))
        }
        let data = try await sendRequest(path: "api/kanji/meta", queryItems: queryItems)
        return try decodeResponse(KanjiMeta.self, from: data)
    }

    func fetchPomodoroState() async throws -> PomodoroState {
        let data = try await sendRequest(path: "api/pomodoro/state")
        return try decodeResponse(PomodoroState.self, from: data)
    }

    func updatePomodoroState(phaseIndex: Int, secLeft: TimeInterval, paused: Bool, updatedBy: String?) async throws -> PomodoroState {
        let normalizedSeconds = max(0, secLeft)
        let secondsRemaining = Int(normalizedSeconds.rounded(.down))
        let payload = UpdatePomodoroPayload(phaseIndex: phaseIndex, secLeft: secondsRemaining, paused: paused, updatedBy: updatedBy)
        let body = try encoder.encode(payload)
        let data = try await sendRequest(path: "api/pomodoro/state", method: .post, body: body)
        let response = try decodeResponse(PomodoroUpdateResponse.self, from: data)
        if let state = response.state {
            return state
        }
        if let error = response.error {
            throw APIError.serverMessage(error)
        }
        throw APIError.missingData
    }

    private func sendRequest(path: String, method: HTTPMethod = .get, queryItems: [URLQueryItem]? = nil, body: Data? = nil) async throws -> Data {
        let url = try buildURL(path: path, queryItems: queryItems)
        return try await sendRequest(to: url, method: method, body: body)
    }

    private func buildURL(path: String, queryItems: [URLQueryItem]? = nil) throws -> URL {
        guard var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false) else {
            throw APIError.invalidURL
        }
        let trimmed = path.trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        var basePath = components.path
        if basePath == "/" {
            basePath = ""
        } else if basePath.hasSuffix("/") {
            basePath.removeLast()
        }

        var finalPath = basePath
        if !trimmed.isEmpty {
            if finalPath.isEmpty {
                finalPath = "/" + trimmed
            } else {
                finalPath += "/" + trimmed
            }
        }

        if finalPath.isEmpty {
            finalPath = "/"
        }

        components.path = finalPath

        if let queryItems {
            let filtered = queryItems.filter { item in
                guard let value = item.value else { return false }
                return !value.isEmpty
            }
            components.queryItems = filtered.isEmpty ? nil : filtered
        } else {
            components.queryItems = nil
        }

        guard let url = components.url else {
            throw APIError.invalidURL
        }
        return url
    }

    private func sendRequest(to url: URL, method: HTTPMethod = .get, body: Data? = nil) async throws -> Data {
        var request = URLRequest(url: url)
        request.httpMethod = method.rawValue
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        do {
            let (data, response) = try await session.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.missingData
            }
            guard 200..<300 ~= httpResponse.statusCode else {
                if let message = extractErrorMessage(from: data) {
                    throw APIError.serverMessage(message)
                }
                throw APIError.serverMessage("Máy chủ trả về trạng thái \(httpResponse.statusCode).")
            }
            return data
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.network(error)
        }
    }

    private func decodeResponse<T: Decodable>(_ type: T.Type, from data: Data) throws -> T {
        do {
            return try decoder.decode(T.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }

    private func extractErrorMessage(from data: Data) -> String? {
        guard !data.isEmpty else { return nil }
        guard let json = try? JSONSerialization.jsonObject(with: data, options: []) as? [String: Any] else {
            return nil
        }
        if let error = json["error"] as? String, !error.isEmpty {
            return error
        }
        if let message = json["message"] as? String, !message.isEmpty {
            return message
        }
        if let ok = json["ok"] as? Bool, !ok {
            if let detail = json["detail"] as? String, !detail.isEmpty {
                return detail
            }
        }
        return nil
    }
}
