/**
 * Tests storage migration plan CRUD through the console proxy.
 *
 * The UI uses MultiNamespaceVirtualMachineStorageMigrationPlan for both listing
 * and creating plans. Creating a multi-ns plan auto-creates child
 * VirtualMachineStorageMigrationPlan resources (one per namespace).
 *
 * This spec exercises:
 *   1. MultiNamespace plan CRUD (what the UI does)
 *   2. Verifying the auto-created child plan via the namespaced API
 */

import type { KubernetesResource } from '@/data-models/kubernetes-types';
import { expect, test } from '@/fixtures/api-test-fixture';

function buildMultiNsPlanSpec(
  name: string,
  namespace: string,
  vmName: string,
  volumeName: string,
  sourcePvcName: string,
  destinationStorageClass: string,
  retentionPolicy: 'keepSource' | 'deleteSource' = 'keepSource',
): KubernetesResource {
  return {
    apiVersion: 'migrations.kubevirt.io/v1alpha1',
    kind: 'MultiNamespaceVirtualMachineStorageMigrationPlan',
    metadata: { name, namespace },
    spec: {
      namespaces: [
        {
          name: namespace,
          retentionPolicy,
          virtualMachines: [
            {
              name: vmName,
              targetMigrationPVCs: [
                {
                  volumeName,
                  sourcePVC: { name: sourcePvcName },
                  destinationPVC: {
                    storageClassName: destinationStorageClass,
                    accessModes: ['Auto'],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  } as unknown as KubernetesResource;
}

test.describe('Storage Migration Plan CRUD — API', { tag: ['@api'] }, () => {
  test.describe.configure({ mode: 'serial' });

  let planName: string;
  let testNs: string;
  const dummyVmName = 'pw-smig-api-dummy';
  const dummyPvcName = 'pw-smig-api-dummy';

  test.beforeAll(async ({ testNamespace, utils }) => {
    testNs = testNamespace;
    planName = utils.generateRandomName('migplan');
  });

  test.afterAll(async ({ apiClient }) => {
    if (planName) {
      await apiClient.deleteMultiNsStorageMigrationPlan(planName, testNs).catch(() => undefined);
    }
  });

  test('CREATE: multi-namespace storage migration plan', async ({ apiClient }) => {
    const spec = buildMultiNsPlanSpec(
      planName,
      testNs,
      dummyVmName,
      'rootdisk',
      dummyPvcName,
      'ocs-storagecluster-ceph-rbd',
    );

    const created = await apiClient.createMultiNsStorageMigrationPlan(spec, testNs);
    expect(created, 'Plan creation must return a resource').not.toBeNull();
    expect(created?.kind).toBe('MultiNamespaceVirtualMachineStorageMigrationPlan');
    expect(created?.metadata.name).toBe(planName);
  });

  test('READ: GET single multi-ns plan returns correct spec', async ({ apiClient }) => {
    const plan = await apiClient.getMultiNsStorageMigrationPlan(planName, testNs);
    expect(plan, 'Plan must be retrievable by name').not.toBeNull();
    expect(plan?.kind).toBe('MultiNamespaceVirtualMachineStorageMigrationPlan');
    expect(plan?.metadata.name).toBe(planName);

    const spec = plan?.spec as {
      namespaces?: Array<{
        name?: string;
        retentionPolicy?: string;
        virtualMachines?: Array<{ name?: string }>;
      }>;
    };
    expect(spec.namespaces?.[0]?.retentionPolicy).toBe('keepSource');
    expect(spec.namespaces?.[0]?.virtualMachines?.[0]?.name).toBe(dummyVmName);
  });

  test('READ: plan appears in multi-ns listing (UI endpoint)', async ({ apiClient }) => {
    const list = await apiClient.getStorageMigrationPlans(testNs);
    expect(list.kind).toContain('List');

    const found = list.items.find((p: KubernetesResource) => p.metadata?.name === planName);
    expect(found, `Plan ${planName} must appear in multi-ns list`).toBeDefined();
  });

  test('READ: auto-created child plan exists in namespaced list', async ({ apiClient }) => {
    const childName = `${planName}-${testNs}`;
    const list = await apiClient.getNamespacedStorageMigrationPlans(testNs);
    expect(list.kind).toContain('List');

    const found = list.items.find((p: KubernetesResource) => p.metadata?.name === childName);
    expect(found, `Child plan ${childName} must exist`).toBeDefined();
    expect(found?.kind).toBe('VirtualMachineStorageMigrationPlan');
  });

  test('DELETE: remove multi-ns plan and verify absence', async ({ apiClient }) => {
    const result = await apiClient.deleteMultiNsStorageMigrationPlan(planName, testNs);
    expect(result).not.toBeNull();

    const list = await apiClient.getStorageMigrationPlans(testNs);
    const found = list.items.find((p: KubernetesResource) => p.metadata?.name === planName);
    expect(found, 'Plan must not appear after deletion').toBeUndefined();

    planName = '';
  });
});
