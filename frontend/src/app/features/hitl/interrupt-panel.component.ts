/**
 * "Handle an interrupt with a typed controller", verbatim — the section the doc
 * called "Handle an interrupt" before 2026-08-21. The controller is headless, so
 * this panel renders nothing until the backend emits an AG-UI interrupt.
 * https://docs.copilotkit.ai/angular/mastra/guides/human-in-the-loop
 *
 * The doc now writes this call as `injectInterrupt<T>("default")`. The object
 * form below is kept because it is the only one that compiles: `@copilotkit/
 * angular@0.3.1` declares `injectInterrupt(options?: InjectInterruptOptions)`
 * and no string overload. See the Known issue on the route page.
 */
import { Component } from '@angular/core';
import { injectInterrupt } from '@copilotkit/angular';

type ReviewRequest = {
  title?: string;
  choices?: Array<{ id: string; label: string }>;
};

@Component({
  selector: 'app-interrupt-panel',
  template: `
    @if (controller.event(); as event) {
      @let request = asReviewRequest(event.value);
      <section aria-labelledby="review-title">
        <h2 id="review-title">{{ request.title ?? "Review required" }}</h2>

        @for (choice of request.choices ?? []; track choice.id) {
          <button type="button" (click)="resolve(choice.id)">
            {{ choice.label }}
          </button>
        }

        <button type="button" (click)="cancel()">Cancel</button>
      </section>
    }

    @if (controller.error()) {
      <p role="alert">The decision could not be submitted.</p>
    }
  `,
})
export class InterruptPanelComponent {
  protected readonly controller = injectInterrupt<ReviewRequest>({
    agentId: 'default',
  });

  protected asReviewRequest(value: unknown): ReviewRequest {
    return typeof value === 'object' && value !== null
      ? (value as ReviewRequest)
      : {};
  }

  protected resolve(choiceId: string): void {
    this.controller.resolve({ choiceId }).catch(() => undefined);
  }

  protected cancel(): void {
    this.controller.cancel().catch(() => undefined);
  }
}
