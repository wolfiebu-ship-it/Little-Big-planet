import SwiftUI

@main
struct CraftWorldApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
                .preferredColorScheme(.dark)
        }
    }
}

/// Zeigt zuerst das Neon-Logo und blendet dann ins Spiel über.
struct RootView: View {
    @State private var showSplash = true
    @State private var gameLoaded = false
    @State private var minTimeElapsed = false

    var body: some View {
        ZStack {
            Neon.background.ignoresSafeArea()

            GameView(onLoaded: {
                gameLoaded = true
                hideSplashIfReady()
            })
            .ignoresSafeArea()

            if showSplash {
                SplashView()
                    .transition(.opacity)
                    .zIndex(1)
            }
        }
        .statusBarHidden(true)
        .persistentSystemOverlays(.hidden)
        .task {
            try? await Task.sleep(nanoseconds: 2_300_000_000)
            minTimeElapsed = true
            hideSplashIfReady()
            // Sicherheitsnetz: Splash spätestens nach 6 Sekunden ausblenden
            try? await Task.sleep(nanoseconds: 3_700_000_000)
            if showSplash { withAnimation(.easeOut(duration: 0.6)) { showSplash = false } }
        }
    }

    private func hideSplashIfReady() {
        guard gameLoaded, minTimeElapsed, showSplash else { return }
        withAnimation(.easeOut(duration: 0.6)) { showSplash = false }
    }
}
