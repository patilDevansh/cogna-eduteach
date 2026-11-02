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

export const GAME_WORDS: { TWO_NUMBERS: Record<LotusTheme, TwoNumbersWords>; COMMIT_THEN_CHOOSE: Record<LotusTheme, CommitWords>; TRUE_FALSE: Record<LotusTheme, TrueFalseWords> } = {
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
};

export function gameTitle(kind: LotusGameKind, theme: LotusTheme): string {
  return GAME_WORDS[kind][theme].title;
}
