-- Squares and square roots (syllabus topic squares-roots, chapter 5): what the shell (rive-chapter-shell/main.luau) shows around its lessons.
local kit = require('kit')

local M: { name: string, kicker: string, blurb: string, lastLine: string, lessons: { kit.Lesson } } = {
    name = 'Squares and square roots', -- the chapter's name in the app's topic catalogue, word for word
    kicker = 'CBSE CLASS 8 MATHS  ·  CHAPTER 5  ·  3 LESSONS',
    blurb = 'Grow it, wrap it, shuffle it. Every idea, built with your own hands.',
    lastLine = 'l3s3done', -- the last thing Kiara says in the last lesson (so "lesson complete" does not talk over it)
    lessons = { require('l1'), require('l2'), require('l3') },
}

return M
