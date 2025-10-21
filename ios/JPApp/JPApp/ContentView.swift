#if canImport(SwiftUI)
import SwiftUI

@available(iOS 26.0, *)
struct ContentView: View {
    enum Tab: Hashable {
        case dashboard
        case study
        case progress
        case tools
    }

    @EnvironmentObject private var appState: AppState
    @State private var selectedTab: Tab = .dashboard
    @State private var showErrorAlert = false
    @State private var currentErrorMessage: String? = nil

    var body: some View {
        TabView(selection: $selectedTab) {
            NavigationStack {
                DashboardScreen(selectedTab: $selectedTab)
            }
            .tabItem { Label("Tổng quan", systemImage: "rectangle.grid.2x2.fill") }
            .tag(Tab.dashboard)

            NavigationStack {
                StudyScreen()
            }
            .tabItem { Label("Học", systemImage: "book.fill") }
            .tag(Tab.study)

            NavigationStack {
                ProgressScreen()
            }
            .tabItem { Label("Tiến độ", systemImage: "chart.bar.doc.horizontal") }
            .tag(Tab.progress)

            NavigationStack {
                ToolsScreen()
            }
            .tabItem { Label("Công cụ", systemImage: "sparkles") }
            .tag(Tab.tools)
        }
        .task { await appState.loadInitialDataIfNeeded() }
        .onChange(of: appState.lastError) { _, newValue in
            currentErrorMessage = newValue
            showErrorAlert = newValue != nil
        }
        .alert("Không thể đồng bộ", isPresented: $showErrorAlert) {
            Button("Thử lại") {
                Task { await appState.refreshAll() }
            }
            Button("Đóng", role: .cancel) { }
        } message: {
            Text(currentErrorMessage ?? "Đã có lỗi xảy ra.")
        }
    }
}

