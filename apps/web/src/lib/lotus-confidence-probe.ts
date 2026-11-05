/** Whether an optional confidence check has a reason and is not too repetitive. */
export function shouldAskLotusConfidence(
  eligible: boolean,
  didNotKnow: boolean,
  recentStatuses: readonly (string | undefined)[],
): boolean {
  return eligible && !didNotKnow && !recentStatuses.slice(-2).some(
    (status) => status === "REPORTED_BEFORE_ANSWER" || status === "SKIPPED",
  );
}
