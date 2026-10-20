import AVFoundation
import Foundation

// usage: swift export_small.swift <in.mp4> <out.mp4> [videoBitsPerSecond]
// Re-encodes at the source resolution with a capped H.264 bitrate so the file fits
// share/upload limits (e.g. 30 MB). Slides are mostly static, so ~1.6 Mbps stays sharp.
let args = CommandLine.arguments
let inURL = URL(fileURLWithPath: args[1]), outURL = URL(fileURLWithPath: args[2])
let bitrate = args.count > 3 ? Int(args[3])! : 1_600_000
try? FileManager.default.removeItem(at: outURL)

let asset = AVURLAsset(url: inURL)
let vTrack = try await asset.loadTracks(withMediaType: .video).first!
let aTrack = try await asset.loadTracks(withMediaType: .audio).first
let size = try await vTrack.load(.naturalSize)
let fps = try await vTrack.load(.nominalFrameRate)

let reader = try AVAssetReader(asset: asset)
let vOut = AVAssetReaderTrackOutput(track: vTrack, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
reader.add(vOut)
var aOut: AVAssetReaderTrackOutput?
if let aTrack {
    let o = AVAssetReaderTrackOutput(track: aTrack, outputSettings: [AVFormatIDKey: kAudioFormatLinearPCM])
    reader.add(o); aOut = o
}

let writer = try AVAssetWriter(outputURL: outURL, fileType: .mp4)
let vIn = AVAssetWriterInput(mediaType: .video, outputSettings: [
    AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(size.width), AVVideoHeightKey: Int(size.height),
    AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: bitrate, AVVideoMaxKeyFrameIntervalKey: Int(fps * 2),
                                      AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
])
vIn.expectsMediaDataInRealTime = false
writer.add(vIn)
var aIn: AVAssetWriterInput?
if aOut != nil {
    let i = AVAssetWriterInput(mediaType: .audio, outputSettings: [
        AVFormatIDKey: kAudioFormatMPEG4AAC, AVNumberOfChannelsKey: 1, AVSampleRateKey: 48000, AVEncoderBitRateKey: 128_000,
    ])
    writer.add(i); aIn = i
}

reader.startReading(); writer.startWriting(); writer.startSession(atSourceTime: .zero)

func pump(_ input: AVAssetWriterInput, _ output: AVAssetReaderTrackOutput, _ label: String) async {
    await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
        input.requestMediaDataWhenReady(on: DispatchQueue(label: label)) {
            while input.isReadyForMoreMediaData {
                if let buf = output.copyNextSampleBuffer() { input.append(buf) } else {
                    input.markAsFinished(); done.resume(); return
                }
            }
        }
    }
}
async let v: Void = pump(vIn, vOut, "video")
if let aIn, let aOut { async let a: Void = pump(aIn, aOut, "audio"); _ = await (v, a) } else { await v }
await writer.finishWriting()
if writer.status != .completed { fatalError(writer.error?.localizedDescription ?? "export failed") }
print("wrote", outURL.path)
