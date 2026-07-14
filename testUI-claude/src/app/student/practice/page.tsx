"use client";

import PracticeSession from "@/components/PracticeSession";

export default function PracticePage() {
  return (
    <div className="grid-air">
      <PracticeSession mode="adaptive" totalQuestions={8} />
    </div>
  );
}
