import Foundation
import CoreGraphics
#if canImport(PencilKit)
import PencilKit
#endif
#if canImport(Vision)
import Vision
#endif

struct KanjiCandidate {
    let character: String
    let confidence: Float
}

struct StrokeMatch {
    let userStrokeIndex: Int
    let templateStrokeIndex: Int
    let geometricScore: Float // 0..1
    let directionOK: Bool
    let positionOK: Bool
}

struct StrokeOrderResult {
    let isOrderCorrect: Bool
    let perStrokeMatches: [StrokeMatch]
    let feedback: String?
}

protocol KanjiStrokeRecognizerProtocol {
    #if canImport(PencilKit)
    func recognizeKanji(from drawing: PKDrawing) async throws -> [KanjiCandidate]
    func analyzeStrokeOrder(for kanji: String, drawing: PKDrawing) -> StrokeOrderResult
    #endif
}

final class KanjiStrokeRecognizer: KanjiStrokeRecognizerProtocol {
    private let templateProvider: KanjiStrokeTemplateProvider

    init(templateProvider: KanjiStrokeTemplateProvider = DefaultKanjiStrokeTemplateProvider()) {
        self.templateProvider = templateProvider
    }

    #if canImport(PencilKit)
    func recognizeKanji(from drawing: PKDrawing) async throws -> [KanjiCandidate] {
        #if canImport(Vision)
        let image = drawing.image(from: drawing.bounds, scale: 2.0)
        guard let cgImage = image.cgImage else { return [] }

        let request = VNRecognizeTextRequest()
        request.recognitionLanguages = ["ja"]
        request.usesLanguageCorrection = true
        request.recognitionLevel = .accurate

        let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])
        try handler.perform([request])
        guard let observations = request.results, !observations.isEmpty else { return [] }

        let candidates: [KanjiCandidate] = observations.flatMap { obs in
            obs.candidates.map { c in
                KanjiCandidate(character: c.string, confidence: Float(c.confidence))
            }
        }
        .filter { !$0.character.isEmpty && $0.character.unicodeScalars.first?.properties.isIdeographic == true }
        .sorted { $0.confidence > $1.confidence }

        return candidates
        #else
        return []
        #endif
    }

    func analyzeStrokeOrder(for kanji: String, drawing: PKDrawing) -> StrokeOrderResult {
        guard let templates = templateProvider.template(for: kanji), !templates.isEmpty else {
            return StrokeOrderResult(isOrderCorrect: false, perStrokeMatches: [], feedback: "Chưa có mẫu nét cho ký tự này.")
        }

        let userStrokes = drawing.strokes.map { resample(stroke: $0, targetCount: 64) }
        var matches: [StrokeMatch] = []
        let count = min(userStrokes.count, templates.count)
        var orderOK = (userStrokes.count == templates.count)

        for i in 0..<count {
            let sUser = userStrokes[i]
            let sTpl = templates[i].points
            let score = geometricSimilarity(user: sUser, template: sTpl)
            let directionOK = checkDirection(user: sUser, template: sTpl)
            let positionOK = checkPosition(user: sUser, template: sTpl)
            matches.append(StrokeMatch(userStrokeIndex: i, templateStrokeIndex: i, geometricScore: score, directionOK: directionOK, positionOK: positionOK))
            if score < 0.5 || !directionOK { orderOK = false }
        }

        let feedback: String = orderOK ? "Thứ tự nét và hình dạng ổn." : "Thử viết theo thứ tự nét chuẩn và chú ý hướng nét."
        return StrokeOrderResult(isOrderCorrect: orderOK, perStrokeMatches: matches, feedback: feedback)
    }

    // MARK: - Helpers
    private func resample(stroke: PKStroke, targetCount: Int) -> [CGPoint] {
        var points: [CGPoint] = []
        stroke.path.enumeratePoints { point, _ in
            points.append(point.location)
        }
        if points.isEmpty { return points }
        return uniformResample(points: points, targetCount: targetCount)
    }

    private func uniformResample(points: [CGPoint], targetCount: Int) -> [CGPoint] {
        guard points.count > 1 else { return points }
        let total = (1..<points.count).reduce(0.0) { acc, i in
            acc + hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y)
        }
        if total == 0 { return Array(repeating: points[0], count: targetCount) }

        var result: [CGPoint] = []
        var distAccum = 0.0
        let step = total / Double(targetCount - 1)
        var i = 1
        var prev = points[0]
        result.append(prev)

        while i < points.count {
            let curr = points[i]
            let seg = hypot(curr.x - prev.x, curr.y - prev.y)
            if distAccum + seg >= step {
                let t = (step - distAccum) / seg
                let x = prev.x + CGFloat(t) * (curr.x - prev.x)
                let y = prev.y + CGFloat(t) * (curr.y - prev.y)
                let pt = CGPoint(x: x, y: y)
                result.append(pt)
                prev = pt
                distAccum = 0
            } else {
                distAccum += seg
                prev = curr
                i += 1
            }
        }
        if result.count < targetCount {
            result.append(points.last!)
        }
        return result
    }

    private func geometricSimilarity(user: [CGPoint], template: [CGPoint]) -> Float {
        guard !user.isEmpty, !template.isEmpty else { return 0 }
        let n = min(user.count, template.count)
        var sum: CGFloat = 0
        for i in 0..<n {
            sum += hypot(user[i].x - template[i].x, user[i].y - template[i].y)
        }
        let avg = sum / CGFloat(n)
        let norm = max(0, 1 - Float(avg / 100.0))
        return min(1, norm)
    }

    private func checkDirection(user: [CGPoint], template: [CGPoint]) -> Bool {
        guard let u0 = user.first, let u1 = user.last, let t0 = template.first, let t1 = template.last else { return false }
        let u = CGVector(dx: u1.x - u0.x, dy: u1.y - u0.y)
        let t = CGVector(dx: t1.x - t0.x, dy: t1.y - t0.y)
        let dot = (u.dx * t.dx + u.dy * t.dy)
        let mu = hypot(u.dx, u.dy)
        let mt = hypot(t.dx, t.dy)
        guard mu > 0, mt > 0 else { return false }
        let cosang = dot / (mu * mt)
        return cosang > 0.7
    }

    private func checkPosition(user: [CGPoint], template: [CGPoint]) -> Bool {
        func bounds(_ pts: [CGPoint]) -> CGRect {
            pts.reduce(into: CGRect.null) { rect, p in
                rect = rect.union(CGRect(origin: p, size: .zero))
            }
        }
        let bu = bounds(user)
        let bt = bounds(template)
        let dx = abs(bu.midX - bt.midX)
        let dy = abs(bu.midY - bt.midY)
        return dx < bt.width * 0.5 && dy < bt.height * 0.5
    }
    #endif
}
