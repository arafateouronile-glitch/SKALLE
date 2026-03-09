/**
 * Emails transactionnels d'authentification (reset mot de passe, vérification email)
 *
 * Utilise les variables d'environnement SMTP génériques :
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

interface AuthEmailParams {
  to: string;
  subject: string;
  html: string;
}

async function sendAuthEmail({ to, subject, html }: AuthEmailParams): Promise<boolean> {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  if (!host || !user || !pass) {
    console.warn("[auth-email] SMTP non configuré — email non envoyé");
    return false;
  }

  try {
    const nodemailer = await import("nodemailer");
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({ from, to, subject, html });
    return true;
  } catch (err) {
    console.error("[auth-email] Erreur envoi email:", err);
    return false;
  }
}

const APP_NAME = "Skalle";

// ─── Reset mot de passe ───────────────────────────────────────────────────────

export async function sendForgotPasswordEmail(
  to: string,
  resetUrl: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Réinitialisation de votre mot de passe</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#10b981,#0d9488);padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">${APP_NAME}</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:600">Réinitialiser votre mot de passe</h2>
      <p style="color:#475569;margin:0 0 24px;line-height:1.6">
        Vous avez demandé à réinitialiser votre mot de passe.
        Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.
        Ce lien expire dans <strong>1 heure</strong>.
      </p>
      <a href="${resetUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#10b981,#0d9488);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
        Réinitialiser mon mot de passe
      </a>
      <p style="color:#94a3b8;margin:24px 0 0;font-size:13px;line-height:1.5">
        Si vous n'avez pas demandé cette réinitialisation, ignorez cet email.
        Votre mot de passe actuel reste inchangé.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;margin:0;font-size:12px">
        Lien valide 1 heure · ${APP_NAME} SaaS
      </p>
    </div>
  </div>
</body>
</html>`;

  return sendAuthEmail({
    to,
    subject: `${APP_NAME} — Réinitialisation de votre mot de passe`,
    html,
  });
}

// ─── Vérification email ───────────────────────────────────────────────────────

export async function sendEmailVerificationEmail(
  to: string,
  verifyUrl: string
): Promise<boolean> {
  const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><title>Vérifiez votre email</title></head>
<body style="font-family:system-ui,sans-serif;background:#f8fafc;margin:0;padding:40px 0">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;overflow:hidden">
    <div style="background:linear-gradient(135deg,#7c3aed,#6d28d9);padding:32px 40px;text-align:center">
      <h1 style="margin:0;color:#fff;font-size:24px;font-weight:700">${APP_NAME}</h1>
    </div>
    <div style="padding:40px">
      <h2 style="margin:0 0 12px;color:#0f172a;font-size:20px;font-weight:600">Vérifiez votre adresse email</h2>
      <p style="color:#475569;margin:0 0 24px;line-height:1.6">
        Bienvenue sur ${APP_NAME} ! Cliquez sur le bouton ci-dessous pour vérifier votre
        adresse email et activer votre compte.
        Ce lien expire dans <strong>24 heures</strong>.
      </p>
      <a href="${verifyUrl}"
         style="display:inline-block;background:linear-gradient(135deg,#7c3aed,#6d28d9);color:#fff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px">
        Vérifier mon adresse email
      </a>
      <p style="color:#94a3b8;margin:24px 0 0;font-size:13px;line-height:1.5">
        Si vous n'avez pas créé ce compte, ignorez cet email.
      </p>
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">
      <p style="color:#94a3b8;margin:0;font-size:12px">
        Lien valide 24 heures · ${APP_NAME} SaaS
      </p>
    </div>
  </div>
</body>
</html>`;

  return sendAuthEmail({
    to,
    subject: `${APP_NAME} — Vérifiez votre adresse email`,
    html,
  });
}
