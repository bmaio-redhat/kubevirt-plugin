import BaseComponent from '@/components/shared/base-component';
import type { Page } from '@playwright/test';

/** Stub — VM detail YAML sidebar; full editor not required for wizard port. */
export class VmSidebarYamlEditorComponent extends BaseComponent {
  constructor(page: Page) {
    super(page);
  }

  async toggle(content?: 'networkSpec' | 'virtualMachine'): Promise<void> {
    void content;
  }

  async waitForReady(timeout?: number): Promise<void> {
    void timeout;
  }
}
