-- lab: what the shell shares with a chapter's lessons beyond kit.G.
--   · the frame a lesson draws in. On a wide screen that is the Area module's board (kit.BX, kit.BY, kit.BW, kit.BH).
--     On a phone held upright the shell sets `portrait`, and a lesson stacks its figure (stage) over its readouts (panel).
--   · answer(): a lesson reports every checked answer, with the syllabus mistake code when it knows one, so the
--     page that hosts the lab hears about it (see the Lab view model in scene.rml).
local lab = {}

export type Rect = { x: number, y: number, w: number, h: number }

lab.portrait = false

-- A lesson that has an upright layout says so here, by its id: lab.upright[L.id] = true.
-- One that has not keeps the wide board, fitted small, even on an upright phone.
local upright: { [string]: boolean } = {}
lab.upright = upright

-- the upright frame, in its own coordinates: 480 × 760
lab.PW, lab.PH = 480, 760
local stage: Rect = { x = 20, y = 16, w = 440, h = 364 }
local panel: Rect = { x = 20, y = 396, w = 440, h = 348 }
lab.stage = stage
lab.panel = panel

-- set by the shell
lab.answer = function(value: string, correct: boolean, mistake: string) end

return lab
