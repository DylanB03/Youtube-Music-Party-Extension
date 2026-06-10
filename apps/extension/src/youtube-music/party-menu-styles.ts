export const PARTY_MENU_STYLES = `
  :host {
    display: block;
    font-family: Roboto, Arial, sans-serif;
  }

  button {
    align-items: center;
    background: transparent;
    border: 0;
    color: var(--ytmusic-text-primary, #fff);
    cursor: pointer;
    display: flex;
    gap: 16px;
    min-height: 48px;
    padding: 8px 16px;
    text-align: left;
    width: 100%;
  }

  button:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }

  button[data-state="added"] {
    color: #ffca28;
  }

  .icon {
    align-items: center;
    border: 1px solid currentColor;
    border-radius: 50%;
    display: inline-flex;
    flex: 0 0 22px;
    font-size: 20px;
    height: 22px;
    justify-content: center;
    line-height: 1;
  }

  .copy {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  strong {
    font-size: 14px;
    font-weight: 500;
  }

  small {
    font-size: 11px;
    line-height: 1.25;
    max-width: 260px;
    opacity: 0.72;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