@available(iOS 26.0, *)
struct DashboardScreen: View {
    @EnvironmentObject private var appState: AppState
    @Binding var selectedTab: ContentView.Tab
    @State private var hasLoadedSnapshot = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let stats = appState.stats {
                    GlassContainer {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Tóm tắt tiến độ hiện tại")
                                .font(.title3.weight(.semibold))
                                .foregroundColor(Color("LiquidPrimary"))
                            Text("Thống kê số lượng thẻ theo từng hạng mục học tập.")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                            VStack(spacing: 12) {
                                ForEach(stats.asMetrics()) { metric in
                                    MetricRow(metric: metric)
                                }
                            }
                        }
                    }
                } else if appState.isRefreshing {
                    ProgressView("Đang tải dữ liệu…")
                        .progressViewStyle(.circular)
                } else {
                    DashboardEmptyState(message: appState.lastError) {
                        Task { await appState.refreshAll() }
                    }
                }

                if !appState.cards.isEmpty {
                    StudyShortcutSection(selectedTab: $selectedTab)
                }

                MemorySnapshotSection(snapshot: appState.memorySnapshot(for: "vocab"))

                if let updated = appState.lastUpdated {
                    Text("Đồng bộ lần cuối: \(updated.formatted(date: .abbreviated, time: .shortened))")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("JP Personalized")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if appState.isRefreshing {
                    ProgressView()
                } else {
                    Button {
                        Task { await appState.refreshAll() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
        }
        .refreshable { await appState.refreshAll() }
        .task {
            guard !hasLoadedSnapshot else { return }
            hasLoadedSnapshot = true
            if appState.memorySnapshot(for: "vocab").rows.isEmpty {
                await appState.refreshProgress(for: "vocab")
            }
        }
    }
}

@available(iOS 26.0, *)
private struct StudyShortcutSection: View {
    @EnvironmentObject private var appState: AppState
    @Binding var selectedTab: ContentView.Tab

    private struct Item: Identifiable {
        let id = UUID()
        let title: String
        let subtitle: String
        let icon: String
        let color: Color
        let type: String
        let count: Int
    }

    private var items: [Item] {
        let counts = countsByType()
        return [
            Item(title: "Flashcards", subtitle: "Ôn tập 10 thẻ mới", icon: "bolt.fill", color: Color("LiquidPrimary"), type: "vocab", count: counts["vocab"] ?? 0),
            Item(title: "Kanji", subtitle: "Luyện bộ thủ và nghĩa", icon: "character.book.closed.fill", color: Color("LiquidAccent"), type: "kanji", count: counts["kanji"] ?? 0),
            Item(title: "Ngữ pháp", subtitle: "Xem liên kết dạng gốc", icon: "list.bullet.rectangle.portrait.fill", color: Color("LiquidHighlight"), type: "grammar", count: counts["grammar"] ?? 0),
            Item(title: "Trợ từ", subtitle: "Tra cứu & so sánh", icon: "textformat.abc", color: Color("LiquidPrimary").opacity(0.8), type: "particle", count: counts["particle"] ?? 0)
        ]
    }

    private func countsByType() -> [String: Int] {
        var counts: [String: Int] = [:]
        for card in appState.cards {
            counts[card.type, default: 0] += 1
        }
        return counts
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Bắt đầu học ngay")
                .font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 16)]) {
                ForEach(items) { item in
                    Button {
                        selectedTab = .study
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack {
                                Image(systemName: item.icon)
                                    .font(.title3)
                                    .foregroundColor(item.color)
                                Spacer()
                                Text("\(item.count)")
                                    .font(.headline)
                                    .foregroundColor(.secondary)
                            }
                            Text(item.title)
                                .font(.headline)
                                .foregroundColor(.primary)
                            Text(item.subtitle)
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                        .padding()
                        .frame(maxWidth: .infinity, minHeight: 120)
                        .background(
                            RoundedRectangle(cornerRadius: 24, style: .continuous)
                                .fill(Color(.secondarySystemBackground))
                        )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}

@available(iOS 26.0, *)
private struct MemorySnapshotSection: View {
    let snapshot: MemorySnapshot

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Phân bổ mức nhớ (vocab)")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                if snapshot.total == 0 {
                    Text("Chưa có dữ liệu ôn tập cho loại này.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                } else {
                    ForEach(Array(snapshot.dist.enumerated()), id: \(.0)) { index, value in
                        HStack {
                            Text("Mức \(index)")
                            Spacer()
                            ProgressView(value: snapshot.total == 0 ? 0 : Double(value) / Double(snapshot.total))
                                .progressViewStyle(.linear)
                                .tint(Color("LiquidAccent"))
                            Text("\(value)")
                                .monospacedDigit()
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
    }
}


@available(iOS 26.0, *)
struct StudyScreen: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedType: CardType = .vocab
    @State private var searchText: String = ""
    @State private var practiceCards: [DeckCard] = []
    @State private var showPractice = false

    var body: some View {
        List {
            Section {
                Picker("Loại thẻ", selection: $selectedType) {
                    ForEach(CardType.allCases) { type in
                        Text(type.displayName).tag(type)
                    }
                }
                .pickerStyle(.segmented)
            }

            Section(header: Text("Danh sách thẻ")) {
                if filteredCards.isEmpty {
                    Text("Chưa có dữ liệu cho loại này. Hãy import từ trang chủ.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(filteredCards) { card in
                        NavigationLink(destination: CardDetailView(card: card, allCards: filteredCards)) {
                            VStack(alignment: .leading, spacing: 6) {
                                Text(card.front)
                                    .font(.headline)
                                Text(card.displayMeaning)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                                if let category = card.category, !category.isEmpty {
                                    Text(category)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Học thẻ \(selectedType.displayName.lowercased())")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    practiceCards = preparePracticeBatch()
                    showPractice = !practiceCards.isEmpty
                } label: {
                    Label("Bắt đầu học", systemImage: "play.circle.fill")
                }
                .disabled(!canPractice)
            }
        }
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Tìm thẻ…")
        .background(
            NavigationLink(
                destination: PracticeSessionView(type: selectedType, cards: practiceCards),
                isActive: $showPractice,
                label: { EmptyView() }
            )
            .hidden()
        )
    }

    private var filteredCards: [DeckCard] {
        let cards = appState.cards.filter { $0.type.lowercased() == selectedType.rawValue }
        guard !searchText.isEmpty else { return cards }
        let needle = searchText.lowercased()
        return cards.filter { card in
            card.front.lowercased().contains(needle) ||
            card.displayMeaning.lowercased().contains(needle) ||
            (card.category?.lowercased().contains(needle) ?? false)
        }
    }

    private func preparePracticeBatch() -> [DeckCard] {
        let pool = appState.cards.filter { $0.type.lowercased() == selectedType.rawValue }
        return Array(pool.shuffled().prefix(10))
    }

    private var canPractice: Bool {
        appState.cards.contains { $0.type.lowercased() == selectedType.rawValue }
    }
}

@available(iOS 26.0, *)
private struct CardDetailView: View {
    let card: DeckCard
    let allCards: [DeckCard]
    @EnvironmentObject private var appState: AppState
    @State private var kanjiMeta: KanjiMeta? = nil
    @State private var isLoadingMeta = false

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                GlassContainer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(card.front)
                            .font(.system(size: 36, weight: .bold))
                        Text(card.displayMeaning)
                            .font(.title3)
                            .foregroundColor(.secondary)
                        if let category = card.category, !category.isEmpty {
                            Label(category, systemImage: "tag")
                                .font(.subheadline)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                if card.type == "kanji" {
                    KanjiDetailSection(card: card, kanjiMeta: $kanjiMeta, isLoadingMeta: $isLoadingMeta)
                }

                if card.type == "grammar" {
                    GrammarDetailSection(card: card, allCards: allCards)
                }

                if card.type == "particle" {
                    ParticleDetailSection(card: card)
                }
            }
            .padding()
        }
        .navigationTitle(card.front)
        .navigationBarTitleDisplayMode(.inline)
    }
}

@available(iOS 26.0, *)
private struct KanjiDetailSection: View {
    let card: DeckCard
    @Binding var kanjiMeta: KanjiMeta?
    @Binding var isLoadingMeta: Bool
    @EnvironmentObject private var appState: AppState

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Kanji · Hán Việt & nét")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                Text("Hán Việt: \(card.hanViet)")
                Text("On: \(card.onReading)")
                Text("Kun: \(card.kunReading)")

                if let meta = kanjiMeta {
                    Divider()
                    Text("Số nét: \(meta.strokeCount ?? 0)")
                    if !meta.radicals.isEmpty {
                        Text("Bộ thủ: \(meta.radicals.joined(separator: ", "))")
                    }
                    if !meta.similar.isEmpty {
                        Text("Kanji tương tự:")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 12) {
                                ForEach(meta.similar) { item in
                                    VStack {
                                        Text(item.kanji)
                                            .font(.title3.bold())
                                        Text("Độ tương đồng: \(Int(item.score * 100))%")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                    .padding(12)
                                    .background(
                                        RoundedRectangle(cornerRadius: 16, style: .continuous)
                                            .fill(Color(.secondarySystemBackground))
                                    )
                                }
                            }
                        }
                    }
                }

                Button {
                    Task {
                        isLoadingMeta = true
                        defer { isLoadingMeta = false }
                        kanjiMeta = try? await appState.fetchKanjiMeta(for: card.front, includeSimilar: true)
                    }
                } label: {
                    if isLoadingMeta {
                        ProgressView()
                    } else {
                        Label("Tải metadata từ Supabase", systemImage: "arrow.down.circle")
                    }
                }
            }
        }
    }
}

@available(iOS 26.0, *)
private struct GrammarDetailSection: View {
    let card: DeckCard
    let allCards: [DeckCard]

    private var related: [DeckCard] {
        let ids = Set(card.relatedRules.map { $0.lowercased() })
        return allCards.filter { ids.contains($0.front.lowercased()) && $0.id != card.id }
    }

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ngữ pháp · liên kết dạng gốc")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                if let first = card.relatedRules.first, !first.isEmpty {
                    Text("Dạng gốc: \(first)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                if related.isEmpty {
                    Text("Chưa có mẫu câu liên quan khác.")
                        .foregroundColor(.secondary)
                } else {
                    Text("Liên quan:")
                        .font(.subheadline)
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 120), spacing: 8)], spacing: 8) {
                        ForEach(related) { item in
                            Text(item.front)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(
                                    Capsule().fill(Color(.secondarySystemBackground))
                                )
                        }
                    }
                }
            }
        }
    }
}

