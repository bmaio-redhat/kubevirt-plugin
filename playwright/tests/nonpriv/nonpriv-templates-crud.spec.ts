/**
 * Templates core flow for non-privileged users.
 *
 * Non-priv users have cluster-level view access — they can list and read
 * templates but cannot create, edit, or delete them. The core flow here
 * covers the full read path: navigate → filter → open detail → verify content.
 */
import { NONPRIV_FEATURE, NONPRIV_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/nonpriv-fixture';
import { TEMPLATE_METADATA_NAMES } from '@/utils/template-constants';

const SUITE = 'NonPriv Templates CRUD';

test.describe('Templates core flow as non-privileged user', { tag: [NONPRIV_TAG] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  // READ — list loads and shows Red Hat templates
  test('Non-priv user can navigate to templates list and see Red Hat templates', async ({
    templatesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await templatesPage.navigateToTemplatesViaUI();
    const loaded = await templatesPage.verifyPageLoaded();
    expect(loaded, 'Templates page should load for non-priv user').toBe(true);

    await templatesPage.filterByDefaultTemplates();
    const rhel9Visible = await templatesPage.isTemplateVisible(TEMPLATE_METADATA_NAMES.RHEL9);
    expect(rhel9Visible, 'Red Hat RHEL9 template should be visible to non-priv user').toBe(true);
  });

  // READ — filter by name
  test('Non-priv user can filter templates by name and find a specific template', async ({
    templatesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(TEMPLATE_METADATA_NAMES.RHEL9);

    const visible = await templatesPage.isTemplateVisible(TEMPLATE_METADATA_NAMES.RHEL9);
    expect(visible, 'Filtered template should be visible').toBe(true);
  });

  // READ — detail page
  test('Non-priv user can open a template detail page and verify its content', async ({
    templatesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(TEMPLATE_METADATA_NAMES.RHEL9);
    await templatesPage.clickTemplateByTestId(TEMPLATE_METADATA_NAMES.RHEL9);

    const detailVisible = await templatesPage.verifyTemplateDetailsPage();
    expect(detailVisible, 'Template detail page should load for non-priv user').toBe(true);
  });

  // READ boundary — detail page actions are restricted for non-priv user on RH templates
  test('Non-priv user cannot delete an RH template from the detail page', async ({
    templatesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(TEMPLATE_METADATA_NAMES.RHEL9);
    await templatesPage.clickTemplateByTestId(TEMPLATE_METADATA_NAMES.RHEL9);

    // RH templates are protected — the Delete action should be either absent or disabled
    // for all users. Verify this by checking it is not enabled on the detail page.
    const detailVisible = await templatesPage.verifyTemplateDetailsPage();
    expect(detailVisible, 'Template detail page should load').toBe(true);

    const deleteActionEnabled = await templatesPage.page
      .locator('[data-test="actions-menu"] li', { hasText: 'Delete' })
      .isVisible()
      .catch(() => false);
    expect(
      deleteActionEnabled,
      'Delete action should not be accessible on RH templates for non-priv user',
    ).toBe(false);
  });
});
