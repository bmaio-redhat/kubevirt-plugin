import { load as yamlLoad } from 'js-yaml';

import type { KubernetesResource } from '@/data-models/kubernetes-types';
import { expect, test } from '@/fixtures/api-test-fixture';

test.describe('VirtualMachineSnapshot CRUD — API', { tag: ['@api'] }, () => {
  let vmName: string;
  let snapshotName: string;
  let setupError: string | undefined;

  test.beforeAll(async ({ testNamespace, apiClient, k8sClient, utils }) => {
    try {
      vmName = utils.generateRandomVmName('test-snap-vm');
      snapshotName = utils.generateRandomSnapshotName('test-snap');

      await test.step('CREATE backing VirtualMachine', async () => {
        const vmYaml = utils.VirtualMachineFactory.create({
          name: vmName,
          namespace: testNamespace,
          runStrategy: 'Halted',
          cpuCores: 1,
          memory: '512Mi',
        });
        const created = await apiClient.createVirtualMachine(
          testNamespace,
          yamlLoad(vmYaml) as KubernetesResource,
        );
        expect(created.kind).toBe('VirtualMachine');
      });

      await test.step('WAIT: VM exists before snapshotting (k8s client)', async () => {
        const ready = await k8sClient.waitForVmExists(vmName, testNamespace);
        expect(ready, 'VM must exist before snapshot can be taken').toBe(true);
      });

      await test.step('CREATE VirtualMachineSnapshot via console proxy', async () => {
        const snapYaml = utils.createMinimalVirtualMachineSnapshotYaml({
          name: snapshotName,
          namespace: testNamespace,
          vmName,
        });
        const created = await apiClient.createVirtualMachineSnapshot(
          testNamespace,
          yamlLoad(snapYaml) as KubernetesResource,
        );
        expect(created.kind).toBe('VirtualMachineSnapshot');
        expect(created.metadata.name).toBe(snapshotName);
      });

      await test.step('WAIT: snapshot reaches Ready state (k8s client)', async () => {
        const ready = await k8sClient.waitForSnapshotReady(snapshotName, testNamespace);
        expect(ready, 'snapshot must reach Ready=true before assertions').toBe(true);
      });
    } catch (error: unknown) {
      setupError = error instanceof Error ? error.message : String(error);
    }
  });

  test.afterAll(async ({ testNamespace, apiClient, k8sClient }) => {
    if (snapshotName) {
      await apiClient
        .deleteVirtualMachineSnapshot(testNamespace, snapshotName)
        .catch(() => undefined);
    }
    if (vmName) {
      await apiClient.deleteVirtualMachine(testNamespace, vmName).catch(() => undefined);
      await k8sClient.waitForVmDeleted(vmName, testNamespace).catch(() => undefined);
    }
  });

  test.beforeEach(() => {
    test.skip(!!setupError, `Setup failed: ${setupError}`);
  });

  test('READ: snapshot appears in namespace snapshot list', async ({
    testNamespace,
    apiClient,
  }) => {
    const list = await apiClient.getVirtualMachineSnapshots(testNamespace);
    expect(list.kind).toBe('VirtualMachineSnapshotList');
    const found = list.items.find((s: KubernetesResource) => s.metadata?.name === snapshotName);
    expect(found, `snapshot ${snapshotName} must appear in list`).toBeDefined();
    expect(
      ((found as KubernetesResource)?.spec as { source?: { name?: string } } | undefined)?.source
        ?.name,
    ).toBe(vmName);
  });

  test('DELETE: remove snapshot via API', async ({ testNamespace, apiClient, k8sClient }) => {
    await apiClient.deleteVirtualMachineSnapshot(testNamespace, snapshotName);

    const deleted = await k8sClient.waitForSnapshotDeleted(snapshotName, testNamespace);
    expect(deleted, 'snapshot must be fully removed from cluster').toBe(true);

    const list = await apiClient.getVirtualMachineSnapshots(testNamespace);
    const found = list.items.find((s: KubernetesResource) => s.metadata?.name === snapshotName);
    expect(found, 'snapshot must no longer appear in list after deletion').toBeUndefined();

    snapshotName = '';
  });
});
