import AppKit
import AVFoundation
import CoreVideo
import Foundation

struct Scene: Codable {
    let eyebrow: String
    let headline: String
    let equation: String
    let caption: String
    let accent: String
}

struct Lesson: Codable {
    let key: String
    let studentName: String
    let title: String
    let scenes: [Scene]
}

struct Manifest: Codable { let lessons: [Lesson] }

let scriptURL = URL(fileURLWithPath: #filePath)
let repositoryURL = scriptURL.deletingLastPathComponent().deletingLastPathComponent()
let manifestURL = scriptURL.deletingLastPathComponent().appendingPathComponent("pilot-video-manifest.json")
let outputURL = repositoryURL.appendingPathComponent("apps/web/public/generated-videos", isDirectory: true)
try FileManager.default.createDirectory(at: outputURL, withIntermediateDirectories: true)
let manifest = try JSONDecoder().decode(Manifest.self, from: Data(contentsOf: manifestURL))

let width = 960
let height = 540
let framesPerSecond: Int32 = 15
let secondsPerScene = 4

func color(_ hex: String) -> NSColor {
    let cleaned = hex.replacingOccurrences(of: "#", with: "")
    guard cleaned.count == 6, let value = Int(cleaned, radix: 16) else { return .black }
    return NSColor(
        red: CGFloat((value >> 16) & 255) / 255,
        green: CGFloat((value >> 8) & 255) / 255,
        blue: CGFloat(value & 255) / 255,
        alpha: 1
    )
}

func draw(_ text: String, in rect: CGRect, font: NSFont, ink: NSColor, alignment: NSTextAlignment = .left) {
    let paragraph = NSMutableParagraphStyle()
    paragraph.alignment = alignment
    paragraph.lineBreakMode = .byWordWrapping
    (text as NSString).draw(in: rect, withAttributes: [
        .font: font,
        .foregroundColor: ink,
        .paragraphStyle: paragraph,
    ])
}

func renderFrame(_ buffer: CVPixelBuffer, lesson: Lesson, scene: Scene, sceneIndex: Int, progress: CGFloat) {
    CVPixelBufferLockBaseAddress(buffer, [])
    defer { CVPixelBufferUnlockBaseAddress(buffer, []) }
    guard let base = CVPixelBufferGetBaseAddress(buffer) else { return }
    let context = CGContext(
        data: base,
        width: width,
        height: height,
        bitsPerComponent: 8,
        bytesPerRow: CVPixelBufferGetBytesPerRow(buffer),
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue
    )!
    let graphics = NSGraphicsContext(cgContext: context, flipped: true)
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = graphics

    let backgrounds: [String: String] = ["green": "#dff2e9", "amber": "#fff0cf", "violet": "#eee8f6"]
    color(backgrounds[scene.accent] ?? "#dff2e9").setFill()
    NSBezierPath(rect: CGRect(x: 0, y: 0, width: width, height: height)).fill()

    color("#0a4b3e").withAlphaComponent(0.08).setFill()
    NSBezierPath(ovalIn: CGRect(x: 770, y: -120, width: 330, height: 330)).fill()
    NSBezierPath(ovalIn: CGRect(x: -90, y: 410, width: 220, height: 220)).fill()

    draw("COGNA · PERSONALIZED FOR \(lesson.studentName.uppercased())", in: CGRect(x: 58, y: 36, width: 700, height: 24), font: .systemFont(ofSize: 13, weight: .bold), ink: color("#0a4b3e"))
    draw(String(format: "%02d", sceneIndex + 1), in: CGRect(x: 820, y: 30, width: 80, height: 50), font: .systemFont(ofSize: 42, weight: .bold), ink: color("#0a4b3e").withAlphaComponent(0.16), alignment: .right)
    draw(scene.eyebrow.uppercased(), in: CGRect(x: 58, y: 104, width: 700, height: 26), font: .systemFont(ofSize: 14, weight: .bold), ink: color("#14745e"))
    draw(scene.headline, in: CGRect(x: 58, y: 140, width: 830, height: 100), font: .systemFont(ofSize: 38, weight: .bold), ink: color("#10251f"))

    color("#ffffff").withAlphaComponent(0.82).setFill()
    let equationBox = NSBezierPath(roundedRect: CGRect(x: 58, y: 258, width: 844, height: 82), xRadius: 14, yRadius: 14)
    equationBox.fill()
    draw(scene.equation, in: CGRect(x: 82, y: 277, width: 796, height: 48), font: .monospacedSystemFont(ofSize: 27, weight: .semibold), ink: color("#0a4b3e"))
    draw(scene.caption, in: CGRect(x: 58, y: 368, width: 830, height: 84), font: .systemFont(ofSize: 18, weight: .medium), ink: color("#38594f"))

    color("#cbdad4").setFill()
    NSBezierPath(roundedRect: CGRect(x: 58, y: 494, width: 844, height: 7), xRadius: 4, yRadius: 4).fill()
    color("#14745e").setFill()
    NSBezierPath(roundedRect: CGRect(x: 58, y: 494, width: 844 * progress, height: 7), xRadius: 4, yRadius: 4).fill()

    NSGraphicsContext.restoreGraphicsState()
}

func render(_ lesson: Lesson) throws {
    let target = outputURL.appendingPathComponent("\(lesson.key).mov")
    try? FileManager.default.removeItem(at: target)
    let writer = try AVAssetWriter(outputURL: target, fileType: .mov)
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.proRes422,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
    ])
    input.expectsMediaDataInRealTime = false
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
    ])
    guard writer.canAdd(input) else { throw NSError(domain: "CognaVideo", code: 1) }
    writer.add(input)
    guard writer.startWriting() else { throw writer.error ?? NSError(domain: "CognaVideo", code: 2) }
    writer.startSession(atSourceTime: .zero)
    guard let pool = adaptor.pixelBufferPool else { throw NSError(domain: "CognaVideo", code: 3) }
    let sceneFrames = Int(framesPerSecond) * secondsPerScene
    let totalFrames = lesson.scenes.count * sceneFrames
    for frame in 0..<totalFrames {
        while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, pool, &buffer)
        guard let pixelBuffer = buffer else { throw NSError(domain: "CognaVideo", code: 4) }
        let sceneIndex = min(frame / sceneFrames, lesson.scenes.count - 1)
        renderFrame(pixelBuffer, lesson: lesson, scene: lesson.scenes[sceneIndex], sceneIndex: sceneIndex, progress: CGFloat(frame + 1) / CGFloat(totalFrames))
        let time = CMTime(value: Int64(frame), timescale: framesPerSecond)
        guard adaptor.append(pixelBuffer, withPresentationTime: time) else { throw writer.error ?? NSError(domain: "CognaVideo", code: 5) }
    }
    input.markAsFinished()
    let semaphore = DispatchSemaphore(value: 0)
    writer.finishWriting { semaphore.signal() }
    semaphore.wait()
    if writer.status != .completed { throw writer.error ?? NSError(domain: "CognaVideo", code: 6) }
    print("Rendered \(target.lastPathComponent)")
}

for lesson in manifest.lessons { try render(lesson) }
