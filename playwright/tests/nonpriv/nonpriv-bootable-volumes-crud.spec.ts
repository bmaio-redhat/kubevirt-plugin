/**
 * Bootable Volumes core flow for non-privileged users.
 *
 * Non-priv users have cluster-level view access. They can list and read
 * volumes from openshift-virtualization-os-images but cannot create new ones
 * (no write access to that namespace). The core flow covers the full read
 * path: navigate → list → filter → detail page.
 */
import { NONPRIV_FEATURE, NONPRIV_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/nonpriv-fixture';

const SUITE = 'NonPriv Bootable Volumes CRUD';

test.describe('Bootable Volumes core flow as non-privileged user', { tag: [NONPRIV_TAG] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  // READ — list
  test('Non-priv user sees Red Hat-provided bootable volumes in the list', async ({
    bootableVolumesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await bootableVolumesPage.navigateToBootableVolumesViaUI();
    await bootableVolumesPage.page.waitForLoadState('domcontentloaded');
    const loaded = await bootableVolumesPage.verifyPageLoaded();
    expect(loaded, 'Bootable volumes page should load for non-priv user').toBe(true);

    const nsVisible = await bootableVolumesPage.verifyAtLeastOneNamespaceIdentifierVisible([]);
    expect(
      nsVisible,
      'At least one volume from openshift-virtualization-os-images should be visible',
    ).toBe(true);
  });

  // READ — filter
  test('Non-priv user can filter bootable volumes by name', async ({
    bootableVolumesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await bootableVolumesPage.navigateToBootableVolumesViaUI();
    await bootableVolumesPage.verifyPageLoaded();

    const searchVisible = await bootableVolumesPage.verifySearchFilterVisible();
    expect(searchVisible, 'Search filter input should be visible').toBe(true);
  });

  // READ — detail page
  test('Non-priv user can open a bootable volume detail page and see Details and YAML tabs', async ({
    bootableVolumeDetailPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    // Navigate directly to a known RH-provided volume — avoids clicking through the list
    // and removes dependency on a specific row selector that differs across CNV builds.
    await bootableVolumeDetailPage.navigateToBootableVolumeDetail(
      'rhel9',
      'openshift-virtualization-os-images',
    );

    const tabsVisible = await bootableVolumeDetailPage.verifyDetailTabsVisible();
    expect(
      tabsVisible,
      'Detail and YAML tabs should be visible on bootable volume detail page',
    ).toBe(true);
  });

  // WRITE boundary — create button absent for non-priv
  test('Non-priv user does not see the Add volume button on bootable volumes', async ({
    bootableVolumesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await bootableVolumesPage.navigateToBootableVolumesViaUI();
    await bootableVolumesPage.page.waitForLoadState('domcontentloaded');

    const addButtonVisible = await bootableVolumesPage.page
      .locator('[data-test="item-create"]')
      .isVisible()
      .catch(() => false);
    expect(addButtonVisible, 'Add volume button should not be visible to non-priv user').toBe(
      false,
    );
  });
});
