#if canImport(SwiftUI)
import SwiftUI
import Combine

@available(iOS 26.0, *)
struct ContentView: View {
    @StateObject private var viewModel: DashboardViewModel
    @State private var isShowingErrorAlert = false
    @State private var currentErrorMessage: String? = nil

    init() {
        _viewModel = StateObject(wrappedValue: DashboardViewModel())
    }

    init(viewModel: DashboardViewModel) {
        _viewModel = StateObject(wrappedValue: viewModel)
    }

    var body: some View {
        NavigationStack {
            ZStack {
                Color(.systemGroupedBackground)
                    .ignoresSafeArea()

                if viewModel.overviewCard == nil {
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
                    cardContent
                }
            }
            .animation(.easeInOut, value: viewModel.overviewCard == nil)
            .navigationTitle("JP Personalized")
        }
        .task { await viewModel.refresh() }
        .alert(
            "Không thể đồng bộ",
            isPresented: $isShowingErrorAlert
        ) {
            Button("Thử lại") {
                Task { await viewModel.refresh() }
            }
            Button("Đóng", role: .cancel) { }
        } message: {
            Text(currentErrorMessage ?? "")
        }
        .onChange(of: viewModel.errorMessage) { _, newValue in
            currentErrorMessage = newValue
            isShowingErrorAlert = (newValue != nil)
        }
    }

    @ViewBuilder
    private var cardContent: some View {
        if let card = viewModel.overviewCard {
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
        }
    }
}

@available(iOS 26.0, *)
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

@available(iOS 26.0, *)
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

@available(iOS 26.0, *)
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

@available(iOS 26.0, *)
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

#if compiler(>=5.9)
@available(iOS 26.0, *)
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

    ContentView()
}
#endif

#endif

