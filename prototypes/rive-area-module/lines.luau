-- The module's own lines (the lesson list and the lesson-complete card). Each lesson keeps its own lines in
-- L.lines inside its file (l1.luau … l8.luau); main.luau merges them in at start-up. In the trail app every line is
-- spoken by the page's voice player; on its own, the module plays voice/<key>.mp3 when scene.rml has an AudioAsset
-- named v_<key> (tools/record-voice.mjs records the shared lines and every lesson's L.lines).
local lines: { [string]: string } = {
    home = "Welcome to Area! Eight short lessons with seven friends from all over India, and you'll do everything with your own hands. Pick lesson one to start.",
    complete = 'Lesson complete! Brilliant work.',
}

return lines
