/**
 * Fresh demo student per login — Part 4 of diagnostic-v2 provenance work.
 * Clones accumulate on purpose; the template is never returned when the env
 * gate is on (unless reuseTemplate is set).
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { AuthService } from "../../src/parents/parents.service";
import {
  DEMO_STUDENT_NAME,
  DEMO_STUDENT_TEMPLATE_ID,
  isDemoFreshStudentPerLoginEnabled,
  isDemoStudent,
} from "../../src/engines/diagnostic-v2/demo-student";
import type { PrismaService } from "../../src/prisma/prisma.service";
import type { ClerkAuthService } from "../../src/parents/clerk-auth.service";

function hashAccessCode(code: string): string {
  return createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
}

describe("isDemoStudent", () => {
  it("is true for the template id and for a demo_ clone, false otherwise", () => {
    assert.equal(isDemoStudent(DEMO_STUDENT_TEMPLATE_ID), true);
    assert.equal(isDemoStudent("demo_abc123"), true);
    assert.equal(isDemoStudent("student-real-001"), false);
    assert.equal(isDemoStudent("dev_student_002"), false);
  });
});

describe("isDemoFreshStudentPerLoginEnabled", () => {
  it("defaults on outside production and respects an explicit false", () => {
    assert.equal(isDemoFreshStudentPerLoginEnabled({ NODE_ENV: "development" }), true);
    assert.equal(
      isDemoFreshStudentPerLoginEnabled({ NODE_ENV: "development", DEMO_FRESH_STUDENT_PER_LOGIN: "false" }),
      false,
    );
    assert.equal(isDemoFreshStudentPerLoginEnabled({ NODE_ENV: "production" }), false);
    assert.equal(
      isDemoFreshStudentPerLoginEnabled({ NODE_ENV: "production", DEMO_FRESH_STUDENT_PER_LOGIN: "true" }),
      true,
    );
  });
});

type StudentRow = {
  id: string;
  name: string;
  grade: number;
  curriculum: string;
  primaryParentId: string;
  accessCodeHash: string;
  deletedAt: Date | null;
  createdAt: Date;
};

function makeAuthHarness() {
  const students: StudentRow[] = [
    {
      id: DEMO_STUDENT_TEMPLATE_ID,
      name: DEMO_STUDENT_NAME,
      grade: 8,
      curriculum: "CBSE",
      primaryParentId: "parent-demo",
      accessCodeHash: hashAccessCode("demo1234"),
      deletedAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ];
  const links: Array<{
    parentId: string;
    studentId: string;
    relationship: string;
    canViewReports: boolean;
  }> = [
    {
      parentId: "parent-demo",
      studentId: DEMO_STUDENT_TEMPLATE_ID,
      relationship: "parent",
      canViewReports: true,
    },
  ];
  const sessions: Array<{ id: string; studentId: string }> = [];
  const states: Array<{ studentId: string; microSkillId: string }> = [];

  const prisma = {
    student: {
      async findFirst({ where }: { where: { accessCodeHash?: string; deletedAt?: null; id?: { startsWith?: string } } }) {
        return (
          students.find((s) => {
            if (where.accessCodeHash && s.accessCodeHash !== where.accessCodeHash) return false;
            if (where.deletedAt === null && s.deletedAt !== null) return false;
            return true;
          }) ?? null
        );
      },
      async findMany({
        where,
        orderBy,
      }: {
        where?: { id?: { startsWith?: string }; deletedAt?: null };
        orderBy?: { createdAt: "asc" | "desc" };
        select?: unknown;
      }) {
        let rows = students.filter((s) => {
          if (where?.deletedAt === null && s.deletedAt !== null) return false;
          if (where?.id?.startsWith && !s.id.startsWith(where.id.startsWith)) return false;
          return true;
        });
        if (orderBy?.createdAt === "asc") {
          rows = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        }
        return rows.map((c) => ({
          id: c.id,
          name: c.name,
          createdAt: c.createdAt,
          _count: { diagnosticV2Sessions: sessions.filter((s) => s.studentId === c.id).length },
        }));
      },
      async create({ data }: { data: Omit<StudentRow, "createdAt" | "deletedAt"> & { deletedAt?: null } }) {
        const row: StudentRow = {
          ...data,
          deletedAt: null,
          createdAt: new Date(),
        };
        students.push(row);
        return row;
      },
    },
    parentStudentLink: {
      async findUnique({
        where,
      }: {
        where: { parentId_studentId: { parentId: string; studentId: string } };
      }) {
        const { parentId, studentId } = where.parentId_studentId;
        return links.find((l) => l.parentId === parentId && l.studentId === studentId) ?? null;
      },
      async create({
        data,
      }: {
        data: { parentId: string; studentId: string; relationship: string; canViewReports: boolean };
      }) {
        links.push(data);
        return data;
      },
    },
    microSkillStateV2: {
      async findMany({ where }: { where: { studentId: string } }) {
        return states.filter((s) => s.studentId === where.studentId);
      },
    },
    diagnosticV2Session: {
      async findMany({ where }: { where: { studentId: string } }) {
        return sessions.filter((s) => s.studentId === where.studentId);
      },
    },
  };

  const clerk = {} as ClerkAuthService;
  const auth = new AuthService(prisma as unknown as PrismaService, clerk);
  return { auth, students, links, sessions, states };
}

describe("AuthService.studentLogin — fresh demo student", () => {
  const prevFlag = process.env.DEMO_FRESH_STUDENT_PER_LOGIN;
  const prevNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.DEMO_FRESH_STUDENT_PER_LOGIN = "true";
    process.env.NODE_ENV = "development";
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.DEMO_FRESH_STUDENT_PER_LOGIN;
    else process.env.DEMO_FRESH_STUDENT_PER_LOGIN = prevFlag;
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
  });

  it("demo login twice yields two different studentIds both named Demo Student", async () => {
    const { auth, students } = makeAuthHarness();
    const a = await auth.studentLogin("demo1234");
    const b = await auth.studentLogin("demo1234");
    assert.notEqual(a.studentId, b.studentId);
    assert.equal(a.name, DEMO_STUDENT_NAME);
    assert.equal(b.name, DEMO_STUDENT_NAME);
    assert.ok(isDemoStudent(a.studentId));
    assert.ok(isDemoStudent(b.studentId));
    assert.ok(students.every((s) => s.id === DEMO_STUDENT_TEMPLATE_ID || s.accessCodeHash !== students[0]!.accessCodeHash || s.id === DEMO_STUDENT_TEMPLATE_ID));
    // Template is never returned.
    assert.notEqual(a.studentId, DEMO_STUDENT_TEMPLATE_ID);
    assert.notEqual(b.studentId, DEMO_STUDENT_TEMPLATE_ID);
  });

  it("a freshly minted demo student has no MicroSkillStateV2 rows and no sessions", async () => {
    const { auth, states, sessions } = makeAuthHarness();
    const login = await auth.studentLogin("demo1234");
    assert.equal(states.filter((s) => s.studentId === login.studentId).length, 0);
    assert.equal(sessions.filter((s) => s.studentId === login.studentId).length, 0);
  });

  it("evidence written during one demo run is invisible to the next demo login", async () => {
    const { auth, states } = makeAuthHarness();
    const first = await auth.studentLogin("demo1234");
    states.push({ studentId: first.studentId, microSkillId: "LIN_REMOVE_COEFFICIENT" });
    const second = await auth.studentLogin("demo1234");
    assert.notEqual(first.studentId, second.studentId);
    assert.equal(states.filter((s) => s.studentId === second.studentId).length, 0);
    assert.equal(states.filter((s) => s.studentId === first.studentId).length, 1);
  });

  it("clone accessCodeHash values are unique; login stays deterministic after many clones", async () => {
    const { auth, students } = makeAuthHarness();
    const ids: string[] = [];
    for (let i = 0; i < 8; i++) {
      const login = await auth.studentLogin("demo1234");
      ids.push(login.studentId);
    }
    assert.equal(new Set(ids).size, 8);
    const hashes = students.map((s) => s.accessCodeHash);
    assert.equal(new Set(hashes).size, hashes.length);
    // Template hash still resolves only the template for findFirst — clones never share it.
    const templateHash = hashAccessCode("demo1234");
    assert.equal(students.filter((s) => s.accessCodeHash === templateHash).length, 1);
  });

  it("with the env flag off, login returns the template exactly as today", async () => {
    process.env.DEMO_FRESH_STUDENT_PER_LOGIN = "false";
    const { auth } = makeAuthHarness();
    const login = await auth.studentLogin("demo1234");
    assert.equal(login.studentId, DEMO_STUDENT_TEMPLATE_ID);
    assert.equal(login.name, DEMO_STUDENT_NAME);
  });

  it("reuseTemplate: true still reaches the seeded template while the flag is on", async () => {
    const { auth } = makeAuthHarness();
    const login = await auth.studentLogin("demo1234", { reuseTemplate: true });
    assert.equal(login.studentId, DEMO_STUDENT_TEMPLATE_ID);
  });

  it("listDemoRuns returns clones in creation order with session counts", async () => {
    const { auth, sessions } = makeAuthHarness();
    const a = await auth.studentLogin("demo1234");
    const b = await auth.studentLogin("demo1234");
    sessions.push({ id: "sess-1", studentId: a.studentId });
    sessions.push({ id: "sess-2", studentId: a.studentId });
    const runs = await auth.listDemoRuns();
    assert.equal(runs.length, 2);
    assert.equal(runs[0]!.studentId, a.studentId);
    assert.equal(runs[1]!.studentId, b.studentId);
    assert.equal(runs[0]!.runLabel, "Demo Student 1");
    assert.equal(runs[1]!.runLabel, "Demo Student 2");
    assert.equal(runs[0]!.sessionCount, 2);
    assert.equal(runs[1]!.sessionCount, 0);
    assert.equal(runs[0]!.name, DEMO_STUDENT_NAME);
  });
});
