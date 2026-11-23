/**
 * RS-NEWSLETTER-BRANDING-EXPORT-008 R1: wires the shared newsletter placement rendered by BaseLayout.
 * Only https://statistics.reltroner.com sends (one consented POST to Reltroner Studio per submit); every
 * other host is a preview that validates locally and sends nothing. Nothing is submitted on load,
 * hydration or prefetch, and diagnostics never contain the address.
 */
import { createNewsletterClient, diagnosticOf, newsletterMode, previewOutcome, validateSubscription, type Outcome } from './newsletter-client.ts';

const LIVE_TEXT = 'With your consent, this form sends your address to Reltroner Studio’s newsletter service, which holds the subscription. Studio’s reply is shown below the button.';
const PREVIEW_TEXT = 'Preview: this copy of the site is not statistics.reltroner.com, so the form only checks your input and sends nothing. You can subscribe on Reltroner Studio instead.';
const LIVE_LABEL = 'Subscribe to Studio updates';
const PREVIEW_LABEL = 'Preview newsletter opt-in';

function init(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>('form[data-newsletter-form]');
  const email = root.querySelector<HTMLInputElement>('#rs-newsletter-email');
  const consent = root.querySelector<HTMLInputElement>('#rs-newsletter-consent');
  const button = root.querySelector<HTMLButtonElement>('[data-newsletter-submit]');
  const feedback = root.querySelector<HTMLElement>('#rs-newsletter-feedback');
  const modeText = root.querySelector<HTMLElement>('#rs-newsletter-mode');
  if (!form || !email || !consent || !button || !feedback || !modeText) return;

  const mode = newsletterMode(window.location);
  const label = mode === 'live' ? LIVE_LABEL : PREVIEW_LABEL;
  root.dataset.newsletterMode = mode;
  modeText.textContent = mode === 'live' ? LIVE_TEXT : PREVIEW_TEXT;
  modeText.dataset.tone = mode === 'live' ? '' : 'unavailable';
  button.textContent = label;
  button.disabled = false;
  const client = createNewsletterClient();
  let confirmedAddress = '';

  const markInvalid = (field: 'email' | 'consent' | null) => {
    email.setAttribute('aria-invalid', String(field === 'email'));
    consent.setAttribute('aria-invalid', String(field === 'consent'));
  };
  const show = (o: Outcome) => {
    feedback.textContent = o.message;
    feedback.dataset.status = o.status;
  };
  const setBusy = (busy: boolean) => {
    // aria-disabled (not disabled) keeps keyboard focus on the button while the request runs.
    button.setAttribute('aria-disabled', String(busy));
    if (busy) form.setAttribute('aria-busy', 'true'); else form.removeAttribute('aria-busy');
    button.textContent = busy ? 'Sending…' : label;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (client.busy) return;
    const checked = validateSubscription(email.value, consent.checked);
    if (!checked.ok) {
      markInvalid(checked.field);
      show(previewOutcome(email.value, consent.checked));
      (checked.field === 'email' ? email : consent).focus();
      return;
    }
    markInvalid(null);
    if (mode === 'preview') { show(previewOutcome(email.value, consent.checked)); return; }
    if (checked.email === confirmedAddress) {
      feedback.textContent = 'This address was already confirmed on this page. No additional request was sent.';
      feedback.dataset.status = 'duplicate';
      return;
    }
    setBusy(true);
    feedback.textContent = 'Sending your request to Reltroner Studio…';
    feedback.dataset.status = 'loading';
    try {
      const outcome = await client.submit(email.value, consent.checked);
      show(outcome);
      if (outcome.status === 'invalid') markInvalid('email');
      if (outcome.confirmed) confirmedAddress = checked.email;
      else if (outcome.requestSent) console.warn(diagnosticOf(outcome));
    } finally {
      setBusy(false);
    }
  });

  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || client.busy || !feedback.textContent) return;
    feedback.textContent = '';
    delete feedback.dataset.status;
    markInvalid(null);
  });
}

const placement = document.querySelector<HTMLElement>('[data-newsletter-placement]');
if (placement) init(placement);
