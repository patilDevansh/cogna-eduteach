import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(studentId: string): Promise<unknown> {
    return this.prisma.learnerProfile.findUniqueOrThrow({
      where: { studentId },
    });
  }

  async getMastery(studentId: string): Promise<unknown> {
    return this.prisma.masteryScore.findMany({
      where: { studentId },
      include: { concept: true },
    });
  }
}
