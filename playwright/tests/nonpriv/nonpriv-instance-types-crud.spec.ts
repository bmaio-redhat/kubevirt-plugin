/**
 * Instance Types core flow for non-privileged users.
 *
 * Non-priv users have cluster-level view access. They can list and read
 * cluster instance types but cannot create or delete them. User (namespaced)
 * instance types are also read-only — no write access to create new ones.
 * Core flow: navigate → list cluster types → filter → read detail.
 */
import { NONPRIV_FEATURE, NONPRIV_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/nonpriv-fixture';

const SUITE = 'NonPriv Instance Types CRUD';

test.describe('Instance Types core flow as non-privileged user', { tag: [NONPRIV_TAG] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  // READ — list loads with cluster instance types
  test('Non-priv user can navigate to instance types and see cluster instance types', async ({
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    const loaded = await instanceTypesPage.verifyInstanceTypesPageLoaded();
    expect(loaded, 'Instance types page should load for non-priv user').toBe(true);
  });

  // READ — filter by name
  test('Non-priv user can filter cluster instance types by name', async ({
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    await instanceTypesPage.verifyInstanceTypesPageLoaded();

    await instanceTypesPage.filterByName('cx1');
    // verifyInstanceTypeExists checks for [data-test-id="<name>"] — pass the full
    // row ID (cx1.2xlarge) rather than the partial filter string (cx1).
    const exists = await instanceTypesPage.verifyInstanceTypeExists('cx1.2xlarge');
    expect(exists, 'Filtered cx1 instance types should be visible').toBe(true);
  });

  // READ — detail page
  test('Non-priv user can open a cluster instance type detail page', async ({
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    await instanceTypesPage.verifyInstanceTypesPageLoaded();

    await instanceTypesPage.navigateToClusterInstanceTypeDetail('cx1.2xlarge');

    const nameValue = await instanceTypesPage.getNameDetailsValue();
    expect(nameValue, 'Detail page should show the instance type name').toContain('cx1.2xlarge');
  });

  // READ — user instance types tab is accessible (empty or populated)
  test('Non-priv user can access the User InstanceTypes tab', async ({
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    await instanceTypesPage.verifyInstanceTypesPageLoaded();

    const result = await instanceTypesPage.verifyUserInstanceTypesTabReady();
    expect(
      ['populated', 'empty'],
      'User InstanceTypes tab should be in either populated or empty state',
    ).toContain(result.state);
  });

  // WRITE boundary — create button absent for non-priv
  test('Non-priv user does not see the Create button on instance types', async ({
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    await instanceTypesPage.verifyInstanceTypesPageLoaded();

    const createVisible = await instanceTypesPage.page
      .locator('[data-test="item-create"]')
      .isVisible()
      .catch(() => false);
    expect(
      createVisible,
      'Create button should not be visible to non-priv user on instance types',
    ).toBe(false);
  });
});
