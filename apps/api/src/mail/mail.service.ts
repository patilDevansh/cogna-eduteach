import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { isProductionLike } from "../access/cogna-access";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export type MailResult = "SENT" | "NOT_CONFIGURED" | "FAILED";

/**
 * Sends Cogna's email (parent invites today) over SMTP. The pilot uses the
 * cogna.eduteach@gmail.com mailbox with a Gmail app password:
 *   SMTP_USER=cogna.eduteach@gmail.com  SMTP_PASS=<16-character app password>
 * SMTP_HOST / SMTP_PORT default to Gmail (smtp.gmail.com:465), MAIL_FROM to "Cogna <SMTP_USER>".
 * Unconfigured, nothing is sent; locally the message is written to the log so the flow can be tried.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport: Transporter | null;
  private readonly from: string;

  constructor() {
    const env = process.env;
    const user = env.SMTP_USER?.trim();
    const pass = env.SMTP_PASS?.replace(/\s+/g, "");
    const port = Number(env.SMTP_PORT ?? 465);
    this.from = env.MAIL_FROM?.trim() || `Cogna <${user ?? "cogna.eduteach@gmail.com"}>`;
    this.transport = user && pass
      ? createTransport({ host: env.SMTP_HOST?.trim() || "smtp.gmail.com", port, secure: port === 465, auth: { user, pass } })
      : null;
  }

  configured(): boolean {
    return Boolean(this.transport);
  }

  /** Never throws: a failed email must not fail the class action that sent it. */
  async send(message: MailMessage): Promise<MailResult> {
    if (!this.transport) {
      if (!isProductionLike()) this.logger.log(`Email not configured (set SMTP_USER and SMTP_PASS). Would send to ${message.to}: ${message.subject}\n${message.text}`);
      else this.logger.warn("Email not configured: set SMTP_USER and SMTP_PASS.");
      return "NOT_CONFIGURED";
    }
    try {
      await this.transport.sendMail({ from: this.from, ...message });
      return "SENT";
    } catch (error) {
      this.logger.error(`Email to a parent failed: ${error instanceof Error ? error.message : String(error)}`);
      return "FAILED";
    }
  }
}
