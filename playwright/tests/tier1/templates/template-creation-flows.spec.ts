import type KubernetesClient from '@/clients/kubernetes-client';
import type { TemplateConfig } from '@/data-factories/template-factory';
import { T1, T1_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/templates-fixture';
import type { TestUtilsType } from '@/fixtures/test-utils';

const SUITE = 'Template creation flows';

async function setupPwNamespace(
  k8sClient: KubernetesClient,
  suffix: string,
  utils: TestUtilsType,
): Promise<string> {
  const ns = utils.generateTestNamespace(suffix);
  await k8sClient.createNamespace(ns);
  await k8sClient.waitForNamespaceReady(ns);
  k8sClient.trackResource('Namespace', ns);
  return ns;
}

async function setupTemplateFromResource(
  k8sClient: KubernetesClient,
  prefix: string,
  config: Omit<Partial<TemplateConfig>, 'namespace'> & { targetNamespace: string; name?: string },
  utils: TestUtilsType,
): Promise<{ templateName: string; templateDisplayName: string }> {
  const { targetNamespace, name: explicitName, ...templateFields } = config;
  const templateName = explicitName ?? utils.generateRandomTemplateName(prefix);
  const templateDisplayName =
    templateFields.displayName ?? `${prefix} ${utils.generateRandomString(8, 'alphanumeric')}`;
  const templateResource = utils.TemplateFactory.createResourceObject({
    ...templateFields,
    name: templateName,
    namespace: targetNamespace,
    displayName: templateDisplayName,
  });
  await k8sClient.createCustomResource(
    'template.openshift.io',
    'v1',
    targetNamespace,
    'templates',
    templateResource,
  );
  k8sClient.trackResource('Template', templateName, targetNamespace);
  return { templateName, templateDisplayName };
}

test.describe.serial('Template creation flows', { tag: [T1_TAG, '@tier1-templates'] }, () => {
  let sharedNs: string;
  let setupError: string | undefined;

  test.beforeAll(async ({ k8sClient, utils }) => {
    try {
      sharedNs = await setupPwNamespace(k8sClient, 'tpl-creation', utils);
    } catch (error: unknown) {
      setupError = error instanceof Error ? error.message : String(error);
    }
  });

  test.beforeEach(async ({ utils }) => {
    test.skip(!!setupError, `Shared setup failed: ${setupError}`);
    await utils.withAllure({
      suite: SUITE,
      feature: T1,
      tags: [T1_TAG, '@tier1-templates'],
    });
  });

  test('Save existing VM as a template from the VM detail page', async ({
    k8sClient,
    pageCommons,
    vmDetailPage,
    templatesPage,
    utils,
  }) => {
    test.setTimeout(utils.TestTimeouts.TEST_VM_CREATION);

    const vmName = utils.generateRandomVmName('vm-save-tpl');
    const templateName = utils.generateRandomTemplateName('saved-tpl');

    await k8sClient.createVmFromTemplate(
      utils.TEMPLATE_METADATA_NAMES.RHEL9,
      vmName,
      sharedNs,
      'openshift',
      false,
    );
    k8sClient.trackResource('VirtualMachine', vmName, sharedNs);

    const vmExists = await k8sClient.waitForVmExists(vmName, sharedNs);
    expect.soft(vmExists, `VM ${vmName} should exist before saving as template`).toBe(true);

    await vmDetailPage.navigateToVirtualMachineDetail(vmName, sharedNs);
    const isVmVisible = await vmDetailPage.isVmNameVisible(vmName);
    expect.soft(isVmVisible, `VM ${vmName} should be visible on detail page`).toBe(true);

    await vmDetailPage.saveAsTemplate(templateName, sharedNs);
    k8sClient.trackResource('VirtualMachineTemplate', templateName, sharedNs);

    if (!utils.EnvVariables.onAcm) {
      await pageCommons.switchProject(sharedNs);
    }
    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(templateName);
    const isVisible = await templatesPage.isTemplateVisible(templateName);
    expect.soft(isVisible, `Template ${templateName} should be visible in the list`).toBe(true);
  });

  test('Clone a template via the kebab menu', async ({
    k8sClient,
    pageCommons,
    templatesPage,
    utils,
  }) => {
    const { templateName: sourceName } = await setupTemplateFromResource(
      k8sClient,
      'clone-src',
      {
        targetNamespace: sharedNs,
        displayName: 'Clone Source Template',
        description: 'Template to be cloned',
      },
      utils,
    );

    if (!utils.EnvVariables.onAcm) {
      await pageCommons.switchProject(sharedNs);
    }

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(sourceName);
    const sourceVisible = await templatesPage.isTemplateVisible(sourceName);
    expect.soft(sourceVisible, `Source template ${sourceName} should be visible`).toBe(true);

    const cloneName = utils.generateRandomTemplateName('cloned-tpl');
    await templatesPage.clickCloneTemplate(sourceName);
    await templatesPage.fillCloneTemplateModal(cloneName);
    await templatesPage.clickFooterSaveButton();
    k8sClient.trackResource('Template', cloneName, sharedNs);

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(cloneName);
    const isVisible = await templatesPage.isTemplateVisible(cloneName);
    expect.soft(isVisible, `Cloned template ${cloneName} should be visible in the list`).toBe(true);
  });

  test('Create a template using the YAML editor', async ({
    k8sClient,
    pageCommons,
    templatesPage,
    utils,
  }) => {
    if (!utils.EnvVariables.onAcm) {
      await pageCommons.switchProject(sharedNs);
    }

    const templateName = utils.generateRandomTemplateName('yaml-tpl');
    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.clickCreateTemplate();

    await templatesPage.setCreateTemplateExampleNameInYamlEditor(templateName);
    await templatesPage.clickCreateButtonInModal();
    k8sClient.trackResource('Template', templateName, sharedNs);

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(templateName);
    const isVisible = await templatesPage.isTemplateVisible(templateName);
    expect
      .soft(isVisible, `Template ${templateName} should be visible after YAML creation`)
      .toBe(true);
  });

  test('Delete a template via the UI', async ({ k8sClient, pageCommons, templatesPage, utils }) => {
    const { templateName } = await setupTemplateFromResource(
      k8sClient,
      'del-tpl',
      {
        targetNamespace: sharedNs,
        displayName: 'Template to delete',
        description: 'Will be deleted via UI',
      },
      utils,
    );

    if (!utils.EnvVariables.onAcm) {
      await pageCommons.switchProject(sharedNs);
    }

    await templatesPage.navigateToTemplatesViaUI();
    await templatesPage.filterTemplatesByName(templateName);
    const isVisible = await templatesPage.isTemplateVisible(templateName);
    expect.soft(isVisible, `Template ${templateName} should be visible before deletion`).toBe(true);

    await templatesPage.deleteTemplateFromList(templateName);
    await templatesPage.waitForTemplateRowDetached(templateName);

    const isStillVisible = await templatesPage.isTemplateVisible(templateName);
    expect
      .soft(isStillVisible, `Template ${templateName} should no longer be visible after deletion`)
      .toBe(false);
  });
});
