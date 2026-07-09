import { NONPRIV_FEATURE, NONPRIV_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/nonpriv-fixture';
import { TEMPLATE_METADATA_NAMES } from '@/utils/template-constants';

const SUITE = 'NonPriv VM Wizard';

test.describe.serial('VM creation wizard as non-priv user', { tag: [NONPRIV_TAG] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  test('Non-priv user can open wizard from namespace VM page and see creation methods', async ({
    vmTreePage,
    vmWizardNavigationPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });
    test.setTimeout(utils.TestTimeouts.TEST_VM_CREATION);

    await vmTreePage.navigateToAllNamespacesVirtualMachines();
    await vmTreePage.toggleEmptyProjectsDisplay(true);
    await vmTreePage.searchTreeView(testConfig.testNamespace);
    await vmTreePage.clickProjectNode(testConfig.testNamespace);

    await vmWizardNavigationPage.openWizardFromCreateDropdown();

    const wizardVisible = await vmWizardNavigationPage.verifyWizardVisible();
    expect.soft(wizardVisible, 'Wizard should open for non-priv user').toBe(true);

    const methodsVisible = await vmWizardNavigationPage.verifyCreationMethodTilesVisible();
    expect.soft(methodsVisible, 'Creation method tiles should be visible').toBe(true);

    await vmWizardNavigationPage.cancelWizard();
  });

  test('Non-priv user From Template path shows template catalog with cards', async ({
    vmTreePage,
    vmWizardNavigationPage,
    testConfig,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });
    test.setTimeout(utils.TestTimeouts.TEST_VM_CREATION);

    await vmTreePage.navigateToAllNamespacesVirtualMachines();
    await vmTreePage.toggleEmptyProjectsDisplay(true);
    await vmTreePage.searchTreeView(testConfig.testNamespace);
    await vmTreePage.clickProjectNode(testConfig.testNamespace);

    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.clickNext();

    const catalogVisible = await vmWizardNavigationPage.verifyTemplateCatalogStepVisible();
    expect.soft(catalogVisible, 'Template catalog step should load for non-priv user').toBe(true);

    const hasCards = await vmWizardNavigationPage.verifyTemplateCatalogHasCards();
    expect.soft(hasCards, 'Template cards should be visible in catalog').toBe(true);

    await vmWizardNavigationPage.cancelWizard();
  });
});

