import SwiftUI

/// Farben des Craft-World-Neonlooks.
enum Neon {
    static let core = Color(red: 0.88, green: 0.99, blue: 1.0)
    static let cyan = Color(red: 0.18, green: 0.85, blue: 1.0)
    static let blue = Color(red: 0.0, green: 0.55, blue: 1.0)
    static let deep = Color(red: 0.0, green: 0.32, blue: 1.0)
    static let fill = Color(red: 0.03, green: 0.10, blue: 0.19)
    static let background = Color(red: 0.012, green: 0.039, blue: 0.086)
}

/// Der neonblaue Wollknäuel-Baum (eigenes Motiv), nativ gezeichnet.
struct NeonTree: View {
    var lineWidth: CGFloat = 5

    var body: some View {
        Canvas { ctx, size in
            let s = min(size.width / 120, size.height / 140)
            let ox = (size.width - 120 * s) / 2
            let oy = (size.height - 140 * s) / 2
            func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
            func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat) -> Path {
                Path(ellipseIn: CGRect(x: ox + (cx - r) * s, y: oy + (cy - r) * s, width: 2 * r * s, height: 2 * r * s))
            }

            var trunk = Path()
            trunk.move(to: p(60, 134)); trunk.addLine(to: p(60, 74))
            trunk.move(to: p(60, 104)); trunk.addLine(to: p(43, 88))
            trunk.move(to: p(60, 94)); trunk.addLine(to: p(77, 80))
            trunk.move(to: p(60, 134)); trunk.addQuadCurve(to: p(42, 138), control: p(49, 133))
            trunk.move(to: p(60, 134)); trunk.addQuadCurve(to: p(78, 138), control: p(71, 133))

            let crowns = [circle(35, 60, 18), circle(85, 60, 18), circle(60, 44, 27)]

            var yarn = Path()
            yarn.move(to: p(44, 26)); yarn.addQuadCurve(to: p(50, 68), control: p(68, 42))
            yarn.move(to: p(58, 18)); yarn.addQuadCurve(to: p(74, 64), control: p(86, 38))
            yarn.move(to: p(36, 42)); yarn.addQuadCurve(to: p(66, 70), control: p(56, 48))

            let thick = StrokeStyle(lineWidth: lineWidth * s, lineCap: .round, lineJoin: .round)
            let thin = StrokeStyle(lineWidth: lineWidth * 0.6 * s, lineCap: .round, lineJoin: .round)

            // Leuchten (mehrere weichgezeichnete Durchgänge)
            for (radius, color, width) in [(22.0, Neon.deep, 3.0), (10.0, Neon.blue, 2.0), (4.0, Neon.cyan, 1.4)] {
                ctx.drawLayer { layer in
                    layer.addFilter(.blur(radius: radius * s))
                    let st = StrokeStyle(lineWidth: lineWidth * width * s, lineCap: .round, lineJoin: .round)
                    layer.stroke(trunk, with: .color(color), style: st)
                    for c in crowns { layer.stroke(c, with: .color(color), style: st) }
                }
            }
            // Scharfe Neonröhren
            ctx.stroke(trunk, with: .color(Neon.core), style: thick)
            for c in crowns {
                ctx.fill(c, with: .color(Neon.fill))
                ctx.stroke(c, with: .color(Neon.core), style: thick)
            }
            ctx.stroke(yarn, with: .color(Neon.core), style: thin)
        }
    }
}

/// Leuchtschrift mit mehrfachem Glühen.
struct NeonText: View {
    let text: String
    var size: CGFloat = 64

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .heavy, design: .rounded))
            .foregroundStyle(Neon.core)
            .shadow(color: Neon.cyan, radius: size * 0.05)
            .shadow(color: Neon.cyan, radius: size * 0.14)
            .shadow(color: Neon.blue, radius: size * 0.3)
            .shadow(color: Neon.deep, radius: size * 0.55)
            .lineLimit(1)
            .minimumScaleFactor(0.5)
    }
}

/// Startbildschirm: Neon-Schild mit Baum und Schriftzug, kurzes Flackern beim Einschalten.
struct SplashView: View {
    @State private var on = false
    @State private var flicker = 1.0

    var body: some View {
        GeometryReader { geo in
            let short = min(geo.size.width, geo.size.height)
            ZStack {
                RadialGradient(colors: [Color(red: 0.05, green: 0.16, blue: 0.29), Neon.background],
                               center: .center, startRadius: 10, endRadius: max(geo.size.width, geo.size.height) * 0.7)
                    .ignoresSafeArea()

                HStack(spacing: short * 0.05) {
                    NeonTree()
                        .frame(width: short * 0.28, height: short * 0.33)
                    NeonText(text: "Craft World", size: short * 0.17)
                }
                .padding(.horizontal, short * 0.08)
                .padding(.vertical, short * 0.06)
                .background(
                    RoundedRectangle(cornerRadius: short * 0.07, style: .continuous)
                        .fill(Neon.fill.opacity(0.85))
                )
                .overlay(
                    RoundedRectangle(cornerRadius: short * 0.07, style: .continuous)
                        .stroke(Neon.cyan, lineWidth: 3)
                        .shadow(color: Neon.cyan, radius: 6)
                        .shadow(color: Neon.blue, radius: 18)
                )
                .rotationEffect(.degrees(-2))
                .padding(24)
                .opacity(on ? flicker : 0)
                .scaleEffect(on ? 1 : 0.94)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .task {
            // Einschalt-Flackern wie bei einer echten Neonröhre
            withAnimation(.easeOut(duration: 0.25)) { on = true }
            for value in [0.35, 1.0, 0.55, 1.0, 0.8, 1.0] {
                try? await Task.sleep(nanoseconds: 90_000_000)
                withAnimation(.linear(duration: 0.05)) { flicker = value }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Craft World")
    }
}

struct SplashView_Previews: PreviewProvider {
    static var previews: some View {
        SplashView()
    }
}
