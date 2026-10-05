import { Global, Module } from "@nestjs/common";
import { ParentsModule } from "../parents/parents.module";
import { StudentAccessService } from "./student-access.service";

/** Makes StudentAccessService injectable everywhere (it needs the parent Clerk lookup). */
@Global()
@Module({
  imports: [ParentsModule],
  providers: [StudentAccessService],
  exports: [StudentAccessService],
})
export class AccessModule {}
