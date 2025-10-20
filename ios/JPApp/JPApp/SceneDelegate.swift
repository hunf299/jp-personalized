import UIKit
#if canImport(SwiftUI)
import SwiftUI
#endif

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(
        _ scene: UIScene,
        willConnectTo session: UISceneSession,
        options connectionOptions: UIScene.ConnectionOptions
    ) {
        guard let windowScene = scene as? UIWindowScene else { return }

        let window = UIWindow(windowScene: windowScene)

#if canImport(SwiftUI)
        if #available(iOS 13.0, *) {
            window.rootViewController = UIHostingController(rootView: ContentView())
        } else {
            window.rootViewController = makeDashboardNavigationController()
        }
#else
        window.rootViewController = makeDashboardNavigationController()
#endif
        self.window = window
        window.makeKeyAndVisible()
    }

    private func makeDashboardNavigationController() -> UINavigationController {
        let navigationController = UINavigationController(rootViewController: DashboardViewController())
        navigationController.navigationBar.prefersLargeTitles = true
        navigationController.navigationBar.tintColor = UIColor(named: "LiquidPrimary")
        return navigationController
    }
}