@available(iOS 26.0, *)
private struct ParticleDetailSection: View {
    let card: DeckCard

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Ghi chú")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                Text(card.back ?? "")
                    .font(.body)
            }
        }
    }
}

@available(iOS 26.0, *)
enum CardType: String, CaseIterable, Identifiable {
    case vocab
    case kanji
    case grammar
    case particle

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .vocab: return "Từ vựng"
        case .kanji: return "Kanji"
        case .grammar: return "Ngữ pháp"
        case .particle: return "Trợ từ"
        }
    }
}


@available(iOS 26.0, *)
struct PracticeSessionView: View {
    @EnvironmentObject private var appState: AppState
    @Environment(\(.dismiss)) private var dismiss

    let type: CardType
    let cards: [DeckCard]

    private enum Phase {
        case warmup
        case warmupSummary
        case recall
        case results
    }

    @State private var phase: Phase = .warmup
    @State private var index: Int = 0
    @State private var warmupScores: [String: WarmupResult] = [:]
    @State private var recallScores: [String: RecallResult] = [:]
    @State private var selectedOption: String? = nil
    @State private var warmupChecked = false
    @State private var warmupStart = Date()
    @State private var answerText: String = ""
    @State private var recallChecked = false
    @State private var qualitySelection: Int = 3
    @State private var isSavingSession = false
    @State private var sessionSaved = false

    struct WarmupResult {
        let correct: Bool
        let time: Int
        let score: Int
    }

    struct RecallResult {
        var quality: Int
        var correct: Bool?
        var userAnswer: String
    }

