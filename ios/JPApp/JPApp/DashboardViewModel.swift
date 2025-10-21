//
// DashboardViewModel.swift
// This is the single source of truth for DashboardViewModel to avoid redeclaration conflicts.
//

import Foundation
import SwiftUI
import Combine

@MainActor
final class DashboardViewModel: ObservableObject {
    @Published private(set) var overviewCard: StudyCard?
    @Published private(set) var isLoading = false
    @Published private(set) var errorMessage: String?

    private let api: APIClient

    init(api: APIClient = APIClient()) {
        self.api = api
    }

    func refresh() async {
        isLoading = true
        errorMessage = nil
        do {
            let stats = try await api.fetchStats()
            let metrics = stats.asMetrics()
            overviewCard = StudyCard(id: UUID(), title: "Tổng quan học tập", subtitle: "Tóm tắt tiến độ hiện tại", longDescription: "Thống kê số lượng thẻ theo từng hạng mục học tập.", progress: 0.0, metrics: metrics)
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
        isLoading = false
    }
}
