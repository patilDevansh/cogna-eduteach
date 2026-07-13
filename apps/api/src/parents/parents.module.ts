import { Module } from "@nestjs/common";
import { ParentsController, AuthController } from "./parents.controller";
import { AuthService, ParentsService } from "./parents.service";

@Module({
  controllers: [ParentsController, AuthController],
  providers: [ParentsService, AuthService],
  exports: [AuthService],
})
export class ParentsModule {}
