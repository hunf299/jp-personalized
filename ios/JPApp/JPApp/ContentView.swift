#if canImport(SwiftUI)
import SwiftUI
#endif
#if canImport(Combine)
import Combine
#endif
#if canImport(UserNotifications)
import UserNotifications
#endif
#if canImport(UIKit)
import UIKit
#endif

@available(iOS 16.0, *)
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
        .onChange(of: appState.lastError, initial: false) { _, newValue in
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

@available(iOS 16.0, *)
struct DashboardScreen: View {
    @EnvironmentObject private var appState: AppState
    @Binding var selectedTab: ContentView.Tab
    @State private var hasLoadedSnapshot = false

    private var vocabSnapshot: MemorySnapshot {
        appState.memorySnapshot(for: "vocab")
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if let stats = appState.stats {
                    GlassContainer {
                        VStack(alignment: .leading, spacing: 16) {
                            Text("Tổng quan dữ liệu hiện tại")
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

                MemorySnapshotSection(snapshot: vocabSnapshot)

                if !vocabSnapshot.rows.isEmpty {
                    DueReminderSection(snapshot: vocabSnapshot, selectedTab: $selectedTab)
                }

                if let updated = appState.lastUpdated {
                    Text("Đồng bộ lần cuối: \(updated.formatted(date: .abbreviated, time: .shortened))")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
            .padding()
        }
        .navigationTitle("Tổng quan học tập")
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
        .onAppear {
            Task { await appState.refreshAll() }
        }
        .onTapGesture {
            Task { await appState.refreshAll() }
        }
    }
}

@available(iOS 16.0, *)
private struct StudyShortcutSection: View {
    @EnvironmentObject private var appState: AppState
    @Binding var selectedTab: ContentView.Tab
    @State private var hasLoadedSnapshots = false
    @State private var snapshotVersion: Int = 0
    @State private var remoteRemaining: [String: Int]? = nil

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
        let counts = remoteRemaining ?? countsByType()
        return [
            Item(title: "Ngữ pháp", subtitle: "Xem liên kết dạng gốc", icon: "list.bullet.rectangle.portrait.fill", color: Color("LiquidHighlight"), type: "grammar", count: counts["grammar"] ?? 0),
            Item(title: "Kanji", subtitle: "Luyện bộ thủ và nghĩa", icon: "character.book.closed.fill", color: Color("LiquidAccent"), type: "kanji", count: counts["kanji"] ?? 0),
            Item(title: "Từ vựng", subtitle: "Ôn tập 10 thẻ mới", icon: "bolt.fill", color: Color("LiquidPrimary"), type: "vocab", count: counts["vocab"] ?? 0),
            Item(title: "Trợ từ", subtitle: "Tra cứu & so sánh", icon: "textformat.abc", color: Color("LiquidPrimary").opacity(0.8), type: "particle", count: counts["particle"] ?? 0)
        ]
    }

    private func countsByType() -> [String: Int] {
        // Total cards per type from the deck
        var totals: [String: Int] = [:]
        for card in appState.cards {
            totals[card.type, default: 0] += 1
        }

        // Learned counts per type from memory snapshots (level >= 3 considered learned)
        var learned: [String: Int] = [:]
        for (type, _) in totals {
            learned[type] = learnedCount(for: type)
        }

        // Remaining = total - learned (clamped at 0)
        var remaining: [String: Int] = [:]
        for (type, total) in totals {
            let learnedCount = learned[type] ?? 0
            remaining[type] = max(0, total - learnedCount)
        }
        return remaining
    }

    private func learnedCount(for type: String) -> Int {
        // Reuse the same idea as PracticeSessionView's memory helpers by reading the snapshot
        // and interpreting levels >= 3 as learned.
        let snapshot = appState.memorySnapshot(for: type)
        var count = 0
        for row in snapshot.rows {
            if row.level >= 0 { count += 1 }
        }
        return count
    }

    private func preloadSnapshotsIfNeeded() async {
        guard !hasLoadedSnapshots else { return }
        hasLoadedSnapshots = true
        let types = ["vocab", "kanji", "grammar", "particle"]
        for type in types {
            if appState.memorySnapshot(for: type).rows.isEmpty {
                await appState.refreshProgress(for: type)
            }
        }
        await MainActor.run { snapshotVersion &+= 1 }
    }

    private func fetchRemoteRemaining() async {
        guard let url = URL(string: "https://jp-personalized.vercel.app/api/progress/export") else { return }
        do {
            let (data, response) = try await URLSession.shared.data(from: url)
            guard let http = response as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return }

            let keys = ["vocab", "kanji", "grammar", "particle"]
            var result: [String: Int]? = nil

            // Try decode as a flat dictionary
            if let dict = try? JSONDecoder().decode([String: Int].self, from: data) {
                result = dict.filter { keys.contains($0.key.lowercased()) }
            } else {
                struct ExportResponse: Decodable {
                    let remaining_by_type: [String: Int]?
                    let remaining: [String: Int]?
                    let vocab: Int?
                    let kanji: Int?
                    let grammar: Int?
                    let particle: Int?
                }

                if let resp = try? JSONDecoder().decode(ExportResponse.self, from: data) {
                    if let byType = resp.remaining_by_type, !byType.isEmpty {
                        result = byType.filter { keys.contains($0.key.lowercased()) }
                    } else if let rem = resp.remaining, !rem.isEmpty {
                        result = rem.filter { keys.contains($0.key.lowercased()) }
                    } else {
                        var out: [String: Int] = [:]
                        if let v = resp.vocab { out["vocab"] = v }
                        if let k = resp.kanji { out["kanji"] = k }
                        if let g = resp.grammar { out["grammar"] = g }
                        if let p = resp.particle { out["particle"] = p }
                        result = out.isEmpty ? nil : out
                    }
                }
            }

            if let result {
                await MainActor.run {
                    self.remoteRemaining = result
                    self.snapshotVersion &+= 1
                }
            }
        } catch {
            // Ignore errors and keep fallback to local calculation
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Bắt đầu học thẻ còn lại")
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
        .task {
            await preloadSnapshotsIfNeeded()
            await fetchRemoteRemaining()
        }
        .onChange(of: appState.cards.count) { _ in
            snapshotVersion &+= 1
        }
    }
}

@available(iOS 16.0, *)
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
                    ForEach(Array(snapshot.dist.enumerated()), id: \.offset) { pair in
                        let index = pair.offset
                        let value = pair.element
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

@available(iOS 16.0, *)
private struct DueReminderSection: View {
    let snapshot: MemorySnapshot
    @Binding var selectedTab: ContentView.Tab

    private var summary: MemorySnapshot.DueSummary {
        snapshot.dueSummary()
    }
    private var dueSoonExcludingToday: Int {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)
        guard let startOfTomorrow = calendar.date(byAdding: .day, value: 1, to: startOfToday) else { return 0 }
        guard let endDate = calendar.date(byAdding: .day, value: 3, to: startOfTomorrow) else { return 0 }
        return snapshot.rows.filter { row in
            guard let due = row.due else { return false }
            return due >= startOfTomorrow && due < endDate
        }.count
    }

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Lịch ôn tập sắp tới")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))

                HStack {
                    Label("Đến hạn hôm nay", systemImage: "calendar.badge.clock")
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(summary.dueTodayTotal)")
                        .font(.title3.monospacedDigit())
                        .foregroundColor(summary.dueTodayTotal > 0 ? .primary : .secondary)
                }

                HStack {
                    Label("Trong 3 ngày tới", systemImage: "calendar")
                        .foregroundColor(.secondary)
                    Spacer()
                    Text("\(dueSoonExcludingToday)")
                        .font(.title3.monospacedDigit())
                        .foregroundColor(dueSoonExcludingToday > 0 ? .primary : .secondary)
                }

                if summary.dueTodayTotal > 0 {
                    Text("Có \(summary.dueTodayTotal) thẻ đã đến hạn. Ôn ngay để không bị trễ nhé!")
                        .font(.footnote)
                        .foregroundColor(.secondary)

                    Button {
                        selectedTab = .progress
                    } label: {
                        Label("Ôn tập ngay", systemImage: "bolt.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                } else if dueSoonExcludingToday > 0 {
                    Text("Trong 3 ngày tới sẽ có \(dueSoonExcludingToday) thẻ đến hạn. Chuẩn bị sẵn sàng nhé!")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                } else {
                    Text("Không có thẻ nào đến hạn trong vài ngày tới. Tiếp tục duy trì nhé!")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
        }
    }
}
@available(iOS 16.0, *)
struct StudyScreen: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedType: CardType = .vocab
    @State private var searchText: String = ""
    @State private var practiceCards: [DeckCard] = []
    @State private var showPractice = false
    @State private var isPreparingPractice = false
    @State private var loadedSnapshotTypes: Set<String> = []

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
                    Task { @MainActor in
                        guard !isPreparingPractice else { return }
                        isPreparingPractice = true
                        defer { isPreparingPractice = false }
                        await loadSnapshotIfNeeded(for: selectedType, force: true)
                        let batch = preparePracticeBatch()
                        practiceCards = batch
                        showPractice = !batch.isEmpty
                    }
                } label: {
                    Label("Bắt đầu học", systemImage: "play.circle.fill")
                }
                .disabled(isPreparingPractice || !canPractice)
                .overlay {
                    if isPreparingPractice {
                        ProgressView()
                            .progressViewStyle(.circular)
                            .controlSize(.small)
                            .allowsHitTesting(false)
                    }
                }
            }
        }
        .searchable(text: $searchText, placement: .navigationBarDrawer(displayMode: .automatic), prompt: "Tìm thẻ…")
        .navigationDestination(isPresented: $showPractice) {
            PracticeSessionView(mode: .study, type: selectedType, cards: practiceCards)
        }
        .task {
            await loadSnapshotIfNeeded(for: selectedType)
        }
        .onChange(of: selectedType, initial: false) { _, newValue in
            Task { await loadSnapshotIfNeeded(for: newValue) }
        }
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
        let pool = availablePracticeCards
        return Array(pool.shuffled().prefix(10))
    }

    private var canPractice: Bool {
        !availablePracticeCards.isEmpty
    }

    private var availablePracticeCards: [DeckCard] {
        let key = selectedType.rawValue
        let snapshot = appState.memorySnapshot(for: key)
        let excludedIDs: Set<String> = Set(snapshot.rows.compactMap { row in
            let trimmedID = row.cardID.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedID.isEmpty else { return nil }
            return trimmedID.lowercased()
        })

        return appState.cards.filter { card in
            let normalizedType = card.type.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            guard normalizedType == key else { return false }
            let identifier = card.id.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            return !excludedIDs.contains(identifier)
        }
    }

    private func loadSnapshotIfNeeded(for type: CardType, force: Bool = false) async {
        let key = type.rawValue
        if force {
            await appState.refreshProgress(for: key)
            await MainActor.run {
                loadedSnapshotTypes.insert(key)
            }
            return
        }

        if loadedSnapshotTypes.contains(key) {
            return
        }

        let shouldFetch: Bool = await MainActor.run {
            appState.memorySnapshot(for: key).rows.isEmpty
        }

        if shouldFetch {
            await appState.refreshProgress(for: key)
        }

        await MainActor.run {
            loadedSnapshotTypes.insert(key)
        }
    }
}

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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


