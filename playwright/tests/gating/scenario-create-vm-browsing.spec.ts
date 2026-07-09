import { load as yamlLoad } from 'js-yaml';

import { ADMIN_ONLY_TAG, GATING, GATING_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/gating-fixture';

const SUITE = 'VM Creation browsing';

test.describe('VM Creation browsing (gating)', { tag: [GATING_TAG] }, () => {
  test('Template catalog provider filter shows Red Hat templates and hides others', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    await createVmPage.filterByProvider('Red Hat', true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.RHEL9),
        'RHEL 9 visible under Red Hat provider',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.FEDORA),
        'Fedora visible under Red Hat provider',
      )
      .toBe(true);
    await createVmPage.filterByProvider('Red Hat', false);

    await createVmPage.filterByProvider('Other', true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.RHEL9),
        'RHEL 9 should NOT be visible under Other provider',
      )
      .toBe(false);
    await createVmPage.filterByProvider('Other', false);
  });

  test('Template catalog supports grid and list view switching', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    await createVmPage.switchView('list');
    const listVisible = await createVmPage.verifyTemplateVisibleInListView(
      utils.TEMPLATE_DISPLAY_NAMES.RHEL8,
    );
    expect.soft(listVisible, 'RHEL 8 visible in list view').toBe(true);

    await createVmPage.switchView('grid');
    const gridVisible = await createVmPage.verifyTemplateCardVisible(
      utils.TEMPLATE_DISPLAY_NAMES.RHEL8,
    );
    expect.soft(gridVisible, 'RHEL 8 visible in grid view').toBe(true);
  });

  test('Template catalog filters by OS name show correct templates', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    await createVmPage.filterByOSName('RHEL', true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.RHEL8),
        'RHEL 8 visible',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.RHEL9),
        'RHEL 9 visible',
      )
      .toBe(true);
    await createVmPage.filterByOSName('RHEL', false);

    if (!utils.EnvVariables.isS390x) {
      await createVmPage.filterByOSName('Windows', true);
      expect
        .soft(
          await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.WIN11),
          'Windows 11 visible',
        )
        .toBe(true);
      expect
        .soft(
          await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.WIN2K22),
          'Windows Server 2022 visible',
        )
        .toBe(true);
      await createVmPage.filterByOSName('Windows', false);
    }

    await createVmPage.filterByOSName(utils.OS_FILTERS.FEDORA, true);
    const fedoraCount = await createVmPage.countTemplateCards(utils.TEMPLATE_DISPLAY_NAMES.FEDORA);
    expect.soft(fedoraCount, 'Fedora template count should be 1').toBe(1);
    await createVmPage.filterByOSName(utils.OS_FILTERS.FEDORA, false);
  });

  test('Template catalog text search narrows results to matching templates', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    await createVmPage.searchTemplate(utils.TEMPLATE_METADATA_NAMES.RHEL8);

    const visible = await createVmPage.verifyTemplateCardVisible(
      utils.TEMPLATE_DISPLAY_NAMES.RHEL8,
    );
    expect.soft(visible, 'RHEL 8 visible after text filtering').toBe(true);
  });

  test('Template catalog boot source filter shows only templates with available source', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    await createVmPage.searchTemplate('');
    await createVmPage.filterByBootSourceAvailable(true);

    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.RHEL8),
        'RHEL 8 visible',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.RHEL9),
        'RHEL 9 visible',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.FEDORA),
        'Fedora visible',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_DISPLAY_NAMES.CENTOS_STREAM_9),
        'CentOS Stream 9 visible',
      )
      .toBe(true);
    await createVmPage.filterByBootSourceAvailable(false);
  });

  test('Template catalog combined OS and provider filters refine results correctly', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    test.skip(utils.EnvVariables.isS390x, 'Windows templates not available on s390x');
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    // Windows OS + Red Hat provider → only Windows templates from Red Hat
    await createVmPage.filterByOSName('Windows', true);
    await createVmPage.filterByProvider('Red Hat', true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.WIN11),
        'Windows 11 visible with Windows+Red Hat filters',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.WIN2K22),
        'Windows Server 2022 visible with Windows+Red Hat filters',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.RHEL9),
        'RHEL 9 should NOT be visible with Windows OS filter active',
      )
      .toBe(false);
    await createVmPage.filterByOSName('Windows', false);

    // Red Hat provider + RHEL OS → only RHEL templates, no Windows
    await createVmPage.filterByOSName('RHEL', true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.RHEL9),
        'RHEL 9 visible with RHEL OS + Red Hat provider filters',
      )
      .toBe(true);
    expect
      .soft(
        await createVmPage.verifyTemplateCardVisible(utils.TEMPLATE_METADATA_NAMES.WIN11),
        'Windows 11 should NOT be visible with RHEL OS filter active',
      )
      .toBe(false);
    await createVmPage.filterByOSName('RHEL', false);
    await createVmPage.filterByProvider('Red Hat', false);
  });

  test('Template catalog "All templates" button reveals all available templates', async ({
    createVmPage,
    vmListPage,
    vmWizardNavigationPage,
    utils,
  }) => {
    await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG] });
    await vmListPage.navigateToVirtualMachinesViaUI();
    await vmWizardNavigationPage.openWizardFromCreateDropdown();
    await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
    await vmWizardNavigationPage.ensureVmNameFilled();
    await vmWizardNavigationPage.clickNext();

    await createVmPage.clickAllTemplatesButton();

    const visible = await createVmPage.verifyTemplateCardVisible(
      utils.TEMPLATE_DISPLAY_NAMES.CENTOS_STREAM_9,
    );
    expect.soft(visible, 'CentOS Stream 9 visible after showing all').toBe(true);
  });

  test(
    'Template creation and project filtering',
    { tag: ['@adminOnly'] },
    async ({
      createVmPage,
      vmListPage,
      vmWizardNavigationPage,
      templatesPage,
      k8sClient,
      testConfig,
      utils,
    }) => {
      test.skip(
        utils.EnvVariables.isNonPrivUser,
        'Requires admin: creates template CRDs in test namespace',
      );
      await utils.withAllure({ suite: SUITE, feature: GATING, tags: [GATING_TAG, ADMIN_ONLY_TAG] });
      const namespace = testConfig?.testNamespace || utils.EnvVariables.testNamespace;

      await templatesPage.navigateToNamespaceTemplatesViaUI(namespace);

      const exampleTemplateName = utils.generateRandomTemplateName('example');
      await templatesPage.clickCreateTemplate();
      await templatesPage.setCreateTemplateExampleNameInYamlEditor(exampleTemplateName);
      await templatesPage.clickCreateButtonInModal();
      k8sClient.trackResource('Template', exampleTemplateName, namespace);

      const templateNameUser = utils.generateRandomTemplateName('user-template');
      const templateDisplayNameUser = `user-template ${utils.generateRandomString(
        8,
        'alphanumeric',
      )}`;
      const userTplResource = utils.TemplateFactory.createResourceObject({
        description: 'Test user-provided template for catalog filter test',
        name: templateNameUser,
        namespace,
        displayName: templateDisplayNameUser,
      });
      await k8sClient.createCustomResource(
        'template.openshift.io',
        'v1',
        namespace,
        'templates',
        userTplResource,
      );
      k8sClient.trackResource('Template', templateNameUser, namespace);

      const templateNameProject = utils.generateRandomTemplateName('default-template');
      const templateDisplayNameProject = `default-template ${utils.generateRandomString(
        8,
        'alphanumeric',
      )}`;
      const templateYaml = utils.TemplateFactory.create({
        name: templateNameProject,
        displayName: templateDisplayNameProject,
        namespace,
        customLabels: { 'template.openshift.io/provider': 'default' },
      });
      const parsedProjectTpl = yamlLoad(templateYaml) as Record<string, unknown>;
      await k8sClient.createCustomResource(
        'template.openshift.io',
        'v1',
        namespace,
        'templates',
        parsedProjectTpl,
      );
      k8sClient.trackResource('Template', templateNameProject, namespace);

      await test.step('Create template from example', async () => {
        const isCreated = await templatesPage.verifyTemplateCreationFromExample('Template details');
        expect.soft(isCreated, 'Template created from example').toBe(true);

        const fedoraVisible = await templatesPage.verifyTemplateCreationFromExample(
          utils.TEMPLATE_DISPLAY_NAMES.FEDORA,
        );
        expect.soft(fedoraVisible, 'Fedora VM template visible').toBe(true);
      });

      await vmListPage.navigateToVirtualMachinesViaUI();
      await vmWizardNavigationPage.openWizardFromCreateDropdown();
      await vmWizardNavigationPage.selectCreationMethod('fromTemplate');
      await vmWizardNavigationPage.ensureVmNameFilled();
      await vmWizardNavigationPage.clickNext();

      await test.step('User template visible in catalog', async () => {
        const verifyResult = await k8sClient.verifyTemplateCreated(templateNameUser, namespace);
        expect.soft(verifyResult.exists, `Template ${templateNameUser} created`).toBe(true);

        await createVmPage.clickUserProvidedTab();
        // CNV 4.99+: cards show metadata name (not display name) — verify by metadata name
        const visible = await createVmPage.verifyTemplateCardVisible(templateNameUser);
        expect.soft(visible, 'User-provided template visible').toBe(true);
      });

      await test.step('Template visible per project', async () => {
        const verifyResult = await k8sClient.verifyTemplateCreated(templateNameProject, namespace);
        expect.soft(verifyResult.exists, `Template ${templateNameProject} exists`).toBe(true);

        await createVmPage.selectProjectFromCatalog(namespace);
        await createVmPage.clickUserProvidedTab();
        // CNV 4.99+: cards show metadata name (not display name) — verify by metadata name
        const visible = await createVmPage.verifyTemplateCardVisible(templateNameProject);
        expect.soft(visible, 'Example template visible in project namespace').toBe(true);
      });
    },
  );
});
