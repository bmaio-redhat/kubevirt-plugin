import { NONPRIV_FEATURE, NONPRIV_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/nonpriv-fixture';
import { TEMPLATE_METADATA_NAMES } from '@/utils/template-constants';

const SUITE = 'NonPriv Overview and Templates';

test.describe(
  'Virtualization overview visibility as non-privileged user',
  { tag: [NONPRIV_TAG] },
  () => {
    test.beforeEach(({ utils }) => {
      test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
    });

    test('Non-priv user can access the Virtualization overview and resource cards are visible', async ({
      overviewPage,
      testConfig,
      utils,
    }) => {
      await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

      await overviewPage.navigateToVirtualizationOverviewViaUI();
      await overviewPage.switchToNamespace(testConfig.testNamespace);

      const cardsVisible = await overviewPage.verifyResourceCards();
      expect(cardsVisible, 'Overview resource cards should be visible to non-priv user').toBe(true);
    });
  },
);

test.describe('Templates list access as non-privileged user', { tag: [NONPRIV_TAG] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  test('Non-priv user can navigate to templates list and filter by name', async ({
    templatesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(TEMPLATE_METADATA_NAMES.RHEL9);

    const visible = await templatesPage.isTemplateVisible(TEMPLATE_METADATA_NAMES.RHEL9);
    expect(visible, 'RHEL9 template should be visible after filtering by name').toBe(true);
  });

  test('Non-priv user can toggle the Architecture column in the templates list', async ({
    templatesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });
    test.setTimeout(utils.TestTimeouts.TEST_EXTENDED);

    await templatesPage.navigateToTemplatesViaUI();
    const pageLoaded = await templatesPage.verifyPageLoaded();
    expect(pageLoaded, 'Templates page should load for non-priv user').toBe(true);

    // Read the current state so the test is resilient to whatever the saved preference is.
    const initiallyEnabled = await templatesPage.isColumnEnabled('architecture');

    if (initiallyEnabled) {
      // Column is ON — toggle off and verify hidden, then restore ON.
      await templatesPage.toggleColumn('architecture');
      await templatesPage.page.waitForTimeout(3000);
      const hiddenAfterOff = await templatesPage.verifyTableHeaderExists('Architecture', false);
      expect(hiddenAfterOff, 'Architecture column should be hidden after toggling off').toBe(true);

      await templatesPage.toggleColumn('architecture');
      await templatesPage.page.waitForTimeout(3000);
      const visibleAfterRestore = await templatesPage.verifyTableHeaderExists('Architecture', true);
      expect(visibleAfterRestore, 'Architecture column should be visible after restoring on').toBe(
        true,
      );
    } else {
      // Column is OFF — toggle on and verify visible, then restore OFF.
      await templatesPage.toggleColumn('architecture');
      await templatesPage.page.waitForTimeout(3000);
      const visibleAfterOn = await templatesPage.verifyTableHeaderExists('Architecture', true);
      expect(visibleAfterOn, 'Architecture column should be visible after toggling on').toBe(true);

      await templatesPage.toggleColumn('architecture');
      await templatesPage.page.waitForTimeout(3000);
      const hiddenAfterRestore = await templatesPage.verifyTableHeaderExists('Architecture', false);
      expect(hiddenAfterRestore, 'Architecture column should be hidden after restoring off').toBe(
        true,
      );
    }
  });
});
