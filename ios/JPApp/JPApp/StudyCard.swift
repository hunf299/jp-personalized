import Foundation

struct StudyCard: Codable, Identifiable {
    struct Metric: Codable {
        let label: String
        let value: String
    }

    let id: UUID
    let title: String
    let subtitle: String
    let longDescription: String
    let progress: Float
    let metrics: [Metric]
}

struct DashboardResponse: Codable {
    let featuredCards: [StudyCard]
}
