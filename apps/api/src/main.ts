import { HttpAdapterHost, NestFactory } from "@nestjs/core";
import { ValidationPipe, Logger } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { rateLimitMiddleware } from "./rate-limit.middleware";
import { allowedWebOrigins } from "./web-origins";
import { isProductionLike, sessionSecretFromEnv } from "./access/cogna-access";
import { SentryExceptionFilter, initSentry } from "./observability/sentry";

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
  const webOrigins = allowedWebOrigins(); // throws in production without WEB_URL, before anything starts
  if (isProductionLike() && !sessionSecretFromEnv()) {
    throw new Error("COGNA_SESSION_SECRET must be set in production, or no student or teacher can sign in.");
  }
  const sentryActive = initSentry();
  const app = await NestFactory.create(AppModule);
  if (sentryActive) app.useGlobalFilters(new SentryExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  else bootLogger.warn("SENTRY_DSN is not set: production errors will not notify anyone.");

  // Behind a load balancer req.ip is the balancer unless the proxy hop is trusted (set COGNA_TRUST_PROXY=true).
  if (process.env.COGNA_TRUST_PROXY === "true") app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(rateLimitMiddleware);

  app.enableCors({
    origin: webOrigins,
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
  // The API docs list every route: useful locally, an attack map in production.
  if (!isProductionLike()) SwaggerModule.setup("docs", app, SwaggerModule.createDocument(app, swagger));

  const port = process.env.PORT ?? 3001;
  await app.listen(port);
}

bootstrap().catch((err) => {
  bootLogger.error(`bootstrap failed: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
