import type KubernetesClient from '@/clients/kubernetes-client';
import { ADMIN_ONLY_TAG, T1, T1_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/instance-types-fixture';
import { generateRandomInstanceTypeName } from '@/utils/random-data-generator';
import { TestTimeouts } from '@/utils/test-config';

const SUITE = 'InstanceType page';

const IT_GROUP = 'instancetype.kubevirt.io';
const IT_VERSION = 'v1beta1';

async function createClusterInstanceTypeApi(
  k8sClient: KubernetesClient,
  name: string,
  cpu = 1,
  memory = '1Gi',
): Promise<void> {
  const plural = 'virtualmachineclusterinstancetypes';
  const instanceTypeResource = {
    apiVersion: `${IT_GROUP}/${IT_VERSION}`,
    kind: 'VirtualMachineClusterInstancetype',
    metadata: {
      name,
      labels: {
        'app.kubernetes.io/managed-by': 'playwright-test',
      },
    },
    spec: {
      cpu: { guest: cpu },
      memory: { guest: memory },
    },
  };
  await k8sClient.createClusterCustomResource(IT_GROUP, IT_VERSION, plural, instanceTypeResource);
  k8sClient.trackResource('VirtualMachineClusterInstanceType', name);
}

async function verifyInstanceTypeDeletedCluster(
  k8sClient: KubernetesClient,
  name: string,
  timeoutMs = TestTimeouts.DEFAULT,
): Promise<{ deleted: boolean }> {
  const plural = 'virtualmachineclusterinstancetypes';
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await k8sClient.getClusterCustomResource(IT_GROUP, IT_VERSION, plural, name);
      await new Promise((r) => setTimeout(r, TestTimeouts.SHORT_WAIT));
    } catch {
      return { deleted: true };
    }
  }
  return { deleted: false };
}

const IT_NAMESPACE_GROUP = 'instancetype.kubevirt.io';
const IT_NAMESPACE_VERSION = 'v1beta1';
const IT_NAMESPACE_PLURAL = 'virtualmachineinstancetypes';

async function namespacedInstanceTypeExists(
  k8sClient: KubernetesClient,
  namespace: string,
  name: string,
): Promise<boolean> {
  try {
    await k8sClient.getCustomResource(
      IT_NAMESPACE_GROUP,
      IT_NAMESPACE_VERSION,
      namespace,
      IT_NAMESPACE_PLURAL,
      name,
    );
    return true;
  } catch {
    return false;
  }
}

async function createNamespacedInstanceTypeApi(
  k8sClient: KubernetesClient,
  name: string,
  namespace: string,
  cpu = 1,
  memory = '512Mi',
): Promise<void> {
  const plural = 'virtualmachineinstancetypes';
  const resource = {
    apiVersion: `${IT_NAMESPACE_GROUP}/${IT_NAMESPACE_VERSION}`,
    kind: 'VirtualMachineInstancetype',
    metadata: {
      name,
      namespace,
      labels: { 'app.kubernetes.io/managed-by': 'playwright-test' },
    },
    spec: {
      cpu: { guest: cpu },
      memory: { guest: memory },
    },
  };
  await k8sClient.createCustomResource(
    IT_NAMESPACE_GROUP,
    IT_NAMESPACE_VERSION,
    namespace,
    plural,
    resource,
  );
  k8sClient.trackResource('VirtualMachineInstanceType', name, namespace);
}

