import { Body, Controller, Get, Headers, Post, Req, type RawBodyRequest } from "@nestjs/common";
import type { Request } from "express";
import { IsBoolean, IsEmail, IsOptional, IsString, Length } from "class-validator";
import { SampleService } from "./sample.service";

class StartSampleDto {
  @IsEmail() parentEmail!: string;
  @IsString() @Length(2, 40) childName!: string;
  @IsBoolean() consent!: boolean;
}

class VerifyPaymentDto {
  @IsString() orderId!: string;
  @IsString() paymentId!: string;
  @IsString() signature!: string;
}

class Empty {
  @IsOptional() @IsString() note?: string;
}

/**
 * The public sample test (marketing links): no sign-in. The private link token travels in the
 * x-sample-token header, never in a URL path, so it stays out of access logs.
 */
@Controller("sample")
export class SampleController {
  constructor(private readonly sample: SampleService) {}

  @Get("price")
  price() {
    return { price: this.sample.price(), currency: "INR" };
  }

  @Post("start")
  start(@Body() body: StartSampleDto, @Req() req: Request) {
    return this.sample.start(body, req.ip ?? "unknown");
  }

  @Get("attempt")
  status(@Headers("x-sample-token") token?: string) {
    return this.sample.status(token ?? "");
  }

  @Post("order")
  order(@Headers("x-sample-token") token: string | undefined, @Body() _body: Empty) {
    return this.sample.order(token ?? "");
  }

  @Post("verify")
  verify(@Headers("x-sample-token") token: string | undefined, @Body() body: VerifyPaymentDto) {
    return this.sample.verify(token ?? "", body);
  }

  /** Local testing only (refused in production and whenever Razorpay is configured). */
  @Post("test-pay")
  testPay(@Headers("x-sample-token") token: string | undefined, @Body() _body: Empty) {
    return this.sample.testPay(token ?? "");
  }

  /** Point Razorpay's webhook (payment.captured, order.paid) here: POST /sample/razorpay-webhook. */
  @Post("razorpay-webhook")
  webhook(@Req() req: RawBodyRequest<Request>, @Headers("x-razorpay-signature") signature?: string) {
    return this.sample.webhook(req.rawBody, signature);
  }
}
