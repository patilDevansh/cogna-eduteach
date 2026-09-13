import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaClient } from "@cogna/database";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private readonly config: ConfigService) {
    super();
  }

  async onModuleInit() {
    if (this.config.get<string>("LOTUS_STANDALONE_DEMO") === "true") return;
    await this.$connect();
  }

  async onModuleDestroy() {
    if (this.config.get<string>("LOTUS_STANDALONE_DEMO") === "true") return;
    await this.$disconnect();
  }
}