    private var currentCard: DeckCard? {
        guard index < cards.count else { return nil }
        return cards[index]
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                switch phase {
                case .warmup:
                    if let card = currentCard {
                        WarmupQuestion(card: card,
                                       options: warmupOptions(for: card),
                                       selectedOption: $selectedOption,
                                       checked: $warmupChecked,
                                       onCheck: { handleWarmupCheck(for: card) })
                        Button("Tiếp") { advanceWarmup() }
                            .buttonStyle(.borderedProminent)
                            .frame(maxWidth: .infinity)
                            .disabled(!warmupChecked)
                    }
                case .warmupSummary:
                    WarmupSummaryView(cards: cards, warmupScores: warmupScores)
                    Button("Bắt đầu ôn tập chi tiết") {
                        phase = .recall
                        index = 0
                        resetRecallState()
                    }
                    .buttonStyle(.borderedProminent)
                case .recall:
                    if let card = currentCard {
                        RecallQuestion(card: card,
                                       type: type,
                                       answerText: $answerText,
                                       recallChecked: $recallChecked,
                                       qualitySelection: $qualitySelection,
                                       onCheck: { handleRecallCheck(for: card) })
                        HStack {
                            Button("Quay lại") {
                                goBackFromRecall()
                            }
                            .buttonStyle(.bordered)
                            .disabled(index == 0)

                            Button(index + 1 == cards.count ? "Hoàn tất" : "Tiếp") {
                                advanceRecall()
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(!recallChecked)
                        }
                    }
                case .results:
                    SessionResultsView(cards: cards, warmupScores: warmupScores, recallScores: recallScores)
                    Button {
                        saveSessionIfNeeded()
                        dismiss()
                    } label: {
                        if isSavingSession {
                            ProgressView()
                        } else {
                            Text("Lưu phiên & quay lại")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding()
        }
        .navigationTitle("Luyện tập \(type.displayName.lowercased())")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            warmupStart = Date()
        }
        .onChange(of: qualitySelection) { _, newValue in
            guard phase == .recall, let card = currentCard else { return }
            var result = recallScores[card.id] ?? RecallResult(quality: newValue, correct: nil, userAnswer: answerText)
            result.quality = newValue
            recallScores[card.id] = result
        }
    }

    private func warmupOptions(for card: DeckCard) -> [String] {
        let correct = card.warmupLabel
        let others = cards.filter { $0.id != card.id }.map { $0.warmupLabel }.shuffled().prefix(3)
        var combined = [correct] + others
        combined = Array(Set(combined)).shuffled()
        if combined.count < 4 {
            combined.append("—")
        }
        return combined
    }

    private func handleWarmupCheck(for card: DeckCard) {
        guard let selectedOption else { return }
        let correctLabel = card.warmupLabel
        let elapsed = Int(Date().timeIntervalSince(warmupStart))
        let isCorrect = selectedOption == correctLabel
        let score = isCorrect ? scoreForTime(elapsed) : 0
        warmupScores[card.id] = WarmupResult(correct: isCorrect, time: elapsed, score: score)
        warmupChecked = true
    }

    private func advanceWarmup() {
        if index + 1 < cards.count {
            index += 1
            warmupStart = Date()
            selectedOption = nil
            warmupChecked = false
        } else {
            phase = .warmupSummary
            index = 0
        }
    }

    private func resetRecallState() {
        answerText = ""
        recallChecked = false
        qualitySelection = 3
    }

    private func handleRecallCheck(for card: DeckCard) {
        let trimmed = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
        let isCorrect: Bool
        if type == .kanji {
            isCorrect = trimmed == card.front
        } else {
            isCorrect = trimmed.lowercased() == (card.back ?? "").lowercased()
        }
        let defaultQuality = isCorrect ? 3 : 0
        qualitySelection = defaultQuality
        recallScores[card.id] = RecallResult(quality: defaultQuality, correct: isCorrect, userAnswer: trimmed)
        recallChecked = true
    }

    private func advanceRecall() {
        guard let card = currentCard, let recall = recallScores[card.id] else { return }
        let warmupScore = warmupScores[card.id]?.score ?? 0
        let finalScore = Int(round(Double(warmupScore + recall.quality) / 2.0))
        Task {
            await appState.logReview(for: card, warmup: warmupScore, recall: recall.quality, final: finalScore, quality: recall.quality)
        }
        if index + 1 < cards.count {
            index += 1
            resetRecallState()
        } else {
            phase = .results
        }
    }

    private func goBackFromRecall() {
        guard index > 0 else { return }
        index -= 1
        let card = cards[index]
        answerText = recallScores[card.id]?.userAnswer ?? ""
        recallChecked = recallScores[card.id] != nil
        qualitySelection = recallScores[card.id]?.quality ?? 3
    }

    private func saveSessionIfNeeded() {
        guard !sessionSaved else { return }
        sessionSaved = true
        isSavingSession = true
        var distribution = Array(repeating: 0, count: 6)
        var learned = 0
        let rows = cards.map { card -> APIClient.SessionResultPayload in
            let warmup = warmupScores[card.id]?.score ?? 0
            let recall = recallScores[card.id]?.quality ?? 0
            let final = Int(round(Double(warmup + recall) / 2.0))
            if final >= 0 && final < distribution.count {
                distribution[final] += 1
                if final >= 3 { learned += 1 }
            }
            return APIClient.SessionResultPayload(cardID: card.id, front: card.front, back: card.back, warmup: warmup, recall: recall, final: final)
        }
        let summary = APIClient.SessionSummaryPayload(total: cards.count, learned: learned, left: max(0, cards.count - learned), distribution: distribution)
        Task {
            await appState.saveSession(type: type.rawValue, cards: rows, summary: summary)
            isSavingSession = false
        }
    }

    private func scoreForTime(_ seconds: Int) -> Int {
        switch seconds {
        case ..<4: return 5
        case ..<7: return 4
        case ..<10: return 3
        case ..<13: return 2
        case ..<16: return 1
        default: return 0
        }
    }
}

@available(iOS 26.0, *)
private struct WarmupQuestion: View {
    let card: DeckCard
    let options: [String]
    @Binding var selectedOption: String?
    @Binding var checked: Bool
    let onCheck: () -> Void

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text(card.type == "kanji" ? "Chọn Hán Việt + on/kun cho \(card.front)" : "Chọn nghĩa đúng cho: \(card.front)")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                VStack(spacing: 8) {
                    ForEach(options, id: \(.self)) { option in
                        Button {
                            selectedOption = option
                        } label: {
                            HStack {
                                Text(option)
                                Spacer()
                                if selectedOption == option {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(Color("LiquidPrimary"))
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding()
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(selectedOption == option ? Color("LiquidAccent").opacity(0.2) : Color.clear)
                            )
                        }
                        .buttonStyle(.plain)
                    }
                }
                Button("Kiểm tra") {
                    onCheck()
                }
                .buttonStyle(.borderedProminent)
                .disabled(selectedOption == nil || checked)
            }
        }
    }
}