@available(iOS 16.0, *)
struct PracticeSessionView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var reviewSettings: ReviewSettingsStore
    @Environment(\.dismiss) private var dismiss

    enum Mode {
        case study
        case review
    }

    let mode: Mode
    let type: CardType
    let cards: [DeckCard]

    init(mode: Mode, type: CardType, cards: [DeckCard]) {
        self.mode = mode
        self.type = type
        self.cards = cards
        let initialPhase: Phase
        switch type {
        case .kanji:
            initialPhase = .warmup
        case .vocab, .grammar, .particle:
            initialPhase = .recall
        }
        _phase = State(initialValue: initialPhase)
    }

    private enum Phase {
        case warmup
        case warmupSummary
        case recall
        case results
    }

    private enum KanjiPhase: Int, CaseIterable {
        case writePass1
        case mcqMeaning
        case mcqExample
        case mcqReading
        case writePass2
        case mcqContext
        case results

        var next: KanjiPhase? {
            guard let currentIndex = KanjiPhase.allCases.firstIndex(of: self), currentIndex + 1 < KanjiPhase.allCases.count else {
                return nil
            }
            return KanjiPhase.allCases[currentIndex + 1]
        }
    }

    private struct KanjiMCQConfiguration {
        let title: String
        let options: [String]
        let correct: String
    }

    @State private var phase: Phase
    @State private var kanjiPhase: KanjiPhase = .writePass1
    @State private var index: Int = 0
    @State private var warmupScores: [String: WarmupResult] = [:]
    @State private var recallScores: [String: RecallResult] = [:]
    @State private var selectedOption: String? = nil
    @State private var warmupChecked = false
    @State private var warmupStart = Date()
    @State private var answerText: String = ""
    @State private var recallChecked = false
    @State private var qualitySelection: Int = 3
    @State private var isUpdatingMemory = false
    @State private var hasAppliedUpdates = false
    @State private var isSavingSession = false
    @State private var sessionSaved = false
    @State private var autoFlipTask: Task<Void, Never>? = nil
    @State private var warmupCompleted = false
    @State private var loggedCardIDs: Set<String> = []

    @State private var kanjiSelectedOption: String? = nil
    @State private var kanjiMCQChecked = false
    @State private var kanjiWarmupStart = Date()
    @State private var kanjiAnswerText: String = ""
    @State private var kanjiRecallChecked = false
    @State private var kanjiQualitySelection: Int = 3

    @State private var kanjiWritePass1Scores: [String: RecallResult] = [:]
    @State private var kanjiWritePass2Scores: [String: RecallResult] = [:]
    @State private var kanjiMCQMeaningScores: [String: WarmupResult] = [:]
    @State private var kanjiMCQExampleScores: [String: WarmupResult] = [:]
    @State private var kanjiMCQReadingScores: [String: WarmupResult] = [:]
    @State private var kanjiMCQContextScores: [String: WarmupResult] = [:]

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

    private var isKanjiFlow: Bool { type == .kanji }

    private var isRecallFirstFlow: Bool {
        switch type {
        case .kanji:
            return false
        case .vocab, .grammar, .particle:
            return true
        }
    }

    private var isKanjiMCQPhase: Bool {
        switch kanjiPhase {
        case .mcqMeaning, .mcqExample, .mcqReading, .mcqContext:
            return true
        default:
            return false
        }
    }

    private var currentCard: DeckCard? {
        guard index < cards.count else { return nil }
        return cards[index]
    }

    private var orientationSetting: ReviewSettingsStore.CardOrientation {
        reviewSettings.cardOrientation
    }

    private var autoFlipConfiguration: ReviewSettingsStore.AutoFlipConfiguration? {
        guard mode == .review else { return nil }
        guard type != .kanji else { return nil }
        return reviewSettings.autoFlipConfiguration
    }

    private func trimmed(_ value: String?) -> String {
        value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    private func normalizedFront(for card: DeckCard) -> String {
        let front = trimmed(card.front)
        return front.isEmpty ? card.front : front
    }

    private func normalizedBack(for card: DeckCard) -> String {
        let candidates = [card.back, card.displayMeaning]
        for candidate in candidates {
            let value = trimmed(candidate)
            if !value.isEmpty { return value }
        }
        return normalizedFront(for: card)
    }

    private func warmupQuestionValue(for card: DeckCard) -> String {
        if type == .kanji {
            return normalizedFront(for: card)
        }
        return orientationSetting == .reversed ? normalizedBack(for: card) : normalizedFront(for: card)
    }

    private func warmupAnswer(for card: DeckCard) -> String {
        if type == .kanji {
            return trimmed(card.warmupLabel)
        }
        return orientationSetting == .reversed ? normalizedFront(for: card) : normalizedBack(for: card)
    }

    private func warmupPromptTitle(for card: DeckCard) -> String {
        if type == .kanji {
            return "Chọn Hán Việt + on/kun cho \(normalizedFront(for: card))"
        }
        let question = warmupQuestionValue(for: card)
        if orientationSetting == .reversed {
            return "Chọn từ đúng cho: \(question)"
        } else {
            return "Chọn nghĩa đúng cho: \(question)"
        }
    }

    private func recallPrompt(for card: DeckCard) -> String {
        if type == .kanji {
            return "Vẽ kanji tương ứng với: \(card.warmupLabel)"
        }
        let base = orientationSetting == .reversed ? normalizedBack(for: card) : normalizedFront(for: card)
        if orientationSetting == .reversed {
            return "Điền từ cho: \(base)"
        } else {
            return "Điền nghĩa cho: \(base)"
        }
    }

    private func recallExpectedAnswer(for card: DeckCard) -> String {
        if type == .kanji {
            return normalizedFront(for: card)
        }
        return orientationSetting == .reversed ? normalizedFront(for: card) : normalizedBack(for: card)
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                if isKanjiFlow {
                    switch kanjiPhase {
                    case .writePass1, .writePass2:
                        if let card = currentCard {
                            let prompt = kanjiPhase == .writePass1 ? kanjiWritingPrompt(pass: 1, for: card) : kanjiWritingPrompt(pass: 2, for: card)
                            let expected = recallExpectedAnswer(for: card)
                            RecallQuestion(card: card,
                                           type: .kanji,
                                           promptText: prompt,
                                           expectedAnswer: expected,
                                           answerText: $kanjiAnswerText,
                                           recallChecked: $kanjiRecallChecked,
                                           qualitySelection: $kanjiQualitySelection,
                                           onCheck: { handleKanjiWritingCheck(for: card) })
                            HStack {
                                Button("Quay lại") {
                                    goBackKanji()
                                }
                                .buttonStyle(.bordered)
                                .disabled(index == 0)

                                let isLastCard = index + 1 == cards.count
                                Button(kanjiAdvanceButtonTitle(isLastCard: isLastCard)) {
                                    advanceKanjiWriting()
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(!kanjiRecallChecked)
                            }
                        }
                    case .mcqMeaning, .mcqExample, .mcqReading, .mcqContext:
                        if let card = currentCard {
                            let config = kanjiConfiguration(for: card)
                            WarmupQuestion(title: config.title,
                                           options: config.options,
                                           selectedOption: $kanjiSelectedOption,
                                           checked: $kanjiMCQChecked,
                                           onCheck: { handleKanjiMCQCheck(for: card, expected: config.correct) })
                            HStack {
                                Button("Quay lại") {
                                    goBackKanji()
                                }
                                .buttonStyle(.bordered)
                                .disabled(index == 0)

                                let isLastCard = index + 1 == cards.count
                                Button(kanjiAdvanceButtonTitle(isLastCard: isLastCard)) {
                                    advanceKanjiMCQ()
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(!kanjiMCQChecked)
                            }
                        }
                    case .results:
                        SessionResultsView(cards: cards, finalScoreProvider: { finalScore(for: $0) })
                        Button {
                            completeSessionAndDismiss()
                        } label: {
                            if isCompletingSession {
                                ProgressView()
                            } else {
                                Text(completionButtonTitle)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    switch phase {
                    case .warmup:
                        if let card = currentCard {
                            WarmupQuestion(title: warmupPromptTitle(for: card),
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
                                           promptText: recallPrompt(for: card),
                                           expectedAnswer: recallExpectedAnswer(for: card),
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

                                let isLastCard = index + 1 == cards.count
                                Button(isLastCard && (!isRecallFirstFlow || warmupCompleted) ? "Hoàn tất" : "Tiếp") {
                                    advanceRecall()
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled((type != .kanji && answerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) || !recallChecked)
                            }
                        }
                    case .results:
                        SessionResultsView(cards: cards, finalScoreProvider: { finalScore(for: $0) })
                        Button {
                            completeSessionAndDismiss()
                        } label: {
                            if isCompletingSession {
                                ProgressView()
                            } else {
                                Text(completionButtonTitle)
                                    .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("Luyện tập \(type.displayName.lowercased())")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if isKanjiFlow {
                prepareKanjiForCurrentCard(resetSelection: true)
            } else {
                if phase == .warmup {
                    warmupStart = Date()
                } else if phase == .recall {
                    resetRecallState()
                }
                scheduleAutoFlip()
            }
        }
        .onDisappear {
            cancelAutoFlipTask()
        }
        .onChange(of: qualitySelection, initial: false) { _, newValue in
            guard !isKanjiFlow, phase == .recall, let card = currentCard else { return }
            var result = recallScores[card.id] ?? RecallResult(quality: newValue, correct: nil, userAnswer: answerText)
            result.quality = newValue
            recallScores[card.id] = result
        }
        .onChange(of: kanjiQualitySelection, initial: false) { _, newValue in
            guard isKanjiFlow, let card = currentCard else { return }
            updateKanjiQuality(quality: newValue, for: card)
        }
        .onChange(of: phase, initial: false) { _, newValue in
            guard !isKanjiFlow else { return }
            if newValue == .warmup {
                warmupStart = Date()
                selectedOption = nil
                warmupChecked = false
            } else if newValue == .recall {
                index = 0
                resetRecallState()
            }
            scheduleAutoFlip()
        }
        .onChange(of: kanjiPhase, initial: false) { _, _ in
            guard isKanjiFlow else { return }
            index = 0
            prepareKanjiForCurrentCard(resetSelection: true)
        }
        .onChange(of: index, initial: false) { _, _ in
            if isKanjiFlow {
                prepareKanjiForCurrentCard(resetSelection: true)
            } else {
                scheduleAutoFlip()
            }
        }
        .onChange(of: warmupChecked, initial: false) { _, _ in
            guard !isKanjiFlow else { return }
            scheduleAutoFlip()
        }
        .onChange(of: recallChecked, initial: false) { _, _ in
            guard !isKanjiFlow else { return }
            scheduleAutoFlip()
        }
        .onChange(of: reviewSettings.autoFlip, initial: false) { _, _ in
            guard !isKanjiFlow else { return }
            scheduleAutoFlip()
        }
        .onChange(of: reviewSettings.cardOrientation, initial: false) { _, _ in
            guard !isKanjiFlow else { return }
            handleOrientationChange()
        }
    }

    private func warmupOptions(for card: DeckCard) -> [String] {
        let correct = warmupAnswer(for: card)
        var options: [String] = []

        func appendOption(_ value: String) {
            guard !value.isEmpty else { return }
            if !options.contains(value) {
                options.append(value)
            }
        }

        appendOption(correct)

        for other in cards.shuffled() where other.id != card.id {
            appendOption(warmupAnswer(for: other))
            if options.count >= 4 { break }
        }

        while options.count < 4 {
            options.append("—")
        }

        return options.shuffled()
    }

    private func handleWarmupCheck(for card: DeckCard, force: Bool = false) {
        let correctLabel = warmupAnswer(for: card)
        let selected = selectedOption ?? ""
        if !force && selected.isEmpty { return }

        let elapsed = Int(Date().timeIntervalSince(warmupStart))
        let isCorrect = selected == correctLabel
        let score = isCorrect ? scoreForTime(elapsed) : 0
        warmupScores[card.id] = WarmupResult(correct: isCorrect, time: elapsed, score: score)
        if !isCorrect {
            self.selectedOption = correctLabel
        }
        warmupChecked = true
    }

    private func advanceWarmup() {
        if let card = currentCard {
            logIfReady(for: card)
        }
        if index + 1 < cards.count {
            index += 1
            warmupStart = Date()
            selectedOption = nil
            warmupChecked = false
        } else {
            warmupCompleted = true
            if isRecallFirstFlow {
                phase = .results
                index = 0
            } else {
                phase = .warmupSummary
                index = 0
            }
        }
    }

    private func resetRecallState() {
        answerText = ""
        recallChecked = false
        qualitySelection = 3
    }

    private func handleRecallCheck(for card: DeckCard) {
        if type == .kanji {
            // For kanji recall, we use drawing instead of text input. Default quality to a neutral value and don't compute correctness.
            let defaultQuality = 3
            qualitySelection = defaultQuality
            recallScores[card.id] = RecallResult(quality: defaultQuality, correct: nil, userAnswer: "")
            recallChecked = true
            return
        }

        let trimmed = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
        let expected = recallExpectedAnswer(for: card)
        let isCorrect = trimmed.lowercased() == expected.lowercased()
        let defaultQuality = isCorrect ? 3 : 0
        qualitySelection = defaultQuality
        recallScores[card.id] = RecallResult(quality: defaultQuality, correct: isCorrect, userAnswer: trimmed)
        recallChecked = true
    }

    private func scheduleAutoFlip() {
        cancelAutoFlipTask()
        guard !isKanjiFlow else { return }
        guard let config = autoFlipConfiguration else { return }
        guard let card = currentCard else { return }

        switch phase {
        case .warmup:
            autoFlipTask = Task {
                let cardID = card.id
                let delay = UInt64(max(0, config.warmupDelay) * 1_000_000_000)
                if delay > 0 {
                    try? await Task.sleep(nanoseconds: delay)
                }
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard self.mode == .review,
                          self.phase == .warmup,
                          let current = self.currentCard,
                          current.id == cardID else { return }
                    if !self.warmupChecked {
                        self.handleWarmupCheck(for: current, force: true)
                    }
                }
                guard !Task.isCancelled else { return }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard self.mode == .review,
                          self.phase == .warmup,
                          let current = self.currentCard,
                          current.id == cardID else { return }
                    if self.warmupChecked {
                        self.advanceWarmup()
                    }
                }
            }
        case .recall:
            autoFlipTask = Task {
                let cardID = card.id
                let delay = UInt64(max(0, config.recallDelay) * 1_000_000_000)
                if delay > 0 {
                    try? await Task.sleep(nanoseconds: delay)
                }
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard self.mode == .review,
                          self.phase == .recall,
                          let current = self.currentCard,
                          current.id == cardID else { return }
                    if !self.recallChecked {
                        self.handleRecallCheck(for: current)
                    }
                }
                guard !Task.isCancelled else { return }
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard self.mode == .review,
                          self.phase == .recall,
                          let current = self.currentCard,
                          current.id == cardID else { return }
                    if self.recallChecked {
                        self.advanceRecall()
                    }
                }
            }
        default:
            break
        }
    }

    private func cancelAutoFlipTask() {
        autoFlipTask?.cancel()
        autoFlipTask = nil
    }

    private func handleOrientationChange() {
        guard !isKanjiFlow else { return }
        if phase == .warmup {
            selectedOption = nil
            warmupChecked = false
            warmupStart = Date()
        } else if phase == .recall {
            resetRecallState()
        }
        scheduleAutoFlip()
    }

    private func advanceRecall() {
        guard let card = currentCard, let _ = recallScores[card.id] else { return }
        logIfReady(for: card)
        if index + 1 < cards.count {
            index += 1
            resetRecallState()
        } else {
            if isRecallFirstFlow && !warmupCompleted {
                phase = .warmup
                index = 0
                warmupStart = Date()
                selectedOption = nil
                warmupChecked = false
                warmupCompleted = false
            } else {
                phase = .results
            }
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

    private func warmupScore(for card: DeckCard) -> Int {
        if isKanjiFlow {
            return kanjiWarmupScore(for: card)
        }
        return warmupScores[card.id]?.score ?? 0
    }

    private func recallScore(for card: DeckCard) -> Int {
        if isKanjiFlow {
            return kanjiRecallScore(for: card)
        }
        return recallScores[card.id]?.quality ?? 0
    }

    private func finalScore(for card: DeckCard) -> Int {
        if isKanjiFlow {
            return kanjiFinalScore(for: card)
        }
        let warmup = warmupScore(for: card)
        let recall = recallScores[card.id]?.quality ?? 0
        let averaged = Int(round(Double(warmup + recall) / 2.0))
        return max(0, min(5, averaged))
    }

    private func qualityScore(for card: DeckCard) -> Int {
        if isKanjiFlow {
            return kanjiFinalScore(for: card)
        }
        return recallScores[card.id]?.quality ?? 0
    }

    private func kanjiWarmupScore(for card: DeckCard) -> Int {
        let values: [(Int, Int)] = [
            (20, kanjiMCQMeaningScores[card.id]?.score ?? 0),
            (20, kanjiMCQExampleScores[card.id]?.score ?? 0),
            (10, kanjiMCQReadingScores[card.id]?.score ?? 0),
            (5, kanjiMCQContextScores[card.id]?.score ?? 0)
        ]
        return weightedScore(values: values, denominator: 55)
    }

    private func kanjiRecallScore(for card: DeckCard) -> Int {
        let values: [(Int, Int)] = [
            (15, kanjiWritePass1Scores[card.id]?.quality ?? 0),
            (20, kanjiWritePass2Scores[card.id]?.quality ?? 0)
        ]
        return weightedScore(values: values, denominator: 35)
    }

    private func kanjiFinalScore(for card: DeckCard) -> Int {
        let values: [(Int, Int)] = [
            (15, kanjiWritePass1Scores[card.id]?.quality ?? 0),
            (20, kanjiMCQMeaningScores[card.id]?.score ?? 0),
            (20, kanjiMCQExampleScores[card.id]?.score ?? 0),
            (10, kanjiMCQReadingScores[card.id]?.score ?? 0),
            (20, kanjiWritePass2Scores[card.id]?.quality ?? 0),
            (5, kanjiMCQContextScores[card.id]?.score ?? 0)
        ]
        return weightedScore(values: values, denominator: 100)
    }

    private func weightedScore(values: [(Int, Int)], denominator: Int) -> Int {
        guard denominator > 0 else { return 0 }
        let numerator = values.reduce(0) { partial, entry in
            let clamped = max(0, min(5, entry.1))
            return partial + entry.0 * clamped
        }
        let raw = Double(numerator) / Double(denominator)
        let rounded = Int(round(raw))
        return max(0, min(5, rounded))
    }

    private func isCardReadyForLogging(_ card: DeckCard) -> Bool {
        if isKanjiFlow {
            return kanjiWritePass1Scores[card.id] != nil &&
                   kanjiWritePass2Scores[card.id] != nil &&
                   kanjiMCQMeaningScores[card.id] != nil &&
                   kanjiMCQExampleScores[card.id] != nil &&
                   kanjiMCQReadingScores[card.id] != nil &&
                   kanjiMCQContextScores[card.id] != nil
        }
        return warmupScores[card.id] != nil && recallScores[card.id] != nil
    }

    private func logIfReady(for card: DeckCard) {
        guard !loggedCardIDs.contains(card.id) else { return }
        guard isCardReadyForLogging(card) else { return }
        let warmup = warmupScore(for: card)
        let recall = recallScore(for: card)
        let final = finalScore(for: card)
        let quality = qualityScore(for: card)
        Task {
            await appState.logReview(for: card, warmup: warmup, recall: recall, final: final, quality: quality)
        }
        loggedCardIDs.insert(card.id)
    }

    private func kanjiWritingPrompt(pass: Int, for card: DeckCard) -> String {
        let prefix = pass == 1 ? "Phần 1 – Viết nét lần 1" : "Phần 5 – Viết nét lần 2"
        return "\(prefix): \(card.front)"
    }

    private func handleKanjiWritingCheck(for card: DeckCard) {
        let clamped = max(0, min(5, kanjiQualitySelection))
        kanjiQualitySelection = clamped
        kanjiRecallChecked = true
        updateKanjiQuality(quality: clamped, for: card)
    }

    private func updateKanjiQuality(quality: Int, for card: DeckCard) {
        let clamped = max(0, min(5, quality))
        let result = RecallResult(quality: clamped, correct: nil, userAnswer: "")
        switch kanjiPhase {
        case .writePass1:
            kanjiWritePass1Scores[card.id] = result
        case .writePass2:
            kanjiWritePass2Scores[card.id] = result
        default:
            break
        }
    }

    private func advanceKanjiWriting() {
        guard let card = currentCard else { return }
        logIfReady(for: card)
        if index + 1 < cards.count {
            index += 1
        } else if let next = kanjiPhase.next {
            kanjiPhase = next
        } else {
            kanjiPhase = .results
        }
    }

    private func goBackKanji() {
        guard index > 0 else { return }
        index -= 1
    }

    private func kanjiAdvanceButtonTitle(isLastCard: Bool) -> String {
        if kanjiPhase == .mcqContext && isLastCard {
            return "Hoàn tất"
        }
        return isLastCard ? "Sang phần tiếp theo" : "Tiếp"
    }

    private func kanjiConfiguration(for card: DeckCard) -> KanjiMCQConfiguration {
        switch kanjiPhase {
        case .mcqMeaning:
            let title = "Phần 2 – MCQ: \(warmupPromptTitle(for: card))"
            return KanjiMCQConfiguration(title: title,
                                        options: warmupOptions(for: card),
                                        correct: warmupAnswer(for: card))
        case .mcqExample:
            return kanjiExampleConfiguration(for: card)
        case .mcqReading:
            return kanjiReadingConfiguration(for: card)
        case .mcqContext:
            return kanjiContextConfiguration(for: card)
        default:
            let title = warmupPromptTitle(for: card)
            return KanjiMCQConfiguration(title: title,
                                        options: warmupOptions(for: card),
                                        correct: warmupAnswer(for: card))
        }
    }

    private func kanjiExampleConfiguration(for card: DeckCard) -> KanjiMCQConfiguration {
        let example = card.exampleItems.first(where: { !$0.front.isEmpty || !$0.back.isEmpty })
        let promptFront = example?.front.trimmingCharacters(in: .whitespacesAndNewlines)
        let prompt = (promptFront?.isEmpty ?? true) ? "Phần 3 – MCQ ví dụ:\n\(normalizedFront(for: card))" : "Phần 3 – MCQ ví dụ:\n\(promptFront!)"
        let defaultAnswer = normalizedBack(for: card)
        let correct = {
            let trimmed = example?.back.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? defaultAnswer : trimmed
        }()

        var options: [String] = []
        appendOption(correct, to: &options)
        for entry in card.exampleItems {
            appendOption(entry.back, to: &options)
        }
        if options.count < 4 {
            for other in cards.shuffled() where other.id != card.id {
                for entry in other.exampleItems {
                    appendOption(entry.back, to: &options)
                    if options.count >= 4 { break }
                }
                if options.count >= 4 { break }
            }
        }
        if options.count < 4 {
            for other in cards.shuffled() where other.id != card.id {
                appendOption(normalizedBack(for: other), to: &options)
                if options.count >= 4 { break }
            }
        }
        while options.count < 4 { options.append("—") }
        return KanjiMCQConfiguration(title: prompt, options: options.shuffled(), correct: correct)
    }

    private func kanjiReadingConfiguration(for card: DeckCard) -> KanjiMCQConfiguration {
        var options: [String] = []
        for value in card.spellVariants {
            appendOption(value, to: &options)
        }
        let fallback = card.warmupLabel
        let correct = options.first ?? fallback
        if options.count < 4 {
            for other in cards.shuffled() where other.id != card.id {
                for value in other.spellVariants {
                    appendOption(value, to: &options)
                    if options.count >= 4 { break }
                }
                if options.count >= 4 { break }
            }
        }
        if options.count < 4 {
            appendOption(card.onReading, to: &options)
            appendOption(card.kunReading, to: &options)
            appendOption(card.warmupLabel, to: &options)
        }
        while options.count < 4 { options.append("—") }
        let title = "Phần 4 – MCQ âm đọc: \(card.front)"
        return KanjiMCQConfiguration(title: title, options: options.shuffled(), correct: correct)
    }

    private func kanjiContextConfiguration(for card: DeckCard) -> KanjiMCQConfiguration {
        let example = card.exampleItems.first(where: { !$0.spell.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) ?? card.exampleItems.first
        let promptFront = example?.front.trimmingCharacters(in: .whitespacesAndNewlines)
        let prompt = (promptFront?.isEmpty ?? true) ? "Phần 6 – MCQ ngữ cảnh:\n\(normalizedFront(for: card))" : "Phần 6 – MCQ ngữ cảnh:\n\(promptFront!)"
        var options: [String] = []
        let defaultSpell = card.hanViet
        let correct = {
            let trimmed = example?.spell.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return trimmed.isEmpty ? defaultSpell : trimmed
        }()
        appendOption(correct, to: &options)
        for entry in card.exampleItems {
            appendOption(entry.spell, to: &options)
        }
        if options.count < 4 {
            for other in cards.shuffled() where other.id != card.id {
                for entry in other.exampleItems {
                    appendOption(entry.spell, to: &options)
                    if options.count >= 4 { break }
                }
                if options.count >= 4 { break }
            }
        }
        if options.count < 4 {
            appendOption(card.hanViet, to: &options)
        }
        while options.count < 4 { options.append("—") }
        return KanjiMCQConfiguration(title: prompt, options: options.shuffled(), correct: correct)
    }

    private func appendOption(_ option: String, to options: inout [String]) {
        let trimmed = option.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if !options.contains(trimmed) {
            options.append(trimmed)
        }
    }

    private func handleKanjiMCQCheck(for card: DeckCard, expected: String) {
        let selection = kanjiSelectedOption ?? ""
        guard !selection.isEmpty else { return }
        let elapsed = Int(Date().timeIntervalSince(kanjiWarmupStart))
        let isCorrect = selection == expected
        let score = isCorrect ? scoreForTime(elapsed) : 0
        let result = WarmupResult(correct: isCorrect, time: elapsed, score: score)
        switch kanjiPhase {
        case .mcqMeaning:
            kanjiMCQMeaningScores[card.id] = result
        case .mcqExample:
            kanjiMCQExampleScores[card.id] = result
        case .mcqReading:
            kanjiMCQReadingScores[card.id] = result
        case .mcqContext:
            kanjiMCQContextScores[card.id] = result
        default:
            break
        }
        if !isCorrect {
            kanjiSelectedOption = expected
        }
        kanjiMCQChecked = true
    }

    private func advanceKanjiMCQ() {
        guard let card = currentCard else { return }
        logIfReady(for: card)
        if index + 1 < cards.count {
            index += 1
        } else if let next = kanjiPhase.next {
            kanjiPhase = next
        } else {
            kanjiPhase = .results
        }
    }

    private func prepareKanjiForCurrentCard(resetSelection: Bool) {
        guard isKanjiFlow else { return }
        guard let card = currentCard else { return }
        switch kanjiPhase {
        case .writePass1:
            kanjiQualitySelection = kanjiWritePass1Scores[card.id]?.quality ?? 3
            kanjiRecallChecked = kanjiWritePass1Scores[card.id] != nil
        case .writePass2:
            kanjiQualitySelection = kanjiWritePass2Scores[card.id]?.quality ?? 3
            kanjiRecallChecked = kanjiWritePass2Scores[card.id] != nil
        default:
            kanjiQualitySelection = 3
            kanjiRecallChecked = false
        }
        kanjiAnswerText = ""
        if isKanjiMCQPhase {
            kanjiWarmupStart = Date()
            if resetSelection {
                kanjiSelectedOption = nil
                kanjiMCQChecked = false
            }
        } else {
            kanjiWarmupStart = Date()
        }
    }

    private var isCompletingSession: Bool {
        switch mode {
        case .study: return isSavingSession
        case .review: return isUpdatingMemory
        }
    }

    private var completionButtonTitle: String {
        switch mode {
        case .study: return "Lưu phiên & quay lại"
        case .review: return "Cập nhật mức nhớ & quay lại"
        }
    }

    private func completeSessionAndDismiss() {
        switch mode {
        case .study:
            saveSessionIfNeeded()
        case .review:
            applyMemoryUpdatesIfNeeded()
        }
        dismiss()
    }

    private func applyMemoryUpdatesIfNeeded() {
        guard mode == .review else { return }
        guard !hasAppliedUpdates else { return }
        guard !cards.isEmpty else { return }
        hasAppliedUpdates = true
        isUpdatingMemory = true

        let baseLevels = memoryBaseLevels()
        let memoryRows = memoryRowsByID()
        let updates: [(card: DeckCard, final: Int, base: Int?)] = cards.map { card in
            let final = finalScore(for: card)
            let clamped = max(0, min(5, final))
            let base = baseLevels[card.id.lowercased()]
            return (card, clamped, base)
        }

        Task {
            var encounteredError = false
            var dueRequests: [AppState.MemoryDueUpdateRequest] = []
            for update in updates {
                do {
                    try await appState.updateMemoryLevel(for: update.card, baseLevel: update.base, finalLevel: update.final)
                    let key = update.card.id.lowercased()
                    let row = memoryRows[key]
                    let request = AppState.MemoryDueUpdateRequest(cardID: update.card.id,
                                                                  final: update.final,
                                                                  level: row?.level ?? update.base,
                                                                  stability: row?.stability,
                                                                  difficulty: row?.difficulty,
                                                                  lastReviewedAt: row?.lastReviewedAt,
                                                                  due: row?.due)
                    dueRequests.append(request)
                } catch {
                    encounteredError = true
                }
            }

            if !dueRequests.isEmpty {
                await appState.updateMemoryDue(type: type.rawValue, requests: dueRequests)
            }

            await appState.refreshProgress(for: type.rawValue)

            await MainActor.run {
                isUpdatingMemory = false
                if encounteredError {
                    hasAppliedUpdates = false
                }
            }
        }
    }

    private func memoryRowsByID() -> [String: MemoryRow] {
        let snapshot = appState.memorySnapshot(for: type.rawValue)
        var map: [String: MemoryRow] = [:]
        for row in snapshot.rows {
            map[row.cardID.lowercased()] = row
        }
        return map
    }

    private func memoryBaseLevels() -> [String: Int] {
        let rows = memoryRowsByID()
        var map: [String: Int] = [:]
        for (key, row) in rows {
            map[key] = row.level
        }
        return map
    }

    private func saveSessionIfNeeded() {
        guard mode == .study else { return }
        guard !sessionSaved else { return }
        sessionSaved = true
        isSavingSession = true
        var distribution = Array(repeating: 0, count: 6)
        var learned = 0
        let rows = cards.map { card -> APIClient.SessionResultPayload in
            let warmup = warmupScore(for: card)
            let recall = recallScore(for: card)
            let final = finalScore(for: card)
            if final >= 0 && final < distribution.count {
                distribution[final] += 1
                if final >= 3 { learned += 1 }
            }
            return APIClient.SessionResultPayload(cardID: card.id,
                                                  front: card.front,
                                                  back: card.back,
                                                  warmup: warmup,
                                                  recall: recall,
                                                  final: final)
        }
        let summary = APIClient.SessionSummaryPayload(total: cards.count,
                                                       learned: learned,
                                                       left: max(0, cards.count - learned),
                                                       distribution: distribution)
        Task {
            await appState.saveSession(type: type.rawValue, cards: rows, summary: summary)
            await MainActor.run { isSavingSession = false }
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

@available(iOS 16.0, *)
private struct WarmupQuestion: View {
    let title: String
    let options: [String]
    @Binding var selectedOption: String?
    @Binding var checked: Bool
    let onCheck: () -> Void

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text(title)
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                VStack(spacing: 8) {
                    ForEach(options, id: \.self) { option in
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
                        .disabled(checked)
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

@available(iOS 16.0, *)
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
                ForEach(Array(dist.enumerated()), id: \.offset) { pair in
                    let value = pair.offset
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

@available(iOS 16.0, *)
private struct RecallQuestion: View {
    let card: DeckCard
    let type: CardType
    let promptText: String
    let expectedAnswer: String
    @Binding var answerText: String
    @Binding var recallChecked: Bool
    @Binding var qualitySelection: Int
    let onCheck: () -> Void

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 16) {
                Text(promptText)
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                if type == .kanji {
                    DrawingCanvas()
                        .frame(height: 240)
                        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                    Text("Dùng ngón tay để luyện nét. Nhấn giữ lâu để xoá.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                } else {
                    TextField("Nhập đáp án…", text: $answerText)
                        .textFieldStyle(.roundedBorder)
                }
                Button("Chấm điểm") {
                    onCheck()
                }
                .buttonStyle(.borderedProminent)
                .disabled((type != .kanji && answerText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) || recallChecked)

                if recallChecked {
                    let user = answerText.trimmingCharacters(in: .whitespacesAndNewlines)
                    let isRight: Bool = {
                        switch type {
                        case .kanji:
                            return user == card.front
                        default:
                            return user.lowercased() == expectedAnswer.lowercased()
                        }
                    }()

                    VStack(alignment: .leading, spacing: 8) {
                        Text("Đáp án đúng: \(expectedAnswer)")
                            .font(.subheadline.weight(.semibold))
                            .foregroundColor(Color("LiquidPrimary"))
                        if type != .kanji, !user.isEmpty {
                            Text("Bạn trả lời: \(user)")
                                .font(.subheadline)
                                .foregroundColor(isRight ? .secondary : .red)
                        }
                    }
                }

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
}

@available(iOS 16.0, *)
private struct SessionResultsView: View {
    let cards: [DeckCard]
    let finalScoreProvider: (DeckCard) -> Int

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                Text("Kết quả phiên học")
                    .font(.headline)
                    .foregroundColor(Color("LiquidPrimary"))
                let summary = aggregated()
                Text("Thẻ đã học: \(summary.learned)/\(cards.count)")
                    .font(.title3.weight(.semibold))
                ForEach(Array(summary.dist.enumerated()), id: \.offset) { pair in
                    let level = pair.offset
                    let value = pair.element
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
            let final = max(0, min(5, finalScoreProvider(card)))
            if final >= 0 && final < dist.count {
                dist[final] += 1
                if final >= 3 { learned += 1 }
            }
        }
        return (cards.count, learned, dist)
    }
}


@available(iOS 16.0, *)
struct ProgressScreen: View {
    @EnvironmentObject private var appState: AppState
    @State private var selectedType: CardType = .vocab
    @State private var isLoading = false
    @State private var isLoadingLeech = false
    @State private var reviewCards: [DeckCard] = []
    @State private var showReviewSession = false
    @State private var showEmptyReviewAlert = false
    @State private var showMemoryLevelDetail = false
    @State private var selectedMemoryLevel: Int? = nil

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                MemoryDistributionCard(type: selectedType, snapshot: currentSnapshot) { level in
                    selectedMemoryLevel = level
                    showMemoryLevelDetail = true
                }
                ReviewOverviewCard(type: selectedType, snapshot: currentSnapshot) { rows, limit, randomize in
                    startReview(rows: rows, limit: limit, randomize: randomize)
                }
                LeechBoardSection(items: leechItems,
                                  isLoading: isLoadingLeech,
                                  errorMessage: leechError) {
                    startLeechReview()
                } onReviewItem: { item in
                    startLeechReview(for: item)
                }
                SessionListView(sessions: appState.sessions(for: selectedType.rawValue)) { session in
                    Task { await appState.deleteSession(id: session.id, type: selectedType.rawValue) }
                } onReplay: { session in
                    startSessionReplay(session)
                } onQuickReview: { cardID in
                    startQuickReview(forCardID: cardID)
                }
            }
            .padding()
        }
        .navigationTitle("Tiến độ học")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                if isLoading || isLoadingLeech {
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
        .navigationDestination(isPresented: $showReviewSession) {
            PracticeSessionView(mode: .review, type: selectedType, cards: reviewCards)
        }
        .navigationDestination(isPresented: $showMemoryLevelDetail) {
            if let level = selectedMemoryLevel {
                MemoryLevelDetailView(type: selectedType,
                                      level: level,
                                      rows: rows(for: level))
                .onDisappear {
                    selectedMemoryLevel = nil
                }
            }
        }
        .alert("Không có thẻ phù hợp", isPresented: $showEmptyReviewAlert) {
            Button("Đóng", role: .cancel) { }
        } message: {
            Text("Hãy đồng bộ dữ liệu hoặc chọn loại thẻ khác trước khi ôn tập.")
        }
        .task { await loadData() }
        .onChange(of: selectedType, initial: false) { _, _ in
            Task { await loadData() }
        }
    }

    private var currentSnapshot: MemorySnapshot {
        appState.memorySnapshot(for: selectedType.rawValue)
    }

    private func rows(for level: Int) -> [MemoryRow] {
        currentSnapshot.rows
            .filter { $0.level == level }
            .sorted { lhs, rhs in
                let lhsDue = lhs.due ?? .distantFuture
                let rhsDue = rhs.due ?? .distantFuture
                return lhsDue < rhsDue
            }
    }

    private var leechItems: [LeechBoardItem] {
        let snapshot = currentSnapshot
        let entries = appState.leechBoard(for: selectedType.rawValue)
        var memoryMap: [String: MemoryRow] = [:]
        for row in snapshot.rows {
            memoryMap[row.cardID.lowercased()] = row
        }
        var combined: [LeechBoardItem] = []
        var seen: Set<String> = []

        for entry in entries {
            let key = entry.cardID.lowercased()
            let memoryRow = memoryMap[key]
            let resolvedLevel = memoryRow?.level ?? entry.level
            if let resolvedLevel, !(0...1).contains(resolvedLevel) { continue }
            let frontSource = entry.front.isEmpty ? (memoryRow?.front ?? "") : entry.front
            let trimmedFront = frontSource.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmedFront.isEmpty else { continue }
            let backSource = entry.back ?? memoryRow?.back
            let trimmedBack = backSource?.trimmingCharacters(in: .whitespacesAndNewlines)
            let leechCount = max(entry.leechCount, memoryRow?.leechCount ?? 0)
            combined.append(LeechBoardItem(cardID: entry.cardID,
                                           front: trimmedFront,
                                           back: trimmedBack,
                                           leechCount: leechCount,
                                           level: resolvedLevel,
                                           memoryRow: memoryRow))
            seen.insert(key)
        }

        for row in snapshot.rows {
            let key = row.cardID.lowercased()
            guard !seen.contains(key) else { continue }
            guard row.level == 0 || row.level == 1 else { continue }
            guard row.leechCount > 0 || row.isLeech else { continue }
            let trimmedFront = row.front?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !trimmedFront.isEmpty else { continue }
            let trimmedBack = row.back?.trimmingCharacters(in: .whitespacesAndNewlines)
            combined.append(LeechBoardItem(cardID: row.cardID,
                                           front: trimmedFront,
                                           back: trimmedBack,
                                           leechCount: row.leechCount,
                                           level: row.level,
                                           memoryRow: row))
        }

        combined.sort { first, second in
            if first.leechCount != second.leechCount {
                return first.leechCount > second.leechCount
            }
            return first.front.localizedCaseInsensitiveCompare(second.front) == .orderedAscending
        }
        return combined
    }

    private var leechError: String? {
        appState.leechError(for: selectedType.rawValue)
    }

    private func loadData() async {
        isLoading = true
        isLoadingLeech = true
        async let progressTask = appState.refreshProgress(for: selectedType.rawValue)
        async let leechTask = appState.refreshLeechBoard(for: selectedType.rawValue)
        await progressTask
        isLoading = false
        await leechTask
        isLoadingLeech = false
    }

    private func startReview(rows: [MemoryRow], limit: Int, randomize: Bool) {
        guard !rows.isEmpty else {
            showEmptyReviewAlert = true
            return
        }
        let prepared = randomize ? rows.shuffled() : rows
        let deck = appState.deckCards(from: prepared, limit: limit)
        present(deck: deck)
    }

    private func startLeechReview(limit: Int = 20) {
        let deck = prepareLeechDeck(from: leechItems, limit: limit)
        present(deck: deck)
    }

    private func startLeechReview(for item: LeechBoardItem) {
        let deck = prepareLeechDeck(from: [item], limit: 1)
        present(deck: deck)
    }

    private func present(deck: [DeckCard]) {
        guard !deck.isEmpty else {
            showEmptyReviewAlert = true
            return
        }
        reviewCards = deck
        showReviewSession = true
    }

    private func prepareLeechDeck(from items: [LeechBoardItem], limit: Int) -> [DeckCard] {
        guard !items.isEmpty else { return [] }
        let level0 = items.filter { $0.effectiveLevel == 0 }.shuffled()
        let level1 = items.filter { $0.effectiveLevel == 1 }.shuffled()

        var ordered: [LeechBoardItem] = []
        var usedIDs: Set<String> = []

        func appendUnique(_ item: LeechBoardItem) {
            let key = item.cardID.lowercased()
            guard !usedIDs.contains(key) else { return }
            ordered.append(item)
            usedIDs.insert(key)
        }

        var index0 = 0
        var index1 = 0
        while ordered.count < limit && (index0 < level0.count || index1 < level1.count) {
            if index0 < level0.count {
                appendUnique(level0[index0])
                index0 += 1
            }
            if ordered.count >= limit { break }
            if index1 < level1.count {
                appendUnique(level1[index1])
                index1 += 1
            }
        }

        if ordered.count < limit {
            let fallbackSource: [LeechBoardItem]
            if !level0.isEmpty {
                fallbackSource = level0
            } else if !level1.isEmpty {
                fallbackSource = level1
            } else {
                fallbackSource = items
            }
            var fallbackIndex = 0
            while ordered.count < limit && fallbackIndex < fallbackSource.count {
                appendUnique(fallbackSource[fallbackIndex])
                fallbackIndex += 1
            }
        }

        if ordered.count < limit {
            for item in items.shuffled() {
                guard ordered.count < limit else { break }
                appendUnique(item)
            }
        }

        let finalItems = ordered.prefix(limit)
        var deck: [DeckCard] = []
        var seen: Set<String> = []
        for item in finalItems {
            guard let card = resolveDeckCard(for: item) else { continue }
            let key = item.cardID.lowercased()
            guard !seen.contains(key) else { continue }
            deck.append(card)
            seen.insert(key)
        }

        if deck.count < finalItems.count {
            for item in items {
                guard deck.count < limit else { break }
                let key = item.cardID.lowercased()
                guard !seen.contains(key), let card = resolveDeckCard(for: item) else { continue }
                deck.append(card)
                seen.insert(key)
            }
        }

        return deck
    }

    private func resolveDeckCard(for item: LeechBoardItem) -> DeckCard? {
        if let row = item.memoryRow {
            return appState.deckCard(for: row)
        }
        return appState.deckCard(forID: item.cardID)
    }

    private func startQuickReview(forCardID cardID: String, total: Int = 10) {
        guard let main = appState.deckCard(forID: cardID) else {
            showEmptyReviewAlert = true
            return
        }
        let rows = currentSnapshot.rows.filter { row in
            row.level == 4 || row.level == 5
        }
        var deck: [DeckCard] = [main]
        var seen: Set<String> = [cardID.lowercased()]
        for row in rows.shuffled() {
            guard deck.count < total else { break }
            let key = row.cardID.lowercased()
            guard !seen.contains(key), let card = appState.deckCard(for: row) else { continue }
            deck.append(card)
            seen.insert(key)
        }
        present(deck: deck.shuffled())
    }

    @discardableResult
    private func startSessionReplay(_ session: StudySession) -> Bool {
        let deck = deckForSession(session)
        guard !deck.isEmpty else {
            showEmptyReviewAlert = true
            return false
        }
        present(deck: deck)
        return true
    }

    private func deckForSession(_ session: StudySession) -> [DeckCard] {
        var deck: [DeckCard] = []
        var seen: Set<String> = []
        let fallbackType = session.type?.lowercased() ?? selectedType.rawValue
        let snapshotRows = currentSnapshot.rows

        for sessionCard in session.cards {
            var candidates = [sessionCard.cardID, sessionCard.id]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }

            guard let primaryID = candidates.first else { continue }
            let normalizedCandidates = Set(candidates.map { $0.lowercased() })
            guard normalizedCandidates.allSatisfy({ !seen.contains($0) }) else { continue }

            var resolvedCard: DeckCard? = nil

            for candidate in candidates {
                if let match = appState.deckCard(forID: candidate) {
                    resolvedCard = match
                    break
                }

                if let snapshotRow = snapshotRows.first(where: { $0.cardID.lowercased() == candidate.lowercased() }),
                   let match = appState.deckCard(for: snapshotRow) {
                    resolvedCard = match
                    break
                }
            }

            if let resolvedCard {
                deck.append(resolvedCard)
                seen.formUnion(normalizedCandidates)
                continue
            }

            guard let front = sessionCard.front?.trimmingCharacters(in: .whitespacesAndNewlines), !front.isEmpty else {
                seen.formUnion(normalizedCandidates)
                continue
            }

            let back = sessionCard.back?.trimmingCharacters(in: .whitespacesAndNewlines)
            let fallbackCard = DeckCard(id: primaryID,
                                        numericID: Int(primaryID),
                                        type: fallbackType,
                                        front: front,
                                        back: back,
                                        category: nil)
            deck.append(fallbackCard)
            seen.formUnion(normalizedCandidates)
        }

        return deck
    }
}

@available(iOS 16.0, *)
private struct MemoryDistributionCard: View {
    let type: CardType
    let snapshot: MemorySnapshot
    let onSelectLevel: (Int) -> Void

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
                    ForEach(Array(snapshot.dist.enumerated()), id: \.offset) { pair in
                        let level = pair.offset
                        let value = pair.element
                        Button {
                            onSelectLevel(level)
                        } label: {
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
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }
}

@available(iOS 16.0, *)
private struct MemoryLevelDetailView: View {
    let type: CardType
    let level: Int
    let rows: [MemoryRow]

    var body: some View {
        List {
            if rows.isEmpty {
                Section {
                    Text("Chưa có thẻ nào ở mức này.")
                        .foregroundColor(.secondary)
                }
            } else {
                Section("Tổng cộng \(rows.count) thẻ") {
                    ForEach(rows) { row in
                        VStack(alignment: .leading, spacing: 8) {
                            Text(primaryText(for: row))
                                .font(.headline)
                                .foregroundColor(Color("LiquidPrimary"))

                            if let back = secondaryText(for: row) {
                                Text(back)
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }

                            HStack(spacing: 12) {
                                if let due = row.due {
                                    Text("Đến hạn: \(due.formatted(date: .abbreviated, time: .shortened))")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }

                                if let reviewed = row.lastReviewedAt {
                                    Text("Ôn gần nhất: \(reviewed.formatted(date: .abbreviated, time: .shortened))")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }

                                if row.leechCount > 0 || row.isLeech {
                                    Label("Leech ×\(max(row.leechCount, 1))", systemImage: "exclamationmark.triangle.fill")
                                        .font(.caption)
                                        .labelStyle(.titleAndIcon)
                                        .foregroundColor(.orange)
                                }
                            }
                        }
                        .padding(.vertical, 6)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Mức \(level) · \(type.displayName)")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func primaryText(for row: MemoryRow) -> String {
        if let front = row.front?.trimmingCharacters(in: .whitespacesAndNewlines), !front.isEmpty {
            return front
        }
        return row.cardID
    }

    private func secondaryText(for row: MemoryRow) -> String? {
        guard let back = row.back?.trimmingCharacters(in: .whitespacesAndNewlines), !back.isEmpty else {
            return nil
        }
        return back
    }
}

@available(iOS 16.0, *)
private struct ReviewOverviewCard: View {
    let type: CardType
    let snapshot: MemorySnapshot
    let onStartReview: (_ rows: [MemoryRow], _ limit: Int, _ randomize: Bool) -> Void

    @State private var reviewCount: Int = 10

    private var dueSummary: MemorySnapshot.DueSummary {
        snapshot.dueSummary()
    }

    private var maxReviewCount: Int {
        let total = snapshot.rows.count
        return max(5, min(50, max(total, 1)))
    }

    private var dueRows: [MemoryRow] {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)
        let startOfTomorrow = calendar.date(byAdding: .day, value: 1, to: startOfToday) ?? now
        return snapshot.rows
            .filter { row in
                guard let due = row.due else { return false }
                return due < startOfTomorrow
            }
            .sorted { lhs, rhs in
                let lhsDue = lhs.due ?? .distantPast
                let rhsDue = rhs.due ?? .distantPast
                return lhsDue < rhsDue
            }
    }

    private var dueSoonCount: Int {
        let calendar = Calendar.current
        let now = Date()
        let startOfToday = calendar.startOfDay(for: now)
        guard let startOfTomorrow = calendar.date(byAdding: .day, value: 1, to: startOfToday) else { return 0 }
        guard let endDate = calendar.date(byAdding: .day, value: 3, to: startOfTomorrow) else { return 0 }
        return snapshot.rows.filter { row in
            guard let due = row.due else { return false }
            return due >= startOfTomorrow && due < endDate
        }.count
    }

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text("Ôn tập · \(type.displayName)")
                        .font(.headline)
                        .foregroundColor(Color("LiquidPrimary"))
                    Spacer()
                    NavigationLink(destination: ReviewSettingsView()) {
                        Label("Cài đặt", systemImage: "gearshape")
                    }
                    .buttonStyle(.borderedProminent)
                }
                if snapshot.rows.isEmpty {
                    Text("Chưa có dữ liệu ôn tập cho loại này.")
                        .foregroundColor(.secondary)
                } else {
                    Text("Thẻ đến hạn: \(dueSummary.dueTodayTotal)")
                        .font(.subheadline)
                        .foregroundColor(dueRows.isEmpty ? .secondary : Color("LiquidAccent"))
                    if dueSoonCount > 0 {
                        Text("Sắp đến hạn trong 3 ngày: \(dueSoonCount)")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }

                    let maxCount = maxReviewCount
                    let binding = Binding(
                        get: { min(reviewCount, maxCount) },
                        set: { newValue in
                            reviewCount = min(maxCount, max(5, newValue))
                        }
                    )

                    Stepper(value: binding, in: 5...maxCount, step: 5) {
                        Text("Số thẻ mỗi phiên: \(binding.wrappedValue)")
                    }

                    Button {
                        onStartReview(dueRows, binding.wrappedValue, false)
                    } label: {
                        Label("Ôn thẻ đến hạn", systemImage: "clock.arrow.circlepath")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(dueRows.isEmpty)

                    if dueRows.isEmpty {
                        Text("Hiện chưa có thẻ đến hạn. Hãy ôn các thẻ mức 0 hoặc 1 để củng cố ghi nhớ.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }

                    Divider()

                    Text("Ôn theo mức nhớ")
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 110), spacing: 12)], spacing: 12) {
                        ForEach(0..<6) { level in
                            let rows = rows(for: level)
                            Button {
                                onStartReview(rows, binding.wrappedValue, true)
                            } label: {
                                VStack(spacing: 6) {
                                    Text("Mức \(level)")
                                        .font(.subheadline.weight(.semibold))
                                    Text("\(rows.count) thẻ")
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .background(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .fill(level <= 1 ? Color("LiquidHighlight").opacity(0.18) : Color(.secondarySystemBackground))
                                )
                            }
                            .buttonStyle(.plain)
                            .disabled(rows.isEmpty)
                            .opacity(rows.isEmpty ? 0.45 : 1)
                        }
                    }

                    Text("Các thẻ mức 0 và 1 thường là leech hoặc thẻ mới. Hãy ưu tiên ôn chúng trước.")
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
            }
        }
        .onChange(of: type) { _ in
            reviewCount = min(10, maxReviewCount)
        }
    }

    private func rows(for level: Int) -> [MemoryRow] {
        snapshot.rows
            .filter { $0.level == level }
            .sorted { lhs, rhs in
                let lhsDue = lhs.due ?? .distantFuture
                let rhsDue = rhs.due ?? .distantFuture
                return lhsDue < rhsDue
            }
    }
}

private struct LeechBoardItem: Identifiable {
    let id: String
    let cardID: String
    let front: String
    let back: String?
    let leechCount: Int
    let level: Int?
    let memoryRow: MemoryRow?

    init(cardID: String, front: String, back: String?, leechCount: Int, level: Int?, memoryRow: MemoryRow?) {
        self.id = cardID
        self.cardID = cardID
        self.front = front
        self.back = back
        self.leechCount = leechCount
        self.level = level
        self.memoryRow = memoryRow
    }

    var effectiveLevel: Int? {
        if let level { return level }
        return memoryRow?.level
    }
}

@available(iOS 16.0, *)
private struct LeechBoardSection: View {
    let items: [LeechBoardItem]
    let isLoading: Bool
    let errorMessage: String?
    let onReviewAll: () -> Void
    let onReviewItem: (LeechBoardItem) -> Void

    var body: some View {
        GlassContainer {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Leech board")
                            .font(.headline)
                            .foregroundColor(Color("LiquidPrimary"))
                        Text("Theo dõi các thẻ đang yếu ở mức 0/1 để ôn tập nhanh.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Button(action: onReviewAll) {
                        Label("Ôn nhanh", systemImage: "bolt.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(items.isEmpty)
                }

                if let errorMessage, !errorMessage.isEmpty {
                    Text(errorMessage)
                        .font(.footnote)
                        .foregroundColor(.red)
                }

                if isLoading {
                    HStack(spacing: 8) {
                        ProgressView()
                        Text("Đang tải danh sách leech…")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                } else if items.isEmpty {
                    Text("Hiện không có thẻ leech ở mức 0 hoặc 1.")
                        .foregroundColor(.secondary)
                } else {
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(items) { item in
                            HStack(alignment: .center, spacing: 12) {
                                Text("×\(item.leechCount)")
                                    .font(.caption.bold())
                                    .padding(.vertical, 6)
                                    .padding(.horizontal, 12)
                                    .background(
                                        Capsule().fill(Color("LiquidPrimary").opacity(0.2))
                                    )
                                    .foregroundColor(Color("LiquidPrimary"))

                                VStack(alignment: .leading, spacing: 4) {
                                    Text(item.front)
                                        .font(.subheadline.weight(.semibold))
                                    if let back = item.back, !back.isEmpty {
                                        Text(back)
                                            .font(.footnote)
                                            .foregroundColor(.secondary)
                                    }
                                }

                                Spacer()

                                if let level = item.effectiveLevel {
                                    Text("Lv \(level)")
                                        .font(.caption)
                                        .padding(.horizontal, 10)
                                        .padding(.vertical, 4)
                                        .background(
                                            Capsule().fill(Color(.secondarySystemBackground))
                                        )
                                }

                                Button("Ôn") {
                                    onReviewItem(item)
                                }
                                .buttonStyle(.bordered)
                            }
                            .padding(12)
                            .background(
                                RoundedRectangle(cornerRadius: 18, style: .continuous)
                                    .fill(Color(.secondarySystemBackground))
                            )
                        }
                    }
                }
            }
        }
    }
}

@available(iOS 16.0, *)
private struct SessionListView: View {
    let sessions: [StudySession]
    let onDelete: (StudySession) -> Void
    let onReplay: (StudySession) -> Bool
    let onQuickReview: (String) -> Void
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
                               isDeleting: deletingIDs.contains(session.id),
                               onToggle: {
                        withAnimation { toggle(session: session) }
                    }, onReplay: {
                        onReplay(session)
                    }, onQuickReview: { cardID in
                        onQuickReview(cardID)
                    }, onDelete: {
                        deletingIDs.insert(session.id)
                        Task {
                            onDelete(session)
                            deletingIDs.remove(session.id)
                        }
                    })
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

@available(iOS 16.0, *)
private struct SessionRow: View {
    let session: StudySession
    let isExpanded: Bool
    let isDeleting: Bool
    let onToggle: () -> Void
    let onReplay: () -> Bool
    let onQuickReview: (String) -> Void
    let onDelete: () -> Void

    @EnvironmentObject private var appState: AppState
    @State private var showDeleteForCardID: String? = nil
    @State private var removedCardIDs: Set<String> = []
    @State private var actionCardID: String? = nil
    @State private var showActions = false

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
                Button {
                    let succeeded = onReplay()
#if canImport(UIKit)
                    let generator = UINotificationFeedbackGenerator()
                    generator.notificationOccurred(succeeded ? .success : .warning)
#endif
                } label: {
                    Image(systemName: "bolt.fill")
                        .font(.headline)
                        .foregroundColor(Color("LiquidAccent"))
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Ôn nhanh session này")
                .disabled(session.cards.isEmpty)
                .opacity(session.cards.isEmpty ? 0.4 : 1)
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
                        ForEach(session.cards.filter { !removedCardIDs.contains($0.id) }) { card in
                            VStack(spacing: 6) {
                                // Card container
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
                            .onLongPressGesture(minimumDuration: 0.35) {
                                actionCardID = card.id
                                showActions = true
                                UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                            }
                            .confirmationDialog("Tác vụ thẻ", isPresented: $showActions, presenting: actionCardID) { cardID in
                                Button("Ôn nhanh") {
                                    onQuickReview(cardID)
                                    UINotificationFeedbackGenerator().notificationOccurred(.success)
                                }
                                Button("Xoá", role: .destructive) {
                                    removedCardIDs.insert(cardID)
                                    UINotificationFeedbackGenerator().notificationOccurred(.warning)
                                }
                                .disabled(!canDelete(cardID: card.cardID))
                                Button("Huỷ", role: .cancel) { }
                            }
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

    private func canDelete(cardID: String) -> Bool {
        let rows = appState.memorySnapshot(for: session.type).rows
        guard let row = rows.first(where: { $0.cardID.lowercased() == cardID.lowercased() }) else { return false }
        if row.isLeech { return false }
        if row.level == 0 || row.level == 1 { return false }
        return true
    }
}

@available(iOS 16.0, *)
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


@available(iOS 16.0, *)
struct ToolsScreen: View {
    var body: some View {
        List {
            Section(header: Text("Học tập")) {
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
            Section(header: Text("Tiện ích")) {
                NavigationLink(destination: PomodoroScreen()) {
                    Label("Pomodoro · 2 giờ", systemImage: "timer")
                }
            }
        }
        .navigationTitle("Công cụ bổ trợ")
        .listStyle(.insetGrouped)
    }
}

@available(iOS 16.0, *)
private struct ReviewSettingsView: View {
    @EnvironmentObject private var reviewSettings: ReviewSettingsStore

    var body: some View {
        List {
            Section(header: Text("Auto-flip"), footer: Text("Áp dụng cho các phiên ôn tập Omni. Kanji viết tay sẽ không tự động lật.")) {
                Picker("Auto-flip", selection: $reviewSettings.autoFlip) {
                    ForEach(ReviewSettingsStore.AutoFlipOption.allCases) { option in
                        Text(option.title).tag(option)
                    }
                }
                .pickerStyle(.navigationLink)
            }

            Section(header: Text("Card Orientation"), footer: Text("Đảo mặt sẽ hỏi nghĩa trước và yêu cầu bạn điền từ.")) {
                Picker("Card Orientation", selection: $reviewSettings.cardOrientation) {
                    ForEach(ReviewSettingsStore.CardOrientation.allCases) { option in
                        Text(option.title).tag(option)
                    }
                }
                .pickerStyle(.segmented)
            }
        }
        .navigationTitle("Cài đặt Review")
        .listStyle(.insetGrouped)
    }
}

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
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

@available(iOS 16.0, *)
private struct PomodoroScreen: View {
    @EnvironmentObject private var appState: AppState
    @State private var localState: PomodoroState?
    @State private var hasLoadedInitialState = false
    @State private var lastSyncDate = Date()
    @State private var pollTask: Task<Void, Never>?
    @State private var isSubmitting = false
    @State private var secondsSinceSync: TimeInterval = 0
    @State private var isSyncingProgress = false

    private let pollInterval: UInt64 = 5_000_000_000
    private let tickTimer = Timer.publish(every: 1, on: .main, in: .common)
    private let progressSyncInterval: TimeInterval = 5
    private var schedule: [PomodoroState.Phase] { PomodoroState.Phase.schedule }
    private var deviceID: String { PomodoroDeviceIdentifier.current }

    private var currentState: PomodoroState? {
        localState ?? appState.pomodoroState
    }

    var body: some View {
        VStack(spacing: 24) {
            if let state = currentState {
                let phase = state.currentPhase
                GlassContainer {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(phase.kind == .focus ? "Tập trung" : "Nghỉ")
                            .font(.headline)
                            .foregroundColor(Color("LiquidPrimary"))
                        Text("Chu kỳ \(phase.cycle)/\(max(1, schedule.count / 2))")
                            .font(.subheadline)
                            .foregroundColor(.secondary)
                        Text(state.formattedTime)
                            .font(.system(size: 64, weight: .bold, design: .rounded))
                            .frame(maxWidth: .infinity, alignment: .center)
                        ProgressView(value: progress(for: state))
                            .progressViewStyle(.linear)
                            .tint(Color("LiquidAccent"))
                            .padding(.top, 8)
                        HStack {
                            Button(state.paused ? "Bắt đầu" : "Tạm dừng") {
                                Task { await togglePause() }
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(isSubmitting || currentState == nil)

                            Button("Reset 2h") {
                                Task { await resetTimer() }
                            }
                            .buttonStyle(.bordered)
                            .disabled(isSubmitting)
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
        .task { await loadInitialState() }
        .onAppear {
            requestNotificationAuthorization()
            startPolling()
            if hasLoadedInitialState {
                Task { await refreshState() }
            }
        }
        .onDisappear {
            Task { await persistProgressBeforeExit() }
            stopPolling()
        }
        .onReceive(tickTimer.autoconnect()) { _ in
            handleTick()
        }
        .onReceive(appState.$pomodoroState.compactMap { $0 }) { remote in
            applyRemote(remote)
        }
        .refreshable { await refreshState() }
    }

    private func requestNotificationAuthorization() {
        #if canImport(UserNotifications)
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }
        #endif
    }

    private func sendNotification(title: String, body: String, identifier: String) {
        #if canImport(UserNotifications)
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.threadIdentifier = identifier

        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: 0.1, repeats: false)
        let request = UNNotificationRequest(identifier: identifier, content: content, trigger: trigger)
        UNUserNotificationCenter.current().add(request, withCompletionHandler: nil)
        #endif
    }

    private func notifyPhaseStart(kind: PomodoroState.Phase.Kind) {
        // If kind is focus, notify focus start; otherwise treat as break.
        if kind == .focus {
            sendNotification(title: "Pomodoro: Bắt đầu Focus 25 phút",
                             body: "Quay lại tập trung nào!",
                             identifier: "pomodoro-phase")
        } else {
            sendNotification(title: "Pomodoro: Nghỉ 5 phút",
                             body: "Thư giãn mắt và duỗi tay nhé. Sẽ tự chuyển lại Focus.",
                             identifier: "pomodoro-phase")
        }
    }

    private func notifyFinished() {
        sendNotification(title: "Pomodoro hoàn tất",
                         body: "Bạn đã hoàn thành đủ chu kỳ Pomodoro (2 tiếng). 🎉",
                         identifier: "pomodoro-done")
    }

    private func progress(for state: PomodoroState) -> Double {
        let phase = state.currentPhase
        guard phase.duration > 0 else { return 0 }
        let ratio = max(0, min(1, state.secLeft / phase.duration))
        return 1 - ratio
    }

    @MainActor
    private func loadInitialState() async {
        guard !hasLoadedInitialState else { return }
        defer { hasLoadedInitialState = true }
        await appState.refreshPomodoro()
        if let state = appState.pomodoroState {
            applyRemote(state)
        }
    }

    @MainActor
    private func refreshState() async {
        await appState.refreshPomodoro()
        if let state = appState.pomodoroState {
            applyRemote(state)
        }
    }

    @MainActor
    private func togglePause() async {
        guard let state = currentState else { return }
        let updated = PomodoroState(
            phaseIndex: state.phaseIndex,
            secLeft: state.secLeft,
            paused: !state.paused,
            updatedBy: deviceID,
            updatedAt: Date()
        )
        await submit(updated)
    }

    @MainActor
    private func resetTimer() async {
        guard let first = schedule.first else { return }
        let resetState = PomodoroState(
            phaseIndex: 0,
            secLeft: first.duration,
            paused: false,
            updatedBy: deviceID,
            updatedAt: Date()
        )
        if let firstPhase = schedule.first {
            notifyPhaseStart(kind: firstPhase.kind)
        }
        await submit(resetState)
    }

    @MainActor
    private func handleTick() {
        guard let state = currentState else { return }
        guard !state.paused else { return }
        let now = Date()
        let elapsed = now.timeIntervalSince(lastSyncDate)
        guard elapsed > 0 else { return }

        secondsSinceSync += elapsed
        let remaining = max(0, state.secLeft - elapsed)
        lastSyncDate = now

        if remaining <= 0 {
            secondsSinceSync = 0
            localState = PomodoroState(
                phaseIndex: state.phaseIndex,
                secLeft: 0,
                paused: state.paused,
                updatedBy: state.updatedBy,
                updatedAt: state.updatedAt
            )
            Task { await advancePhase() }
        } else {
            let progressState = PomodoroState(
                phaseIndex: state.phaseIndex,
                secLeft: remaining,
                paused: state.paused,
                updatedBy: state.updatedBy,
                updatedAt: state.updatedAt
            )
            localState = progressState
            if secondsSinceSync >= progressSyncInterval {
                secondsSinceSync = 0
                Task { await syncProgress(progressState) }
            }
        }
    }

    @MainActor
    private func advancePhase() async {
        if isSubmitting { return }
        guard let current = currentState else { return }
        if current.phaseIndex >= schedule.count - 1 {
            let finished = PomodoroState(
                phaseIndex: current.phaseIndex,
                secLeft: 0,
                paused: true,
                updatedBy: deviceID,
                updatedAt: Date()
            )
            notifyFinished()
            await submit(finished)
            return
        }

        let nextIndex = current.phaseIndex + 1
        let nextPhase = schedule[nextIndex]
        let nextState = PomodoroState(
            phaseIndex: nextIndex,
            secLeft: nextPhase.duration,
            paused: false,
            updatedBy: deviceID,
            updatedAt: Date()
        )
        notifyPhaseStart(kind: nextPhase.kind)
        await submit(nextState)
    }

    @MainActor
    private func submit(_ state: PomodoroState) async {
        if isSubmitting { return }
        isSubmitting = true
        defer { isSubmitting = false }

        localState = state
        lastSyncDate = Date()
        secondsSinceSync = 0

        await appState.updatePomodoro(
            phaseIndex: state.phaseIndex,
            secLeft: state.secLeft,
            paused: state.paused,
            updatedBy: deviceID
        )
    }

    @MainActor
    private func syncProgress(_ state: PomodoroState) async {
        if isSubmitting || isSyncingProgress { return }
        isSyncingProgress = true
        defer { isSyncingProgress = false }

        await appState.updatePomodoro(
            phaseIndex: state.phaseIndex,
            secLeft: state.secLeft,
            paused: state.paused,
            updatedBy: deviceID
        )
    }

    @MainActor
    private func applyRemote(_ remote: PomodoroState) {
        let now = Date()
        let syncBase = min(remote.updatedAt ?? now, now)
        let elapsed = remote.paused ? 0 : max(0, now.timeIntervalSince(syncBase))
        let adjustedRemaining = remote.paused ? remote.secLeft : max(0, remote.secLeft - elapsed)
        let resolved = PomodoroState(
            phaseIndex: remote.phaseIndex,
            secLeft: adjustedRemaining,
            paused: remote.paused,
            updatedBy: remote.updatedBy,
            updatedAt: remote.updatedAt
        )

        func applyResolved(previous: PomodoroState?) {
            localState = resolved
            lastSyncDate = now
            secondsSinceSync = remote.paused ? 0 : min(progressSyncInterval, elapsed)

            if let previous = previous {
                let phaseChanged = remote.phaseIndex != previous.phaseIndex
                if phaseChanged {
                    if remote.phaseIndex >= schedule.count - 1 && adjustedRemaining <= 0 && remote.paused {
                        notifyFinished()
                    } else {
                        notifyPhaseStart(kind: remote.currentPhase.kind)
                    }
                }
            }

            if !remote.paused && adjustedRemaining <= 0 && !isSubmitting {
                Task { await advancePhase() }
            }
        }

        guard let existing = localState else {
            applyResolved(previous: nil)
            return
        }

        if (remote.updatedAt ?? .distantPast) > (existing.updatedAt ?? .distantPast) {
            applyResolved(previous: existing)
        }
    }

    private func startPolling() {
        guard pollTask == nil else { return }
        pollTask = Task { @MainActor in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: pollInterval)
                await appState.refreshPomodoro()
            }
        }
    }

    private func stopPolling() {
        pollTask?.cancel()
        pollTask = nil
    }

    @MainActor
    private func persistProgressBeforeExit() async {
        guard currentState != nil else { return }

        handleTick()

        guard let state = currentState else { return }
        if !state.paused && state.secLeft <= 0 {
            return
        }

        secondsSinceSync = 0
        lastSyncDate = Date()
        localState = state

        await syncProgress(state)
    }
}

private enum PomodoroDeviceIdentifier {
    static var current: String {
        let defaults = UserDefaults.standard
        let key = "jp.pomodoro.deviceID"
        if let existing = defaults.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let newValue = UUID().uuidString.replacingOccurrences(of: "-", with: "")
        defaults.set(newValue, forKey: key)
        return newValue
    }
}

@available(iOS 16.0, *)
private struct DrawingCanvas: View {
    @State private var strokes: [[CGPoint]] = []
    @State private var currentStroke: [CGPoint] = []

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color(.systemBackground)
                ForEach(strokes.indices, id: \.self) { index in
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


@available(iOS 16.0, *)
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

