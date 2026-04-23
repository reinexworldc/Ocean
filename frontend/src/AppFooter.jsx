import { useEffect, useRef, useState } from 'react';

import './AppFooter.css';

function getPromptText(disabled, isSending, walletState) {
  if (isSending) {
    return 'Sending message...';
  }

  if (!disabled) {
    return 'Ask Ocean...';
  }

  if (walletState === 'connecting') {
    return 'Connecting wallet...';
  }

  if (walletState === 'authenticating') {
    return 'Check wallet and sign message...';
  }

  if (walletState === 'readyToSign') {
    return 'Finish wallet sign-in to chat...';
  }

  return 'Connect wallet to chat...';
}

function AppFooter({ onSubmit, disabled, isSending, walletState, walletError }) {
  const [value, setValue] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const textareaRef = useRef(null);
  const promptText = getPromptText(disabled, isSending, walletState);
  const displayError = submitError || (disabled ? walletError?.message ?? '' : '');

  useEffect(() => {
    if (!disabled && !isSending) {
      textareaRef.current?.focus();
    }
  }, [disabled, isSending]);

  // Auto-grow: reset to 1-row height, then expand to fit content.
  function adjustHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  function handleChange(event) {
    setValue(event.target.value);
    adjustHeight();
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const trimmedValue = value.trim();
    if (!trimmedValue || disabled || isSending) {
      return;
    }

    setSubmitError('');
    setValue('');

    // Reset height after clearing value.
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    });

    try {
      await onSubmit(trimmedValue);
    } catch (error) {
      setValue(trimmedValue);
      requestAnimationFrame(adjustHeight);
      setSubmitError(error instanceof Error ? error.message : 'Failed to send message.');
    } finally {
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(event) {
    // Submit on Enter; Shift+Enter inserts a newline.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit(event);
    }
  }

  return (
    <footer className="app-footer">
      <div className="app-footer__inner">
        <form className="app-footer__form" onSubmit={handleSubmit}>
          <div className="app-footer__inputContainer">
            {value.length === 0 && !isFocused && (
              <div className="app-footer__inputIcon" aria-hidden="true" />
            )}
            <textarea
              ref={textareaRef}
              className="app-footer__input"
              value={value}
              rows={1}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || isSending}
              placeholder={promptText}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
            />
          </div>
        </form>

        {displayError ? <div className="app-footer__error">{displayError}</div> : null}
      </div>
    </footer>
  );
}

export default AppFooter;
