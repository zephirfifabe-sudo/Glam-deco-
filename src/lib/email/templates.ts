// Plain server-rendered HTML templates - no secrets ever interpolated
// here beyond the single-use token that is the email's whole purpose
// (brief §89). Kept intentionally simple for Phase 2; a richer
// templating system can replace this without touching call sites.

function wrapper(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="fr">
  <body style="font-family: sans-serif; color: #1c1917; max-width: 480px; margin: 0 auto; padding: 24px;">
    <h1 style="font-size: 20px;">${title}</h1>
    ${bodyHtml}
    <p style="color: #78716c; font-size: 12px; margin-top: 32px;">
      Glam Déco - Décoration événementielle, Belgique.
    </p>
  </body>
</html>`;
}

export function emailVerificationTemplate(verifyUrl: string) {
  return {
    subject: "Confirmez votre adresse email",
    html: wrapper(
      "Confirmez votre adresse email",
      `<p>Cliquez sur le lien ci-dessous pour confirmer votre adresse email. Ce lien expire dans 24 heures.</p>
       <p><a href="${verifyUrl}">${verifyUrl}</a></p>`,
    ),
  };
}

export function passwordResetTemplate(resetUrl: string) {
  return {
    subject: "Réinitialisation de votre mot de passe",
    html: wrapper(
      "Réinitialisation de votre mot de passe",
      `<p>Une demande de réinitialisation de mot de passe a été effectuée pour ce compte. Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.</p>
       <p>Ce lien expire dans 1 heure.</p>
       <p><a href="${resetUrl}">${resetUrl}</a></p>`,
    ),
  };
}
