-- Algebraic expressions and identities (syllabus topic algebraic-expressions, chapter 8): what the shell (rive-chapter-shell/main.luau) shows around its lessons.
local kit = require('kit')

local M: { name: string, kicker: string, blurb: string, lastLine: string, lessons: { kit.Lesson } } = {
    name = 'Algebraic expressions and identities', -- the chapter's name in the app's topic catalogue, word for word
    kicker = 'CBSE CLASS 8 MATHS  ·  CHAPTER 8  ·  4 LESSONS',
    blurb = 'Cut a field and the bracket opens itself.',
    lastLine = 'l4s3done', -- the last thing Kiara says in the last lesson (so "lesson complete" does not talk over it)
    lessons = { require('l1'), require('l2'), require('l3'), require('l4') },
}

return M
