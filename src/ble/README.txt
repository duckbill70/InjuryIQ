Usage snippets
Fatigue (value + trend)
const { value: fatigue, supported: fatigueOk } = useFatigueValue(deviceEntry);
const { history, latest, avg } = useFatigueTrend(deviceEntry, { maxPoints: 600, emitEveryMs: 250 });
IMU (background stream + downsampled UI)
// background processing via callback (e.g., write to file / analytics)
useImuStream(deviceEntry, {
  onBatch: (batch) => {
    // batch is ImuSample[]
    // TODO: append to file / upload / compute features
  },
  autoStart: true,
  batchSize: 64,
  flushIntervalMs: 50,
  keepLastInState: true, // if you want quick "last" preview
});
 
// or for charts/UI:
const { series, isStreaming } = useImuDownsampled(deviceEntry, { targetHz: 25 });