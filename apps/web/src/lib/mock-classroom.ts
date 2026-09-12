export interface MockClassroomProfile {
  teacherName: string;
  schoolName: string;
  grade: string;
  className: string;
  subject: string;
  shareCode: string;
}

export interface MockStudentEnrollment {
  studentId: string;
  fullName: string;
  rollNumber: string;
  admissionNumber?: string;
  classCode: string;
  className: string;
  grade: string;
  teacherName: string;
}

export const MOCK_CLASSROOM: MockClassroomProfile = {
  teacherName: "Ananya Rao — Demo",
  schoolName: "Gurukul",
  grade: "Grade 8",
  className: "Grade 8 · Section A",
  subject: "Mathematics",
  shareCode: "GURU-8A",
};

const CLASSROOM_KEY = "cogna_mock_classroom";
const ENROLLMENT_KEY = "cogna_mock_student_enrollment";
const ENROLLMENT_LIST_KEY = "cogna_mock_class_enrollments";

export function saveMockClassroom(profile: MockClassroomProfile) {
  localStorage.setItem(CLASSROOM_KEY, JSON.stringify(profile));
}

export function getMockClassroom(): MockClassroomProfile {
  if (typeof window === "undefined") return MOCK_CLASSROOM;
  const raw = localStorage.getItem(CLASSROOM_KEY);
  if (!raw) return MOCK_CLASSROOM;
  try {
    return { ...MOCK_CLASSROOM, ...JSON.parse(raw) } as MockClassroomProfile;
  } catch {
    return MOCK_CLASSROOM;
  }
}

export function saveMockEnrollment(enrollment: MockStudentEnrollment) {
  localStorage.setItem(ENROLLMENT_KEY, JSON.stringify(enrollment));

  const raw = localStorage.getItem(ENROLLMENT_LIST_KEY);
  let existing: MockStudentEnrollment[] = [];
  try {
    existing = raw ? JSON.parse(raw) : [];
  } catch {
    existing = [];
  }

  const withoutSameRoll = existing.filter(
    (item) => item.classCode !== enrollment.classCode || item.rollNumber !== enrollment.rollNumber,
  );
  localStorage.setItem(ENROLLMENT_LIST_KEY, JSON.stringify([...withoutSameRoll, enrollment]));
}

export function getMockEnrollment(): MockStudentEnrollment | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(ENROLLMENT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MockStudentEnrollment;
  } catch {
    return null;
  }
}

export function getMockEnrollments(): MockStudentEnrollment[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(ENROLLMENT_LIST_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as MockStudentEnrollment[];
  } catch {
    return [];
  }
}
