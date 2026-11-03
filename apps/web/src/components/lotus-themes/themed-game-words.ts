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
  /** A small mark on the corner of the card; optional. */
  tag?: string;
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

export interface RectangleWords {
  title: string;
  intro: string;
  /** The control that sets how many strips go down the side. */
  control: string;
  /** What the picture is of, for the screen reader. */
  picture: string;
  square: string;
  strip: string;
  unit: string;
}
export interface ReadbackWords {
  title: string;
  intro: string;
  input: string;
  read: string;
  flag: string;
  confirm: string;
  suggest: string;
  stamp: string;
  change: string;
  nothing: string;
}

export interface OrderWords { title: string; intro: string; slot: string; pool: string; empty: string }
export interface ClaimWords { title: string; intro: string; control: string; sideA: string; sideB: string; tried: string; decide: string }
export interface RapidWords { title: string; intro: string; row: string; done: string }
export interface FindWords { title: string; intro: string; unit: string; picked: string; none: string }
export interface ReplayWords { title: string; intro: string; play: string; stop: string; again: string; line: string; stopHere: string; stoppedAt: string }
export interface ChunkWords { title: string; intro: string; chunk: string; expand: string; root: string; working: string }

export const GAME_WORDS: {
  TWO_NUMBERS: Record<LotusTheme, TwoNumbersWords>;
  COMMIT_THEN_CHOOSE: Record<LotusTheme, CommitWords>;
  TRUE_FALSE: Record<LotusTheme, TrueFalseWords>;
  SPLIT_CONFIDENCE: Record<LotusTheme, SplitWords>;
  TWO_MOVES: Record<LotusTheme, TwoMovesWords>;
  FOUR_SIGNS: Record<LotusTheme, FourSignsWords>;
  EDIT_HISTORY: Record<LotusTheme, EditWords>;
  RECTANGLE: Record<LotusTheme, RectangleWords>;
  READBACK: Record<LotusTheme, ReadbackWords>;
  ORDER_STEPS: Record<LotusTheme, OrderWords>;
  TEST_CLAIM: Record<LotusTheme, ClaimWords>;
  RAPID_SET: Record<LotusTheme, RapidWords>;
  FIND_EVERY_B: Record<LotusTheme, FindWords>;
  REPLAY: Record<LotusTheme, ReplayWords>;
  CHUNK_IT: Record<LotusTheme, ChunkWords>;
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
    drafting: { title: "Submittal review", intro: "Review each submittal. Approve it, reject it, or query it if you are unsure.", card: "Submittal", tag: "For review", yes: "Approve", no: "Reject", unsure: "Query", done: "All submittals reviewed" },
    cabinet: { title: "Sealed letters", intro: "Break each seal. Is the claim genuine or forged? You may say you are unsure.", card: "Letter", tag: "By hand", yes: "Genuine", no: "Forged", unsure: "Unsure", done: "All letters read" },
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
  RECTANGLE: {
    studio: { title: "Tiles", intro: "Use every tile to make one rectangle. Choose how many strips go down the side; the rest go along the top.", control: "Strips down the side", picture: "The tiles laid out as a rectangle", square: "x²", strip: "strip", unit: "unit tile" },
    drafting: { title: "Floor plan", intro: "Lay the wall strips and the unit slabs into one room. Choose how many strips go on the side wall; the rest go along the top.", control: "Strips on the side wall", picture: "The floor plan", square: "x²", strip: "wall strip", unit: "unit slab" },
    cabinet: { title: "Inlay tray", intro: "Fit the veneers into one tray: the dark square, the mid strips and the brass unit pieces. Choose how many strips go down the side.", control: "Strips down the side of the tray", picture: "The inlay tray", square: "x²", strip: "strip", unit: "brass piece" },
    soundlab: { title: "Pad grid", intro: "Light up one rectangle of pads from the big pad, the bars and the single pads. Choose how many bars go down the side.", control: "Bars down the side", picture: "The pad grid", square: "x²", strip: "bar", unit: "pad" },
  },
  READBACK: {
    studio: { title: "Confirm your input", intro: "Type the factorisation. Before it is marked you see exactly how it was read.", input: "What you typed", read: "What Lotus read", flag: "CHECK", confirm: "That's what I meant", suggest: "Use the suggestion", stamp: "Confirmed", change: "Change it", nothing: "Nothing typed yet." },
    drafting: { title: "Issued for construction", intro: "Letter the factorisation. The drafter letters it back to you, with a query for anything unclear.", input: "Your drawing note", read: "Lettered back", flag: "RFI", confirm: "Issue for construction", suggest: "Use the drafter's reading", stamp: "Issued", change: "Revise it", nothing: "Nothing lettered yet." },
    cabinet: { title: "Engraver's proof", intro: "Write out the factorisation. The engraver reads it back before anything is cut.", input: "Your instruction", read: "The engraver's proof", flag: "QUERY", confirm: "Approve the proof", suggest: "Use the engraver's reading", stamp: "Approved", change: "Amend it", nothing: "Nothing written yet." },
    soundlab: { title: "Export check", intro: "Type the factorisation. Before export, the engineer reads back what the file will contain.", input: "Your session note", read: "Engineer's readback", flag: "WARN", confirm: "Export as is", suggest: "Use the suggested fix", stamp: "Exported", change: "Edit again", nothing: "Nothing typed yet." },
  },
  ORDER_STEPS: {
    studio: { title: "Order the steps", intro: "Build the working: tap three of the six cards into order. Three of them contain a slip.", slot: "Step", pool: "Steps", empty: "Tap a step" },
    drafting: { title: "Stack the floors", intro: "Lift three of the six floor slabs into place, bottom to top. Three of them contain a slip.", slot: "Floor", pool: "Slabs", empty: "Lift a slab here" },
    cabinet: { title: "Gear train", intro: "Mesh three of the six engraved gears into a train, in order. Three of them contain a slip.", slot: "Gear", pool: "Gears", empty: "Mesh a gear here" },
    soundlab: { title: "Arrange the track", intro: "Drop three of the six clips onto the track, in order. Three of them contain a slip.", slot: "Slot", pool: "Clips", empty: "Drop a clip here" },
  },
  TEST_CLAIM: {
    studio: { title: "Test the claim", intro: "Is the claim always true, sometimes true or never true? Try some values of x, then decide.", control: "Try a value of x", sideA: "Left side", sideB: "Right side", tried: "Values tried", decide: "Your verdict" },
    drafting: { title: "Area audit", intro: "Two formulas for the same room. Try different values of x, then decide whether they always, sometimes or never agree.", control: "Try a value of x", sideA: "Formula A", sideB: "Formula B", tried: "Sizes tried", decide: "Your verdict" },
    cabinet: { title: "Brass balance", intro: "Weigh both sides on the balance with different values of x, then decide whether it always, sometimes or never balances.", control: "Try a value of x", sideA: "Left pan", sideB: "Right pan", tried: "Weighings", decide: "Your verdict" },
    soundlab: { title: "A/B compare", intro: "Two signals. Try different values of x, then decide whether A and B are always, sometimes or never the same.", control: "Try a value of x", sideA: "Signal A", sideB: "Signal B", tried: "Takes tried", decide: "Your verdict" },
  },
  RAPID_SET: {
    studio: { title: "Rapid set", intro: "Four quick ones. Choose the factorisation, or say it can't be done.", row: "Question", done: "All four done" },
    drafting: { title: "Door schedule", intro: "Fill in the schedule row by row. Choose the factorisation, or say it can't be done.", row: "Row", done: "Schedule complete" },
    cabinet: { title: "Pneumatic post", intro: "Canisters arrive by tube, one at a time. Choose the factorisation, or say it can't be done.", row: "Canister", done: "All canisters answered" },
    soundlab: { title: "Keep the beat", intro: "Four quick ones, on the beat. Choose the factorisation, or say it can't be done.", row: "Beat", done: "All four beats played" },
  },
  FIND_EVERY_B: {
    studio: { title: "Find every b", intro: "Tap every b that makes it factorise into two brackets with whole numbers.", unit: "b", picked: "Picked", none: "None yet" },
    drafting: { title: "Every room of this area", intro: "Flag every b on the scale rule for which the room can be split into two whole-number sides.", unit: "b", picked: "Flagged", none: "None yet" },
    cabinet: { title: "Pegboard", intro: "Set a brass peg at every b that works: it must factorise into two brackets with whole numbers.", unit: "b", picked: "Pegs set", none: "No pegs yet" },
    soundlab: { title: "Find every note", intro: "Light every key b that works: it must factorise into two brackets with whole numbers.", unit: "b", picked: "Keys lit", none: "None lit" },
  },
  REPLAY: {
    studio: { title: "Stop the replay", intro: "The working plays line by line. Stop it at the first line that goes wrong.", play: "Play", stop: "Stop", again: "Play again", line: "Line", stopHere: "Stop here", stoppedAt: "Stopped at line" },
    drafting: { title: "Plotter check", intro: "A pen plotter draws the working line by line. Stop the plot at the first line that goes wrong.", play: "Start plot", stop: "Stop plot", again: "Plot again", line: "Line", stopHere: "Stop at this line", stoppedAt: "Stopped at line" },
    cabinet: { title: "The automaton", intro: "A writing automaton pens the working line by line. Stop it at the first line that goes wrong.", play: "Wind it up", stop: "Stop the automaton", again: "Wind it again", line: "Line", stopHere: "Stop at this line", stoppedAt: "Stopped at line" },
    soundlab: { title: "Scrub the take", intro: "The working plays back like a take. Stop the tape at the first line that goes wrong.", play: "Play", stop: "Stop the tape", again: "Play again", line: "Line", stopHere: "Stop here", stoppedAt: "Stopped at line" },
  },
  CHUNK_IT: {
    studio: { title: "Chunk it", intro: "What is your first move? Each one leads to its own working.", chunk: "Treat ({chunk}) as one chunk", expand: "Expand the bracket first", root: "Square-root each part", working: "Your working" },
    drafting: { title: "Module", intro: "What is your first move? Each one leads to its own set of drawings.", chunk: "Block ({chunk}) as one module", expand: "Expand the bracket first", root: "Take the square root of each part", working: "Your drawings" },
    cabinet: { title: "Nested boxes", intro: "What is your first move? Each one leads to its own working in the workshop.", chunk: "Pack ({chunk}) into one small box", expand: "Unpack the bracket first", root: "Take the square root of each part", working: "Your workshop notes" },
    soundlab: { title: "Bus it", intro: "What is your first move? Each one leads to its own signal path.", chunk: "Route ({chunk}) to a single bus", expand: "Split the bracket out first", root: "Take the square root of each part", working: "Your signal path" },
  },
};

export function gameTitle(kind: LotusGameKind, theme: LotusTheme): string {
  return GAME_WORDS[kind][theme].title;
}
