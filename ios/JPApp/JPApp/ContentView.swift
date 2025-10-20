#if canImport(SwiftUI)
import SwiftUI
import UIKit

@available(iOS 13.0, *)
struct ContentView: View {
    var body: some View {
        DashboardNavigationControllerContainer()
    }
}

@available(iOS 13.0, *)
struct DashboardNavigationControllerContainer: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> UINavigationController {
        let navigationController = UINavigationController(rootViewController: DashboardViewController())
        navigationController.navigationBar.prefersLargeTitles = true
        navigationController.navigationBar.tintColor = UIColor(named: "LiquidPrimary")
        return navigationController
    }

    func updateUIViewController(_ uiViewController: UINavigationController, context: Context) {}
}

#if compiler(>=5.9)
@available(iOS 17.0, *)
#Preview {
    ContentView()
}
#endif

#endif