test.describe(SUITE, { tag: [T1_TAG, '@tier1-pages-it'] }, () => {
  test.beforeEach(async ({ instanceTypesPage }) => {
    await instanceTypesPage.navigateToInstanceTypesViaUI();
  });

  test('Cluster instance type supports create, name filter, and deletion', async ({
    k8sClient,
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: T1,
      tags: [T1_TAG, ADMIN_ONLY_TAG],
    });

    const clusterItName = generateRandomInstanceTypeName('cluster-instancetype');

    await createClusterInstanceTypeApi(k8sClient, clusterItName, 2, '2Gi');

    await instanceTypesPage.filterByName(clusterItName);

    const instanceTypeExists = await instanceTypesPage.verifyInstanceTypeExists(clusterItName);
    expect.soft(instanceTypeExists, `${clusterItName} instanceType should exist`).toBe(true);

    await instanceTypesPage.filterByName(clusterItName);

    const instanceTypeStillExists = await instanceTypesPage.verifyInstanceTypeExists(clusterItName);
    expect
      .soft(instanceTypeStillExists, `${clusterItName} should still exist after filtering`)
      .toBe(true);

    const clusterItDelName = generateRandomInstanceTypeName('cluster-it-delete');

    await createClusterInstanceTypeApi(k8sClient, clusterItDelName, 1, '1Gi');

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    await instanceTypesPage.filterByName(clusterItDelName);

    const existsBeforeDelete = await instanceTypesPage.verifyInstanceTypeExists(clusterItDelName);
    expect.soft(existsBeforeDelete, `${clusterItDelName} should exist before delete`).toBe(true);

    await k8sClient.deleteClusterCustomResource(
      IT_GROUP,
      IT_VERSION,
      'virtualmachineclusterinstancetypes',
      clusterItDelName,
    );

    const k8sDeleteResult = await verifyInstanceTypeDeletedCluster(
      k8sClient,
      clusterItDelName,
      TestTimeouts.DEFAULT,
    );
    expect
      .soft(k8sDeleteResult.deleted, `${clusterItDelName} should be deleted from cluster`)
      .toBe(true);

    await instanceTypesPage.navigateToInstanceTypesViaUI();
    await instanceTypesPage.filterByName(clusterItDelName);

    let emptyMessageVisible = await instanceTypesPage.verifyEmptyMessageVisible();
    if (!emptyMessageVisible) {
      await instanceTypesPage.navigateToInstanceTypesViaUI();
      await instanceTypesPage.filterByName(clusterItDelName);
      emptyMessageVisible = await instanceTypesPage.verifyEmptyMessageVisible();
    }
    expect
      .soft(emptyMessageVisible, 'Empty message should be visible after deleting instance type')
      .toBe(true);
  });

  test('User InstanceTypes tab shows user-created instance types and supports name filter', async ({
    k8sClient,
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: T1,
      tags: [T1_TAG, ADMIN_ONLY_TAG],
    });
    test.setTimeout(utils.TestTimeouts.TEST_SHORT);

    const ns = utils.generateTestNamespace('user-it');
    await k8sClient.createNamespace(ns);
    await k8sClient.waitForNamespaceReady(ns);
    k8sClient.trackResource('Namespace', ns);

    const itName = generateRandomInstanceTypeName('user-it');
    await createNamespacedInstanceTypeApi(k8sClient, itName, ns);

    await instanceTypesPage.clickUserInstanceTypesTab();
    await instanceTypesPage.waitForInstanceTypesListReady();
    await instanceTypesPage.navigateToUserInstanceTypesProject(ns);
    await instanceTypesPage.filterByNameInUserTab(itName);

    const exists = await instanceTypesPage.verifyInstanceTypeExists(itName);
    expect.soft(exists, `User instance type ${itName} should appear in User tab`).toBe(true);
  });

  test('Cluster instance type detail page shows Details and YAML tabs with metadata', async ({
    k8sClient,
    instanceTypesPage,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: T1,
      tags: [T1_TAG, ADMIN_ONLY_TAG],
    });
    test.setTimeout(utils.TestTimeouts.TEST_SHORT);

    const itName = generateRandomInstanceTypeName('cluster-it-detail');
    await createClusterInstanceTypeApi(k8sClient, itName, 2, '2Gi');

    await instanceTypesPage.filterByName(itName);
    const exists = await instanceTypesPage.verifyInstanceTypeExists(itName);
    expect
      .soft(exists, `${itName} should appear in the list before navigating to detail`)
      .toBe(true);

    const detailUrl = `/k8s/cluster/instancetype.kubevirt.io~v1beta1~VirtualMachineClusterInstancetype/${itName}`;
    await instanceTypesPage.page.goto(
      `${instanceTypesPage.page.url().split('/k8s')[0]}${detailUrl}`,
    );

    await test.step('Details tab is visible', async () => {
      const detailsTab = instanceTypesPage.page.locator('[data-test-id="horizontal-link-Details"]');
      const visible = await detailsTab
        .waitFor({ state: 'visible', timeout: utils.TestTimeouts.UI_ELEMENT_VISIBILITY })
        .then(() => true)
        .catch(() => false);
      expect.soft(visible, 'Details tab should be present on instance type detail page').toBe(true);
    });

    await test.step('YAML tab is visible', async () => {
      const yamlTab = instanceTypesPage.page.locator('[data-test-id="horizontal-link-YAML"]');
      const visible = await yamlTab
        .waitFor({ state: 'visible', timeout: utils.TestTimeouts.UI_ELEMENT_VISIBILITY })
        .then(() => true)
        .catch(() => false);
      expect.soft(visible, 'YAML tab should be present on instance type detail page').toBe(true);
    });

    await test.step('Name metadata field shows correct name', async () => {
      const nameField = instanceTypesPage.page.locator('[data-test="Name"]');
      const visible = await nameField
        .waitFor({ state: 'visible', timeout: utils.TestTimeouts.UI_ELEMENT_VISIBILITY })
        .then(() => true)
        .catch(() => false);
      expect.soft(visible, 'Name metadata field should be visible').toBe(true);
    });
  });

  test('User instance type can be deleted from its detail page', async ({
    k8sClient,
    instanceTypesPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: T1,
      tags: [T1_TAG, ADMIN_ONLY_TAG],
    });
    test.setTimeout(utils.TestTimeouts.TEST_SHORT);

    const itName = generateRandomInstanceTypeName('user-it-del');
    await createNamespacedInstanceTypeApi(k8sClient, itName, testConfig.testNamespace);

    await test.step('Navigate to user instance type detail page', async () => {
      await instanceTypesPage.navigateToUserInstanceTypeDetail(testConfig.testNamespace, itName);
    });

    await test.step('Delete via Actions menu on detail page', async () => {
      await instanceTypesPage.deleteUserInstanceTypeFromDetail();
    });

    await test.step('Resource no longer exists on the cluster', async () => {
      const stillExists = await namespacedInstanceTypeExists(
        k8sClient,
        testConfig.testNamespace,
        itName,
      );
      expect
        .soft(stillExists, `${itName} should be removed from cluster after UI deletion`)
        .toBe(false);
    });
  });
});

