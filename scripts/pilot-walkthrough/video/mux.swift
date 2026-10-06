import AVFoundation
import Foundation

// usage: swift mux_v2.swift <video.mp4> <audio.wav> <out.mp4>
let a = CommandLine.arguments
let videoURL = URL(fileURLWithPath: a[1]), audioURL = URL(fileURLWithPath: a[2]), outputURL = URL(fileURLWithPath: a[3])
try? FileManager.default.removeItem(at: outputURL)
let composition = AVMutableComposition()
let videoAsset = AVURLAsset(url: videoURL), audioAsset = AVURLAsset(url: audioURL)
let duration = try await videoAsset.load(.duration)
let v = try await videoAsset.loadTracks(withMediaType: .video).first!
let au = try await audioAsset.loadTracks(withMediaType: .audio).first!
let cv = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid)!
let ca = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)!
try cv.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: v, at: .zero)
try ca.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: au, at: .zero)
let export = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetHighestQuality)!
try await export.export(to: outputURL, as: .mp4)
print("wrote", outputURL.path)
