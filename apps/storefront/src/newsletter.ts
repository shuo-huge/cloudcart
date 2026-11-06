/** Newsletter forms collect into D1; no third-party email service is required. */
export function bindNewsletterForms(): void {
  document.addEventListener("submit", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLFormElement) || !target.matches("[data-newsletter-form]")) return;
    event.preventDefault();
    const input = target.querySelector("input[type='email']") as HTMLInputElement | null;
    const message = target.parentElement?.querySelector("[data-newsletter-message]") as HTMLElement | null;
    const email = input?.value.trim() ?? "";
    if (!email) return;
    void fetch("/api/newsletter", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email }),
    }).then(async (response) => {
      const body = (await response.json().catch(() => null)) as { ok?: boolean; error?: { message?: string } } | null;
      if (response.ok && body?.ok) {
        if (message) message.textContent = "Thanks — you are subscribed.";
        target.reset();
      } else if (message) {
        message.textContent = body?.error?.message ?? "Subscription failed. Please try again.";
      }
    }).catch(() => {
      if (message) message.textContent = "Subscription failed. Please try again.";
    });
  });
}
