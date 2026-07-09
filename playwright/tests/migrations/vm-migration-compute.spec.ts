import type KubernetesClient from '@/clients/kubernetes-client';
import { ADMIN_ONLY_TAG, MIGRATION_FEATURE, MIGRATION_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/migration-fixture';
import type { TestUtilsType } from '@/fixtures/test-utils';

const SUITE = 'VM compute migration';

async function waitForVmReadyApi(
  utils: TestUtilsType,
  k8sClient: KubernetesClient,
  vmName: string,
  namespace: string,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const vm = (await k8sClient.getVirtualMachine(vmName, namespace)) as {
        status?: { ready?: boolean };
      };
      if (vm?.status?.ready === true) return;
    } catch {
      /* poll */
    }
    await new Promise((r) => setTimeout(r, utils.TestTimeouts.POLLING_INTERVAL));
  }
  throw new Error(`VM ${vmName} not ready within ${timeoutMs}ms`);
}

test.describe(SUITE, { tag: [MIGRATION_TAG, ADMIN_ONLY_TAG] }, () => {
  test.beforeEach(({ utils }) => {
    test.setTimeout(utils.TestTimeouts.TEST_EXTENDED);
  });
  test('Migration target node list excludes nodes with SchedulingDisabled taint', async ({
    k8sClient,
    vmListPage,
    vmDetailPage,
    utils,
    testConfig,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const namespace = utils.generateTestNamespace('vm-migrate-cordon');
    const vmName = utils.generateRandomVmName('vm-migrate-cordon');
    await k8sClient.createNamespace(namespace);
    await k8sClient.waitForNamespaceReady(namespace);
    k8sClient.trackResource('Namespace', namespace);
    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.RHEL9,
      vmName,
      namespace,
      'openshift',
      true,
    );
    k8sClient.trackResource('VirtualMachine', vmName, namespace);
    await waitForVmReadyApi(utils, k8sClient, vmName, namespace, utils.TestTimeouts.VM_RUNNING);

    await vmListPage.navigateToNamespaceVirtualMachinesViaUI(testConfig.testNamespace);
    await vmListPage.toggleEmptyProjectsDisplay(true);
    await vmListPage.searchTreeView(namespace);
    await vmListPage.clickProjectNode(namespace);
    await vmListPage.clickVmListTab();
    await vmListPage.clickVmByTestId(vmName);

    const currentVmNode = await k8sClient.getVmNodeName(vmName, namespace);
    const migrationTargetNodes = await k8sClient.getMigrationTargetNodes(
      currentVmNode || undefined,
    );
    expect
      .soft(migrationTargetNodes.length, 'At least one migration target node should be available')
      .toBeGreaterThan(0);

    const nodeWithLowerResources = k8sClient.getNodeNameWithLowerAllocatable(migrationTargetNodes);
    expect
      .soft(
        nodeWithLowerResources,
        'Node name with lower allocatable resources should be available',
      )
      .toBeDefined();

    const nodeToCordon = nodeWithLowerResources as string;
    await k8sClient.cordonNode(nodeToCordon);
    try {
      await vmDetailPage.openActionsDropdownAndClickMigrateCompute();
      const visibleOptions = await vmListPage.getVisibleMigrationNodeOptionsFromOpenModal();

      expect
        .soft(
          visibleOptions,
          `SchedulingDisabled node "${nodeToCordon}" should not be a visible migration option`,
        )
        .not.toContain(nodeToCordon);

      const expectedVisibleNodes = migrationTargetNodes
        .map((n) => n.metadata?.name)
        .filter((name): name is string => name !== undefined && name !== nodeToCordon);
      for (const nodeName of expectedVisibleNodes) {
        expect
          .soft(
            visibleOptions,
            `Schedulable node "${nodeName}" should be a visible migration option`,
          )
          .toContain(nodeName);
      }
    } finally {
      await k8sClient.uncordonNode(nodeToCordon);
    }
  });
});
