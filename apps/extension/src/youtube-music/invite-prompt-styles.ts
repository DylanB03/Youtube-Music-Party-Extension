export const INVITE_PROMPT_STYLES = `
  :host {
    bottom: 24px;
    display: block;
    font-family: Roboto, Arial, sans-serif;
    position: fixed;
    right: 24px;
    width: min(380px, calc(100vw - 32px));
    z-index: 2147483647;
  }

  .prompt {
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 20px;
    background:
      radial-gradient(circle at 92% 8%, rgba(255, 202, 40, 0.26), transparent 34%),
      #171717;
    box-shadow: 0 20px 70px rgba(0, 0, 0, 0.48);
    color: #fff;
    padding: 20px;
  }

  .eyebrow {
    color: #ffca28;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    margin: 0 0 8px;
    text-transform: uppercase;
  }

  h2 {
    font-size: 22px;
    line-height: 1.05;
    margin: 0;
  }

  p {
    color: #c8c8c8;
    font-size: 13px;
    line-height: 1.45;
    margin: 10px 0 16px;
  }

  .code {
    border-radius: 10px;
    background: #2b2b2b;
    color: #ffca28;
    font-family: monospace;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: 0.18em;
    margin-bottom: 14px;
    padding: 10px 12px;
    text-align: center;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  button {
    border: 0;
    border-radius: 999px;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    padding: 10px 14px;
  }

  .open {
    background: #ff0033;
    color: white;
    flex: 1;
  }

  .dismiss {
    background: #333;
    color: #ddd;
  }

  button:disabled {
    cursor: wait;
    opacity: 0.65;
  }

  .error {
    color: #ff9a9a;
    margin-bottom: 0;
  }

  @media (max-width: 520px) {
    :host {
      bottom: 16px;
      left: 16px;
      right: 16px;
      width: auto;
    }
  }
`;
