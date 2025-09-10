import { useImuIngress, type ConnectedDeviceLike } from './useImuIngress';
 
export function useImuStats(entry: ConnectedDeviceLike | undefined, expectedHz: number) {
  // stats-only: never collect, no batches
  const { isStreaming, start, stop, stats } = useImuIngress(entry, {
    expectedHz,
    autoStart: true,
    collect: false,
    onBatch: undefined,
    batchSize: 0,
  });
  return { isStreaming, start, stop, stats } as const;
}