test.describe.serial(
  'VM creation wizard E2E — Custom Configuration as non-priv user',
  { tag: [NONPRIV_TAG] },
  () => {
    test.beforeEach(({ utils }) => {
      test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
    });

    test('Non-priv user creates a VM via Custom Configuration wizard', async ({
      k8sClient,
      vmTreePage,
      vmWizardNavigationPage,
      vmWizardBootSourcePage,
      vmWizardComputePage,
      testConfig,
      utils,
    }) => {
      test.setTimeout(utils.TestTimeouts.TEST_VM_CREATION);
      await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

      await vmTreePage.navigateToAllNamespacesVirtualMachines();
      await vmTreePage.toggleEmptyProjectsDisplay(true);
      await vmTreePage.searchTreeView(testConfig.testNamespace);
      await vmTreePage.clickProjectNode(testConfig.testNamespace);

      await vmWizardNavigationPage.openWizardFromCreateDropdown();

      const wizardVisible = await vmWizardNavigationPage.verifyWizardVisible();
      expect(wizardVisible, 'Wizard should open').toBe(true);

      await test.step('Deployment details — verify Custom Configuration selected and generate name', async () => {
        const tilesVisible = await vmWizardNavigationPage.verifyCreationMethodTilesVisible();
        expect.soft(tilesVisible, 'Creation method tiles should be visible').toBe(true);

        const isCustomSelected = await vmWizardNavigationPage.verifyCreationMethodCardSelected(
          'newVm',
        );
        expect
          .soft(isCustomSelected, 'Custom configuration should be selected by default')
          .toBe(true);

        await vmWizardNavigationPage.generateVmName();
        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Guest OS — verify OS tiles and select RHEL OS type', async () => {
        const osTilesVisible = await vmWizardNavigationPage.verifyOsTilesVisible();
        expect
          .soft(osTilesVisible, 'OS tiles (RHEL, Windows, Other Linux) should be visible')
          .toBe(true);

        const osDropdownVisible = await vmWizardNavigationPage.verifyOsTypeDropdownVisible();
        expect.soft(osDropdownVisible, 'OS type dropdown should be visible').toBe(true);

        await vmWizardNavigationPage.selectOperatingSystem('rhel');
        await vmWizardNavigationPage.selectOsType('RHEL 9');

        const selectedOs = await vmWizardNavigationPage.getSelectedOsType();
        expect.soft(selectedOs.length, 'An OS type should be selected').toBeGreaterThan(0);

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Boot source — select a boot volume or skip', async () => {
        const bootStepVisible = await vmWizardBootSourcePage.verifyBootSourceStepVisible();
        expect.soft(bootStepVisible, 'Boot source step should be visible').toBe(true);

        const tableVisible = await vmWizardBootSourcePage.verifyBootVolumeTableOrEmptyState();
        expect.soft(tableVisible, 'Boot volume table or empty state should be visible').toBe(true);

        const volumeCount = await vmWizardBootSourcePage.getBootVolumeCount();
        if (volumeCount > 0) {
          await vmWizardBootSourcePage.selectBootVolumeByName('rhel');
        } else {
          await vmWizardBootSourcePage.selectNoBootSource();
        }

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Compute resources — verify instance type series and size', async () => {
        const computeVisible = await vmWizardComputePage.verifyComputeResourcesStepVisible();
        expect.soft(computeVisible, 'Compute resources step should be visible').toBe(true);

        const seriesVisible = await vmWizardComputePage.verifyInstanceTypeSeriesVisible();
        expect.soft(seriesVisible, 'Instance type series cards should be visible').toBe(true);

        const sizeText = await vmWizardComputePage.getComputeSizeDropdownText();
        expect.soft(sizeText, 'A compute size should be pre-selected').toContain('CPUs');

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Customization — verify tabs are accessible', async () => {
        const custVisible = await vmWizardComputePage.verifyCustomizationStepVisible();
        expect.soft(custVisible, 'Customization step should be visible').toBe(true);

        const tabsVisible = await vmWizardComputePage.verifyCustomizationTabsVisible();
        expect
          .soft(
            tabsVisible,
            'Customization tabs (Details, Storage, Network, etc.) should be visible',
          )
          .toBe(true);

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Review and create — verify summary and create VM', async () => {
        const reviewVisible = await vmWizardComputePage.verifyReviewStepVisible();
        expect(reviewVisible, 'Review step should be visible').toBe(true);

        const sectionsVisible = await vmWizardComputePage.verifyReviewSectionsVisible();
        expect.soft(sectionsVisible, 'Review sections should be visible').toBe(true);

        const checkboxVisible = await vmWizardComputePage.verifyStartAfterCreationCheckbox();
        expect.soft(checkboxVisible, 'Start after creation checkbox should be visible').toBe(true);

        await vmWizardNavigationPage.clickCreateVm();
        const redirected = await vmWizardNavigationPage.verifyRedirectedToVmDetails();
        expect.soft(redirected, 'Should redirect to VM details after creation').toBe(true);
      });

      await test.step('Verify VM resource was created', async () => {
        const vmName = await vmWizardNavigationPage.getCreatedVmNameFromUrl();
        expect.soft(vmName.length, 'VM name should be in the URL').toBeGreaterThan(0);
        if (vmName) {
          k8sClient.trackResource('VirtualMachine', vmName, testConfig.testNamespace);
          const result = await k8sClient.verifyVmCreated(vmName, testConfig.testNamespace);
          expect.soft(result.exists, `VM '${vmName}' should exist`).toBe(true);
        }
      });
    });
  },
);

