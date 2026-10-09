import { createTransport } from 'nodemailer';

export interface Mail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type SendMail = (mail: Mail) => Promise<void>;

// Lokaal en in de runner: Mailpit (framework §3, poort E-mail). Per app een SMTP-dienst via SMTP_URL.
export function createSmtpMailer(smtpUrl: string, from: string): SendMail {
  const transport = createTransport(smtpUrl);
  return async (mail) => {
    await transport.sendMail({ from, ...mail });
  };
}
