export function waitForStableLayout() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

export function createInterfaceTransitionCoordinator(options = {}) {
  const flushReaderSession = options.flushReaderSession || (() => Promise.resolve());
  const closeTransientUi = options.closeTransientUi || (() => {});
  const preloadKavita = options.preloadKavita || (() => Promise.resolve());
  const persistMode = options.persistMode || (() => Promise.resolve());
  const applyMode = options.applyMode || (() => {});
  const setTransition = options.setTransition || (() => {});
  const stableLayout = options.waitForStableLayout || waitForStableLayout;
  const reportError = options.reportError || (() => {});

  return {
    async request(nextMode, currentMode) {
      if (!nextMode || nextMode === currentMode) return true;
      setTransition(true);
      try {
        await flushReaderSession();
        closeTransientUi();
        if (nextMode === 'kavita') await preloadKavita();
        await persistMode(nextMode);
        applyMode(nextMode);
        await stableLayout();
        return true;
      } catch (error) {
        reportError(error instanceof Error ? error.message : String(error));
        return false;
      } finally {
        setTransition(false);
      }
    },
  };
}
