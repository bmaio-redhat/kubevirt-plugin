import { ADMIN_ONLY_TAG, MIGRATION_FEATURE, MIGRATION_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/migration-fixture';

const SUITE = 'VM storage migration';

test.describe(SUITE, { tag: [MIGRATION_TAG, ADMIN_ONLY_TAG] }, () => {
  test.describe.configure({ mode: 'parallel' });

  test.beforeEach(async ({ vmTreePage, testConfig, utils }) => {
    test.setTimeout(5 * utils.MINUTE);
    await utils.navigateToVirtualMachinesWithEmptyProjectsInTree(
      vmTreePage,
      testConfig.testNamespace,
    );
  });

  test.afterEach(async ({ k8sClient, utils }) => {
    await utils.cleanupMigrationPlans(k8sClient);
  });

  test('Online storage migration triggers and creates plan with expected structure', async ({
    utils,
    k8sClient,
    vmListPage,
    vmTreePage,
    cleanup,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const missingDestinationSc = await utils.getMissingStorageClasses(k8sClient, [
      utils.STORAGE_CLASSES.VOL_DESTINATION,
    ]);
    if (missingDestinationSc.length > 0) {
      test.skip(
        true,
        `Cluster missing StorageClass(es) for online migration: ${missingDestinationSc.join(', ')}`,
      );
    }

    const nsWrap = await utils.setupPwTestNamespace(
      k8sClient,
      cleanup,
      'vm-online-migrate-storage',
    );
    const vmNameDraw = utils.createPwPrefixedName(utils.VM_NAME_PREFIXES.SC_MIGRATION_VM);
    const vmName = vmNameDraw.name;

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.FEDORA,
      vmName,
      nsWrap.namespace,
      'openshift',
      true,
    );
    cleanup.trackVirtualMachine(vmName, nsWrap.namespace);

    await utils.navigateToProjectVmListForNamespace(vmTreePage, nsWrap.namespace);
    await vmListPage.waitForVmRowVisible(vmName, utils.TestTimeouts.VM_BOOTUP);

    await vmListPage.triggerStorageMigration(vmName, utils.STORAGE_CLASSES.VOL_DESTINATION);

    const plan = await utils.waitForMigrationPlanCreated(k8sClient, nsWrap.namespace);
    expect(plan, 'Migration plan CR should be created after triggering').not.toBeNull();
    if (plan) {
      expect(plan.name, 'Plan name should be a non-empty string').toBeTruthy();
    }
  });

  test('Offline storage migration triggers for a stopped VM', async ({
    utils,
    k8sClient,
    vmListPage,
    vmTreePage,
    cleanup,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const missingDestinationSc = await utils.getMissingStorageClasses(k8sClient, [
      utils.STORAGE_CLASSES.VOL_DESTINATION,
    ]);
    if (missingDestinationSc.length > 0) {
      test.skip(
        true,
        `Cluster missing StorageClass(es) for offline migration: ${missingDestinationSc.join(
          ', ',
        )}`,
      );
    }

    const nsWrap = await utils.setupPwTestNamespace(
      k8sClient,
      cleanup,
      'vm-offline-migrate-storage',
    );
    const vmNameDraw = utils.createPwPrefixedName(utils.VM_NAME_PREFIXES.SC_MIGRATION_VM);
    const vmName = vmNameDraw.name;

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.FEDORA,
      vmName,
      nsWrap.namespace,
      'openshift',
      false,
    );
    cleanup.trackVirtualMachine(vmName, nsWrap.namespace);

    await utils.navigateToProjectVmListForNamespace(vmTreePage, nsWrap.namespace);
    await vmListPage.waitForVmRowVisible(vmName, utils.TestTimeouts.UI_ELEMENT_VISIBILITY);
    await vmListPage.waitForVmStatus(vmName, 'Stopped', utils.TestTimeouts.VM_BOOTUP);

    await vmListPage.triggerStorageMigration(vmName, utils.STORAGE_CLASSES.VOL_DESTINATION);

    const plan = await utils.waitForMigrationPlanCreated(k8sClient, nsWrap.namespace);
    expect(plan, 'Migration plan CR should be created for offline migration').not.toBeNull();
  });

  test('Selected volumes migration with wizard validation triggers and creates plan', async ({
    utils,
    k8sClient,
    vmListPage,
    vmTreePage,
    cleanup,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const missingVolSc = await utils.getMissingStorageClasses(k8sClient, [
      utils.STORAGE_CLASSES.VOL_DESTINATION,
    ]);
    if (missingVolSc.length > 0) {
      test.skip(
        true,
        `Cluster missing StorageClass(es) for volume migration: ${missingVolSc.join(', ')}`,
      );
    }

    const nsWrap = await utils.setupPwTestNamespace(k8sClient, cleanup, 'vm-migrate-storage-vol');
    const vmNameDraw = utils.createPwPrefixedName(utils.VM_NAME_PREFIXES.SC_MIGRATION_VOL);
    const vmName = vmNameDraw.name;

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.FEDORA,
      vmName,
      nsWrap.namespace,
      'openshift',
      false,
    );
    cleanup.trackVirtualMachine(vmName, nsWrap.namespace);

    const verifyResult = await k8sClient.verifyVmCreated(
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_CREATION,
    );
    expect.soft(verifyResult.exists, `VM ${vmName} should be created`).toBe(true);

    await utils.navigateToProjectVmListForNamespace(vmTreePage, nsWrap.namespace);
    await vmListPage.waitForVmRowVisible(vmName, utils.TestTimeouts.UI_ELEMENT_VISIBILITY);

    await vmListPage.openStorageMigrationModal(vmName);

    await vmListPage.clickSelectedVolumesRadio();
    const nextButtonDisabledAfterDeselect = await vmListPage.isNextButtonDisabled();
    expect
      .soft(
        nextButtonDisabledAfterDeselect,
        'Next button should be disabled when no volumes are selected',
      )
      .toBe(true);

    await vmListPage.selectAllVolumesInMigrationModal();
    const nextButtonDisabledAfterSelect = await vmListPage.isNextButtonDisabled();
    expect
      .soft(
        nextButtonDisabledAfterSelect,
        'Next button should be enabled after selecting all volumes',
      )
      .toBe(false);

    await vmListPage.closeMigrationModal();

    await vmListPage.triggerStorageMigration(vmName, utils.STORAGE_CLASSES.VOL_DESTINATION, true);

    const plan = await utils.waitForMigrationPlanCreated(k8sClient, nsWrap.namespace);
    expect(
      plan,
      'Migration plan CR should be created for selected-volumes migration',
    ).not.toBeNull();
  });

  test('Storage migration decommissions source volumes when keep-source is unchecked', async ({
    utils,
    k8sClient,
    vmListPage,
    vmTreePage,
    cleanup,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const missingVolSc = await utils.getMissingStorageClasses(k8sClient, [
      utils.STORAGE_CLASSES.VOL_DESTINATION,
    ]);
    if (missingVolSc.length > 0) {
      test.skip(true, `Cluster missing StorageClass(es): ${missingVolSc.join(', ')}`);
    }

    const nsWrap = await utils.setupPwTestNamespace(k8sClient, cleanup, 'vm-mig-cleanup');
    const vmNameDraw = utils.createPwPrefixedName('vm-mig-cleanup');
    const vmName = vmNameDraw.name;

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.FEDORA,
      vmName,
      nsWrap.namespace,
      'openshift',
      true,
    );
    cleanup.trackVirtualMachine(vmName, nsWrap.namespace);

    const verifyResult = await k8sClient.verifyVmCreated(
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_BOOTUP,
    );
    expect.soft(verifyResult.exists, `VM ${vmName} should be created`).toBe(true);

    await utils.waitForVirtualMachineReady(
      k8sClient,
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_BOOTUP,
    );

    await utils.navigateToProjectVmListForNamespace(vmTreePage, nsWrap.namespace);

    await vmListPage.triggerStorageMigration(
      vmName,
      utils.STORAGE_CLASSES.VOL_DESTINATION,
      false,
      false,
    );

    const plan = await utils.waitForMigrationPlanCreated(k8sClient, nsWrap.namespace);
    expect(plan, 'Migration plan CR should be created').not.toBeNull();
    if (plan) {
      expect(
        plan.retentionPolicy,
        'Migration plan should have deleteSource retention policy when keep is unchecked',
      ).toBe('deleteSource');
    }
  });

  test('Storage migration retains source volumes when keep-source is checked', async ({
    utils,
    k8sClient,
    vmListPage,
    vmTreePage,
    cleanup,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const missingVolSc = await utils.getMissingStorageClasses(k8sClient, [
      utils.STORAGE_CLASSES.VOL_DESTINATION,
    ]);
    if (missingVolSc.length > 0) {
      test.skip(true, `Cluster missing StorageClass(es): ${missingVolSc.join(', ')}`);
    }

    const nsWrap = await utils.setupPwTestNamespace(k8sClient, cleanup, 'vm-mig-retain');
    const vmNameDraw = utils.createPwPrefixedName('vm-mig-retain');
    const vmName = vmNameDraw.name;

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.FEDORA,
      vmName,
      nsWrap.namespace,
      'openshift',
      true,
    );
    cleanup.trackVirtualMachine(vmName, nsWrap.namespace);

    const verifyResult = await k8sClient.verifyVmCreated(
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_BOOTUP,
    );
    expect.soft(verifyResult.exists, `VM ${vmName} should be created`).toBe(true);

    await utils.waitForVirtualMachineReady(
      k8sClient,
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_BOOTUP,
    );

    await utils.navigateToProjectVmListForNamespace(vmTreePage, nsWrap.namespace);

    await vmListPage.triggerStorageMigration(
      vmName,
      utils.STORAGE_CLASSES.VOL_DESTINATION,
      false,
      true,
    );

    const plan = await utils.waitForMigrationPlanCreated(k8sClient, nsWrap.namespace);
    expect(plan, 'Migration plan CR should be created').not.toBeNull();
    if (plan) {
      expect(
        plan.retentionPolicy,
        'Migration plan should have keepSource retention policy when keep is checked',
      ).toBe('keepSource');
    }
  });

  test('Cancelling an in-progress storage migration removes the migration plan', async ({
    utils,
    k8sClient,
    vmListPage,
    vmTreePage,
    cleanup,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: MIGRATION_FEATURE,
      tags: [MIGRATION_TAG, ADMIN_ONLY_TAG],
    });

    const missingDestinationSc = await utils.getMissingStorageClasses(k8sClient, [
      utils.STORAGE_CLASSES.VOL_DESTINATION,
    ]);
    if (missingDestinationSc.length > 0) {
      test.skip(
        true,
        `Cluster missing StorageClass(es) for storage migration cancel test: ${missingDestinationSc.join(
          ', ',
        )}`,
      );
    }

    const nsWrap = await utils.setupPwTestNamespace(k8sClient, cleanup, 'vm-mig-cancel');
    const vmNameDraw = utils.createPwPrefixedName('vm-mig-cancel');
    const vmName = vmNameDraw.name;

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.FEDORA,
      vmName,
      nsWrap.namespace,
      'openshift',
      true,
    );
    cleanup.trackVirtualMachine(vmName, nsWrap.namespace);

    const verifyResult = await k8sClient.verifyVmCreated(
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_BOOTUP,
    );
    expect.soft(verifyResult.exists, `VM ${vmName} should be created`).toBe(true);

    const addedDiskName = await utils.waitForVmDiskAndGetName(
      k8sClient,
      vmName,
      nsWrap.namespace,
      'disk',
      utils.TestTimeouts.DATA_VOLUME_EXTENDED,
    );
    expect.soft(addedDiskName, 'Root disk should be present').not.toBeNull();
    await utils.waitForVirtualMachineReady(
      k8sClient,
      vmName,
      nsWrap.namespace,
      utils.TestTimeouts.VM_BOOTUP,
    );

    await utils.navigateToProjectVmListForNamespace(vmTreePage, nsWrap.namespace);

    await vmListPage.startStorageMigrationAndCancelWhileInProgress(vmName);

    await utils.waitForVirtualMachineReady(k8sClient, vmName, nsWrap.namespace, 2 * utils.MINUTE);

    const planCount = await utils.getMigrationPlanCount(k8sClient, nsWrap.namespace);
    expect
      .soft(
        planCount,
        'Migration plan should be deleted after cancelling in-progress storage migration',
      )
      .toBe(0);
  });
});