@available(iOS 26.0, *)
private struct WarmupSummaryView: View {
    let cards: [DeckCard]
    let warmupScores: [String: PracticeSessionView.WarmupResult]

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Tổng quan warm-up")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                let dist = distribution()
                ForEach(0..<dist.count, id: \(.self)) { value in
                    HStack {
                        Text("Mức \(value)")
                        Spacer()
                        Text("\(dist[value])")
                            .monospacedDigit()
                            .foregroundColor(.secondary)
                    }
                }
                Text("Nhấn nút bên dưới để tiếp tục phần ôn tập chi tiết.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
        }
    }

    private func distribution() -> [Int] {
        var dist = Array(repeating: 0, count: 6)
        for card in cards {
            let score = warmupScores[card.id]?.score ?? 0
            if score >= 0 && score < dist.count {
                dist[score] += 1
            }
        }
        return dist
    }
}

@available(iOS 26.0, *)
private struct RecallQuestion: View {
    let card: DeckCard
    let type: CardType
    @Binding var answerText: String
    @Binding var recallChecked: Bool
    @Binding var qualitySelection: Int
    let onCheck: () -> Void

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 16) {
                Text(prompt)
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                TextField("Nhập đáp án…", text: $answerText)
                    .textFieldStyle(.roundedBorder)
                Button("Chấm điểm") {
                    onCheck()
                }
                .buttonStyle(.borderedProminent)
                .disabled(answerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || recallChecked)

                if recallChecked {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Điều chỉnh chất lượng ghi nhớ (0-5)")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Picker("Điểm", selection: $qualitySelection) {
                            ForEach(0..<6) { score in
                                Text("Mức \(score)").tag(score)
                            }
                        }
                        .pickerStyle(.segmented)
                    }
                }
            }
        }
    }

    private var prompt: String {
        switch type {
        case .kanji:
            return "Điền kanji tương ứng với: \(card.warmupLabel)"
        default:
            return "Điền nghĩa cho: \(card.front)"
        }
    }
}

@available(iOS 26.0, *)
private struct SessionResultsView: View {
    let cards: [DeckCard]
    let warmupScores: [String: PracticeSessionView.WarmupResult]
    let recallScores: [String: PracticeSessionView.RecallResult]

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Kết quả phiên học")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                let summary = aggregated()
                Text("Thẻ đã học: \(summary.learned)/\(cards.count)")
                    .font(.title3.weight(.semibold))
                ForEach(0..<summary.dist.count, id: \(.self)) { level in
                    HStack {
                        Text("Mức \(level)")
                        Spacer()
                        ProgressView(value: summary.total == 0 ? 0 : Double(summary.dist[level]) / Double(summary.total))
                            .progressViewStyle(.linear)
                            .tint(Color("LiquidAccent"))
                        Text("\(summary.dist[level])")
                            .monospacedDigit()
                    }
                }
            }
        }
    }

    private func aggregated() -> (total: Int, learned: Int, dist: [Int]) {
        var dist = Array(repeating: 0, count: 6)
        var learned = 0
        for card in cards {
            let warmup = warmupScores[card.id]?.score ?? 0
            let recall = recallScores[card.id]?.quality ?? 0
            let final = Int(round(Double(warmup + recall) / 2.0))
            if final >= 0 && final < dist.count {
                dist[final] += 1
                if final >= 3 { learned += 1 }
            }
        }
        return (cards.count, learned, dist)
    }
}


@available(iOS 26.0, *)
struct ProgressScreen: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedType: CardType = .vocab
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                MemoryDistributionCard(type: selectedType, snapshot: appState.memorySnapshot(for: selectedType.rawValue))
                SessionListView(sessions: appState.sessions(for: selectedType.rawValue)) { session in
                    Task { await appState.deleteSession(id: session.id, type: selectedType.rawValue) }
                }
            }
            .padding()
        }
        .navigationTitle("Tiến độ học")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if isLoading {
                    ProgressView()
                } else {
                    Button {
                        Task { await loadData() }
                    } label: {
                        Image(systemName: "arrow.clockwise")
                    }
                }
            }
            ToolbarItem(placement: .principal) {
                Picker("Loại", selection: $selectedType) {
                    ForEach(CardType.allCases) { type in
                        Text(type.displayName).tag(type)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 280)
            }
        }
        .refreshable { await loadData() }
        .task { await loadData() }
        .onChange(of: selectedType) { _, _ in
            Task { await loadData() }
        }
    }

    private func loadData() async {
        isLoading = true
        defer { isLoading = false }
        await appState.refreshProgress(for: selectedType.rawValue)
    }
}

@available(iOS 26.0, *)
private struct MemoryDistributionCard: View {
    let type: CardType
    let snapshot: MemorySnapshot

    private var dueCount: Int {
        let now = Date()
        return snapshot.rows.filter { row in
            guard let due = row.due else { return false }
            return due <= now
        }.count
    }

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Phân bổ mức nhớ · \(type.displayName)")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                if snapshot.total == 0 {
                    Text("Chưa có dữ liệu ôn tập cho loại này.")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(Array(snapshot.dist.enumerated()), id: \(.0)) { level, value in
                        HStack {
                            Text("Mức \(level)")
                            Spacer()
                            ProgressView(value: snapshot.total == 0 ? 0 : Double(value) / Double(snapshot.total))
                                .progressViewStyle(.linear)
                                .tint(Color("LiquidAccent"))
                            Text("\(value)")
                                .monospacedDigit()
                                .foregroundColor(.secondary)
                        }
                    }
                    Divider()
                    Text("Thẻ đến hạn ôn: \(dueCount)")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}

