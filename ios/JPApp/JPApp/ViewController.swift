import UIKit

final class DashboardViewController: UIViewController {
    private let glassBackground = LiquidGlassView()
    private let tableView = UITableView(frame: .zero, style: .insetGrouped)
    private let activityIndicator = UIActivityIndicatorView(style: .large)
    private let refreshControl = UIRefreshControl()

    private let apiClient = APIClient()
    private var cards: [StudyCard] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        title = "JP Personalized"
        view.backgroundColor = UIColor.systemBackground
        configureHierarchy()
        fetchDashboard()
    }

    private func configureHierarchy() {
        glassBackground.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(glassBackground)

        tableView.translatesAutoresizingMaskIntoConstraints = false
        tableView.backgroundColor = .clear
        tableView.separatorStyle = .none
        tableView.dataSource = self
        tableView.delegate = self
        tableView.register(CardCell.self, forCellReuseIdentifier: CardCell.reuseIdentifier)

        refreshControl.addTarget(self, action: #selector(refreshPulled), for: .valueChanged)
        tableView.refreshControl = refreshControl

        view.addSubview(tableView)

        activityIndicator.translatesAutoresizingMaskIntoConstraints = false
        activityIndicator.hidesWhenStopped = true
        view.addSubview(activityIndicator)

        NSLayoutConstraint.activate([
            glassBackground.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            glassBackground.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            glassBackground.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            glassBackground.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -12),

            tableView.leadingAnchor.constraint(equalTo: glassBackground.leadingAnchor, constant: 12),
            tableView.trailingAnchor.constraint(equalTo: glassBackground.trailingAnchor, constant: -12),
            tableView.topAnchor.constraint(equalTo: glassBackground.topAnchor, constant: 12),
            tableView.bottomAnchor.constraint(equalTo: glassBackground.bottomAnchor, constant: -12),

            activityIndicator.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            activityIndicator.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }

    private func fetchDashboard() {
        if !refreshControl.isRefreshing {
            activityIndicator.startAnimating()
        }

        Task { @MainActor in
            do {
                let dashboard = try await apiClient.fetchDashboard()
                cards = dashboard.featuredCards
                tableView.reloadData()
            } catch {
                presentErrorAlert(message: error.localizedDescription)
            }
            refreshControl.endRefreshing()
            activityIndicator.stopAnimating()
        }
    }

    @objc private func refreshPulled() {
        fetchDashboard()
    }

    private func presentErrorAlert(message: String) {
        let alert = UIAlertController(title: "Unable to Sync", message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

extension DashboardViewController: UITableViewDataSource {
    func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
        cards.count
    }

    func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
        guard let cell = tableView.dequeueReusableCell(withIdentifier: CardCell.reuseIdentifier, for: indexPath) as? CardCell else {
            return UITableViewCell()
        }
        cell.configure(with: cards[indexPath.row])
        return cell
    }
}

extension DashboardViewController: UITableViewDelegate {
    func tableView(_ tableView: UITableView, didSelectRowAt indexPath: IndexPath) {
        tableView.deselectRow(at: indexPath, animated: true)

        let card = cards[indexPath.row]
        let detailController = CardDetailViewController(card: card)
        navigationController?.pushViewController(detailController, animated: true)
    }
}

final class CardCell: UITableViewCell {
    static let reuseIdentifier = "CardCell"

    private let glassView = LiquidGlassView()
    private let titleLabel = UILabel()
    private let subtitleLabel = UILabel()
    private let progressView = UIProgressView(progressViewStyle: .bar)

    override init(style: UITableViewCell.CellStyle, reuseIdentifier: String?) {
        super.init(style: style, reuseIdentifier: reuseIdentifier)
        backgroundColor = .clear
        selectionStyle = .none
        configure()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func configure() {
        glassView.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(glassView)

        titleLabel.font = UIFont.preferredFont(forTextStyle: .headline)
        titleLabel.textColor = UIColor(named: "LiquidPrimary")
        titleLabel.translatesAutoresizingMaskIntoConstraints = false

        subtitleLabel.font = UIFont.preferredFont(forTextStyle: .subheadline)
        subtitleLabel.textColor = .secondaryLabel
        subtitleLabel.numberOfLines = 0
        subtitleLabel.translatesAutoresizingMaskIntoConstraints = false

        progressView.translatesAutoresizingMaskIntoConstraints = false
        progressView.progressTintColor = UIColor(named: "LiquidPrimary")
        progressView.trackTintColor = UIColor(named: "LiquidAccent")?.withAlphaComponent(0.4)

        glassView.contentView.addSubview(titleLabel)
        glassView.contentView.addSubview(subtitleLabel)
        glassView.contentView.addSubview(progressView)

        NSLayoutConstraint.activate([
            glassView.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
            glassView.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
            glassView.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            glassView.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8),

            titleLabel.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor, constant: -16),
            titleLabel.topAnchor.constraint(equalTo: glassView.contentView.topAnchor, constant: 16),

            subtitleLabel.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            subtitleLabel.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            subtitleLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 8),

            progressView.leadingAnchor.constraint(equalTo: titleLabel.leadingAnchor),
            progressView.trailingAnchor.constraint(equalTo: titleLabel.trailingAnchor),
            progressView.topAnchor.constraint(equalTo: subtitleLabel.bottomAnchor, constant: 12),
            progressView.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor, constant: -16)
        ])
    }

    func configure(with card: StudyCard) {
        titleLabel.text = card.title
        subtitleLabel.text = card.subtitle
        progressView.progress = card.progress
    }
}

