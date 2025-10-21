import Foundation

enum APIError: Error, LocalizedError {
    case invalidURL
    case decodingFailed
    case network(Error)
    case missingData

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
        }
    }
}

final class APIClient {
    private let session: URLSession
    private let baseURL: URL

    init(session: URLSession = .shared, baseURL: URL = APIClient.defaultBaseURL) {
        self.session = session
        self.baseURL = baseURL
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
        let endpoint = baseURL.appendingPathComponent("api/stats")
        let (data, _) = try await data(for: endpoint)

        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase

        guard let data = data else {
            throw APIError.missingData
        }

        do {
            return try decoder.decode(DashboardStats.self, from: data)
        } catch {
            throw APIError.decodingFailed
        }
    }

    func data(for url: URL) async throws -> (Data?, URLResponse?) {
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.addValue("application/json", forHTTPHeaderField: "Accept")

        do {
            return try await session.data(for: request)
        } catch {
            throw APIError.network(error)
        }
    }
}

