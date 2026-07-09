/**
 * Non-privileged user API contract tests.
 *
 * Validates that the endpoints exercised by the non-priv UI tests return correct
 * HTTP responses when called as a limited-permission user (cluster view + namespace
 * KubevirtAccess). Covers:
 *
 *  - VirtualMachines (ns-scoped): list & single-GET allowed; write rejected
 *  - Templates (openshift ns): list & single-GET allowed; write rejected
 *  - DataSources / BootableVolumes (os-images ns): list & single-GET allowed; write rejected
 *  - VirtualMachineClusterInstanceTypes: list & single-GET allowed; write rejected
 *
 * Run with: `./playwright-runner.sh test-nonpriv`
 * (sets NON_PRIV=1, global setup provisions the test user)
 */

import type { KubernetesResource } from '@/data-models/kubernetes-types';
import { ALLURE_API_FEATURE, expect, test } from '@/fixtures/api-test-fixture';
import { TEMPLATE_METADATA_NAMES } from '@/utils/template-constants';

const SUITE = 'NonPriv API';
const OS_IMAGES_NS = 'openshift-virtualization-os-images';
const OPENSHIFT_NS = 'openshift';
const KNOWN_DATASOURCE = 'rhel9';
const KNOWN_CLUSTER_IT = 'cx1.2xlarge';

test.describe('Non-privileged user API — VirtualMachines', { tag: ['@api', '@nonpriv'] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  test('READ: non-priv user can list VMs in their namespace', async ({
    nonPrivApiClient,
    testNamespace,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: ALLURE_API_FEATURE,
      tags: ['@api', '@nonpriv'],
    });

    const list = await nonPrivApiClient.getVirtualMachines(testNamespace);
    expect(list.kind).toBe('VirtualMachineList');
  });

  test('READ: non-priv user can list VMs across all namespaces (cluster view)', async ({
    nonPrivApiClient,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: ALLURE_API_FEATURE,
      tags: ['@api', '@nonpriv'],
    });

    const list = await nonPrivApiClient.getVirtualMachines();
    expect(list.kind).toBe('VirtualMachineList');
  });

  test('WRITE-REJECTED: non-priv user cannot create a VM in a system namespace (403)', async ({
    nonPrivApiClient,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: ALLURE_API_FEATURE,
      tags: ['@api', '@nonpriv'],
    });

    // The non-priv user has admin access in the test namespace (for test setup),
    // but has no write access in system namespaces like openshift-cnv.
    const SYSTEM_NS = 'openshift-cnv';
    const stub: KubernetesResource = {
      apiVersion: 'kubevirt.io/v1',
      kind: 'VirtualMachine',
      metadata: { name: 'nonpriv-write-probe', namespace: SYSTEM_NS },
      spec: { runStrategy: 'Halted', template: { spec: { domain: { resources: {} } } } },
    };

    await expect(nonPrivApiClient.createVirtualMachine(SYSTEM_NS, stub)).rejects.toThrow(
      /403|Forbidden|RBAC/,
    );
  });
});

test.describe('Non-privileged user API — Templates', { tag: ['@api', '@nonpriv'] }, () => {
  test.beforeEach(({ utils }) => {
    test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
  });

  test('READ: non-priv user can list templates with kubevirt label', async ({
    nonPrivApiClient,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: ALLURE_API_FEATURE,
      tags: ['@api', '@nonpriv'],
    });

    const list = await nonPrivApiClient.getTemplates(
      OPENSHIFT_NS,
      'template.kubevirt.io/type=base',
    );
    expect(list.kind).toBe('TemplateList');
    expect(list.items.length, 'RH templates must be present').toBeGreaterThan(0);
  });

  test('READ: non-priv user can read a single RH template', async ({ nonPrivApiClient, utils }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: ALLURE_API_FEATURE,
      tags: ['@api', '@nonpriv'],
    });

    const template = await nonPrivApiClient.getTemplate(
      OPENSHIFT_NS,
      TEMPLATE_METADATA_NAMES.RHEL9,
    );
    expect(template?.kind).toBe('Template');
    expect(template?.metadata?.name).toBe(TEMPLATE_METADATA_NAMES.RHEL9);
  });

  test('WRITE-REJECTED: non-priv user cannot delete an RH template (403)', async ({
    nonPrivApiClient,
    utils,
  }) => {
    await utils.withAllure({
      suite: SUITE,
      feature: ALLURE_API_FEATURE,
      tags: ['@api', '@nonpriv'],
    });

    await expect(
      nonPrivApiClient.deleteTemplate(OPENSHIFT_NS, TEMPLATE_METADATA_NAMES.RHEL9),
    ).rejects.toThrow(/403|Forbidden|RBAC/);
  });
});

