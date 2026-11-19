import type { Logger } from "@ballm/platform/logging"
import type { ControlPlaneEnv } from "@ballm/platform/env"

export interface MailInput {
  readonly to: string
  readonly subject: string
  readonly text: string
  readonly html?: string
}

/**
 * Invitation mail is best effort. When SMTP is not configured the control plane still creates the
 * invitation and returns its link, so an operator can deliver it by hand instead of the API
 * pretending to have sent something.
 */
export function createMailer(env: ControlPlaneEnv, logger: Logger) {
  const url = env.BALLM_SMTP_URL
  return {
    configured: Boolean(url),
    async send(input: MailInput) {
      if (!url) return { delivered: false as const, reason: "smtp_not_configured" as const }
      const { default: nodemailer } = await import("nodemailer")
      const transport = nodemailer.createTransport(url)
      try {
        await transport.sendMail({
          from: env.BALLM_MAIL_FROM,
          to: input.to,
          subject: input.subject,
          text: input.text,
          ...(input.html ? { html: input.html } : {}),
        })
        return { delivered: true as const }
      } catch (error) {
        logger.warn("invitation mail failed", { to: input.to, error: error instanceof Error ? error.message : String(error) })
        return { delivered: false as const, reason: "delivery_failed" as const }
      } finally {
        transport.close()
      }
    },
  }
}

export type Mailer = ReturnType<typeof createMailer>
