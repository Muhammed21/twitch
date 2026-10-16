export const EMAIL_CODE = { length: 6, lifetimeSeconds: 300 } as const;

export type EmailCodePurpose =
  | "sign-in"
  | "email-verification"
  | "forget-password"
  | "change-email";

export type EmailMessage = { readonly subject: string; readonly text: string };

const SUBJECTS: Readonly<Record<EmailCodePurpose, string>> = {
  "email-verification": "Your Twitch verification code",
  "forget-password": "Your Twitch password reset code",
  "sign-in": "Your Twitch verification code",
  "change-email": "Your Twitch verification code",
};

export const emailCodeMessage = ({
  code,
  purpose,
}: {
  code: string;
  purpose: EmailCodePurpose;
}): EmailMessage => ({
  subject: SUBJECTS[purpose],
  text: `Your verification code is ${code}. It expires in ${EMAIL_CODE.lifetimeSeconds / 60} minutes. If you didn't request it, you can ignore this email.`,
});
