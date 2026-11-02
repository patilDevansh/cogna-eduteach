import type { LotusGameKind, LotusTheme } from "@cogna/shared";

/**
 * What each theme calls things in each game. Words only: the diagnosis is read
 * on the server from what the student did, so none of this can change it.
 * Nothing here says right or wrong.
 */
export interface TwoNumbersWords {
  title: string;
  intro: string;
  first: string;
  second: string;
  product: string;
  sum: string;
}
export interface CommitWords {
  title: string;
  intro: string;
  guess: string;
  commit: string;
  cover: string;
  options: string;
}
export interface TrueFalseWords {
  title: string;
  intro: string;
  card: string;
  yes: string;
  no: string;
  unsure: string;
  done: string;
}

export interface SplitWords {
  title: string;
  intro: string;
  /** What one token is called, singular and plural. */
  token: string;
  tokens: string;
  tray: string;
  place: string;
  takeBack: string;
}
export interface TwoMovesWords {
  title: string;
  intro: string;
  move1: string;
  move2: string;
  first: string;
  second: string;
  plate: string;
}
export interface FourSignsWords {
  title: string;
  intro: string;
  cases: [string, string, string, string];
}
export interface EditWords {
  title: string;
  intro: string;
  input: string;
  log: string;
  empty: string;
  draft: string;
}

