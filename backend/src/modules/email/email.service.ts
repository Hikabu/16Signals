import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailService {
  private resend: Resend;
  private readonly logger = new Logger(EmailService.name);

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (apiKey) {
      this.resend = new Resend(apiKey);
    } else {
      this.logger.warn(
        'RESEND_API_KEY is not defined. Email service will run in stub mode.',
      );
    }
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (!this.resend) {
      this.logger.log(
        `[MAIL STUB] To: ${to}, Subject: ${subject}, Content: ${html}`,
      );
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: this.configService.get<string>('RESEND_FROM') || 'mail.16signals.com',
        to: [to],
        subject,
        html,
      });

      if (error) {
        this.logger.error(`Failed to send email to ${to}: ${error.message}`);
        throw error;
      }

      this.logger.log(`Email sent to ${to}, ID: ${data?.id}`);
      return data;
    } catch (error) {
      this.logger.error(`Error sending email to ${to}: ${error.message}`);
      throw error;
    }
  }
}