@available(iOS 26.0, *)
private struct SessionListView: View {
    let sessions: [StudySession]
    let onDelete: (StudySession) -> Void
    @State private var expandedSession: String? = nil
    @State private var deletingIDs: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Lịch sử sessions")
                .font(.headline)
            if sessions.isEmpty {
                Text("Chưa có session nào được lưu.")
                    .foregroundColor(.secondary)
            } else {
                ForEach(sessions) { session in
                    SessionRow(session: session,
                               isExpanded: expandedSession == session.id,
                               isDeleting: deletingIDs.contains(session.id))
                    {
                        withAnimation { toggle(session: session) }
                    } onDelete: {
                        deletingIDs.insert(session.id)
                        Task {
                            onDelete(session)
                            deletingIDs.remove(session.id)
                        }
                    }
                }
            }
        }
    }

    private func toggle(session: StudySession) {
        if expandedSession == session.id {
            expandedSession = nil
        } else {
            expandedSession = session.id
        }
    }
}

@available(iOS 26.0, *)
private struct SessionRow: View {
    let session: StudySession
    let isExpanded: Bool
    let isDeleting: Bool
    let onToggle: () -> Void
    let onDelete: () -> Void

    private var summary: StudySession.SessionSummary {
        session.summary ?? StudySession.SessionSummary(total: session.cards.count, learned: session.cards.count, left: 0, distribution: [])
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 6) {
                    Text(sessionTitle)
                        .font(.headline)
                    Text(summaryText)
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
                Spacer()
                Button(action: onToggle) {
                    Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                        .font(.headline)
                }
                Button(role: .destructive, action: onDelete) {
                    if isDeleting {
                        ProgressView()
                    } else {
                        Image(systemName: "trash")
                    }
                }
            }
            if isExpanded {
                Divider()
                if session.cards.isEmpty {
                    Text("Không có chi tiết thẻ trong session này.")
                        .foregroundColor(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(session.cards) { card in
                            VStack(alignment: .leading, spacing: 4) {
                                Text(card.front ?? "")
                                    .font(.subheadline.weight(.semibold))
                                HStack(spacing: 12) {
                                    if let warmup = card.warmup { TagLabel(title: "Warm-up", value: warmup) }
                                    if let recall = card.recall { TagLabel(title: "Recall", value: recall) }
                                    if let final = card.final { TagLabel(title: "Final", value: final) }
                                }
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(Color(.secondarySystemBackground))
                            )
                        }
                    }
                }
            }
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(Color(.systemBackground))
                .shadow(color: Color.black.opacity(0.05), radius: 8, x: 0, y: 4)
        )
    }

    private var sessionTitle: String {
        let date = session.createdAt?.formatted(date: .abbreviated, time: .shortened) ?? "Không rõ"
        return "Session \(session.type ?? "") · \(date)"
    }

    private var summaryText: String {
        let learned = summary.learned
        let total = summary.total
        return "Hoàn thành \(learned)/\(total) · Mức cao nhất: \(summary.distribution.enumerated().max(by: { $0.element < $1.element })?.offset ?? 0)"
    }
}

@available(iOS 26.0, *)
private struct TagLabel: View {
    let title: String
    let value: Int

    var body: some View {
        HStack(spacing: 4) {
            Text(title)
            Text("\(value)")
                .bold()
        }
        .font(.caption)
        .padding(.horizontal, 10)
        .padding(.vertical, 4)
        .background(
            Capsule().fill(Color("LiquidAccent").opacity(0.2))
        )
    }
}


@available(iOS 26.0, *)
struct ToolsScreen: View {
    var body: some View {
        List {
            Section("Học tập") {
                NavigationLink(destination: KanjiToolsView()) {
                    Label("Kanji · Bộ thủ & luyện viết", systemImage: "character.book.closed")
                }
                NavigationLink(destination: GrammarAtlasView()) {
                    Label("Ngữ pháp · Sơ đồ dạng gốc", systemImage: "list.bullet.rectangle.portrait")
                }
                NavigationLink(destination: ParticlesCatalogView()) {
                    Label("Trợ từ · Tra cứu", systemImage: "text.book.closed")
                }
            }
            Section("Tiện ích") {
                NavigationLink(destination: PomodoroScreen()) {
                    Label("Pomodoro · 2 giờ", systemImage: "timer")
                }
            }
        }
        .navigationTitle("Công cụ bổ trợ")
        .listStyle(.insetGrouped)
    }
}

