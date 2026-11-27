# StallCount auth email templates

Paste into Supabase: **Authentication → Emails → Templates**. For each template, set the subject and replace the whole body with the HTML below (Source tab), then **Save changes**.

Every link goes to `/auth/confirm` with a `token_hash`, which the app verifies only when the page opens. This stops email link scanners from using up the one-time link before the person clicks it.

Generated from one layout so the four stay alike; to change the look, change it in all four.

## Invite user

**Subject:** You're invited to StallCount

```html
<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:#f5fbf6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbf6;padding:32px 16px;font-family:'Plus Jakarta Sans',Inter,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe9e2;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0a3d29;padding:20px 32px;border-bottom:3px solid #c6ff62;">
            <span style="font-size:24px;line-height:32px;font-weight:800;color:#ffffff;letter-spacing:0.2px;">StallCount</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;color:#0b1f19;">You're invited to StallCount</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">An account has been created for you on StallCount, so you can help run matches and events.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">Choose a password to finish setting it up. You'll sign in with this email address: <strong>{{ .Email }}</strong>.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
            <tr>
              <td style="background:#0a3d29;border-radius:8px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Set your password</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">This link can be used once and expires after 24 hours. If it has expired, ask the person who invited you to send a new one.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">If you weren't expecting this, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #dfe9e2;font-size:12px;line-height:18px;color:#4a5f57;">
            StallCount: live scores, schedules and stats for ultimate frisbee.<br>
            <a href="{{ .SiteURL }}" style="color:#4a5f57;">stallcount.vercel.app</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

## Reset password

**Subject:** Reset your StallCount password

```html
<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:#f5fbf6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbf6;padding:32px 16px;font-family:'Plus Jakarta Sans',Inter,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe9e2;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0a3d29;padding:20px 32px;border-bottom:3px solid #c6ff62;">
            <span style="font-size:24px;line-height:32px;font-weight:800;color:#ffffff;letter-spacing:0.2px;">StallCount</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;color:#0b1f19;">Reset your password</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">We received a request to reset the password for <strong>{{ .Email }}</strong>.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">Choose a new password using the button below.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
            <tr>
              <td style="background:#0a3d29;border-radius:8px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Choose a new password</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">This link can be used once and expires after 1 hour. You can request a new one from the sign-in page.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">If you didn't ask to reset your password, you can ignore this email. Your password won't change.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #dfe9e2;font-size:12px;line-height:18px;color:#4a5f57;">
            StallCount: live scores, schedules and stats for ultimate frisbee.<br>
            <a href="{{ .SiteURL }}" style="color:#4a5f57;">stallcount.vercel.app</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

## Change email address

**Subject:** Confirm your new StallCount email address

```html
<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:#f5fbf6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbf6;padding:32px 16px;font-family:'Plus Jakarta Sans',Inter,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe9e2;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0a3d29;padding:20px 32px;border-bottom:3px solid #c6ff62;">
            <span style="font-size:24px;line-height:32px;font-weight:800;color:#ffffff;letter-spacing:0.2px;">StallCount</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;color:#0b1f19;">Confirm your new email address</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">You asked to change the email address on your StallCount account from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.</p>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">Confirm the change using the button below.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
            <tr>
              <td style="background:#0a3d29;border-radius:8px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Confirm email address</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">If a confirmation was also sent to your other address, confirm that one too.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">If you didn't ask for this change, don't click the button, and sign in to check your account.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #dfe9e2;font-size:12px;line-height:18px;color:#4a5f57;">
            StallCount: live scores, schedules and stats for ultimate frisbee.<br>
            <a href="{{ .SiteURL }}" style="color:#4a5f57;">stallcount.vercel.app</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```

## Confirm sign up

**Subject:** Confirm your StallCount account

```html
<!doctype html>
<html lang="en-GB">
<body style="margin:0;padding:0;background:#f5fbf6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5fbf6;padding:32px 16px;font-family:'Plus Jakarta Sans',Inter,'Segoe UI',Helvetica,Arial,sans-serif;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe9e2;border-radius:12px;overflow:hidden;">
        <tr>
          <td style="background:#0a3d29;padding:20px 32px;border-bottom:3px solid #c6ff62;">
            <span style="font-size:24px;line-height:32px;font-weight:800;color:#ffffff;letter-spacing:0.2px;">StallCount</span>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
          <h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:700;color:#0b1f19;">Confirm your email address</h1>
          <p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#0b1f19;">Thanks for creating a StallCount account. Confirm that <strong>{{ .Email }}</strong> is your email address to finish signing up.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
            <tr>
              <td style="background:#0a3d29;border-radius:8px;">
                <a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email" style="display:inline-block;padding:12px 24px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;">Confirm email address</a>
              </td>
            </tr>
          </table>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">This link can be used once and expires after 24 hours.</p>
          <p style="margin:0 0 12px;font-size:14px;line-height:21px;color:#4a5f57;">If you didn't create an account, you can ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 32px;border-top:1px solid #dfe9e2;font-size:12px;line-height:18px;color:#4a5f57;">
            StallCount: live scores, schedules and stats for ultimate frisbee.<br>
            <a href="{{ .SiteURL }}" style="color:#4a5f57;">stallcount.vercel.app</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>
```
