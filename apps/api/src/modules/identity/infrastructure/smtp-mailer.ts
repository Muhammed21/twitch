import { createTransport } from "nodemailer";

export type OutgoingEmail = {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
};

export type Mailer = { readonly send: (email: OutgoingEmail) => Promise<void> };

export const createSmtpMailer = ({
  host,
  port,
  from,
}: {
  host: string;
  port: number;
  from: string;
}): Mailer => {
  const transport = createTransport({ host, port, secure: false });
  return {
    send: async ({ to, subject, text }) => {
      await transport.sendMail({ from, to, subject, text });
    },
  };
};
