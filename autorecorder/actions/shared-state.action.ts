/**
 * Shared state — the browser writes agent state, then the agent reads it back.
 *
 * https://docs.copilotkit.ai/angular/mastra/guides/shared-state
 *
 * Two browser-side writes happen before the prompt, and both are what make the
 * answer evidence rather than a plausible sentence:
 *
 * - "Mark high priority" writes agent *state*, so "high" can only come back if
 *   the write reached the agent.
 * - "Use London time" changes a signal the read-only *context* accessor reads,
 *   so "Europe/London" can only come back if the context re-registered.
 *
 * The prompt deliberately does not ask about `notes`: that array is always empty
 * in this demo, so it gave the agent nothing to be right or wrong about.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

export const runSharedStateAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
  console.log(`   🔄 Writing state from the browser first...`);
  const priorityBtn = page
    .locator('app-workspace button:has-text("Mark high priority")')
    .first();

  const btnBox = await priorityBtn.boundingBox().catch(() => null);
  if (btnBox) {
    await humanGlide(page, btnBox.x + btnBox.width / 2, btnBox.y + btnBox.height / 2, 20);
    await sleep(400);
    await humanClick(page);
    await sleep(1000);
  } else {
    console.warn(`   ⚠️ "Mark high priority" not found — the agent will read the default state.`);
  }

  // Second write: a signal the context accessor reads, so the re-registration
  // is observable in the same answer.
  const timezoneBtn = page
    .locator('app-account-context button:has-text("Use London time")')
    .first();
  const tzBox = await timezoneBtn.boundingBox().catch(() => null);
  if (tzBox) {
    console.log(`   🌍 Switching the account timezone to Europe/London...`);
    await humanGlide(page, tzBox.x + tzBox.width / 2, tzBox.y + tzBox.height / 2, 20);
    await sleep(400);
    await humanClick(page);
    await sleep(1000);
  } else {
    console.warn(`   ⚠️ "Use London time" not found — the agent will read the default timezone.`);
  }

  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);

  // Rest on the context panel the answer just quoted back.
  const accountContext = page.locator('app-account-context').first();
  const ctxBox = await accountContext.boundingBox().catch(() => null);
  if (ctxBox) {
    console.log(`   🎯 Resting on the read-only context components.`);
    await humanGlide(page, ctxBox.x + ctxBox.width / 2, ctxBox.y + ctxBox.height / 2, 22);
    await sleep(1500);
  }
};