@available(iOS 26.0, *)
private struct KanjiToolsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedCard: DeckCard? = nil
    @State private var meta: KanjiMeta? = nil
    @State private var isLoading = false

    private var kanjiCards: [DeckCard] {
        appState.cards.filter { $0.type == "kanji" }
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                Picker("Kanji", selection: $selectedCard) {
                    ForEach(kanjiCards) { card in
                        Text(card.front).tag(Optional(card))
                    }
                }
                .pickerStyle(.wheel)
                .frame(height: 150)

                if let card = selectedCard {
                    GlassContainer {
                        VStack(alignment: .leading, spacing: 12) {
                            Text(card.front)
                                .font(.system(size: 48, weight: .bold))
                            Text(card.hanViet)
                                .font(.title3)
                            Text("On: \(card.onReading)")
                            Text("Kun: \(card.kunReading)")
                        }
                    }

                    GlassContainer {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Luyện viết tay")
                                .font(.headline)
                                .foregroundColor(Color("LiquidPrimary"))
                            DrawingCanvas()
                                .frame(height: 240)
                                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                            Text("Dùng ngón tay để luyện nét. Nhấn giữ lâu để xoá.")
                                .font(.footnote)
                                .foregroundColor(.secondary)
                        }
                    }

                    GlassContainer {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Metadata từ Supabase")
                                .font(.headline)
                                .foregroundColor(Color("LiquidPrimary"))
                            if let meta {
                                Text("Số nét: \(meta.strokeCount ?? 0)")
                                if !meta.radicals.isEmpty {
                                    Text("Bộ thủ: \(meta.radicals.joined(separator: ", "))")
                                }
                                if !meta.similar.isEmpty {
                                    Text("Kanji tương tự:")
                                        .font(.subheadline)
                                    ScrollView(.horizontal, showsIndicators: false) {
                                        HStack(spacing: 12) {
                                            ForEach(meta.similar) { item in
                                                VStack {
                                                    Text(item.kanji)
                                                        .font(.title2)
                                                    Text("\(Int(item.score * 100))%")
                                                        .font(.caption)
                                                        .foregroundColor(.secondary)
                                                }
                                                .padding(10)
                                                .background(
                                                    RoundedRectangle(cornerRadius: 14, style: .continuous)
                                                        .fill(Color(.secondarySystemBackground))
                                                )
                                            }
                                        }
                                    }
                                }
                            } else {
                                Text("Chưa tải metadata.")
                                    .foregroundColor(.secondary)
                            }
                            Button {
                                Task {
                                    guard let card = selectedCard else { return }
                                    isLoading = true
                                    defer { isLoading = false }
                                    meta = try? await appState.fetchKanjiMeta(for: card.front, includeSimilar: true)
                                }
                            } label: {
                                if isLoading { ProgressView() } else { Label("Đồng bộ", systemImage: "arrow.triangle.2.circlepath") }
                            }
                        }
                    }
                } else {
                    Text("Chưa có dữ liệu kanji. Hãy import từ trang chủ.")
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Kanji")
        .onAppear {
            if selectedCard == nil {
                selectedCard = kanjiCards.first
            }
        }
    }
}

