import type KubernetesClient from '@/clients/kubernetes-client';
import type { TemplateConfig } from '@/data-factories/template-factory';
import { T2, T2_TAG } from '@/data-models/allure-constants';
import { expect, test } from '@/fixtures/templates-fixture';
import type { TestUtilsType } from '@/fixtures/test-utils';

const SUITE = 'Template detail page';

const TEMPLATE_FIELDS = {
  displayName: 'Detail Validation Template',
  description: 'Template created for detail page validation',
  cpuCores: 2,
  memory: '4Gi',
};

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

test.describe.serial(
  'Template detail page validation',
  { tag: [T2_TAG, '@tier2-templates'] },
  () => {
    let sharedNs: string;
    let templateName: string;
    let setupError: string | undefined;

    test.beforeAll(async ({ k8sClient, utils }) => {
      try {
        sharedNs = await setupPwNamespace(k8sClient, 'tpl-detail', utils);
        const result = await setupTemplateFromResource(
          k8sClient,
          'detail-tpl',
          {
            targetNamespace: sharedNs,
            ...TEMPLATE_FIELDS,
          },
          utils,
        );
        templateName = result.templateName;

        const exists = await k8sClient.verifyTemplateCreated(templateName, sharedNs);
        if (!exists.exists) {
          throw new Error(`Template ${templateName} was not created`);
        }
      } catch (error: unknown) {
        setupError = error instanceof Error ? error.message : String(error);
      }
    });

    test.beforeEach(async ({ utils }) => {
      test.skip(!!setupError, `Shared setup failed: ${setupError}`);
      await utils.withAllure({
        suite: SUITE,
        feature: T2,
        tags: [T2_TAG, '@tier2-templates'],
      });
    });

    test('Details tab shows correct template metadata', async ({ templateDetailPage }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);

      const isNameVisible = await templateDetailPage.isTemplateNameVisible(templateName);
      expect.soft(isNameVisible, 'Template name should be visible').toBe(true);

      const displayNameVisible = await templateDetailPage.verifyDisplayName();
      expect.soft(displayNameVisible, 'Display name label should be visible').toBe(true);

      const result = await templateDetailPage.verifyAllDetailFields({
        'Display name': TEMPLATE_FIELDS.displayName,
        Description: TEMPLATE_FIELDS.description,
        'CPU | Memory': `${TEMPLATE_FIELDS.cpuCores} CPU | 4 GiB Memory`,
      });

      for (const fail of result.failed) {
        expect
          .soft(false, `Field "${fail.field}": expected "${fail.expected}", got "${fail.actual}"`)
          .toBe(true);
      }
    });

    test('Scheduling tab loads without errors', async ({ templateDetailPage }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);
      await templateDetailPage.navigateToScheduling();

      const tolerationsVisible = await templateDetailPage.verifyTolerations();
      expect.soft(tolerationsVisible, 'Tolerations section should be visible').toBe(true);
    });

    test('Network interfaces tab shows default network', async ({ templateDetailPage }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);
      await templateDetailPage.navigateToNetworks();

      const podNetworkVisible = await templateDetailPage.verifyPodNetworking();
      expect.soft(podNetworkVisible, 'Network interfaces section should be visible').toBe(true);
    });

    test('Disks tab shows rootdisk', async ({ templateDetailPage }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);
      await templateDetailPage.navigateToDisks();

      const rootdiskVisible = await templateDetailPage.verifyRootdisk();
      expect.soft(rootdiskVisible, 'Rootdisk should be visible on the Disks tab').toBe(true);
    });

    test('Scripts tab shows cloud-init section', async ({ templateDetailPage }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);
      await templateDetailPage.navigateToScripts();

      const cloudInitVisible = await templateDetailPage.verifyCloudInit();
      expect
        .soft(cloudInitVisible, 'Cloud-init section should be visible on the Scripts tab')
        .toBe(true);
    });

    test('Parameters tab loads and shows expected parameters', async ({ templateDetailPage }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);
      await templateDetailPage.navigateToParameters();

      const cloudUserPassword = await templateDetailPage.verifyCloudUserPassword();
      expect
        .soft(
          cloudUserPassword,
          'CLOUD_USER_PASSWORD parameter should be visible on the Parameters tab',
        )
        .toBe(true);
    });

    test('Actions dropdown shows Clone and Delete for user templates', async ({
      templateDetailPage,
    }) => {
      await templateDetailPage.navigateToTemplateDetail(templateName, sharedNs);

      await templateDetailPage.clickActionsDropdown();

      const cloneItem = templateDetailPage.page.getByRole('menuitem', { name: 'Clone' });
      const deleteItem = templateDetailPage.page.getByRole('menuitem', { name: 'Delete' });

      const cloneVisible = await cloneItem.isVisible({ timeout: 5000 }).catch(() => false);
      expect.soft(cloneVisible, 'Clone action should be visible for user templates').toBe(true);

      const deleteVisible = await deleteItem.isVisible({ timeout: 5000 }).catch(() => false);
      expect.soft(deleteVisible, 'Delete action should be visible for user templates').toBe(true);

      await templateDetailPage.page.keyboard.press('Escape');
    });
  },
);
