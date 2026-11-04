import SwiftUI
import UIKit
import WebKit

/// Bettet das Spiel (HTML/JS im App-Bundle) offline in die native App ein
/// und stellt native Funktionen bereit: Haptik, Kopieren, Teilen.
struct GameView: UIViewRepresentable {
    var onLoaded: () -> Void = {}

    static let handlerNames = ["haptic", "copy", "share"]

    func makeCoordinator() -> Coordinator {
        Coordinator(onLoaded: onLoaded)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []
        config.websiteDataStore = .default() // Spielstände & eigene Level bleiben gespeichert

        let contentController = WKUserContentController()
        for name in Self.handlerNames {
            contentController.add(context.coordinator, name: name)
        }
        config.userContentController = contentController

        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = UIColor(red: 0.012, green: 0.039, blue: 0.086, alpha: 1)
        web.scrollView.backgroundColor = web.backgroundColor
        web.scrollView.isScrollEnabled = false
        web.scrollView.bounces = false
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.scrollView.pinchGestureRecognizer?.isEnabled = false
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.navigationDelegate = context.coordinator
        web.uiDelegate = context.coordinator
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true }
        #endif

        if let url = Bundle.main.url(forResource: "index", withExtension: "html") {
            web.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        } else {
            web.loadHTMLString("<body style='background:#030a16;color:#fff;font:20px -apple-system;padding:40px'>Spieldateien fehlen im App-Bundle.</body>", baseURL: nil)
        }
        return web
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}

    static func dismantleUIView(_ uiView: WKWebView, coordinator: Coordinator) {
        for name in handlerNames {
            uiView.configuration.userContentController.removeScriptMessageHandler(forName: name)
        }
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
        private let onLoaded: () -> Void
        private let lightImpact = UIImpactFeedbackGenerator(style: .light)
        private let heavyImpact = UIImpactFeedbackGenerator(style: .heavy)
        private let notification = UINotificationFeedbackGenerator()

        init(onLoaded: @escaping () -> Void) {
            self.onLoaded = onLoaded
            super.init()
            lightImpact.prepare()
            heavyImpact.prepare()
            notification.prepare()
        }

        // MARK: Nachrichten aus dem Spiel

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            switch message.name {
            case "haptic":
                guard let kind = message.body as? String else { return }
                switch kind {
                case "light": lightImpact.impactOccurred()
                case "heavy": heavyImpact.impactOccurred()
                case "success": notification.notificationOccurred(.success)
                case "error": notification.notificationOccurred(.error)
                default: break
                }
            case "copy":
                if let text = message.body as? String { UIPasteboard.general.string = text }
            case "share":
                guard let dict = message.body as? [String: Any],
                      let text = dict["text"] as? String else { return }
                let rawName = (dict["name"] as? String) ?? "level.craftworld.json"
                share(text: text, fileName: rawName, from: message.webView)
            default:
                break
            }
        }

        private func share(text: String, fileName: String, from webView: WKWebView?) {
            let safeName = fileName.replacingOccurrences(of: "/", with: "_")
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeName)
            var items: [Any] = [text]
            if (try? text.data(using: .utf8)?.write(to: url, options: .atomic)) != nil {
                items = [url]
            }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            guard let presenter = webView.flatMap(Self.topViewController(from:)) else { return }
            if let pop = sheet.popoverPresentationController, let view = webView {
                pop.sourceView = view
                pop.sourceRect = CGRect(x: view.bounds.midX, y: view.bounds.midY, width: 1, height: 1)
                pop.permittedArrowDirections = []
            }
            presenter.present(sheet, animated: true)
        }

        private static func topViewController(from view: UIView) -> UIViewController? {
            var top = view.window?.rootViewController
            while let presented = top?.presentedViewController { top = presented }
            return top
        }

        // MARK: Navigation

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            onLoaded()
        }

        func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                     decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            // Nur lokale Spielinhalte laden, keine fremden Seiten im Spiel öffnen
            guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
            let allowed = url.isFileURL || ["about", "blob", "data"].contains(url.scheme ?? "")
            decisionHandler(allowed ? .allow : .cancel)
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            // Falls iOS den Web-Prozess beendet (z. B. Speicherdruck): neu laden
            webView.reload()
        }

        // MARK: JavaScript-Dialoge (werden vom Spiel nicht genutzt, aber sicher abgefangen)

        func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                     initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
            completionHandler()
        }
    }
}