final class CardDetailViewController: UIViewController {
    private let card: StudyCard
    private let glassView = LiquidGlassView()
    private let descriptionLabel = UILabel()
    private let stackView = UIStackView()

    init(card: StudyCard) {
        self.card = card
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        title = card.title
        view.backgroundColor = UIColor.systemBackground
        configure()
    }

    private func configure() {
        glassView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(glassView)

        descriptionLabel.text = card.longDescription
        descriptionLabel.textColor = .secondaryLabel
        descriptionLabel.numberOfLines = 0

        let statsView = MetricStack(metrics: card.metrics)

        stackView.axis = .vertical
        stackView.spacing = 20
        stackView.translatesAutoresizingMaskIntoConstraints = false
        stackView.addArrangedSubview(descriptionLabel)
        stackView.addArrangedSubview(statsView)

        glassView.contentView.addSubview(stackView)

        NSLayoutConstraint.activate([
            glassView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            glassView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            glassView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20),
            glassView.bottomAnchor.constraint(lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20),

            stackView.leadingAnchor.constraint(equalTo: glassView.contentView.leadingAnchor, constant: 20),
            stackView.trailingAnchor.constraint(equalTo: glassView.contentView.trailingAnchor, constant: -20),
            stackView.topAnchor.constraint(equalTo: glassView.contentView.topAnchor, constant: 20),
            stackView.bottomAnchor.constraint(equalTo: glassView.contentView.bottomAnchor, constant: -20)
        ])
    }
}

final class MetricStack: UIView {
    private let metrics: [StudyCard.Metric]

    init(metrics: [StudyCard.Metric]) {
        self.metrics = metrics
        super.init(frame: .zero)
        configure()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func configure() {
        let stackView = UIStackView()
        stackView.axis = .vertical
        stackView.spacing = 12
        stackView.translatesAutoresizingMaskIntoConstraints = false

        metrics.forEach { metric in
            let metricView = LiquidGlassView()
            metricView.translatesAutoresizingMaskIntoConstraints = false

            let titleLabel = UILabel()
            titleLabel.font = UIFont.preferredFont(forTextStyle: .subheadline)
            titleLabel.textColor = UIColor(named: "LiquidPrimary")
            titleLabel.text = metric.label

            let valueLabel = UILabel()
            valueLabel.font = UIFont.monospacedSystemFont(ofSize: 16, weight: .medium)
            valueLabel.textColor = .label
            valueLabel.text = metric.value

            let horizontal = UIStackView(arrangedSubviews: [titleLabel, UIView(), valueLabel])
            horizontal.axis = .horizontal
            horizontal.alignment = .center
            horizontal.translatesAutoresizingMaskIntoConstraints = false

            metricView.contentView.addSubview(horizontal)
            stackView.addArrangedSubview(metricView)

            NSLayoutConstraint.activate([
                horizontal.leadingAnchor.constraint(equalTo: metricView.contentView.leadingAnchor, constant: 16),
                horizontal.trailingAnchor.constraint(equalTo: metricView.contentView.trailingAnchor, constant: -16),
                horizontal.topAnchor.constraint(equalTo: metricView.contentView.topAnchor, constant: 12),
                horizontal.bottomAnchor.constraint(equalTo: metricView.contentView.bottomAnchor, constant: -12)
            ])
        }

        addSubview(stackView)

        NSLayoutConstraint.activate([
            stackView.leadingAnchor.constraint(equalTo: leadingAnchor),
            stackView.trailingAnchor.constraint(equalTo: trailingAnchor),
            stackView.topAnchor.constraint(equalTo: topAnchor),
            stackView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])
    }
}
