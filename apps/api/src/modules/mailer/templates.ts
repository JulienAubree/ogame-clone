/**
 * Transactional email templates. Kept as plain strings to avoid pulling in a
 * JSX runtime on the backend. Inline styles for maximum client compatibility.
 */

const BRAND = 'Exilium';
const BG = '#0b1020';
const FG = '#e6e9f2';
const MUTED = '#8b94ab';
const ACCENT = '#7cc5ff';
const BUTTON_BG = '#1e3a8a';

function wrap(title: string, body: string): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${BG};color:${FG};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:32px 0;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#11172e;border:1px solid #1e2544;border-radius:12px;overflow:hidden;">
        <tr><td style="padding:24px 32px;border-bottom:1px solid #1e2544;">
          <div style="font-size:20px;font-weight:700;letter-spacing:0.04em;color:${ACCENT};">${BRAND}</div>
        </td></tr>
        <tr><td style="padding:32px;color:${FG};line-height:1.6;font-size:15px;">
          ${body}
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid #1e2544;color:${MUTED};font-size:12px;">
          Email automatique — ne pas répondre.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;padding:12px 24px;background:${BUTTON_BG};color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">${label}</a>`;
}

export function emailVerificationEmail(params: { username: string; verifyUrl: string; expiresInHours: number }) {
  const subject = 'Vérifiez votre adresse email Exilium';
  const html = wrap(subject, `
    <h2 style="margin:0 0 16px 0;font-size:18px;">Bienvenue ${params.username} !</h2>
    <p>Merci d'avoir rejoint Exilium. Pour finaliser la création de votre compte, confirmez votre adresse email en cliquant sur le bouton ci-dessous&nbsp;:</p>
    <p style="margin:24px 0;">${button(params.verifyUrl, 'Vérifier mon email')}</p>
    <p style="color:${MUTED};font-size:13px;">Ce lien est valable ${params.expiresInHours} heures. Si vous n'êtes pas à l'origine de cette inscription, ignorez simplement cet email.</p>
    <p style="color:${MUTED};font-size:13px;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br/><a href="${params.verifyUrl}" style="color:${ACCENT};">${params.verifyUrl}</a></p>
  `);
  const text = `Bienvenue ${params.username} !

Merci d'avoir rejoint Exilium. Pour finaliser la création de votre compte, vérifiez votre email en ouvrant ce lien (valable ${params.expiresInHours} h) :

${params.verifyUrl}

Si vous n'êtes pas à l'origine de cette inscription, ignorez cet email.`;
  return { subject, html, text };
}

export function passwordResetEmail(params: { username: string; resetUrl: string; expiresInMinutes: number }) {
  const subject = 'Réinitialisation de votre mot de passe Exilium';
  const html = wrap(subject, `
    <h2 style="margin:0 0 16px 0;font-size:18px;">Bonjour ${params.username},</h2>
    <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe&nbsp;:</p>
    <p style="margin:24px 0;">${button(params.resetUrl, 'Réinitialiser mon mot de passe')}</p>
    <p style="color:${MUTED};font-size:13px;">Ce lien est valable ${params.expiresInMinutes} minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez simplement cet email — votre mot de passe actuel reste inchangé.</p>
    <p style="color:${MUTED};font-size:13px;word-break:break-all;">Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur&nbsp;:<br/><a href="${params.resetUrl}" style="color:${ACCENT};">${params.resetUrl}</a></p>
  `);
  const text = `Bonjour ${params.username},

Vous avez demandé à réinitialiser votre mot de passe Exilium.
Ouvrez ce lien pour choisir un nouveau mot de passe (valable ${params.expiresInMinutes} min) :

${params.resetUrl}

Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.`;
  return { subject, html, text };
}