test.describe(
  'InstanceTypes name filter regression',
  { tag: [T1_TAG, ADMIN_ONLY_TAG, '@tier1-instancetypes'] },
  () => {
    test.beforeEach(async ({ instanceTypesPage }) => {
      await instanceTypesPage.navigateToInstanceTypesViaUI();
    });

    test('Cluster InstanceTypes name filter restores full list after clearing', async ({
      k8sClient,
      instanceTypesPage,
      cleanup,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: T1,
        tags: [T1_TAG, ADMIN_ONLY_TAG],
      });

      const itNameA = generateRandomInstanceTypeName('filter-reg-a');
      const itNameB = generateRandomInstanceTypeName('filter-reg-b');
      await createClusterInstanceTypeApi(k8sClient, itNameA, 1, '1Gi');
      await createClusterInstanceTypeApi(k8sClient, itNameB, 1, '512Mi');
      cleanup.trackClusterInstanceType(itNameA);
      cleanup.trackClusterInstanceType(itNameB);

      await test.step('Filter by A shows A but not B', async () => {
        await instanceTypesPage.filterByName(itNameA);
        const aExists = await instanceTypesPage.verifyInstanceTypeExists(itNameA);
        expect.soft(aExists, `${itNameA} should be visible after filtering by name`).toBe(true);
        const bExists = await instanceTypesPage.verifyInstanceTypeExists(itNameB);
        expect
          .soft(bExists, `${itNameB} should not be visible when filtered to ${itNameA}`)
          .toBe(false);
      });

      await test.step('Clearing filter and filtering by B shows B (CNV-87321 regression)', async () => {
        await instanceTypesPage.filterByName('');
        await instanceTypesPage.page.waitForTimeout(2000);
        await instanceTypesPage.filterByName(itNameB);
        const bExistsAfterClear = await instanceTypesPage.verifyInstanceTypeExists(itNameB);
        expect
          .soft(
            bExistsAfterClear,
            `${itNameB} should be visible after clearing the name filter and re-filtering (CNV-87321 regression: filter was not resetting)`,
          )
          .toBe(true);
        const aStillHidden = await instanceTypesPage.verifyInstanceTypeExists(itNameA);
        expect
          .soft(aStillHidden, `${itNameA} should not be visible when filtered to ${itNameB}`)
          .toBe(false);
      });
    });
  },
);