export const GAME_WORDS: {
  TWO_NUMBERS: Record<LotusTheme, TwoNumbersWords>;
  COMMIT_THEN_CHOOSE: Record<LotusTheme, CommitWords>;
  TRUE_FALSE: Record<LotusTheme, TrueFalseWords>;
  SPLIT_CONFIDENCE: Record<LotusTheme, SplitWords>;
  TWO_MOVES: Record<LotusTheme, TwoMovesWords>;
  FOUR_SIGNS: Record<LotusTheme, FourSignsWords>;
  EDIT_HISTORY: Record<LotusTheme, EditWords>;
} = {
  TWO_NUMBERS: {
    studio: { title: "Two numbers", intro: "Pick the two numbers that go inside the brackets.", first: "First", second: "Second", product: "multiply", sum: "add" },
    drafting: { title: "Set out the room", intro: "Set the two wall offsets. The plan redraws as you go.", first: "Wall one", second: "Wall two", product: "area", sum: "run" },
    cabinet: { title: "Combination dials", intro: "Turn the two dials to the numbers that go inside the brackets.", first: "Left dial", second: "Right dial", product: "multiply", sum: "add" },
    soundlab: { title: "Tune two oscillators", intro: "Tune the two oscillators. Their mix is read out live.", first: "Osc A", second: "Osc B", product: "mix ×", sum: "mix +" },
  },
  COMMIT_THEN_CHOOSE: {
    studio: { title: "Commit, then choose", intro: "Write your own answer first. The options appear once you commit.", guess: "Your answer", commit: "Commit", cover: "The options appear after you commit.", options: "Now choose" },
    drafting: { title: "Sketch, then trace", intro: "Sketch your answer first. The traced options go on top once it is pinned.", guess: "Your sketch", commit: "Pin the sketch", cover: "Tracing paper covers the options until you pin your sketch.", options: "Trace one" },
    cabinet: { title: "Frosted compartment", intro: "Write down your answer first. The frosted glass slides away after.", guess: "Your answer", commit: "Slide the glass", cover: "Frosted glass hides the compartment until you commit.", options: "Open one" },
    soundlab: { title: "Hum it first", intro: "Hum your answer first. The channels unmute after you play your take.", guess: "Your take", commit: "Play my take", cover: "The channels stay muted until you play your take.", options: "Pick a channel" },
  },
  TRUE_FALSE: {
    studio: { title: "True or false", intro: "Is each claim true or false? Choose “not sure” if you can’t tell.", card: "Card", yes: "True", no: "False", unsure: "Not sure", done: "All cards judged" },
    drafting: { title: "Submittal review", intro: "Review each submittal. Approve it, reject it, or query it if you are unsure.", card: "Submittal", yes: "Approve", no: "Reject", unsure: "Query", done: "All submittals reviewed" },
    cabinet: { title: "Sealed letters", intro: "Break each seal. Is the claim genuine or forged? You may say you are unsure.", card: "Letter", yes: "Genuine", no: "Forged", unsure: "Unsure", done: "All letters read" },
    soundlab: { title: "Keep or drop", intro: "Listen to each take. Keep it, drop it, or mark it unsure.", card: "Take", yes: "Keep", no: "Drop", unsure: "Unsure", done: "All takes judged" },
  },
  SPLIT_CONFIDENCE: {
    studio: { title: "Split your confidence", intro: "Which one is the factorisation? Share four dots: all on one if you’re sure, split them if you’re torn.", token: "dot", tokens: "dots", tray: "Your dots", place: "Add a dot to", takeBack: "Take a dot from" },
    drafting: { title: "Pin the drawings", intro: "Which sheet is right? You have four pushpins: all on one sheet if you’re sure, split them if you’re torn.", token: "pin", tokens: "pins", tray: "Your pins", place: "Pin to", takeBack: "Unpin from" },
    cabinet: { title: "Brass weights", intro: "Which plaque is right? Hang four brass weights: all on one if you’re sure, split them if you’re torn.", token: "weight", tokens: "weights", tray: "Your weights", place: "Hang a weight on", takeBack: "Lift a weight from" },
    soundlab: { title: "Mixing desk", intro: "Which channel is right? You have four levels: push them all to one channel if you’re sure, split them if you’re torn.", token: "level", tokens: "levels", tray: "Levels left", place: "Raise", takeBack: "Lower" },
  },
  TWO_MOVES: {
    studio: { title: "Look inside", intro: "Factorise in two moves. First the numbers, then the signs.", move1: "Move 1: the two numbers that multiply to the last number and add to the middle number", move2: "Move 2: the sign each number takes into its bracket", first: "First", second: "Second", plate: "Your answer" },
    drafting: { title: "Section cut", intro: "Build the wall in two moves. The finished answer goes on the facade.", move1: "Move 1: the two offsets that multiply to the last number and add to the middle number", move2: "Move 2: the sign each offset takes into its bracket", first: "Offset one", second: "Offset two", plate: "The facade" },
    cabinet: { title: "Jeweller’s loupe", intro: "Factorise in two moves. The answer is engraved on a plate.", move1: "Move 1: the two numbers that multiply to the last number and add to the middle number", move2: "Move 2: the sign each number takes into its bracket", first: "First", second: "Second", plate: "The plate" },
    soundlab: { title: "Solo the stems", intro: "Factorise in two moves, one stem at a time.", move1: "Stem 1: the two numbers that multiply to the last number and add to the middle number", move2: "Stem 2: the sign each number takes into its bracket", first: "First", second: "Second", plate: "The mix" },
  },
  FOUR_SIGNS: {
    studio: { title: "Four sign cases", intro: "The numbers are the same in all four. Choose the signs for each case.", cases: ["Case 1", "Case 2", "Case 3", "Case 4"] },
    drafting: { title: "Four elevations", intro: "The same two offsets on all four elevations. Set the signs for each one.", cases: ["North", "East", "South", "West"] },
    cabinet: { title: "Four locks", intro: "The same two numbers open all four padlocks. Set the two sign tumblers on each.", cases: ["Lock I", "Lock II", "Lock III", "Lock IV"] },
    soundlab: { title: "Four pads", intro: "The same two numbers on all four pads. Flip the two sign switches on each.", cases: ["Pad 1", "Pad 2", "Pad 3", "Pad 4"] },
  },
  EDIT_HISTORY: {
    studio: { title: "Edit history", intro: "Type the factorisation. Anything you delete stays in your history.", input: "Your answer", log: "Your history", empty: "Nothing deleted yet.", draft: "Draft" },
    drafting: { title: "Revision table", intro: "Letter the factorisation. Every change you make goes in the revision table.", input: "Your drawing note", log: "Revision table", empty: "No revisions yet.", draft: "Rev" },
    cabinet: { title: "Telegraph", intro: "Send your factorisation by telegraph. Every message you delete stays on the tape.", input: "Your message", log: "Telegraph tape", empty: "The tape is clean.", draft: "Message" },
    soundlab: { title: "Take history", intro: "Type the factorisation. Every edit becomes a take.", input: "Your take", log: "Take history", empty: "No takes dropped yet.", draft: "Take" },
  },
};

export function gameTitle(kind: LotusGameKind, theme: LotusTheme): string {
  return GAME_WORDS[kind][theme].title;
}