test.describe.serial(
  'VM creation wizard E2E — From Template as non-priv user',
  { tag: [NONPRIV_TAG] },
  () => {
    test.beforeEach(({ utils }) => {
      test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
    });

    test('Non-priv user creates a VM from Template via the wizard', async ({
      k8sClient,
      vmTreePage,
      vmWizardNavigationPage,
      vmWizardComputePage,
      testConfig,
      utils,
    }) => {
      test.setTimeout(utils.TestTimeouts.TEST_VM_CREATION);
      await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

      await vmTreePage.navigateToAllNamespacesVirtualMachines();
      await vmTreePage.toggleEmptyProjectsDisplay(true);
      await vmTreePage.searchTreeView(testConfig.testNamespace);
      await vmTreePage.clickProjectNode(testConfig.testNamespace);

      await vmWizardNavigationPage.openWizardFromCreateDropdown();

      const wizardVisible = await vmWizardNavigationPage.verifyWizardVisible();
      expect(wizardVisible, 'Wizard should open').toBe(true);

      await test.step('Deployment details — select From Template and generate name', async () => {
        await vmWizardNavigationPage.selectCreationMethod('fromTemplate');

        const isTemplateSelected = await vmWizardNavigationPage.verifyCreationMethodCardSelected(
          'fromTemplate',
        );
        expect.soft(isTemplateSelected, 'From Template should be selected').toBe(true);

        await vmWizardNavigationPage.generateVmName();
        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Template catalog — verify cards and select rhel9-server-small', async () => {
        const catalogVisible = await vmWizardNavigationPage.verifyTemplateCatalogStepVisible();
        expect(catalogVisible, 'Template catalog should be visible').toBe(true);

        const toolbar = await vmWizardNavigationPage.verifyTemplateCatalogToolbar();
        expect.soft(toolbar.filterInput, 'Keyword filter input should be visible').toBe(true);

        const cardCount = await vmWizardNavigationPage.getTemplateCatalogCount();
        expect(cardCount, 'At least one template card should be visible').toBeGreaterThan(0);

        await vmWizardNavigationPage.selectTemplateByTestId('rhel9-server-small');

        const nextDisabled = await vmWizardNavigationPage.isNextButtonDisabled();
        expect(nextDisabled, 'Next should be enabled after selecting a template').toBe(false);

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Customization — verify tabs and auto-generated hostname', async () => {
        const custVisible = await vmWizardComputePage.verifyCustomizationStepVisible();
        expect(custVisible, 'Customization step should be visible').toBe(true);

        const tabsVisible = await vmWizardComputePage.verifyCustomizationTabsVisible();
        expect.soft(tabsVisible, 'Customization tabs should be visible').toBe(true);

        const hostname = await vmWizardComputePage.getCustomizationVmName();
        expect.soft(hostname.length, 'Hostname should be auto-generated').toBeGreaterThan(0);

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Review and create — verify summary and create VM', async () => {
        const reviewVisible = await vmWizardComputePage.verifyReviewStepVisible();
        expect(reviewVisible, 'Review step should be visible').toBe(true);

        const sectionsVisible = await vmWizardComputePage.verifyReviewSectionsVisible();
        expect.soft(sectionsVisible, 'Review sections should be visible').toBe(true);

        await vmWizardNavigationPage.clickCreateVm();
        const redirected = await vmWizardNavigationPage.verifyRedirectedToVmDetails();
        expect.soft(redirected, 'Should redirect to VM details after creation').toBe(true);
      });

      await test.step('Verify VM resource was created', async () => {
        const vmName = await vmWizardNavigationPage.getCreatedVmNameFromUrl();
        expect.soft(vmName.length, 'VM name should be in the URL').toBeGreaterThan(0);
        if (vmName) {
          k8sClient.trackResource('VirtualMachine', vmName, testConfig.testNamespace);
          const result = await k8sClient.verifyVmCreated(vmName, testConfig.testNamespace);
          expect.soft(result.exists, `VM '${vmName}' should exist`).toBe(true);
        }
      });
    });
  },
);

