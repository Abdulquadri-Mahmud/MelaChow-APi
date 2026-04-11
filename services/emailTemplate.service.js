/**
 * Shared layout and styles for MelaChow Premium Emails.
 * Uses a "logic-first" approach to generate beautiful, responsive HTML
 * without using generic, AI-looking templates.
 */

const THEME = {
  primary: '#F97316', // Orange-600
  secondary: '#111827', // Zinc-900
  accent: '#10B981', // Emerald-500
  error: '#EF4444', // Red-500
  warning: '#F59E0B', // Amber-500
  text: '#374151', // Zinc-700
  lightText: '#6B7280', // Zinc-500
  bg: '#F3F4F6', // Zinc-100
  white: '#FFFFFF',
};

const styles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;900&display=swap');
  
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    background-color: ${THEME.bg};
    margin: 0;
    padding: 0;
    -webkit-font-smoothing: antialiased;
  }
  
  .container {
    max-width: 600px;
    margin: 40px auto;
    background: ${THEME.white};
    border-radius: 24px;
    overflow: hidden;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1);
  }
  
  .header {
    background: ${THEME.secondary};
    padding: 40px 20px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  
  .header-logo {
    font-size: 28px;
    font-weight: 900;
    color: ${THEME.white};
    letter-spacing: -1px;
    text-transform: uppercase;
    font-style: italic;
  }
  
  .header-logo span {
    color: ${THEME.primary};
  }

  .content {
    padding: 48px 40px;
  }

  .h1 {
    font-size: 24px;
    font-weight: 900;
    color: ${THEME.secondary};
    margin: 0 0 16px;
    text-transform: uppercase;
    letter-spacing: -0.5px;
    line-height: 1.2;
  }

  .p {
    font-size: 16px;
    line-height: 1.6;
    color: ${THEME.text};
    margin: 0 0 24px;
  }

  .button {
    display: inline-block;
    background-color: ${THEME.primary};
    color: ${THEME.white} !important;
    padding: 16px 32px;
    border-radius: 16px;
    text-decoration: none;
    font-weight: 700;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 1px;
    box-shadow: 0 4px 14px 0 rgba(249, 115, 22, 0.39);
  }

  .footer {
    background: #F9FAF9;
    padding: 32px 40px;
    text-align: center;
    border-top: 1px solid #E5E7EB;
  }

  .footer-text {
    font-size: 12px;
    color: ${THEME.lightText};
    line-height: 1.5;
    margin: 0;
  }

  .badge {
    display: inline-block;
    padding: 4px 12px;
    border-radius: 100px;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 12px;
  }

  .badge-primary { background: #FFF7ED; color: ${THEME.primary}; }
  .badge-success { background: #ECFDF5; color: ${THEME.accent}; }
  .badge-error { background: #FEF2F2; color: ${THEME.error}; }
  .badge-warning { background: #FFFBEB; color: ${THEME.warning}; }
`;

/**
 * wraps content in the premium MelaChow layout
 */
export const wrapLayout = (title, content, badgeText = 'Official Update') => {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${styles}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="header-logo">Mela<span>Chow</span></div>
          </div>
          <div class="content">
            ${badgeText ? `<div class="badge badge-primary">${badgeText}</div>` : ''}
            <h1 class="h1">${title}</h1>
            ${content}
          </div>
          <div class="footer">
            <p class="footer-text">
              <strong>Need help?</strong> Reply to this email or visit our help center.
            </p>
            <p class="footer-text" style="margin-top: 12px;">
              © ${new Date().getFullYear()} MelaChow Technologies. All rights reserved.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;
};
