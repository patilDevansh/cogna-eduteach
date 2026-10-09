import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConfigService } from "@nestjs/config";
import { TeacherInvitationsService } from "../../src/teachers/teacher-invitations.service";

const service = (invitations?: string) =>
  new TeacherInvitationsService(new ConfigService(invitations ? { TEACHER_PILOT_INVITATIONS: invitations } : {}));

describe("teacher invitations — the public demo code", () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    if (prev === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prev;
  });

  it("works locally when no invitations are configured", () => {
    process.env.NODE_ENV = "development";
    assert.equal(service().claim("ananya@gurukul.edu", "GURUKUL-2026").schoolId, "gurukul-pilot");
  });

  it("is refused in production, whether the list is missing or malformed", () => {
    process.env.NODE_ENV = "production";
    assert.throws(() => service().claim("ananya@gurukul.edu", "GURUKUL-2026"));
    assert.throws(() => service("not json").claim("ananya@gurukul.edu", "GURUKUL-2026"));
  });

  it("configured invitations still work in production", () => {
    process.env.NODE_ENV = "production";
    const list = JSON.stringify([
      { email: "t@school.in", code: "SCHOOL-X", teacherName: "T", schoolId: "school-x", schoolName: "School X" },
    ]);
    assert.equal(service(list).claim("T@School.in", "school-x").schoolId, "school-x");
  });
});
