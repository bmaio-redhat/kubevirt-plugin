import { GATING, GATING_TAG, VM_OVERVIEW_TAG, VM_TABS_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/gating-fixture';
import type VmTreePage from '@/page-objects/vm/vm-tree-page';

const SUITE = 'VM management (gating)';

/** Opens VM list with "empty projects" visible in tree for the active OpenShift project context. */
async function navigateToVirtualMachinesWithEmptyProjectsInTree(
  vmTreePage: VmTreePage,
  projectNamespace: string,
): Promise<void> {
  await vmTreePage.navigateToNamespaceVirtualMachinesViaUI(projectNamespace);
  await vmTreePage.toggleEmptyProjectsDisplay(true);
}

async function navigateToProjectVmListForNamespace(
  vmTreePage: VmTreePage,
  ns: string,
): Promise<void> {
  try {
    await vmTreePage.searchTreeView(ns);
    await vmTreePage.clickProjectNode(ns);
    await vmTreePage.clickVmListTab();
  } catch {
    await vmTreePage.navigateToNamespaceVirtualMachines(ns);
    await vmTreePage.clickVmListTab();
  }
}

test.describe(SUITE, { tag: [GATING_TAG] }, () => {
  test('VM and VMI detail tabs', async ({
    k8sClient,
    vmTreePage,
    vmListPage,
    vmDetailPage,
    utils,
  }) => {
    test.setTimeout(utils.TestTimeouts.TEST_EXTENDED);
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_TABS_TAG, 'vmi-tabs'],
    });

    const namespace = utils.generateTestNamespace('gating-tabs');
    const vmName = utils.generateRandomVmName('gating-tabs');

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
    await k8sClient.waitForVmRunning(vmName, namespace, utils.TestTimeouts.VM_RUNNING);

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, namespace);
    await navigateToProjectVmListForNamespace(vmTreePage, namespace);

    const pageLoaded = await vmListPage.verifyPageLoaded();
    expect.soft(pageLoaded, 'VM list page should load').toBe(true);

    await vmListPage.clickVmByTestId(vmName);

    const vmNameVisible = await vmDetailPage.isVmNameVisible(
      vmName,
      utils.TestTimeouts.UI_ELEMENT_VISIBILITY,
    );
    expect.soft(vmNameVisible, 'VM name visible on detail page').toBe(true);

    const osVisible = await vmDetailPage.verifyOperatingSystem();
    expect.soft(osVisible, 'Operating system visible in Overview tab').toBe(true);

    await vmDetailPage.navigateToYAML();
    const downloadYaml = await vmDetailPage.verifyDownload();
    expect.soft(downloadYaml, 'Download visible in YAML tab').toBe(true);

    const hasDiagnosticsTab = await vmDetailPage.isDiagnosticsTabVisible();
    if (hasDiagnosticsTab) {
      await vmDetailPage.navigateToDiagnostics();
      const diagnosticsLoaded = await vmDetailPage.verifyNoErrorBoundary();
      expect.soft(diagnosticsLoaded, 'Diagnostics tab loads without error boundary').toBe(true);
    }

    await vmDetailPage.navigateToConfigurationDetails();
    const headless = await vmDetailPage.verifyHeadlessMode();
    expect.soft(headless, 'Headless mode visible in Configuration > Details').toBe(true);

    await vmDetailPage.navigateToEvents();
    const eventVisible = await vmDetailPage.verifyVmStartEvent(utils.TestTimeouts.DEFAULT);
    expect.soft(eventVisible, 'VM start event visible in Events tab').toBe(true);

    await vmDetailPage.navigateToConsole();
    await vmDetailPage.tryDismissVncTryLaterDialog();
    const guestLogin = await vmDetailPage.verifyGuestLogin();
    expect.soft(guestLogin, 'Guest login visible in Console tab').toBe(true);

    await vmDetailPage.navigateToSnapshots();
    const noSnapshots = await vmDetailPage.verifyNoSnapshots();
    expect.soft(noSnapshots, 'No snapshots found visible in Snapshots tab').toBe(true);

    await vmDetailPage.navigateToMetrics();
    const utilization = await vmDetailPage.verifyUtilization();
    expect.soft(utilization, 'Utilization visible in Metrics tab').toBe(true);

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, namespace);
    await navigateToProjectVmListForNamespace(vmTreePage, namespace);
    await vmListPage.clickVmByTestId(vmName);
    await vmDetailPage.navigateToOverview();
    await vmDetailPage.clickVmiByTestId(vmName);

    const annotations = await vmDetailPage.verifyAnnotationsInOverview();
    expect.soft(annotations, 'Annotations visible on VMI detail').toBe(true);

    await vmDetailPage.navigateToYAML();
    const download = await vmDetailPage.verifyDownload();
    expect.soft(download, 'Download visible in VMI YAML tab').toBe(true);

    await vmDetailPage.navigateToScheduling();
    const tolerations = await vmDetailPage.verifyTolerations();
    expect.soft(tolerations, 'Tolerations visible in VMI Scheduling tab').toBe(true);

    await vmDetailPage.navigateToEvents();
    const event = await vmDetailPage.verifyVmStartEvent(utils.TestTimeouts.DEFAULT);
    expect.soft(event, 'VM start event visible in VMI Events tab').toBe(true);

    await vmDetailPage.navigateToConsole();
    await vmDetailPage.tryDismissVncTryLaterDialog();
    const guestLoginVmi = await vmDetailPage.verifyGuestLogin();
    expect.soft(guestLoginVmi, 'Guest login visible in VMI Console tab').toBe(true);

    await vmDetailPage.navigateToNetworks();
    const podNetworking = await vmDetailPage.verifyPodNetworking();
    expect.soft(podNetworking, 'Pod networking visible in VMI Networks tab').toBe(true);
  });

  test('Red Hat template detail page shows all tabs with expected content', async ({
    overviewPage,
    templatesPage,
    templateDetailPage,
    pageCommons,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, 'template-tabs'],
    });

    await overviewPage.navigateToVirtualizationOverviewViaUI();
    await templatesPage.navigateToTemplatesViaUI();
    await pageCommons.switchProject('All Projects');

    await templatesPage.filterTemplatesByName(utils.TEMPLATE_METADATA_NAMES.RHEL9);

    const visible = await templatesPage.isTemplateVisible(utils.TEMPLATE_METADATA_NAMES.RHEL9);
    expect.soft(visible, 'RHEL9 template should be visible after filtering').toBe(true);

    await templatesPage.clickTemplateByTestId(utils.TEMPLATE_METADATA_NAMES.RHEL9);

    const displayName = await templateDetailPage.verifyDisplayName();
    expect.soft(displayName, 'Display name should be visible').toBe(true);

    const notEditable = await templateDetailPage.verifyRedHatTemplateNotEditable();
    expect.soft(notEditable, 'Red Hat template not-editable notice visible').toBe(true);

    await templateDetailPage.navigateToYAML();
    expect.soft(await templateDetailPage.verifyDownload(), 'YAML download visible').toBe(true);

    await templateDetailPage.navigateToScheduling();
    expect.soft(await templateDetailPage.verifyTolerations(), 'Tolerations visible').toBe(true);

    await templateDetailPage.navigateToNetworks();
    expect
      .soft(await templateDetailPage.verifyPodNetworking(), 'Pod networking visible')
      .toBe(true);

    await templateDetailPage.navigateToDisks();
    expect.soft(await templateDetailPage.verifyRootdisk(), 'rootdisk visible').toBe(true);

    await templateDetailPage.navigateToScripts();
    expect.soft(await templateDetailPage.verifyCloudInit(), 'Cloud-init visible').toBe(true);

    await templateDetailPage.navigateToParameters();
    expect
      .soft(await templateDetailPage.verifyDataSourceName(), 'DATA_SOURCE_NAME visible')
      .toBe(true);
  });

  test('Custom template detail page shows all tabs with expected content', async ({
    k8sClient,
    overviewPage,
    templatesPage,
    templateDetailPage,
    pageCommons,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, 'template-tabs'],
    });

    const namespace = utils.generateTestNamespace('gating-tpl');
    const templateName = utils.generateRandomTemplateName('gating-tpl-tpl');

    await k8sClient.createNamespace(namespace);
    await k8sClient.waitForNamespaceReady(namespace);
    k8sClient.trackResource('Namespace', namespace);

    const templateResource = {
      apiVersion: 'template.openshift.io/v1',
      kind: 'Template',
      metadata: {
        name: templateName,
        namespace,
        labels: {
          'template.kubevirt.io/type': 'base',
          'os.template.kubevirt.io/fedora': 'true',
          'workload.template.kubevirt.io/server': 'true',
        },
      },
      objects: [
        {
          apiVersion: 'kubevirt.io/v1',
          kind: 'VirtualMachine',
          metadata: { name: '${NAME}', labels: { app: '${NAME}' } },
          spec: {
            runStrategy: 'Always',
            template: {
              metadata: { labels: { 'kubevirt.io/domain': '${NAME}' } },
              spec: {
                domain: {
                  devices: {
                    disks: [{ disk: { bus: 'virtio' }, name: 'containerdisk' }],
                    interfaces: [{ masquerade: {}, model: 'virtio', name: 'default' }],
                    rng: {},
                  },
                  resources: { requests: { memory: '1Gi' } },
                },
                networks: [{ name: 'default', pod: {} }],
                terminationGracePeriodSeconds: 180,
                volumes: [
                  {
                    containerDisk: { image: 'quay.io/containerdisks/fedora:latest' },
                    name: 'containerdisk',
                  },
                ],
              },
            },
          },
        },
      ],
      parameters: [
        {
          description: 'VM name',
          from: 'vm-[a-z0-9]{6}',
          generate: 'expression',
          name: 'NAME',
        },
        {
          description: 'Cloud user password',
          from: '[a-z0-9]{4}-[a-z0-9]{4}',
          generate: 'expression',
          name: 'CLOUD_USER_PASSWORD',
        },
      ],
    };

    await k8sClient.createCustomResource(
      'template.openshift.io',
      'v1',
      namespace,
      'templates',
      templateResource,
    );
    k8sClient.trackResource('Template', templateName, namespace);

    await overviewPage.navigateToVirtualizationOverviewViaUI();
    await templatesPage.navigateToTemplatesViaUI();
    await pageCommons.switchProject(namespace);

    const pageLoaded = await templatesPage.verifyPageLoaded(templateName);
    expect.soft(pageLoaded, 'Templates page should load').toBe(true);

    await templatesPage.filterTemplatesByName(templateName);
    await templatesPage.clickTemplateByTestId(templateName);

    expect.soft(await templateDetailPage.verifyDisplayName(), 'Display name visible').toBe(true);

    await templateDetailPage.navigateToYAML();
    expect.soft(await templateDetailPage.verifyDownload(), 'YAML download visible').toBe(true);

    await templateDetailPage.navigateToScheduling();
    expect.soft(await templateDetailPage.verifyTolerations(), 'Tolerations visible').toBe(true);

    await templateDetailPage.navigateToNetworks();
    expect
      .soft(await templateDetailPage.verifyPodNetworking(), 'Pod networking visible')
      .toBe(true);

    await templateDetailPage.navigateToDisks();
    expect.soft(await templateDetailPage.verifyContainerDisk(), 'containerdisk visible').toBe(true);

    await templateDetailPage.navigateToScripts();
    expect.soft(await templateDetailPage.verifyCloudInit(), 'Cloud-init visible').toBe(true);

    await templateDetailPage.navigateToParameters();
    expect
      .soft(await templateDetailPage.verifyCloudUserPassword(), 'CLOUD_USER_PASSWORD visible')
      .toBe(true);
  });

  test('Cluster overview displays status, health, and resource allocation widgets', async ({
    vmTreePage,
    vmListPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_OVERVIEW_TAG],
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    const statusResult = await vmListPage.verifyClusterStatusSectionWidgetsVisible(
      utils.TestTimeouts.DEFAULT,
      utils.TestTimeouts.DEFAULT,
    );
    expect
      .soft(
        statusResult.allVisible,
        statusResult.missing.length
          ? `Missing widgets: ${statusResult.missing.join(', ')}`
          : 'All cluster status widgets visible',
      )
      .toBe(true);

    const healthResult = await vmListPage.getHealthSectionWidgetsVisibility(
      utils.TestTimeouts.DEFAULT,
    );
    expect
      .soft(
        healthResult.allVisible,
        healthResult.missing.length
          ? `Missing health widgets: ${healthResult.missing.join(', ')}`
          : 'All health widgets visible',
      )
      .toBe(true);

    const { count, allVisible } = await vmListPage.getResourceAllocationChartsVisibility(
      utils.TestTimeouts.DEFAULT,
    );
    expect.soft(count, 'Resource allocation should have 4 charts').toBe(4);
    expect.soft(allVisible, 'All 4 charts should be visible').toBe(true);

    const overviewTab = await vmListPage.isOverviewTabSelected();
    expect.soft(overviewTab, 'Overview tab selected by default').toBe(true);
  });

  test('Migration and descheduler status widgets are visible on cluster overview', async ({
    vmTreePage,
    vmListPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_OVERVIEW_TAG],
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    const migrationsVisible = await vmListPage.isMigrationsWidgetVisible(
      utils.TestTimeouts.DEFAULT,
    );
    expect.soft(migrationsVisible, 'Migration statuses widget visible').toBe(true);

    const title = await vmListPage.getMigrationStatusSectionTitle(utils.TestTimeouts.DEFAULT);
    expect.soft(title, 'Heading uses plural "Migration statuses"').toBe('Migration statuses');

    const guestTitle = await vmListPage.getGuestAgentWidgetTitle(utils.TestTimeouts.DEFAULT);
    expect.soft(guestTitle, 'Guest agent widget title').toBe('Guest agent status');

    const descheduler = await vmListPage.getDeschedulerStatus(utils.TestTimeouts.DEFAULT);
    if (descheduler.label !== null) {
      expect.soft(descheduler.label, 'Descheduler label text').toBe('Descheduler status');
      if (descheduler.value !== null) {
        const validDeschedulerValues = ['Not installed', 'Active', 'Unknown'];
        expect
          .soft(
            validDeschedulerValues.includes(descheduler.value),
            `Descheduler value should be one of ${validDeschedulerValues.join('/')}, got "${
              descheduler.value
            }"`,
          )
          .toBe(true);
      }
    }

    const nodeLoadVisible = await vmListPage.isNodeLoadDistributionVisible(
      utils.TestTimeouts.DEFAULT,
    );
    expect.soft(nodeLoadVisible, 'Node load distribution visible').toBe(true);

    const nodeNames = await vmListPage.getNodeLoadDistributionNames(utils.TestTimeouts.DEFAULT);
    expect.soft(nodeNames.length, 'At least one node listed').toBeGreaterThan(0);

    const computeStatuses = await vmListPage.getComputeMigrationStatusNames(
      utils.TestTimeouts.DEFAULT,
    );
    expect
      .soft(computeStatuses.length, 'Compute migrations should have status entries')
      .toBeGreaterThan(0);
    expect.soft(computeStatuses, 'Should include "Scheduled" status').toContain('Scheduled');
    expect.soft(computeStatuses, 'Should include "Succeeded" status').toContain('Succeeded');

    const storagePlans = await vmListPage.isStorageMigrationPlansVisible(
      utils.TestTimeouts.DEFAULT,
    );
    expect.soft(storagePlans, 'Storage migration plans widget visible').toBe(true);
  });

  test('Cluster and project VM overview tabs switch correctly with expected widget visibility', async ({
    vmTreePage,
    vmListPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_OVERVIEW_TAG],
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    await vmListPage.clickVmListTab();
    const listLoaded = await vmListPage.verifyPageLoaded();
    expect.soft(listLoaded, 'VM list visible after tab switch').toBe(true);

    await vmListPage.clickOverviewTab();
    const overviewReselected = await vmListPage.isOverviewTabSelected();
    expect.soft(overviewReselected, 'Overview tab selected after switching back').toBe(true);

    const clusterWidget = await vmListPage.isClusterStatusWidgetPresent();
    expect.soft(clusterWidget, 'Cluster status widget present after tab switch').toBe(true);

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.searchTreeView(testConfig.testNamespace);
    await vmListPage.clickProjectNode(testConfig.testNamespace);

    const noCluster = await vmListPage.isClusterStatusWidgetPresent();
    expect.soft(noCluster, 'Cluster status NOT present at project level').toBe(false);

    const healthResult = await vmListPage.getHealthSectionWidgetsVisibility(
      utils.TestTimeouts.DEFAULT,
    );
    expect.soft(healthResult.allVisible, 'Health widgets visible at project level').toBe(true);

    const drillDown = await vmListPage.clickVmStatusDrillDown(
      testConfig.testNamespace,
      utils.TestTimeouts.DEFAULT,
    );
    if (drillDown.clicked) {
      expect.soft(drillDown.url, 'URL contains status filter').toMatch(/status|rowFilter-status/);
      expect.soft(drillDown.url, 'URL switches to vms tab').toContain('tab=vms');
    }
  });

  test('Overview "View all" links are visible with valid hrefs and navigate correctly', async ({
    vmTreePage,
    vmListPage,
    vmOverviewTabPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_OVERVIEW_TAG],
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    const links = await vmOverviewTabPage.getOverviewViewAllLinks(utils.TestTimeouts.DEFAULT);
    const visibleLinks = links.filter((l) => l.visible);
    expect
      .soft(visibleLinks.length, 'Should find at least 2 visible View all links')
      .toBeGreaterThanOrEqual(2);

    for (const link of visibleLinks) {
      expect
        .soft(link.href.length, `"View all" for ${link.section} should have a non-empty href`)
        .toBeGreaterThan(0);
    }

    const migrationsNav = await vmOverviewTabPage.clickViewAllLink(
      'migrations',
      utils.TestTimeouts.DEFAULT,
    );
    expect.soft(migrationsNav.clicked, '"View all" for migrations should be clickable').toBe(true);
    expect
      .soft(migrationsNav.url, 'Navigation URL should contain "migrations"')
      .toContain('migrations');
  });

  test('Overview status score items show tooltips and View all links navigate without opening new tabs', async ({
    vmTreePage,
    vmListPage,
    vmOverviewTabPage,
    testConfig,
    utils,
  }) => {
    test.setTimeout(utils.TestTimeouts.TEST_EXTENDED);
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_OVERVIEW_TAG],
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    await test.step('Status score items show tooltip on hover', async () => {
      const tooltipInfo = await vmOverviewTabPage.getStatusScoreItemTooltipInfo(
        utils.TestTimeouts.DEFAULT,
      );
      expect
        .soft(tooltipInfo.itemCount, 'At least one status score item should exist')
        .toBeGreaterThan(0);

      if (tooltipInfo.checkedItem) {
        expect
          .soft(tooltipInfo.checkedItem.text.length, 'Status score item should have non-empty text')
          .toBeGreaterThan(0);

        if (tooltipInfo.checkedItem.tooltipText) {
          expect
            .soft(
              tooltipInfo.checkedItem.tooltipText.length,
              'Tooltip should contain text when shown',
            )
            .toBeGreaterThan(0);
        }
      }
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    await test.step('Storage migration plans View all navigates internally (if available)', async () => {
      try {
        const result = await vmOverviewTabPage.clickViewAllLinkAndVerifyInternalNavigation(
          'StorageMigrationPlan',
          10_000,
        );

        if (result.navigated) {
          expect
            .soft(result.url, 'URL should contain StorageMigrationPlan')
            .toContain('StorageMigrationPlan');
          expect
            .soft(result.openedNewTab, 'Storage migration plans View all should NOT open a new tab')
            .toBe(false);
        }
      } catch {
        // StorageMigrationPlan feature not installed — skip
      }
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    await test.step('Compute migrations View all navigates internally', async () => {
      const result = await vmOverviewTabPage.clickViewAllLinkAndVerifyInternalNavigation(
        'migrations',
        utils.TestTimeouts.DEFAULT,
      );

      expect.soft(result.navigated, 'Migrations View all should navigate').toBe(true);
      expect.soft(result.url, 'URL should contain migrations').toContain('migrations');
      expect.soft(result.openedNewTab, 'Migrations View all should NOT open a new tab').toBe(false);
    });
  });

  test('Selected overview tab is preserved when switching between cluster and project nodes', async ({
    vmTreePage,
    vmListPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: GATING,
      tags: [GATING_TAG, VM_OVERVIEW_TAG],
    });

    await navigateToVirtualMachinesWithEmptyProjectsInTree(vmTreePage, testConfig.testNamespace);
    await vmListPage.clickLocalClusterInTree();

    const initialTab = await vmListPage.getSelectedTabName();
    expect.soft(initialTab, 'Initial tab should be Overview').toBe('Overview');

    await vmListPage.clickVmListTab();
    const listTab = await vmListPage.getSelectedTabName();
    expect.soft(listTab, 'Should be on Virtual machines tab').toBe('Virtual machines');

    await vmListPage.searchTreeView(testConfig.testNamespace);
    await vmListPage.clickProjectNode(testConfig.testNamespace);

    const tabAfterSwitch = await vmListPage.getSelectedTabName();
    expect
      .soft(tabAfterSwitch, 'Tab should be preserved after switching project')
      .toBe('Virtual machines');

    await vmListPage.clearTreeViewSearch();
    await vmListPage.clickLocalClusterInTree();

    const tabAfterReturn = await vmListPage.getSelectedTabName(utils.TestTimeouts.DEFAULT);
    expect
      .soft(tabAfterReturn, 'Tab should be preserved after returning to cluster')
      .toBe('Virtual machines');
  });
});
