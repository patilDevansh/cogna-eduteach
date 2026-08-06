import { NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

const bootLogger = new Logger("Bootstrap");

/** Leave a trail if something escapes Nest's request-scoped try/catch (AI fail-closed paths must never take down the process). */
process.on("unhandledRejection", (reason) => {
  bootLogger.error(
    `unhandledRejection (process stays up): ${reason instanceof Error ? reason.stack ?? reason.message : String(reason)}`,
  );
});
process.on("uncaughtException", (err) => {
  bootLogger.error(`uncaughtException: ${err.stack ?? err.message}`);
});

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle("Cogna API")
    .setDescription("AI Cognitive Learning Engine")
    .setVersion("0.0.1")
    .build();
  SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap().catch((err) => {
  bootLogger.error(`bootstrap failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
