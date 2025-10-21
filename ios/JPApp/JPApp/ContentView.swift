#if canImport(SwiftUI)
import SwiftUI

@available(iOS 16.0, *)
struct ContentView: View {
    @StateObject private var viewModel: DashboardViewModel

    init(viewModel: DashboardViewModel = DashboardViewModel()) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                if viewModel.cards.isEmpty {
                    if viewModel.isLoading {
                        ProgressView("Đang tải dữ liệu...")
                            .progressViewStyle(.circular)
                            .tint(Color("LiquidPrimary"))
                    } else {
                        DashboardEmptyState(message: viewModel.errorMessage) {
                            Task { await viewModel.refresh() }
                        }
                    }
                } else {
                    cardList
                }
            }
            .animation(.easeInOut, value: viewModel.cards.isEmpty)
            .navigationTitle("JP Personalized")
        }
        .task { await viewModel.load() }
        .alert(
            "Không thể đồng bộ",
            isPresented: Binding(
                get: { viewModel.errorMessage != nil },
                set: { if !$0 { viewModel.errorMessage = nil } }
            )
        ) {
            Button("Thử lại") {
                Task { await viewModel.refresh() }
            }
            Button("Đóng", role: .cancel) {
                viewModel.errorMessage = nil
            }
        } message: {
            Text(viewModel.errorMessage ?? "")
        }
    }

    @ViewBuilder
    private var cardList: some View {
        List {
            ForEach(viewModel.cards) { card in
                NavigationLink {
                    CardDetailView(card: card)
                } label: {
                    CardRow(card: card)
                }
                .listRowSeparator(.hidden)
                .listRowBackground(Color.clear)
                .padding(.vertical, 4)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .background(Color.clear)
        .refreshable { await viewModel.refresh() }
        .overlay {
            if viewModel.isLoading {
                ProgressView()
                    .progressViewStyle(.circular)
                    .padding()
                    .background(
                        .regularMaterial,
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                    )
            }
        }
    }
}

@available(iOS 16.0, *)
struct CardRow: View {
    let card: StudyCard

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text(card.title)
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                Text(card.subtitle)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 6) {
                    ProgressView(value: Double(card.progress))
                        .progressViewStyle(.linear)
                        .tint(Color("LiquidPrimary"))
                    Text("\(Int(card.progress * 100))% hoàn thành")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

@available(iOS 16.0, *)
struct CardDetailView: View {
    let card: StudyCard

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                GlassContainer {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(card.subtitle)
                            .font(.headline)
                            .foregroundColor(Color("LiquidPrimary"))
                        Text(card.longDescription)
                            .font(.body)
                            .foregroundColor(.secondary)
                    }
                }

                VStack(spacing: 12) {
                    ForEach(card.metrics) { metric in
                        MetricRow(metric: metric)
                    }
                }
            }
            .padding()
        }
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
        .navigationTitle(card.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

@available(iOS 16.0, *)
struct MetricRow: View {
    let metric: StudyCard.Metric

    var body: some View {
        GlassContainer(padding: 16) {
            HStack {
                Text(metric.label)
                    .font(.subheadline)
                    .foregroundColor(Color("LiquidPrimary"))
                Spacer()
                Text(metric.value)
                    .font(.system(.body, design: .monospaced))
                    .foregroundColor(.primary)
            }
        }
    }
}

@available(iOS 16.0, *)
struct DashboardEmptyState: View {
    let message: String?
    let retryAction: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "book.closed")
                .font(.system(size: 44, weight: .medium))
                .foregroundColor(Color("LiquidPrimary"))
            Text("Không có dữ liệu để hiển thị")
                .font(.headline)
            Text(message ?? "Kéo xuống để đồng bộ dữ liệu từ máy chủ Next.js.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)
                .padding(.horizontal)
            Button(action: retryAction) {
                Label("Thử lại", systemImage: "arrow.clockwise")
            }
            .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.ultraThinMaterial)
        )
        .padding()
    }
}

@available(iOS 16.0, *)
struct GlassContainer<Content: View>: View {
    private let content: Content
    private let cornerRadius: CGFloat
    private let padding: CGFloat

    init(cornerRadius: CGFloat = 24, padding: CGFloat = 20, @ViewBuilder content: () -> Content) {
        self.content = content()
        self.cornerRadius = cornerRadius
        self.padding = padding
    }

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                    .fill(.ultraThinMaterial)
                    .background(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .fill(Color("LiquidAccent").opacity(0.08))
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
                            .stroke(
                                LinearGradient(
                                    colors: [
                                        Color("LiquidHighlight").opacity(0.6),
                                        Color("LiquidAccent").opacity(0.2)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                lineWidth: 1
                            )
                    )
                    .shadow(color: Color("LiquidAccent").opacity(0.15), radius: 18, x: 0, y: 10)
            }
    }
}

@available(iOS 16.0, *)
@MainActor
final class DashboardViewModel: ObservableObject {
    @Published private(set) var cards: [StudyCard]
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    private let apiClient: APIClient

    init(apiClient: APIClient = APIClient(), initialCards: [StudyCard] = []) {
        self.apiClient = apiClient
        self.cards = initialCards
    }

    func load() async {
        guard cards.isEmpty else { return }
        await refresh()
    }

    func refresh() async {
        if isLoading { return }
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            let dashboard = try await apiClient.fetchDashboard()
            withAnimation(.spring(response: 0.45, dampingFraction: 0.82)) {
                cards = dashboard.featuredCards
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

#if compiler(>=5.9)
@available(iOS 17.0, *)
#Preview("Danh sách thẻ") {
    let sampleMetrics = [
        StudyCard.Metric(label: "Số thẻ", value: "24"),
        StudyCard.Metric(label: "Từ vựng mới", value: "12"),
        StudyCard.Metric(label: "Độ chính xác", value: "92%")
    ]

    let sampleCards = [
        StudyCard(
            id: UUID(),
            title: "Từ vựng JLPT N3",
            subtitle: "Luyện ôn với danh sách được cá nhân hoá",
            longDescription: "Ôn luyện các từ vựng trọng tâm theo năng lực hiện tại của bạn cùng với ví dụ thực tế và câu hỏi kiểm tra ngắn.",
            progress: 0.45,
            metrics: sampleMetrics
        ),
        StudyCard(
            id: UUID(),
            title: "Ngữ pháp trung cấp",
            subtitle: "Các mẫu câu xuất hiện trong bài thi gần đây",
            longDescription: "Khám phá những cấu trúc ngữ pháp quan trọng với hướng dẫn chi tiết và bài tập áp dụng.",
            progress: 0.72,
            metrics: sampleMetrics
        )
    ]

    return ContentView(viewModel: DashboardViewModel(initialCards: sampleCards))
        .frame(maxHeight: .infinity)
}
#endif

#endif