@available(iOS 26.0, *)
private struct GrammarAtlasView: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedID: String? = nil

    private var grammarCards: [DeckCard] {
        appState.cards.filter { $0.type == "grammar" }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            if grammarCards.isEmpty {
                Text("Chưa có dữ liệu ngữ pháp.")
                    .foregroundColor(.secondary)
            } else {
                List {
                    ForEach(grammarCards) { card in
                        Button {
                            selectedID = card.id
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(card.front)
                                        .font(.headline)
                                    if let base = card.relatedRules.first, !base.isEmpty {
                                        Text("Gốc: \(base)")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                Spacer()
                                if selectedID == card.id {
                                    Image(systemName: "checkmark.circle.fill")
                                        .foregroundColor(Color("LiquidPrimary"))
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .frame(height: 260)

                if let current = grammarCards.first(where: { $0.id == selectedID }) ?? grammarCards.first {
                    GrammarDetailSection(card: current, allCards: grammarCards)
                }
            }
        }
        .padding()
        .navigationTitle("Ngữ pháp")
        .onAppear {
            if selectedID == nil {
                selectedID = grammarCards.first?.id
            }
        }
    }
}

@available(iOS 26.0, *)
private struct ParticlesCatalogView: View {
    @EnvironmentObject private var appState: AppState
    @State private var search: String = ""

    private var particles: [DeckCard] {
        let base = appState.cards.filter { $0.type == "particle" }
        guard !search.isEmpty else { return base }
        let needle = search.lowercased()
        return base.filter { card in
            card.front.lowercased().contains(needle) ||
            (card.back ?? "").lowercased().contains(needle)
        }
    }

    var body: some View {
        List {
            ForEach(particles) { card in
                VStack(alignment: .leading, spacing: 6) {
                    HStack {
                        Text(card.front)
                            .font(.headline)
                        Spacer()
                        if let category = card.category {
                            Text(category)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    Text(card.back ?? "")
                        .font(.subheadline)
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle("Trợ từ")
        .searchable(text: $search, prompt: "Tìm trợ từ…")
    }
}

@available(iOS 26.0, *)
private struct PomodoroScreen: View {
    @EnvironmentObject private var appState: AppState
    @State private var localState: PomodoroState? = nil
    @State private var syncDate = Date()
    @State private var timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()
    @State private var isUpdating = false

    private var schedule: [PomodoroState.Phase] { PomodoroState.Phase.schedule }

    var body: some View {
        VStack(spacing: 24) {
            if let state = localState ?? appState.pomodoroState {
                let phase = state.currentPhase
                GlassContainer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(phase.kind == .focus ? "Tập trung" : "Nghỉ")
                            .font(.headline)
                            .foregroundColor(Color("LiquidPrimary"))
                        Text("Chu kỳ \(phase.cycle)/2")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Text(timeLabel(for: state))
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .frame(maxWidth: .infinity, alignment: .center)
                        ProgressView(value: progress(for: state))
                            .progressViewStyle(.linear)
                            .tint(Color("LiquidAccent"))
                            .padding(.top, 8)
                        HStack {
                            Button(state.paused ? "Bắt đầu" : "Tạm dừng") {
                                Task { await toggleRunning(paused: !state.paused) }
                            }
                            .buttonStyle(.borderedProminent)

                            Button("Reset 2h") {
                                Task { await resetTimer() }
                            }
                            .buttonStyle(.bordered)
                            .disabled(isUpdating)
                        }
                    }
                }
            } else {
                ProgressView("Đang đồng bộ Pomodoro…")
            }
            Spacer()
        }
        .padding()
        .navigationTitle("Pomodoro")
        .onAppear {
            localState = appState.pomodoroState
            syncDate = Date()
        }
        .onReceive(timer) { _ in
            guard var state = localState ?? appState.pomodoroState else { return }
            if state.paused { return }
            let elapsed = Date().timeIntervalSince(syncDate)
            let next = max(0, state.secLeft - elapsed)
            state = PomodoroState(phaseIndex: state.phaseIndex, secLeft: next, paused: false, updatedBy: state.updatedBy, updatedAt: state.updatedAt)
            localState = state
            if next <= 0.5 {
                advancePhase()
            }
        }
        .onChange(of: appState.pomodoroState) { _, newValue in
            localState = newValue
            syncDate = Date()
        }
        .task {
            if appState.pomodoroState == nil {
                await appState.refreshPomodoro()
                localState = appState.pomodoroState
                syncDate = Date()
            }
        }
    }

    private func timeLabel(for state: PomodoroState) -> String {
        let remaining = Int(max(0, state.secLeft))
        let minutes = remaining / 60
        let seconds = remaining % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    private func progress(for state: PomodoroState) -> Double {
        let phase = state.currentPhase
        return 1 - max(0, min(1, state.secLeft / phase.duration))
    }

    private func toggleRunning(paused: Bool) async {
        guard let current = localState ?? appState.pomodoroState else { return }
        isUpdating = true
        defer { isUpdating = false }
        await appState.updatePomodoro(phaseIndex: current.phaseIndex, secLeft: current.secLeft, paused: paused, updatedBy: nil)
        localState = appState.pomodoroState
        syncDate = Date()
    }

    private func resetTimer() async {
        isUpdating = true
        defer { isUpdating = false }
        let first = schedule.first ?? PomodoroState.Phase(kind: .focus, cycle: 1, duration: 50 * 60)
        await appState.updatePomodoro(phaseIndex: 0, secLeft: first.duration, paused: true, updatedBy: nil)
        localState = appState.pomodoroState
        syncDate = Date()
    }

    private func advancePhase() {
        guard let current = localState ?? appState.pomodoroState else { return }
        let nextIndex = min(current.phaseIndex + 1, schedule.count - 1)
        Task {
            await appState.updatePomodoro(phaseIndex: nextIndex, secLeft: schedule[nextIndex].duration, paused: false, updatedBy: nil)
            localState = appState.pomodoroState
            syncDate = Date()
        }
    }
}


@available(iOS 26.0, *)
private struct DrawingCanvas: View {
    @State private var strokes: [[CGPoint]] = []
    @State private var currentStroke: [CGPoint] = []

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(.systemBackground)
                ForEach(strokes.indices, id: \(.self)) { index in
                    path(for: strokes[index])
                        .stroke(Color.blue, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
                }
                path(for: currentStroke)
                    .stroke(Color.orange, style: StrokeStyle(lineWidth: 4, lineCap: .round, lineJoin: .round))
            }
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { value in
                        if currentStroke.isEmpty {
                            currentStroke = [value.location]
                        } else {
                            currentStroke.append(value.location)
                        }
                    }
                    .onEnded { _ in
                        if !currentStroke.isEmpty {
                            strokes.append(currentStroke)
                            currentStroke = []
                        }
                    }
            )
            .simultaneousGesture(
                LongPressGesture(minimumDuration: 0.7).onEnded { _ in
                    strokes.removeAll()
                    currentStroke = []
                }
            )
        }
        .frame(maxWidth: .infinity, minHeight: 220)
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    private func path(for points: [CGPoint]) -> Path {
        var path = Path()
        guard let first = points.first else { return path }
        path.move(to: first)
        for point in points.dropFirst() {
            path.addLine(to: point)
        }
        return path
    }
}


@available(iOS 26.0, *)
struct MetricRow: View {
    let metric: StudyCard.Metric

    var body: some View {
        HStack {
            Text(metric.label)
                .font(.subheadline)
                .foregroundColor(Color("LiquidPrimary"))
            Spacer()
            Text(metric.value)
                .font(.system(.body, design: .monospaced))
                .foregroundColor(.primary)
        }
        .padding()
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(Color(.secondarySystemBackground))
        )
    }
}

@available(iOS 26.0, *)
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

#endif
