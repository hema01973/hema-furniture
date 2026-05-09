// Ambient declaration for nodemailer.
// nodemailer ships its own JS but no bundled TypeScript types.
// The proper fix is `npm i --save-dev @types/nodemailer`, but until that is
// added to the project this shim satisfies the compiler with accurate-enough
// types for the subset of the API used in email.ts.
//
// If @types/nodemailer is ever installed, delete this file — the installed
// package will take precedence and this declaration would conflict.

declare module 'nodemailer' {
  export interface TransportOptions {
    host?: string;
    port?: number;
    secure?: boolean;
    auth?: {
      user?: string;
      pass?: string;
    };
    [key: string]: unknown;
  }

  export interface MailOptions {
    from?: string;
    to?: string | string[];
    cc?: string | string[];
    bcc?: string | string[];
    subject?: string;
    text?: string;
    html?: string;
    attachments?: Array<{
      filename?: string;
      content?: string | Buffer;
      path?: string;
      contentType?: string;
    }>;
    [key: string]: unknown;
  }

  export interface SentMessageInfo {
    messageId: string;
    envelope: { from: string; to: string[] };
    accepted: string[];
    rejected: string[];
    response: string;
    [key: string]: unknown;
  }

  export interface Transporter {
    sendMail(mailOptions: MailOptions): Promise<SentMessageInfo>;
    verify(): Promise<boolean>;
    close(): void;
  }

  export function createTransport(options: TransportOptions): Transporter;

  const nodemailer: {
    createTransport(options: TransportOptions): Transporter;
  };
  export default nodemailer;
}
