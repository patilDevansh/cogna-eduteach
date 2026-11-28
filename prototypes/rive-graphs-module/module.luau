-- Introduction to graphs (syllabus topic graphs, chapter 13): what the shell (rive-chapter-shell/main.luau) shows around its lessons.
local kit = require('kit')

local M: { name: string, kicker: string, blurb: string, lastLine: string, lessons: { kit.Lesson } } = {
    name = 'Introduction to graphs', -- the chapter's name in the app's topic catalogue, word for word
    kicker = 'CBSE CLASS 8 MATHS  ·  CHAPTER 13  ·  3 LESSONS',
    blurb = 'Fly over it, climb it, ride it. Every graph, in 3D, by your own hands.',
    lastLine = 'l3s3done', -- the last thing Kiara says in the last lesson (so "lesson complete" does not talk over it)
    lessons = { require('l1'), require('l2'), require('l3') },
}

return M
