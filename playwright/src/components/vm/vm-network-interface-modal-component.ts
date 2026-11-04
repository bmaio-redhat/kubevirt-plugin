import BaseComponent from '@/components/shared/base-component';
import type { Locator, Page } from '@playwright/test';

/** Stub — network modal methods are no-ops until full component is ported. */
export class VmNetworkInterfaceModalComponent extends BaseComponent {
  constructor(page: Page) {
    super(page);
  }

  async cancel(): Promise<void> {}

  async fillNicName(name = ''): Promise<void> {
    void name;
  }

  async openAddNetworkInterfaceModal(trigger?: Locator): Promise<void> {
    void trigger;
  }

  async save(): Promise<void> {}

  async selectNetwork(name: string | RegExp = ''): Promise<void> {
    void name;
  }

  async waitForNetworkAutoSelection(timeout: number | string = 0): Promise<void> {
    void timeout;
  }

  modelSelect(): ReturnType<BaseComponent['locator']> {
    return this.locator('select');
  }
}
