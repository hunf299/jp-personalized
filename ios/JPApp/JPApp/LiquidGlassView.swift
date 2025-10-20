import UIKit

final class LiquidGlassView: UIView {
    let contentView = UIView()

    private let blurView: UIVisualEffectView
    private let highlightLayer = CAGradientLayer()
    private let shimmerLayer = CAGradientLayer()

    override init(frame: CGRect) {
        let blurEffect: UIBlurEffect
        if #available(iOS 26.0, *) {
            blurEffect = UIBlurEffect(style: .systemUltraThinMaterial)
        } else {
            blurEffect = UIBlurEffect(style: .systemThinMaterial)
        }
        blurView = UIVisualEffectView(effect: blurEffect)
        super.init(frame: frame)
        configure()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        blurView.frame = bounds
        contentView.frame = bounds
        highlightLayer.frame = bounds
        shimmerLayer.frame = bounds
        layer.cornerRadius = 24
        blurView.layer.cornerRadius = 24
        contentView.layer.cornerRadius = 24
    }

    private func configure() {
        backgroundColor = UIColor(named: "LiquidAccent")?.withAlphaComponent(0.1)
        layer.masksToBounds = true

        blurView.translatesAutoresizingMaskIntoConstraints = false
        blurView.clipsToBounds = true
        addSubview(blurView)

        contentView.backgroundColor = UIColor(named: "LiquidAccent")?.withAlphaComponent(0.05)
        contentView.translatesAutoresizingMaskIntoConstraints = false
        addSubview(contentView)

        NSLayoutConstraint.activate([
            blurView.leadingAnchor.constraint(equalTo: leadingAnchor),
            blurView.trailingAnchor.constraint(equalTo: trailingAnchor),
            blurView.topAnchor.constraint(equalTo: topAnchor),
            blurView.bottomAnchor.constraint(equalTo: bottomAnchor),

            contentView.leadingAnchor.constraint(equalTo: leadingAnchor),
            contentView.trailingAnchor.constraint(equalTo: trailingAnchor),
            contentView.topAnchor.constraint(equalTo: topAnchor),
            contentView.bottomAnchor.constraint(equalTo: bottomAnchor)
        ])

        configureHighlight()
        configureShimmer()
    }

    private func configureHighlight() {
        highlightLayer.colors = [
            UIColor(named: "LiquidHighlight")?.withAlphaComponent(0.7).cgColor ?? UIColor.white.withAlphaComponent(0.4).cgColor,
            UIColor.clear.cgColor
        ]
        highlightLayer.startPoint = CGPoint(x: 0.0, y: 0.0)
        highlightLayer.endPoint = CGPoint(x: 1.0, y: 1.0)
        highlightLayer.opacity = 0.6
        layer.insertSublayer(highlightLayer, above: blurView.layer)
    }

    private func configureShimmer() {
        shimmerLayer.colors = [
            UIColor.clear.cgColor,
            UIColor(named: "LiquidHighlight")?.withAlphaComponent(0.5).cgColor ?? UIColor.white.withAlphaComponent(0.3).cgColor,
            UIColor.clear.cgColor
        ]
        shimmerLayer.locations = [0.0, 0.5, 1.0]
        shimmerLayer.startPoint = CGPoint(x: 0, y: 0.5)
        shimmerLayer.endPoint = CGPoint(x: 1, y: 0.5)
        shimmerLayer.opacity = 0.8
        shimmerLayer.compositingFilter = "screenBlendMode"
        layer.addSublayer(shimmerLayer)

        let animation = CABasicAnimation(keyPath: "locations")
        animation.fromValue = [-0.3, 0.0, 0.3]
        animation.toValue = [0.7, 1.0, 1.3]
        animation.duration = 4
        animation.repeatCount = .infinity
        shimmerLayer.add(animation, forKey: "liquid-glass-shimmer")
    }
}