test.describe(
  'Non-privileged user API — Bootable Volumes / DataSources',
  { tag: ['@api', '@nonpriv'] },
  () => {
    test.beforeEach(({ utils }) => {
      test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
    });

    test('READ: non-priv user can list DataSources in os-images namespace', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      const list = await nonPrivApiClient.getDataSources(OS_IMAGES_NS);
      expect(list.kind).toBe('DataSourceList');
      expect(list.items.length, 'RH DataSources must be present').toBeGreaterThan(0);
    });

    test('READ: non-priv user can read the rhel9 DataSource', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      const ds = await nonPrivApiClient.getDataSource(OS_IMAGES_NS, KNOWN_DATASOURCE);
      expect(ds?.kind).toBe('DataSource');
      expect(ds?.metadata?.name).toBe(KNOWN_DATASOURCE);
    });

    test('READ: non-priv user can list DataSources filtered by default-preference label', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      const list = await nonPrivApiClient.getDataSources(
        OS_IMAGES_NS,
        'instancetype.kubevirt.io/default-preference',
      );
      expect(list.kind).toBe('DataSourceList');
    });

    test('WRITE-REJECTED: non-priv user cannot create a DataSource (403)', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      const stub: KubernetesResource = {
        apiVersion: 'cdi.kubevirt.io/v1beta1',
        kind: 'DataSource',
        metadata: { name: 'nonpriv-ds-probe', namespace: OS_IMAGES_NS },
        spec: { source: {} },
      };

      await expect(nonPrivApiClient.createDataSource(OS_IMAGES_NS, stub)).rejects.toThrow(
        /403|Forbidden|RBAC/,
      );
    });
  },
);

test.describe(
  'Non-privileged user API — VirtualMachineClusterInstanceTypes',
  { tag: ['@api', '@nonpriv'] },
  () => {
    test.beforeEach(({ utils }) => {
      test.skip(!utils.EnvVariables.isNonPrivUser, 'Requires non-privileged user (NON_PRIV=1)');
    });

    test('READ: non-priv user can list cluster instance types', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      const list = await nonPrivApiClient.getVirtualMachineClusterInstanceTypes();
      expect(list.kind).toBe('VirtualMachineClusterInstancetypeList');
      expect(list.items.length, 'Built-in cluster instance types must be present').toBeGreaterThan(
        0,
      );
    });

    test('READ: non-priv user can read a single cluster instance type', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      const it = await nonPrivApiClient.getResource(
        'instancetype.kubevirt.io',
        'v1beta1',
        'virtualmachineclusterinstancetypes',
        KNOWN_CLUSTER_IT,
      );
      expect(it?.kind).toBe('VirtualMachineClusterInstancetype');
      expect(it?.metadata?.name).toBe(KNOWN_CLUSTER_IT);
    });

    test('WRITE-REJECTED: non-priv user cannot delete a cluster instance type (403)', async ({
      nonPrivApiClient,
      utils,
    }) => {
      await utils.withAllure({
        suite: SUITE,
        feature: ALLURE_API_FEATURE,
        tags: ['@api', '@nonpriv'],
      });

      await expect(
        nonPrivApiClient.deleteVirtualMachineClusterInstanceType(KNOWN_CLUSTER_IT),
      ).rejects.toThrow(/403|Forbidden|RBAC/);
    });
  },
);
