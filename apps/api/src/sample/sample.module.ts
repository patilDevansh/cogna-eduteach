import { Module } from "@nestjs/common";
import { LotusModule } from "../lotus/lotus.module";
import { MailService } from "../mail/mail.service";
import { SampleController } from "./sample.controller";
import { SampleService } from "./sample.service";

@Module({ imports: [LotusModule], controllers: [SampleController], providers: [SampleService, MailService] })
export class SampleModule {}