test.describe.serial(
  'VM creation wizard E2E — Clone existing VM as non-priv user',
  { tag: [NONPRIV_TAG] },
  () => {
    test.beforeEach(({ utils }) => {
      test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
    });

    test('Non-priv user clones an existing VM via the wizard', async ({
      k8sClient,
      vmTreePage,
      vmWizardNavigationPage,
      vmWizardComputePage,
      testConfig,
      utils,
    }) => {
      test.setTimeout(utils.TestTimeouts.TEST_EXTENDED);
      await utils.withAllure({ suite: SUITE, feature: NONPRIV_FEATURE, tags: [NONPRIV_TAG] });

      const sourceVmName = utils.generateRandomVmName('np-clone-src');

      await test.step('Precondition: Create source VM via admin K8s API', async () => {
        await k8sClient.createVmFromTemplate(
          TEMPLATE_METADATA_NAMES.RHEL9,
          sourceVmName,
          testConfig.testNamespace,
          'openshift',
          true,
        );
        k8sClient.trackResource('VirtualMachine', sourceVmName, testConfig.testNamespace);
        await utils.waitForVirtualMachineReady(
          k8sClient,
          sourceVmName,
          testConfig.testNamespace,
          utils.TestTimeouts.VM_BOOTUP,
        );
      });

      await vmTreePage.navigateToAllNamespacesVirtualMachines();
      await vmTreePage.toggleEmptyProjectsDisplay(true);
      await vmTreePage.searchTreeView(testConfig.testNamespace);
      await vmTreePage.clickProjectNode(testConfig.testNamespace);

      await vmWizardNavigationPage.openWizardFromCreateDropdown();

      const wizardVisible = await vmWizardNavigationPage.verifyWizardVisible();
      expect(wizardVisible, 'Wizard should open').toBe(true);

      await test.step('Deployment details — select Clone existing VirtualMachine', async () => {
        await vmWizardNavigationPage.selectCreationMethod('cloneVm');

        const isCloneSelected = await vmWizardNavigationPage.verifyCreationMethodCardSelected(
          'cloneVm',
        );
        expect.soft(isCloneSelected, 'Clone existing VirtualMachine should be selected').toBe(true);

        await vmWizardNavigationPage.clickNext();
      });

      await test.step('Source — verify VM list and select source VM', async () => {
        const sourceStepVisible = await vmWizardNavigationPage.verifyCloneSourceStepVisible();
        expect(sourceStepVisible, 'Source step heading should be visible').toBe(true);

        const vmListVisible = await vmWizardNavigationPage.verifyCloneVmListVisible();
        expect(vmListVisible, 'VM list should be visible in Source step').toBe(true);

        await vmWizardNavigationPage.searchCloneSourceByName(sourceVmName);
        await vmWizardNavigationPage.selectCloneSourceVm(sourceVmName);

        const nextDisabled = await vmWizardNavigationPage.isNextButtonDisabled();
        expect(nextDisabled, 'Next should be enabled after selecting a source VM').toBe(false);

        await vmWizardNavigationPage.clickNext();
      });

      let cloneVmName = '';

      await test.step('Review and create — verify clone summary and create', async () => {
        const reviewVisible = await vmWizardComputePage.verifyReviewStepVisible();
        expect(reviewVisible, 'Review step should be visible').toBe(true);

        cloneVmName = await vmWizardComputePage.getReviewVmName();
        expect(cloneVmName.length, 'Clone VM name should be auto-generated').toBeGreaterThan(0);

        const checkboxVisible = await vmWizardComputePage.verifyStartAfterCreationCheckbox();
        expect.soft(checkboxVisible, 'Start after creation checkbox should be visible').toBe(true);

        const createButtonText = await vmWizardComputePage.getCreateButtonText();
        expect
          .soft(createButtonText, 'Create button should say "Clone VirtualMachine"')
          .toContain('Clone');

        k8sClient.trackResource('VirtualMachine', cloneVmName, testConfig.testNamespace);
        await vmWizardNavigationPage.clickCreateVm();
        const redirected = await vmWizardNavigationPage.verifyRedirectedToVmDetails();
        expect.soft(redirected, 'Should redirect to VM details after cloning').toBe(true);
      });

      await test.step('Verify clone VM exists', async () => {
        const urlCloneName = await vmWizardNavigationPage.getCreatedVmNameFromUrl();
        if (urlCloneName) cloneVmName = urlCloneName;
        k8sClient.trackResource('VirtualMachine', cloneVmName, testConfig.testNamespace);

        const result = await k8sClient.verifyVmCreated(
          cloneVmName,
          testConfig.testNamespace,
          utils.TestTimeouts.VM_BOOTUP,
        );
        expect.soft(result.exists, `Clone VM '${cloneVmName}' should exist`).toBe(true);
      });
    });
  },
);
